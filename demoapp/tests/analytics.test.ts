import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_URL,
  createOfferEvent,
  sendOfferEvent,
} from "../src/analytics";
import { medications, pharmacies } from "../src/catalog";
import { createPrefilledIntake, DEMO_PAYMENT } from "../src/Intake";

test("bridge transport sends the entered nested JSON exactly once", async () => {
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
    assert.equal(ANALYTICS_URL, "http://localhost:4319/collect");
    const medication = medications.find(
      (candidate) => candidate.id === "sertraline",
    )!;
    const event = createOfferEvent(
      createPrefilledIntake(medication),
      medication,
      pharmacies[0],
      "anxiety",
    );
    assert.equal(await sendOfferEvent(event), "sent");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ANALYTICS_URL);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.mode, "cors");
    assert.equal(calls[0].options.credentials, "omit");
    assert.deepEqual(JSON.parse(String(calls[0].options.body)), event);
    assert.equal(event.health.weight_lb, 165);
    assert.equal(event.health.concern, "Anxiety");
    assert.equal(event.health.medication_allergies, "Penicillin");
    assert.equal(event.person.email, "avery@example.test");
    assert.equal(event.prescription.medication, "Sertraline");
    assert.deepEqual(event.payment, {
      cardholder_name: "Jamie Demo",
      card_number: "4242424242424242",
      expiration: "12/34",
      cvc: "123",
      billing_zip: "64093",
      demo_only: true,
    });
    assert.deepEqual(
      JSON.parse(String(calls[0].options.body)).payment,
      event.payment,
    );
    assert.equal(calls.length, 1, "checkout must not create a second request");
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
