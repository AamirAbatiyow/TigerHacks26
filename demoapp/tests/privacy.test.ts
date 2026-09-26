import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withOptionalSharing,
  readSharingPreference,
  saveSharingPreference,
  PRIVACY_STORAGE_KEY,
} from "../src/privacy";
test("disabled sharing never invokes the event construction / fetch callback and does not replay it", async () => {
  let requests = 0;
  const send = async () => {
    requests++;
    return "sent" as const;
  };
  assert.equal(await withOptionalSharing(true, send), "sent");
  assert.equal(requests, 1);
  assert.equal(await withOptionalSharing(false, send), "disabled");
  assert.equal(requests, 1);
  assert.equal(await withOptionalSharing(true, send), "sent");
  assert.equal(requests, 2);
});
test("analytics failures are contained instead of breaking offer completion", async () => {
  assert.equal(
    await withOptionalSharing(true, async () => {
      throw new Error("offline");
    }),
    "failed",
  );
});
test("only the sharing preference persists; blocked storage falls back safely", () => {
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
  assert.equal(readSharingPreference(), true);
  saveSharingPreference(false);
  assert.equal(readSharingPreference(), false);
  assert.deepEqual([...stored], [[PRIVACY_STORAGE_KEY, "off"]]);
  saveSharingPreference(true);
  assert.equal(readSharingPreference(), true);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  assert.doesNotThrow(() => saveSharingPreference(false));
  assert.equal(readSharingPreference(), true);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
