import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import classifier
from classifier import collect_findings, fuse, rule_match
from semantic_classifier import get_classifier, key_words, semantic_text

DEMO = json.loads((ROOT / 'tests/demo-payload.json').read_text())
MODEL = get_classifier()


def by_field(body):
    return {f['field']: f for f in collect_findings(body)}


def rules_only(body):
    with patch.object(classifier, 'get_classifier', return_value=None):
        return by_field(body)


class NormalizationTests(unittest.TestCase):
    def test_key_casings_paths_and_arrays(self):
        self.assertEqual(key_words('health.reproductive.contraceptiveMethod'),
                         ['health', 'reproductive', 'contraceptive', 'method'])
        self.assertEqual(key_words('pregnancy-goal'), ['pregnancy', 'goal'])
        self.assertEqual(key_words('last_period'), ['last', 'period'])
        self.assertEqual(key_words('HTTPStatusCode'), ['http', 'status', 'code'])
        self.assertEqual(key_words('phq9Score'), ['phq depression questionnaire', '9', 'score'])
        self.assertEqual(key_words('medical.medications[0]'), ['medical', 'medications'])
        self.assertEqual(semantic_text('health.reproductive.contraceptiveMethod', 'IUD'),
                         'health reproductive contraceptive method iud')
        self.assertEqual(semantic_text('rxList[2]', 'Sertraline'), 'prescription list list sertraline')

    def test_unsafe_values_are_not_embedded(self):
        for value in ['person@example.test', 'https://example.test/a', 'f11055f0-c945-40f4', 'None', 'x' * 60]:
            self.assertEqual(semantic_text('field', value), 'field')
        self.assertEqual(semantic_text('field', 7), 'field')
        self.assertEqual(semantic_text('field', True), 'field')


class FusionTests(unittest.TestCase):
    rule = {'category': 'medications', 'severity': 'HIGH', 'confidence': 0.9, 'reason': "field name contains 'rx'"}

    def semantic(self, category, score=0.7):
        return {'category': category, 'score': score, 'prototype': 'rx list'}

    def test_agreement_boosts_confidence(self):
        finding = fuse('rxList', 'x', self.rule, self.semantic('medications'))
        self.assertEqual(finding['detection_method'], 'rule+semantic')
        self.assertGreater(finding['confidence'], self.rule['confidence'])
        self.assertLessEqual(finding['confidence'], 0.99)

    def test_conflict_prefers_rule_and_keeps_semantic_score(self):
        finding = fuse('rxList', 'x', self.rule, self.semantic('insurance', 0.61))
        self.assertEqual((finding['category'], finding['detection_method'], finding['confidence']),
                         ('medications', 'rule', 0.9))
        self.assertEqual(finding['semantic_candidate'], {'category': 'insurance', 'score': 0.61})

    def test_semantic_fills_gap_below_rule_confidence(self):
        finding = fuse('currentMeds', 'x', None, self.semantic('medications', 0.95))
        self.assertEqual((finding['detection_method'], finding['severity']), ('semantic', 'HIGH'))
        self.assertLessEqual(finding['confidence'], 0.85)
        self.assertIsNone(fuse('price', 3, None, None))

    def test_structural_value_rules(self):
        self.assertEqual(rule_match('arbitrary', '192.168.1.20')['category'], 'device_identifiers')
        self.assertEqual(rule_match('arbitrary', '2001:db8::1')['category'], 'device_identifiers')
        self.assertEqual(rule_match('arbitrary', 'a4:83:e7:12:9c:01')['category'], 'device_identifiers')
        self.assertEqual(rule_match('arbitrary', 'person@example.test')['confidence'], 0.97)
        for value in ['12:30', '2026-01-01', '1.0', 'deadbeef']:
            self.assertIsNone(rule_match('arbitrary', value))


@unittest.skipUnless(MODEL, 'local semantic model not installed (run fetch_semantic_model.py)')
class SemanticClassifierTests(unittest.TestCase):
    def test_demo_payload_preserves_rules_and_adds_only_semantic_gaps(self):
        baseline, hybrid = rules_only(DEMO), by_field(DEMO)
        for field, finding in baseline.items():
            self.assertEqual((hybrid[field]['category'], hybrid[field]['severity']),
                             (finding['category'], finding['severity']), field)
            self.assertIn(hybrid[field]['detection_method'], ('rule', 'rule+semantic'))
        added = {field: f['category'] for field, f in hybrid.items() if field not in baseline}
        self.assertEqual(added, {'interaction.search_term': 'mental_health'})
        self.assertEqual(hybrid['interaction.search_term']['detection_method'], 'semantic')

    def test_alternate_field_names_generalize(self):
        body = {'health': {'reproductive': {'contraceptiveMethod': 'IUD'}}, 'bc_method': 'pill',
                'tryingForBaby': True, 'phq9Score': 8, 'rxList': ['Sertraline'], 'memberInsuranceId': 'SYN-1',
                'geoLatitude': 38.95, 'currentMeds': 'Iron', 'drinksPerWeek': 3, 'condomUse': True,
                'nextApptDate': '2026-10-01', 'bodyMassIndex': 22.1, 'chronicIllnesses': 'asthma',
                'feverish': True, 'postcode': '65201', 'clientIp': 'unavailable', 'birthdate': '2000-01-01'}
        expected = {
            'health.reproductive.contraceptiveMethod': 'reproductive_health', 'bc_method': 'reproductive_health',
            'tryingForBaby': 'reproductive_health', 'phq9Score': 'mental_health', 'rxList[0]': 'medications',
            'memberInsuranceId': 'insurance', 'geoLatitude': 'location', 'currentMeds': 'medications',
            'drinksPerWeek': 'substance_use', 'condomUse': 'sexual_health', 'nextApptDate': 'appointments',
            'bodyMassIndex': 'biometrics', 'chronicIllnesses': 'diagnoses', 'feverish': 'symptoms',
            'postcode': 'location', 'clientIp': 'device_identifiers', 'birthdate': 'identity'}
        found, baseline = by_field(body), rules_only(body)
        self.assertEqual({field: found[field]['category'] for field in expected if field in found}, expected)
        semantic_only = {'bc_method', 'tryingForBaby', 'currentMeds', 'drinksPerWeek', 'condomUse',
                         'nextApptDate', 'bodyMassIndex', 'chronicIllnesses', 'feverish', 'postcode', 'birthdate'}
        for field in semantic_only:
            self.assertNotIn(field, baseline, field)
            self.assertEqual(found[field]['detection_method'], 'semantic', field)
        for field in expected.keys() - semantic_only - {'clientIp'}:
            self.assertEqual(found[field]['detection_method'], 'rule+semantic', field)

    def test_benign_analytics_fields_stay_unclassified(self):
        body = {'schema_version': '1.0', 'event_name': 'offer_confirmed', 'occurred_at': '2026-09-26T00:00:00Z',
                'source': {'origin': 'http://localhost:5173', 'application': 'prescription_savings'},
                'cart': {'total': 42, 'currency': 'USD', 'items': [{'sku': 'A1'}]}, 'utm_source': 'newsletter',
                'theme': 'dark', 'sortOrder': 'asc', 'retryCount': 1, 'isLoggedIn': True, 'emailing': 'x',
                'experiment': {'variant': 'B'}, 'page_title': 'Home', 'button_id': 'cta-1', 'status': 'ok'}
        self.assertEqual(collect_findings(body), [])

    def test_findings_are_compact(self):
        text = json.dumps(collect_findings(DEMO))
        self.assertLess(len(text), 8000)
        allowed = {'field', 'value', 'category', 'severity', 'confidence', 'detection_method', 'reason',
                   'semantic_candidate'}
        for finding in collect_findings(DEMO):
            self.assertLessEqual(set(finding), allowed)
            self.assertTrue(0 < finding['confidence'] <= 0.99)

    def test_embeddings_are_cached(self):
        texts = ['cache probe alpha', 'cache probe beta']
        MODEL.embed(texts)
        with patch.object(MODEL, '_encode', side_effect=AssertionError('re-encoded')):
            self.assertEqual(MODEL.embed(texts).shape, (2, 384))


if __name__ == '__main__': unittest.main()
