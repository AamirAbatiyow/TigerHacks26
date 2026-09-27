import { ExternalLink, HeartHandshake, ShieldCheck } from "lucide-react";
import { BRAND, PRIVACY_EMAIL } from "./config";

export function PrivacyPolicy() {
  return (
    <section
      className="privacy-policy wrap"
      aria-labelledby="privacy-policy-title"
    >
      <div className="privacy-policy-hero">
        <span className="policy-icon" aria-hidden="true">
          <ShieldCheck size={30} />
        </span>
        <span className="eyebrow">YOUR INFORMATION, EXPLAINED</span>
        <h1 id="privacy-policy-title">Privacy Policy</h1>
        <p>
          This policy explains how {BRAND.name} collects and shares information
          when you explore a prescription offer.
        </p>
        <small>Effective September 26, 2026</small>
      </div>

      <div className="policy-layout">
        <aside className="policy-summary" aria-label="Privacy summary">
          <HeartHandshake size={25} />
          <h2>A clear summary</h2>
          <p>
            Information submitted during the offer flow is shared with an
            analytics service when the final offer is confirmed.
          </p>
          <p>Opt-out requests may be submitted through our privacy contact.</p>
          <a href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL} <ExternalLink size={13} />
          </a>
        </aside>

        <article className="policy-content">
          <section>
            <span className="policy-number">01</span>
            <div>
              <h2>Information we collect</h2>
              <p>
                The offer flow collects information you enter, including name,
                email address, ZIP code, weight, health concern, symptoms,
                duration, current medications, medication allergies, medication
                selection, pharmacy, and illustrative price.
              </p>
              <p>
                The demo checkout also collects cardholder name, demo card
                number, expiration, CVC, and billing ZIP. This section is for
                synthetic test data only. Do not enter a real payment card.
              </p>
            </div>
          </section>

          <section>
            <span className="policy-number">02</span>
            <div>
              <h2>How information is shared</h2>
              <p>
                When an offer is confirmed, the submitted contact, health,
                prescription, pharmacy, interaction, and synthetic checkout
                information is included in a single analytics event and shared
                with our analytics service.
              </p>
              <p>
                We use this event to demonstrate how sensitive-looking patient
                and payment information can travel through website analytics.
                The website does not send a separate payment request.
              </p>
            </div>
          </section>

          <section>
            <span className="policy-number">03</span>
            <div>
              <h2>Storage and payment processing</h2>
              <p>
                {BRAND.name} keeps form values only in page memory for the
                current flow. It does not save them to browser storage or a
                Scriptwell database. Network inspection tools, browser
                extensions, and analytics infrastructure may capture the event.
              </p>
              <p>
                No payment processor is connected. No authorization, charge,
                purchase, prescription, or pharmacy reservation occurs.
              </p>
            </div>
          </section>

          <section>
            <span className="policy-number">04</span>
            <div>
              <h2>Analytics opt-out requests</h2>
              <p>
                A request to stop future analytics sharing may be submitted to
                our privacy contact at {" "}
                <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. An
                opt-out request cannot recall information that was already
                transmitted before the request was processed.
              </p>
            </div>
          </section>

          <section>
            <span className="policy-number">05</span>
            <div>
              <h2>Health privacy and demo limits</h2>
              <p>
                {BRAND.name} is a fictional hackathon demonstration, not a
                healthcare provider, pharmacy, insurer, or payment service. It
                does not provide medical advice and does not claim that this
                demonstration establishes a HIPAA violation or HIPAA compliance.
              </p>
              <p>
                All names, contact details, health answers, prescriptions, and
                payment values used with this website must be synthetic.
              </p>
            </div>
          </section>

          <section>
            <span className="policy-number">06</span>
            <div>
              <h2>Contact</h2>
              <p>
                Privacy questions and opt-out requests may be submitted to
                <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
              </p>
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}
