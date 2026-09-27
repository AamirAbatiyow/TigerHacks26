import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Brain,
  ChevronRight,
  Flower2,
  Heart,
  Pill,
  Search,
  Sun,
  Wind,
} from "lucide-react";
import { BRAND, PRIVACY_EMAIL } from "./config";
import {
  conditions,
  medications,
  money,
  pharmacies,
  type Medication,
  type Pharmacy,
} from "./catalog";
import {
  Intake,
  Confirmation,
  type CompletedOffer,
  type IntakeData,
} from "./Intake";
import { createOfferEvent, sendOfferEvent } from "./analytics";
import { PrivacyPolicy } from "./PrivacyPolicy";
const icons = {
  heart: Heart,
  brain: Brain,
  activity: Activity,
  flower: Flower2,
  sun: Sun,
  wind: Wind,
};
const featuredMedicationIds = new Set([
  "sertraline",
  "atorvastatin",
  "metformin",
  "albuterol",
]);
const featuredMedications = medications.filter((medication) =>
  featuredMedicationIds.has(medication.id),
);
export default function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [searched, setSearched] = useState(false);
  const [medication, setMedication] = useState<Medication | null>(null);
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [completed, setCompleted] = useState<CompletedOffer | null>(null);
  const submitted = useRef(false);
  const privacyPage = window.location.pathname === "/privacy";
  const finish = (data: IntakeData) => {
    if (!medication || !pharmacy || submitted.current) return;
    submitted.current = true;
    void sendOfferEvent(
      createOfferEvent(data, medication, pharmacy, query || category),
    );
    setCompleted({
      medication,
      pharmacy,
      firstName: data.fullName.split(/\s+/)[0],
    });
    setPharmacy(null);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    document.title = privacyPage
      ? `${BRAND.name} | Privacy Policy`
      : `${BRAND.name} | Prescription savings`;
  }, [privacyPage]);
  const results = medications.filter(
    (m) =>
      (!category || m.condition === category) &&
      `${m.name} ${m.brand} ${m.terms}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const home = () => {
    submitted.current = false;
    setPharmacy(null);
    setCompleted(null);
    setMedication(null);
    setSearched(false);
    setCategory("");
    setQuery("");
  };
  const goHome = () => {
    if (privacyPage) {
      window.location.assign("/");
      return;
    }
    home();
  };
  const browse = (id: string) => {
    setCategory(id);
    setQuery("");
    setSearched(true);
    setMedication(null);
  };
  return (
    <>
      <header className="header wrap">
        <button
          className="brand"
          onClick={goHome}
          aria-label={`${BRAND.name} home`}
        >
          <span className="brandmark">
            <Pill size={24} />
          </span>
          {BRAND.name}
          <span className="brand-dot">.</span>
        </button>
        <nav aria-label="Main navigation">
          <button className={!privacyPage ? "nav-active" : ""} onClick={goHome}>
            Prescription savings
          </button>
          <a href={privacyPage ? "/#conditions" : "#conditions"} onClick={home}>
            Explore health
          </a>
          <a
            href={privacyPage ? "/#how-it-works" : "#how-it-works"}
            onClick={home}
          >
            How it works
          </a>
        </nav>
      </header>
      <main>
        {privacyPage ? (
          <PrivacyPolicy />
        ) : completed ? (
          <Confirmation offer={completed} onBrowse={home} />
        ) : medication && pharmacy ? (
          <Intake
            medication={medication}
            pharmacy={pharmacy}
            onBack={() => setPharmacy(null)}
            onComplete={finish}
          />
        ) : !medication ? (
          <>
            <section className="hero">
              <div className="wrap hero-grid">
                <div className="hero-copy">
                  <h1>
                    Your health matters.
                    <br />
                    So does your <span>budget.</span>
                  </h1>
                  <p>
                    Find your medication. Compare pharmacy prices.
                    <br className="desktop" /> Take the next step with a little
                    more peace of mind.
                  </p>
                  <form
                    className="search"
                    role="search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSearched(true);
                      setCategory("");
                      document.getElementById("results")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                  >
                    <Search size={23} />
                    <label className="sr-only" htmlFor="medication-search">
                      Search medication or condition
                    </label>
                    <input
                      id="medication-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Enter a medication or health concern"
                    />
                    <button className="dark-btn" type="submit">
                      Find savings <ArrowRight size={17} />
                    </button>
                  </form>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="art-ring" />
                  <div className="art-spark spark-one">✳</div>
                  <div className="art-spark spark-two">✳</div>
                  <div className="bottle">
                    <div className="bottle-cap" />
                    <div className="bottle-label">
                      <span className="mini-brand">
                        <Pill size={16} /> {BRAND.name}
                      </span>
                      <strong>
                        More care.
                        <br />
                        Less worry.
                      </strong>
                      <div className="bottle-line" />
                      <small>PRESCRIPTION SAVINGS</small>
                      <span className="bottle-rx">Rx</span>
                    </div>
                  </div>
                  <div className="art-pill pill-one" />
                  <div className="art-pill pill-two" />
                </div>
              </div>
            </section>
            <section className="wrap section" id="conditions">
              <div className="section-heading">
                <h2>What brings you here today?</h2>
              </div>
              <div className="condition-grid">
                {conditions.map((c) => {
                  const Icon = icons[c.icon];
                  return (
                    <button
                      className={`condition-card ${category === c.id ? "selected" : ""}`}
                      key={c.id}
                      onClick={() => browse(c.id)}
                    >
                      <span className={`condition-icon ${c.tone}`}>
                        <Icon size={25} />
                      </span>
                      <strong>{c.name}</strong>
                      <ArrowRight size={18} />
                    </button>
                  );
                })}
              </div>
            </section>
            <section
              className="wrap section medication-section"
              id="results"
              aria-live="polite"
            >
              <div className="section-heading">
                <h2>
                  {searched
                    ? category
                      ? `${conditions.find((c) => c.id === category)?.name} medications`
                      : `Results${query ? ` for “${query}”` : ""}`
                    : "Popular prescriptions"}
                </h2>
                {searched && (
                  <button
                    className="text-btn"
                    onClick={() => {
                      setQuery("");
                      setCategory("");
                      setSearched(false);
                    }}
                  >
                    Clear filters <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <div className="medication-grid">
                {(searched ? results : featuredMedications).map((m) => (
                  <button
                    className="medication-card"
                    key={m.id}
                    onClick={() => {
                      setMedication(m);
                      window.scrollTo(0, 0);
                    }}
                  >
                    <span className={`pill-icon ${m.color}`}>
                      <Pill size={24} />
                    </span>
                    <span className="medication-name">
                      <strong>{m.name}</strong>
                      <small>{m.brand}</small>
                    </span>
                    <span className="dose">
                      {m.dose} · {m.quantity}
                    </span>
                    <span className="medication-price">
                      <span>
                        Price from <b>{money(m.price)}</b>
                      </span>
                      <span className="arrow-circle">
                        <ArrowRight size={18} />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {searched && !results.length && (
                <div className="empty">
                  <Search size={30} />
                  <h3>No matching medications</h3>
                  <p>Try a medication name, “anxiety,” or “blood pressure.”</p>
                  <button
                    className="dark-btn"
                    onClick={() => {
                      setQuery("");
                      setCategory("");
                    }}
                  >
                    Browse all medications
                  </button>
                </div>
              )}
            </section>
            <section className="wrap how-section" id="how-it-works">
              <div>
                <h2>
                  A simpler path
                  <br />
                  to prescription savings.
                </h2>
              </div>
              <div className="steps">
                {[
                  ["01", "Find your medication"],
                  ["02", "Compare your options"],
                  ["03", "Make it yours"],
                ].map(([n, t]) => (
                  <div className="step" key={n}>
                    <span>{n}</span>
                    <div>
                      <h3>{t}</h3>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="wrap comparison section">
            <button className="text-btn" onClick={() => setMedication(null)}>
              <ArrowLeft size={17} /> Back to medications
            </button>
            <div className="comparison-heading">
              <span className={`large-pill ${medication.color}`}>
                <Pill size={40} />
              </span>
              <div>
                <h1>{medication.name}</h1>
                <p>
                  {medication.brand} · {medication.dose} · {medication.quantity}
                </p>
              </div>
            </div>
            <div className="comparison-layout">
              <div>
                <div className="section-heading">
                  <h2>Compare pharmacy offers</h2>
                </div>
                <div className="offers">
                  {pharmacies.map((p, i) => (
                    <article
                      className={`offer ${i === 0 ? "best" : ""}`}
                      key={p.id}
                    >
                      {i === 0 && (
                        <span className="best-label">LOWEST PRICE</span>
                      )}
                      <span className={`pharmacy-logo ${p.color}`}>
                        {p.initials}
                      </span>
                      <div className="pharmacy-info">
                        <h3>{p.name}</h3>
                      </div>
                      <div className="offer-price">
                        <strong>{money(medication.price + p.addition)}</strong>
                      </div>
                      <button
                        className="dark-btn offer-link"
                        onClick={() => {
                          setPharmacy(p);
                          window.scrollTo(0, 0);
                        }}
                        aria-label={`Choose ${p.name}`}
                      >
                        Choose offer <ChevronRight size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
      <footer className="footer">
        <div className="wrap">
          <div className="footer-top">
            <span className="brand">
              <Pill size={24} />
              {BRAND.name}
              <span className="brand-dot">.</span>
            </span>
            <a href={privacyPage ? "/#how-it-works" : "#how-it-works"}>
              How it works <ArrowRight size={15} />
            </a>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {BRAND.name}
            </span>
            <span className="footer-links">
              <a href="/privacy">Privacy Policy</a>
              <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
