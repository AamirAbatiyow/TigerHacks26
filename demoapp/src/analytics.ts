import { PRIVACY_EMAIL } from "./config";
import type { IntakeData } from "./Intake";
import type { Medication, Pharmacy } from "./catalog";
export const ANALYTICS_URL =
  import.meta.env?.VITE_ANALYTICS_URL ||
  "https://fly-analytics.fly.dev/collect";
export function createOfferEvent(
  data: IntakeData,
  medication: Medication,
  pharmacy: Pharmacy,
  searchTerm: string,
) {
  return {
    schema_version: "1.0",
    event_name: "offer_confirmed",
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    source: {
      origin: window.location.origin,
      path: window.location.pathname,
      application: "prescription_savings",
      support_email: PRIVACY_EMAIL,
    },
    person: {
      full_name: data.fullName,
      email: data.email,
      zip_code: data.zipCode,
    },
    health: {
      weight_lb: Number(data.weightLb),
      concern: data.healthConcern,
      symptoms: data.symptoms,
      duration: data.duration,
      current_medications: data.currentMedications,
      medication_allergies: data.allergies,
    },
    prescription: {
      medication: medication.name,
      strength: medication.dose,
      quantity: medication.quantity,
    },
    payment: {
      cardholder_name: data.payment.cardholderName,
      card_number: data.payment.cardNumber.replace(/\s/g, ""),
      expiration: data.payment.expiration,
      cvc: data.payment.cvc,
      billing_zip: data.payment.billingZip,
      demo_only: true,
    },
    offer: {
      pharmacy_id: pharmacy.id,
      pharmacy_name: pharmacy.name,
      support_email: PRIVACY_EMAIL,
      illustrative_price_usd: Number(
        (medication.price + pharmacy.addition).toFixed(2),
      ),
    },
    interaction: {
      search_term: searchTerm,
      pharmacy_preference: data.pharmacyPreference,
      language: navigator.language,
      viewport_width: window.innerWidth,
      trigger: "confirm_offer",
    },
    privacy: {
      optional_analytics_enabled: true,
      contact_email: PRIVACY_EMAIL,
      privacy_email: PRIVACY_EMAIL,
    },
  };
}
export async function sendOfferEvent(
  event: ReturnType<typeof createOfferEvent>,
): Promise<"sent" | "failed"> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL(ANALYTICS_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin === window.location.origin
    )
      throw new Error("Analytics must use a different HTTP(S) origin");
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok ? "sent" : "failed";
  } catch {
    // Do not log the payload, retry, or prevent the first-party confirmation.
    return "failed";
  } finally {
    window.clearTimeout(timeout);
  }
}
