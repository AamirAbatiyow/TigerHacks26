// User-facing issues derived from raw classifier findings. Findings themselves are not changed.
const SEVERITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

// Service mailboxes and browser context. Patient identity fields are not in this set.
export const SUPPRESSED_FIELDS = new Set([
  "source.support_email",
  "offer.support_email",
  "privacy.contact_email",
  "privacy.privacy_email",
  "interaction.language",
  "interaction.viewport_width",
]);

// Meaning groups. A finding joins only the group that names its field. Shared category is not enough.
// metadata fields ride along with a group and never become their own issue.
const GROUPS = [
  { id: "full_name", title: "Full name", category: "identity", fields: ["person.full_name"] },
  { id: "email", title: "Email address", category: "identity", fields: ["person.email"] },
  { id: "zip", title: "ZIP / location", category: "location", fields: ["person.zip_code"] },
  { id: "weight", title: "Body weight", category: "biometrics", fields: ["health.weight_lb"] },
  { id: "concern", title: "Health concern", category: "diagnoses", fields: ["health.concern"] },
  { id: "symptoms", title: "Symptoms and duration", category: "symptoms", fields: ["health.symptoms", "health.duration"] },
  { id: "medications", title: "Current medications", category: "medications", fields: ["health.current_medications"] },
  { id: "allergies", title: "Medication allergies", category: "medications", fields: ["health.medication_allergies"] },
  { id: "prescription", title: "Prescription details", category: "medications", fields: ["prescription.medication", "prescription.strength", "prescription.quantity"] },
  { id: "payment_card", title: "Payment card details", category: "financial", fields: ["payment.cardholder_name", "payment.card_number", "payment.expiration", "payment.cvc"] },
  { id: "billing_zip", title: "Billing ZIP", category: "location", fields: ["payment.billing_zip"] },
  {
    id: "pharmacy",
    title: "Pharmacy / fulfillment preference",
    category: "appointments",
    fields: ["offer.pharmacy_name", "interaction.pharmacy_preference"],
    metadata: ["offer.pharmacy_id"],
  },
];

const METADATA_FIELDS = new Set(GROUPS.flatMap((group) => group.metadata || []));

function severityOf(findings) {
  let best = null;
  let rank = 0;
  for (const finding of findings) {
    const label = String(finding.severity || "");
    const score = SEVERITY_RANK[label.toUpperCase()] || 0;
    if (score > rank) {
      rank = score;
      best = label;
    }
  }
  return best;
}

function confidenceOf(findings) {
  const scores = findings.map((finding) => Number(finding.confidence)).filter((score) => Number.isFinite(score));
  return scores.length ? Math.max(...scores) : null;
}

function displayValue(field, value) {
  if (field === "payment.cvc") return "•••";
  if (field === "payment.card_number") {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
  }
  if (value == null) return "";
  return String(value).replaceAll("_", " ");
}

function issueFrom(group, members, metadata, byField) {
  const included = [...members, ...metadata].flatMap((field) => byField.get(field));
  return {
    id: group.id,
    type: group.id,
    title: group.title,
    category: group.category,
    severity: severityOf(included),
    fields: members,
    metadata,
    summary: members.map((field) => displayValue(field, byField.get(field)[0].value)).filter(Boolean).join(" · "),
    confidence: confidenceOf(included),
  };
}

export function privacyIssues(findings) {
  const byField = new Map();
  for (const finding of Array.isArray(findings) ? findings : []) {
    const field = finding?.field;
    if (typeof field !== "string" || !field || SUPPRESSED_FIELDS.has(field)) continue;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(finding);
  }
  const used = new Set();
  const issues = [];
  for (const group of GROUPS) {
    const members = group.fields.filter((field) => byField.has(field));
    const metadata = (group.metadata || []).filter((field) => byField.has(field));
    if (!members.length) continue;
    for (const field of [...members, ...metadata]) used.add(field);
    issues.push(issueFrom(group, members, metadata, byField));
  }
  for (const [field, groupFindings] of byField) {
    if (used.has(field) || METADATA_FIELDS.has(field)) continue;
    const finding = groupFindings[0];
    issues.push({
      id: `field:${field}`,
      type: "field",
      title: field,
      category: finding.category || "unknown",
      severity: severityOf(groupFindings),
      fields: [field],
      metadata: [],
      summary: displayValue(field, finding.value),
      confidence: confidenceOf(groupFindings),
    });
  }
  return issues;
}
