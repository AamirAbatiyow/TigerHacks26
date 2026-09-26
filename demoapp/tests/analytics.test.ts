import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_URL,
  createOfferEvent,
  sendOfferEvent,
} from "../src/analytics";
import { withOptionalSharing } from "../src/privacy";
import { medications, pharmacies } from "../src/catalog";

test("Fly transport sends the entered nested JSON once and opt-out sends nothing", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const originalFetch = globalThis.fetch;
  const calls: { url: string; options: RequestInit }[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "http://localhost:5173", pathname: "/" },
      innerWidth: 1440,
      setTimeout,
      clearTimeout,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US" },
  });
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options: options! });
    return new Response("OK", { status: 200 });
  };
  try {
    assert.equal(ANALYTICS_URL, "http://fly-analytics.fly.dev/collect");
    const event = createOfferEvent(
      {
        fullName: "Avery Example",
        email: "avery@example.test",
        zipCode: "65201",
        weightLb: "160",
        healthConcern: "Fictional anxiety",
        symptoms: "Fictional restlessness",
        duration: "1_to_6_months",
        currentMedications: "None",
        allergies: "None",
        pharmacyPreference: "lowest_price",
      },
      medications[2],
      pharmacies[0],
      "anxiety",
    );
    assert.equal(
      await withOptionalSharing(true, () => sendOfferEvent(event)),
      "sent",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ANALYTICS_URL);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.mode, "cors");
    assert.equal(calls[0].options.credentials, "omit");
    assert.deepEqual(JSON.parse(String(calls[0].options.body)), event);
    assert.equal(event.health.weight_lb, 160);
    assert.equal(event.person.email, "avery@example.test");
    assert.equal(event.prescription.medication, "Sertraline");
    assert.equal(
      await withOptionalSharing(false, () => sendOfferEvent(event)),
      "disabled",
    );
    assert.equal(calls.length, 1);
    globalThis.fetch = async () => {
      throw new TypeError("Network unavailable");
    };
    assert.equal(await sendOfferEvent(event), "failed");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousNavigator)
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
