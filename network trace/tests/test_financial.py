import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import classifier
from classifier import aba_routing_valid, card_number, collect_findings, iban_valid, luhn_valid, rule_match
from semantic_classifier import get_classifier

DEMO = json.loads((ROOT / 'tests/demo-payload.json').read_text())
MODEL = get_classifier()

# Published network test numbers and documentation examples only; none is a real account.
VISA_TEST = '4242424242424242'
VISA_ALT = '4111111111111111'
MASTERCARD_TEST = '5555555555554444'
AMEX_TEST = '378282246310005'
ABA_TEST = '011000015'
IBAN_EXAMPLE = 'GB82WEST12345698765432'


def by_field(body):
    return {f['field']: f for f in collect_findings(body)}


def rules_only(body):
    with patch.object(classifier, 'get_classifier', return_value=None):
        return by_field(body)


class StructuralValidatorTests(unittest.TestCase):
    def test_luhn(self):
        for number in (VISA_TEST, VISA_ALT, MASTERCARD_TEST, AMEX_TEST):
            self.assertTrue(luhn_valid(number), number)
        self.assertFalse(luhn_valid('4242424242424241'))

    def test_card_number_requires_network_prefix_length_and_luhn(self):
        self.assertEqual(card_number(VISA_TEST), (VISA_TEST, False))
        self.assertEqual(card_number('4242 4242 4242 4242'), (VISA_TEST, True))
        self.assertEqual(card_number('4242-4242-4242-4242'), (VISA_TEST, True))
        self.assertEqual(card_number('3782 822463 10005'), (AMEX_TEST, True))
        self.assertEqual(card_number(int(VISA_TEST)), (VISA_TEST, False))
        self.assertEqual(card_number('4242 4242-4242 4242'), (VISA_TEST, False))
        for value in ('4242424242424241', '0000000000000000', '9999999999999995', '42424242424242424242',
                      '424242424242', '4242  4242 4242 4242', True, None, 4.2):
            self.assertIsNone(card_number(value), value)

    def test_iban_and_routing_checksums(self):
        self.assertTrue(iban_valid(IBAN_EXAMPLE))
        self.assertTrue(iban_valid('GB82 WEST 1234 5698 7654 32'))
        self.assertFalse(iban_valid('GB82WEST12345698765431'))
        self.assertFalse(iban_valid('XX82WEST12345698765432'))
        self.assertTrue(aba_routing_valid(ABA_TEST))
        self.assertFalse(aba_routing_valid('011000016'))
        self.assertFalse(aba_routing_valid('01100001'))


class FinancialRuleTests(unittest.TestCase):
    """Deterministic behavior; identical with or without the semantic model."""

    def assertFinancial(self, finding, method=None):
        self.assertIsNotNone(finding)
        self.assertEqual((finding['category'], finding['severity']), ('financial', 'HIGH'))
        if method:
            self.assertIn(method, finding['reason'])

    def test_payment_field_names_in_any_casing(self):
        body = {'payment': {'card_number': VISA_TEST, 'cvc': '123', 'expiration': '12/29',
                            'cardholder_name': 'Avery Synthetic'},
                'creditCardNumber': MASTERCARD_TEST, 'debit-card': 'on file', 'cvv': '4321',
                'securityCode': '321', 'card': {'expiry': '12/2029', 'exp_month': 12, 'exp_year': 2029},
                'routing_number': ABA_TEST, 'bankAccount': 'synthetic', 'account_number': 'synthetic',
                'iban': IBAN_EXAMPLE, 'bank_swift': 'SYNTHXXX', 'bic': 'SYNTHXXX', 'payment_token': 'tok_synthetic',
                'wallet': {'cards': [{'number': VISA_ALT, 'pan': 'masked'}]}, 'ccExp': '01/30'}
        found = rules_only(body)
        for field in ('payment.card_number', 'payment.cvc', 'payment.expiration', 'payment.cardholder_name',
                      'creditCardNumber', 'debit-card', 'cvv', 'securityCode', 'card.expiry', 'card.exp_month',
                      'card.exp_year', 'routing_number', 'bankAccount', 'account_number', 'iban', 'bank_swift',
                      'bic', 'payment_token', 'wallet.cards[0].number', 'wallet.cards[0].pan', 'ccExp'):
            self.assertFinancial(found.get(field), None)
        self.assertFinancial(found['payment.card_number'], 'Luhn-valid')
        self.assertFinancial(found['wallet.cards[0].number'], 'Luhn-valid')
        self.assertFinancial(found['payment.cvc'], 'security code')
        self.assertFinancial(found['payment.expiration'], 'expiration date')
        self.assertFinancial(found['card.expiry'], 'expiration date')
        self.assertFinancial(found['routing_number'], 'ABA routing')
        self.assertFinancial(found['iban'], 'IBAN')

    def test_spaced_and_hyphenated_cards_are_structural_anywhere(self):
        for value in ('4242 4242 4242 4242', '4111-1111-1111-1111', '3782 822463 10005'):
            finding = rule_match('notes', value)
            self.assertFinancial(finding, 'Luhn-valid')
            self.assertEqual(finding['confidence'], 0.97)

    def test_structural_match_outranks_other_key_rules(self):
        self.assertEqual(rule_match('user_id', '4242 4242 4242 4242')['category'], 'financial')
        self.assertEqual(rule_match('memo', 'GB82 WEST 1234 5698 7654 32')['category'], 'financial')

    def test_billing_zip_is_location_not_a_payment_credential(self):
        for field in ('billing_zip', 'billingPostalCode', 'payment.billing_zip'):
            self.assertEqual(rule_match(field, '65201')['category'], 'location', field)

    def test_negatives_are_not_financial(self):
        body = {'tracking_number': '4242 4242 4242 4241', 'order_id': VISA_TEST, 'invoiceRef': '1234567890123456',
                'age': 123, 'count': '321', 'value': '456', 'retries': 999,
                'subscription': {'expiration': '12/29'}, 'session_expiry': '12/2029', 'coupon': {'exp': '01/30'},
                'phone': '573-555-0142', 'zip_code': '65201', 'request_uuid': 'f11055f0-c945-40f4-9f2d-1b2c3d4e5f60',
                'panX': 14, 'map': {'pan': 3}, 'swiftVersion': '5.9', 'swift': 'fast', 'routeKey': ABA_TEST,
                'nine_digits': ABA_TEST, 'reference': 'GB82WEST12345698765431', 'cart': {'total': 42.5, 'currency': 'USD'}}
        for found in (rules_only(body), by_field(body)):
            financial = {field for field, f in found.items() if f['category'] == 'financial'}
            self.assertEqual(financial, set())
        found = rules_only(body)
        self.assertEqual(found['phone']['category'], 'identity')
        self.assertEqual(found['zip_code']['category'], 'location')

    def test_scriptwell_payment_fields(self):
        found = rules_only(DEMO)
        for field in ('payment.card_number', 'payment.cvc', 'payment.expiration', 'payment.cardholder_name'):
            self.assertFinancial(found.get(field), None)
        self.assertEqual(found['payment.billing_zip']['category'], 'location')
        self.assertNotIn('payment.demo_only', found)
        self.assertFalse(any('4242' in f['reason'] for f in found.values()))


@unittest.skipUnless(MODEL, 'local semantic model not installed (run fetch_semantic_model.py)')
class FinancialSemanticTests(unittest.TestCase):
    def test_semantic_corroborates_structural_payment_matches(self):
        found = by_field(DEMO)
        for field in ('payment.card_number', 'payment.cvc', 'payment.expiration', 'payment.cardholder_name'):
            self.assertEqual((found[field]['category'], found[field]['detection_method']),
                             ('financial', 'rule+semantic'), field)

    def test_semantic_cannot_override_structural_match(self):
        finding = classifier.fuse('payment.card_number', VISA_TEST, rule_match('payment.card_number', VISA_TEST),
                                  {'category': 'identity', 'score': 0.9, 'prototype': 'user account id'})
        self.assertEqual((finding['category'], finding['detection_method'], finding['confidence']),
                         ('financial', 'rule', 0.97))
        self.assertEqual(finding['semantic_candidate']['category'], 'identity')

    def test_semantic_fills_alternate_payment_names(self):
        found = by_field({'plasticNumberOnFile': 'on file', 'nameOnTheCard': 'Avery Synthetic'})
        self.assertTrue(found, 'expected at least one semantic payment gap fill')
        for field, finding in found.items():
            self.assertEqual(finding['category'], 'financial', field)


if __name__ == '__main__': unittest.main()
