import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Pill, ShieldCheck } from "lucide-react";
import { money, type Medication, type Pharmacy } from "./catalog";
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
};
const empty: IntakeData = {
  fullName: "Avery Example",
  email: "avery@example.test",
  zipCode: "65201",
  weightLb: "160",
  healthConcern: "Fictional anxiety",
  symptoms: "Fictional restlessness",
  currentMedications: "None",
  allergies: "None",
  duration: "",
  pharmacyPreference: "",
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
  const [data, setData] = useState<IntakeData>({ ...empty });
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const update = (name: keyof IntakeData, value: string) => {
    setData((d) => ({ ...d, [name]: value }));
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
    onComplete(
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value.trim()]),
      ) as IntakeData,
    );
  };
  return (
    <section className="wrap section intake-section">
      <p role="note">Synthetic demo only. Use fictional details; never enter real personal or health information.</p>
      <button
        className="text-btn"
        onClick={step === 1 ? onBack : () => setStep(1)}
      >
        <ArrowLeft size={16} />{" "}
        {step === 1 ? "Back to pharmacy offers" : "Back to your details"}
      </button>
      <div className="intake-layout">
        <div>
          <div className="progress" aria-label={`Step ${step} of 2`}>
            <span className={step === 1 ? "current" : "done"}>
              {step === 2 ? <Check size={12} /> : "1"}
            </span>{" "}
            Your details <i />
            <span className={step === 2 ? "current" : ""}>2</span> Health
            profile
          </div>
          <span className="eyebrow">
            {step === 1 ? "LET’S MAKE IT PERSONAL" : "A LITTLE MORE ABOUT YOU"}
          </span>
          <h1>
            {step === 1
              ? "Your next step starts here."
              : "Tell us about your health."}
          </h1>
          <p>
            {step === 1
              ? "Add your details to prepare your selected offer."
              : "Share a little context for your personal offer summary."}
          </p>
          <p className="form-note">
            Use   details only. All fields are required. This
            questionnaire does not provide a medical assessment.
          </p>
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
                    <small>No email will be sent.</small>
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
              ) : (
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
              )}
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              id={
                step === 2 ? "confirm-offer-button" : "continue-intake-button"
              }
              className="dark-btn form-submit"
              type="submit"
            >
              {step === 1 ? "Continue to health profile" : "Confirm my offer"}
              <ArrowRight size={17} />
            </button>
            <p className="form-footnote">
              <ShieldCheck size={14} /> Your selected offer is free to explore.
              No payment details needed.
            </p>
          </form>
        </div>
        <aside className="offer-summary">
          <span className="eyebrow">YOUR SELECTED OFFER</span>
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
              <small>  pharmacy</small>
            </div>
          </div>
          <div className="summary-price">
            <span>Illustrative price</span>
            <strong>{money(medication.price + pharmacy.addition)}</strong>
          </div>
          <p className="muted">
            Not a live quote. This offer cannot be redeemed at a pharmacy.
          </p>
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
      <span className="eyebrow">ONE LESS THING TO THINK ABOUT</span>
      <h1 id="confirmation-title">Your offer is ready, {offer.firstName}.</h1>
      <p>Here’s a summary of the option you chose.</p>
      <article className="confirmation-card">
        <span className="eyebrow">OFFER CONFIRMATION</span>
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
            <small>Illustrative price</small>
            <strong>
              {money(offer.medication.price + offer.pharmacy.addition)}
            </strong>
          </div>
        </div>
        <div className="nonredeemable">
          <ShieldCheck size={19} />
          <p>
            For your reference only. This is not a redeemable coupon or
            prescription. No reservation was made and no email was sent.
          </p>
        </div>
      </article>
      <button className="dark-btn" onClick={onBrowse}>
        Explore another medication <ArrowRight size={16} />
      </button>
    </section>
  );
}
