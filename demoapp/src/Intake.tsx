import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Pill } from "lucide-react";
import { conditions, money, type Medication, type Pharmacy } from "./catalog";
import { PRIVACY_EMAIL } from "./config";

export type DemoPaymentData = {
  cardholderName: string;
  cardNumber: string;
  expiration: string;
  cvc: string;
  billingZip: string;
  demoOnly: true;
};

export const DEMO_PAYMENT: DemoPaymentData = {
  cardholderName: "Jamie Demo",
  cardNumber: "4242 4242 4242 4242",
  expiration: "12/34",
  cvc: "123",
  billingZip: "64093",
  demoOnly: true,
};

export type IntakeData = {
  fullName: string;
  email: string;
  zipCode: string;
  weightLb: string;
  healthConcern: string;
  symptoms: string;
  currentMedications: string;
  allergies: string;
  duration: string;
  pharmacyPreference: string;
  payment: DemoPaymentData;
};
const symptomsByCondition: Record<string, string> = {
  anxiety: "Restlessness and difficulty sleeping",
  depression: "Low mood and reduced interest in usual activities",
  "high-cholesterol": "Elevated cholesterol on a recent screening",
  "high-blood-pressure": "Headaches and elevated home blood pressure readings",
  "type-2-diabetes": "Increased thirst and fatigue",
  "seasonal-allergies": "Sneezing, runny nose, and itchy eyes",
  acne: "Recurring facial breakouts",
  asthma: "Wheezing and shortness of breath",
};

export const createPrefilledIntake = (medication: Medication): IntakeData => ({
  fullName: "Avery Example",
  email: "avery@example.test",
  zipCode: "65201",
  weightLb: "165",
  healthConcern:
    conditions.find((condition) => condition.id === medication.condition)
      ?.name ?? medication.condition,
  symptoms:
    symptomsByCondition[medication.condition] ??
    "Ongoing symptoms related to this concern",
  currentMedications: "Daily multivitamin",
  allergies: "Penicillin",
  duration: "1_to_6_months",
  pharmacyPreference: "lowest_price",
  payment: { ...DEMO_PAYMENT },
});

const digitsOnly = (value: string, maxLength: number) =>
  value.replace(/\D/g, "").slice(0, maxLength);

const formatCardNumber = (value: string) =>
  digitsOnly(value, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();

const formatExpiration = (value: string) => {
  const digits = digitsOnly(value, 4);
  return digits.length > 2
    ? `${digits.slice(0, 2)}/${digits.slice(2)}`
    : digits;
};
export type CompletedOffer = {
  medication: Medication;
  pharmacy: Pharmacy;
  firstName: string;
};
export function Intake({
  medication,
  pharmacy,
  onBack,
  onComplete,
}: {
  medication: Medication;
  pharmacy: Pharmacy;
  onBack: () => void;
  onComplete: (data: IntakeData) => void;
}) {
  const [data, setData] = useState<IntakeData>(() =>
    createPrefilledIntake(medication),
  );
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const update = (
    name: Exclude<keyof IntakeData, "payment">,
    value: string,
  ) => {
    setData((d) => ({ ...d, [name]: value }));
    setError("");
  };
  const updatePayment = (
    name: Exclude<keyof DemoPaymentData, "demoOnly">,
    value: string,
  ) => {
    setData((current) => ({
      ...current,
      payment: { ...current.payment, [name]: value },
    }));
    setError("");
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step === 1) {
      if (!data.fullName.trim() || !data.email.trim()) {
        setError("Please enter your name and email address.");
        return;
      }
      setStep(2);
      window.scrollTo(0, 0);
      return;
    }
    if (
      step === 2 &&
      ![
        data.healthConcern,
        data.symptoms,
        data.currentMedications,
        data.allergies,
      ].every((v) => v.trim())
    ) {
      setError(
        "Please complete the health fields. You can enter “None” where appropriate.",
      );
      return;
    }
    if (step === 2) {
      setStep(3);
      window.scrollTo(0, 0);
      return;
    }
    if (
      ![
        data.payment.cardholderName,
        data.payment.cardNumber,
        data.payment.expiration,
        data.payment.cvc,
        data.payment.billingZip,
      ].every((value) => value.trim())
    ) {
      setError("Please complete every demo payment field.");
      return;
    }
    onComplete({
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      zipCode: data.zipCode.trim(),
      weightLb: data.weightLb.trim(),
      healthConcern: data.healthConcern.trim(),
      symptoms: data.symptoms.trim(),
      currentMedications: data.currentMedications.trim(),
      allergies: data.allergies.trim(),
      duration: data.duration.trim(),
      pharmacyPreference: data.pharmacyPreference.trim(),
      payment: {
        cardholderName: data.payment.cardholderName.trim(),
        cardNumber: data.payment.cardNumber.trim(),
        expiration: data.payment.expiration.trim(),
        cvc: data.payment.cvc.trim(),
        billingZip: data.payment.billingZip.trim(),
        demoOnly: true,
      },
    });
  };
  return (
    <section className="wrap section intake-section">
      <p role="note">
        Synthetic demo only. Use fictional details; never enter real personal or
        health information. Pharmacy preference, duration, and demo payment are
        already filled in, so you can continue through each step. Privacy
        contact: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
      </p>
      <button
        className="text-btn"
        onClick={step === 1 ? onBack : () => setStep((current) => current - 1)}
      >
        <ArrowLeft size={16} />{" "}
        {step === 1
          ? "Back to pharmacy offers"
          : step === 2
            ? "Back to your details"
            : "Back to health profile"}
      </button>
      <div className="intake-layout">
        <div>
          <div className="progress" aria-label={`Step ${step} of 3`}>
            <span className={step === 1 ? "current" : "done"}>
              {step > 1 ? <Check size={12} /> : "1"}
            </span>{" "}
            Your details <i />
            <span className={step === 2 ? "current" : step > 2 ? "done" : ""}>
              {step > 2 ? <Check size={12} /> : "2"}
            </span>{" "}
            Health profile <i />
            <span className={step === 3 ? "current" : ""}>3</span> Demo checkout
          </div>
          <h1>
            {step === 1
              ? "Your next step starts here."
              : step === 2
                ? "Tell us about your health."
                : "Demo Checkout"}
          </h1>
          <form id="offer-intake-form" autoComplete="off" onSubmit={submit}>
            <div className="form-grid">
              {step === 1 ? (
                <>
                  <label className="full">
                    Full name
                    <input
                      name="fullName"
                      autoComplete="off"
                      required
                      maxLength={100}
                      value={data.fullName}
                      onChange={(e) => update("fullName", e.target.value)}
                      placeholder="Enter a full name"
                    />
                  </label>
                  <label className="full">
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="off"
                      required
                      maxLength={150}
                      value={data.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="Enter a email address"
                    />
                  </label>
                  <label>
                    ZIP code
                    <input
                      name="zipCode"
                      autoComplete="off"
                      inputMode="numeric"
                      pattern="[0-9]{5}"
                      title="Enter a five-digit ZIP code"
                      required
                      maxLength={5}
                      value={data.zipCode}
                      onChange={(e) => update("zipCode", e.target.value)}
                      placeholder="5-digit ZIP code"
                    />
                  </label>
                  <label>
                    Weight (lb)
                    <input
                      name="weightLb"
                      type="number"
                      autoComplete="off"
                      min={1}
                      max={1500}
                      step="0.1"
                      required
                      value={data.weightLb}
                      onChange={(e) => update("weightLb", e.target.value)}
                      placeholder="Enter weight in pounds"
                    />
                  </label>
                  <label className="full">
                    Pharmacy preference
                    <select
                      name="pharmacyPreference"
                      required
                      value={data.pharmacyPreference}
                      onChange={(e) =>
                        update("pharmacyPreference", e.target.value)
                      }
                    >
                      <option value="" disabled>
                        Select a preference
                      </option>
                      <option value="lowest_price">Lowest price</option>
                      <option value="nearby">Close to home</option>
                      <option value="familiar">A pharmacy I know</option>
                    </select>
                  </label>
                </>
              ) : step === 2 ? (
                <>
                  <label className="full">
                    What health concern brings you here?
                    <input
                      name="healthConcern"
                      autoComplete="off"
                      required
                      maxLength={200}
                      value={data.healthConcern}
                      onChange={(e) => update("healthConcern", e.target.value)}
                      placeholder="Describe a health concern"
                    />
                  </label>
                  <label className="full">
                    What symptoms are you experiencing?
                    <textarea
                      name="symptoms"
                      autoComplete="off"
                      required
                      maxLength={1000}
                      rows={3}
                      value={data.symptoms}
                      onChange={(e) => update("symptoms", e.target.value)}
                      placeholder="Describe symptoms, or enter None"
                    />
                  </label>
                  <label className="full">
                    How long has this been a concern?
                    <select
                      name="duration"
                      required
                      value={data.duration}
                      onChange={(e) => update("duration", e.target.value)}
                    >
                      <option value="" disabled>
                        Select a time range
                      </option>
                      <option value="under_1_month">Less than a month</option>
                      <option value="1_to_6_months">1–6 months</option>
                      <option value="over_6_months">More than 6 months</option>
                    </select>
                  </label>
                  <label className="full">
                    Current medications
                    <input
                      name="currentMedications"
                      autoComplete="off"
                      required
                      maxLength={500}
                      value={data.currentMedications}
                      onChange={(e) =>
                        update("currentMedications", e.target.value)
                      }
                      placeholder="List medications, or enter None"
                    />
                  </label>
                  <label className="full">
                    Medication allergies
                    <input
                      name="allergies"
                      autoComplete="off"
                      required
                      maxLength={500}
                      value={data.allergies}
                      onChange={(e) => update("allergies", e.target.value)}
                      placeholder="List allergies, or enter None"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="full">
                    Cardholder name
                    <input
                      name="demoCardholderName"
                      autoComplete="off"
                      required
                      maxLength={100}
                      value={data.payment.cardholderName}
                      onChange={(event) =>
                        updatePayment("cardholderName", event.target.value)
                      }
                      placeholder="Jamie Demo"
                    />
                  </label>
                  <label className="full">
                    Demo card number
                    <input
                      name="demoCardNumber"
                      autoComplete="off"
                      inputMode="numeric"
                      required
                      pattern="4242 4242 4242 4242"
                      title="Use the displayed demo card number: 4242 4242 4242 4242"
                      maxLength={19}
                      value={data.payment.cardNumber}
                      onChange={(event) =>
                        updatePayment(
                          "cardNumber",
                          formatCardNumber(event.target.value),
                        )
                      }
                      placeholder="4242 4242 4242 4242"
                    />
                  </label>
                  <label>
                    Expiration date
                    <input
                      name="demoExpiration"
                      autoComplete="off"
                      inputMode="numeric"
                      required
                      pattern="(0[1-9]|1[0-2])/[0-9]{2}"
                      title="Use MM/YY format"
                      maxLength={5}
                      value={data.payment.expiration}
                      onChange={(event) =>
                        updatePayment(
                          "expiration",
                          formatExpiration(event.target.value),
                        )
                      }
                      placeholder="MM/YY"
                    />
                  </label>
                  <label>
                    CVC
                    <input
                      name="demoCvc"
                      autoComplete="off"
                      inputMode="numeric"
                      required
                      pattern="[0-9]{3}"
                      title="Enter three digits"
                      maxLength={3}
                      value={data.payment.cvc}
                      onChange={(event) =>
                        updatePayment("cvc", digitsOnly(event.target.value, 3))
                      }
                      placeholder="123"
                    />
                  </label>
                  <label className="full">
                    Billing ZIP
                    <input
                      name="demoBillingZip"
                      autoComplete="off"
                      inputMode="numeric"
                      required
                      pattern="[0-9]{5}"
                      title="Enter five digits"
                      maxLength={5}
                      value={data.payment.billingZip}
                      onChange={(event) =>
                        updatePayment(
                          "billingZip",
                          digitsOnly(event.target.value, 5),
                        )
                      }
                      placeholder="64093"
                    />
                  </label>
                </>
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              id={
                step === 3 ? "confirm-offer-button" : "continue-intake-button"
              }
              className="dark-btn form-submit"
              type="submit"
            >
              {step === 1
                ? "Continue to health profile"
                : step === 2
                  ? "Continue to demo checkout"
                  : "Confirm my offer"}
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
        <aside className="offer-summary">
          <span className={`large-pill ${medication.color}`}>
            <Pill size={35} />
          </span>
          <h2>{medication.name}</h2>
          <p>
            {medication.dose} · {medication.quantity}
          </p>
          <hr />
          <div className="summary-pharmacy">
            <span className={`pharmacy-logo ${pharmacy.color}`}>
              {pharmacy.initials}
            </span>
            <div>
              <strong>{pharmacy.name}</strong>
              <small>Selected pharmacy</small>
            </div>
          </div>
          <p>
            Questions: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
          </p>
          <div className="summary-price">
            <span>Price</span>
            <strong>{money(medication.price + pharmacy.addition)}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}
export function Confirmation({
  offer,
  onBrowse,
}: {
  offer: CompletedOffer;
  onBrowse: () => void;
}) {
  return (
    <section
      className="wrap confirmation section"
      aria-labelledby="confirmation-title"
    >
      <div className="confirmation-check">
        <Check size={30} />
      </div>
      <h1 id="confirmation-title">Your offer is ready, {offer.firstName}.</h1>
      <article className="confirmation-card">
        <h2>{offer.medication.name}</h2>
        <p>
          {offer.medication.dose} · {offer.medication.quantity}
        </p>
        <hr />
        <div className="confirmation-details">
          <div>
            <small>Selected pharmacy</small>
            <strong>{offer.pharmacy.name}</strong>
          </div>
          <div>
            <small>Price</small>
            <strong>
              {money(offer.medication.price + offer.pharmacy.addition)}
            </strong>
          </div>
        </div>
      </article>
      <p>
        Contact <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
      </p>
      <button className="dark-btn" onClick={onBrowse}>
        Explore another medication <ArrowRight size={16} />
      </button>
    </section>
  );
}
