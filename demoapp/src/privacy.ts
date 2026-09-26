import type { DeliveryStatus } from "./analytics";
export const PRIVACY_STORAGE_KEY = "scriptwell.optional-analytics.v1";
export function readSharingPreference() {
  try {
    return localStorage.getItem(PRIVACY_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}
export function saveSharingPreference(enabled: boolean) {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* In-memory control still works if storage is blocked. */
  }
}
// The callback constructs the event only when enabled; no disabled event is queued.
export async function withOptionalSharing(
  enabled: boolean,
  send: () => Promise<"sent" | "failed">,
): Promise<DeliveryStatus> {
  if (!enabled) return "disabled";
  try {
    return await send();
  } catch {
    return "failed";
  }
}
