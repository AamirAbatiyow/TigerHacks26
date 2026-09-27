// Regenerate the classifier fixture from the actual demo event builder.
import { writeFileSync } from 'node:fs';
import { createOfferEvent } from '../src/analytics';
import { medications, pharmacies } from '../src/catalog';
Object.defineProperty(globalThis, 'window', { value: { location: { origin: 'http://localhost:5173', pathname: '/' }, innerWidth: 1440 } });
const payload = createOfferEvent({ fullName: 'Avery Example', email: 'avery@example.test', zipCode: '65201', weightLb: '160', healthConcern: 'Fictional anxiety', symptoms: 'Fictional restlessness', duration: '1_to_6_months', currentMedications: 'None', allergies: 'None', pharmacyPreference: 'lowest_price' }, medications[2], pharmacies[0], 'anxiety');
writeFileSync(new URL('../../network trace/tests/demo-payload.json', import.meta.url), JSON.stringify(payload, null, 2) + '\n');
