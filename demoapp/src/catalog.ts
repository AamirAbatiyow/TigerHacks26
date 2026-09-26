export const conditions = [
  {
    id: "heart",
    name: "Heart health",
    description: "Cholesterol & blood pressure",
    icon: "heart",
  },
  {
    id: "mental",
    name: "Mental wellness",
    description: "Depression & anxiety",
    icon: "brain",
  },
  {
    id: "diabetes",
    name: "Diabetes",
    description: "Blood sugar management",
    icon: "activity",
  },
  {
    id: "allergy",
    name: "Allergies",
    description: "Seasonal & everyday relief",
    icon: "flower",
  },
  {
    id: "skin",
    name: "Skin health",
    description: "Acne & skin concerns",
    icon: "sun",
  },
  {
    id: "respiratory",
    name: "Breathing & asthma",
    description: "Respiratory health",
    icon: "wind",
  },
] as const;
export type Medication = {
  id: string;
  name: string;
  brand: string;
  condition: string;
  terms: string;
  dose: string;
  quantity: string;
  price: number;
  color: string;
};
export const medications: Medication[] = [
  {
    id: "atorvastatin",
    name: "Atorvastatin",
    brand: "Generic Lipitor",
    condition: "heart",
    terms: "cholesterol heart statin",
    dose: "20 mg",
    quantity: "30 tablets",
    price: 8.4,
    color: "lavender",
  },
  {
    id: "lisinopril",
    name: "Lisinopril",
    brand: "Generic Zestril",
    condition: "heart",
    terms: "blood pressure hypertension heart",
    dose: "10 mg",
    quantity: "30 tablets",
    price: 5.2,
    color: "peach",
  },
  {
    id: "sertraline",
    name: "Sertraline",
    brand: "Generic Zoloft",
    condition: "mental",
    terms: "depression anxiety mental wellness",
    dose: "50 mg",
    quantity: "30 tablets",
    price: 9.6,
    color: "pink",
  },
  {
    id: "metformin",
    name: "Metformin",
    brand: "Generic Glucophage",
    condition: "diabetes",
    terms: "diabetes blood sugar",
    dose: "500 mg",
    quantity: "60 tablets",
    price: 4.8,
    color: "mint",
  },
  {
    id: "cetirizine",
    name: "Cetirizine",
    brand: "Generic Zyrtec",
    condition: "allergy",
    terms: "allergy allergies seasonal",
    dose: "10 mg",
    quantity: "30 tablets",
    price: 6.5,
    color: "peach",
  },
  {
    id: "tretinoin",
    name: "Tretinoin",
    brand: "Generic Retin-A",
    condition: "skin",
    terms: "acne skin cream",
    dose: "0.025% cream",
    quantity: "1 tube, 20 g",
    price: 24.2,
    color: "pink",
  },
  {
    id: "albuterol",
    name: "Albuterol",
    brand: "Generic Ventolin HFA",
    condition: "respiratory",
    terms: "asthma breathing respiratory inhaler",
    dose: "90 mcg",
    quantity: "1 inhaler, 18 g",
    price: 18.4,
    color: "lavender",
  },
];
export const pharmacies = [
  {
    id: "meadow",
    name: "Meadow Pharmacy",
    subtitle: "Your neighborhood pharmacy",
    initials: "m",
    color: "mint",
    addition: 0,
  },
  {
    id: "juniper",
    name: "Juniper Drugstore",
    subtitle: "Care around the corner",
    initials: "J",
    color: "lavender",
    addition: 3.75,
  },
  {
    id: "oak",
    name: "Oak & Hearth",
    subtitle: "Pharmacy & everyday essentials",
    initials: "o+h",
    color: "peach",
    addition: 7.4,
  },
];
export type Pharmacy = (typeof pharmacies)[number];
export const money = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
