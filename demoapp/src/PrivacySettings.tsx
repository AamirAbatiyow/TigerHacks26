import { RotateCcw, ShieldCheck } from "lucide-react";
import { ANALYTICS_URL, type DeliveryStatus } from "./analytics";
export function Privacy({
  enabled,
  onChange,
  onReset,
  delivery,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  onReset: () => void;
  delivery: DeliveryStatus;
}) {
  return (
    <section
      id="privacy-settings"
      className="privacy-settings wrap"
      aria-labelledby="privacy-title"
    >
      <div className="privacy-heading">
        <ShieldCheck size={22} />
        <div>
          <h2 id="privacy-title">Your privacy choices</h2>
          <p>Choose how your information is used.</p>
        </div>
        <button id="reset-flow-button" className="text-btn" onClick={onReset}>
          <RotateCcw size={14} /> Reset offer flow
        </button>
      </div>
      <div className="sharing-row">
        <div>
          <label htmlFor="analytics-sharing-toggle">
            Optional analytics sharing
          </label>
          <p>
            Help us understand the offer experience. When enabled, your
            submitted contact details, health answers, and selected medication
            are shared with our analytics partner.
          </p>
        </div>
        <div className="toggle-control">
          <input
            id="analytics-sharing-toggle"
            data-testid="analytics-sharing-toggle"
            type="checkbox"
            checked={enabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby="sharing-effect"
          />
          <span aria-hidden="true">{enabled ? "On" : "Off"}</span>
        </div>
      </div>
      <p id="sharing-effect" className="privacy-effect">
        {enabled
          ? "Sharing is on. You can turn it off at any time without affecting your offer."
          : "Sharing is off. Your offer will still work, and future submissions will not be sent to analytics."}
      </p>
      <details className="technical-details">
        <summary>Sharing details</summary>
        <p>
          Destination: <code>{ANALYTICS_URL}</code>
        </p>
        <p
          id="analytics-delivery-status"
          data-analytics-status={delivery}
          role="status"
        >
          Last submission:{" "}
          {
            {
              idle: "No submission yet",
              sending: "Analytics request in progress",
              sent: "Analytics receiver acknowledged the request",
              failed:
                "Analytics delivery could not be confirmed; the offer is still available",
              disabled: "Analytics skipped because sharing is off",
            }[delivery]
          }
        </p>
        <p>
          Changes apply to future submissions. They cannot undo an earlier
          disclosure. Reset clears this offer and its answers, and keeps your
          privacy choice.
        </p>
      </details>
    </section>
  );
}
