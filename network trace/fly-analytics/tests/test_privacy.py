import copy
from datetime import date
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from privacy.contract import LocalPrivacyFindingProvider, PrivacyFinding, ValidationError
from privacy.engine import OptOutEngine, ROOT
from privacy.store import EventConflict, ResultStore
from server import create_server


class PrivacyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.provider = LocalPrivacyFindingProvider(ROOT / 'fixtures')
        self.finding = self.provider.getPrivacyFinding('mock-microsoft-ads-001')
        self.engine = OptOutEngine(today=date(2026, 9, 26))
        self.store = ResultStore(Path(self.tmp.name) / 'results.sqlite3')

    def changed(self, **kwargs):
        raw = self.finding.to_dict()
        for group, changes in kwargs.items():
            if isinstance(changes, dict): raw[group].update(changes)
            else: raw[group] = changes
        return PrivacyFinding.parse(raw)

    def test_fixture_end_to_end_persisted_without_pii(self):
        result = self.store.run(self.finding, self.engine)
        self.assertEqual(result['status'], 'ACTION_REQUIRED')
        self.assertEqual(result['privacy_right'], 'targeted_advertising_opt_out')
        self.assertEqual(result['submission_method'], 'gpc')
        self.assertIsNone(result['submitted_at'])
        self.assertEqual([e['status'] for e in result['evidence']], ['READY', 'ACTION_REQUIRED'])
        self.assertEqual(self.store.list(), [result])
        for secret in [b'Jane', b'Doe', b'jane@example.com']:
            self.assertNotIn(secret, Path(self.store.path).read_bytes())
        self.assertEqual(self.store.run(self.finding, self.engine), result)
        with self.assertRaises(EventConflict):
            self.store.run(self.changed(user={'email': 'other@example.com'}), self.engine)

    def test_fixture_insertion_and_validation(self):
        directory = Path(self.tmp.name) / 'fixtures'
        directory.mkdir()
        path = directory / 'finding.json'
        path.write_text(json.dumps(self.finding.to_dict()))
        provider = LocalPrivacyFindingProvider(directory)
        self.assertEqual(self.store.run(provider.getPrivacyFinding(self.finding.event_id), self.engine)['status'], 'ACTION_REQUIRED')
        path.write_text('{bad json')
        with self.assertRaises(ValidationError): provider.findings()
        path.write_text(json.dumps(self.finding.to_dict()))
        (directory / 'duplicate.json').write_text(path.read_text())
        with self.assertRaises(ValidationError): provider.findings()

    def test_invalid_contract(self):
        for group, key, value in [('company', 'domain', 'https://microsoft.com'),
                                  ('company', 'domain', 'microsoft.com@evil.com'),
                                  ('user', 'state', 'UK'), ('user', 'email', 'bad'),
                                  ('reason', 'code', ''), ('company', 'name', None)]:
            raw = self.finding.to_dict()
            raw[group][key] = value
            with self.subTest(group=group, key=key), self.assertRaises(ValidationError): PrivacyFinding.parse(raw)
        raw = self.finding.to_dict()
        del raw['company']
        with self.assertRaises(ValidationError): PrivacyFinding.parse(raw)
        raw = self.finding.to_dict()
        raw['destination'] = 'https://evil.com'
        with self.assertRaises(ValidationError): PrivacyFinding.parse(raw)

    def test_unsupported_cases(self):
        for finding in [self.changed(reason={'code': 'unknown'}),
                        self.changed(company={'domain': 'microsoft.com.evil.com'}),
                        self.changed(company={'name': 'Other company'}),
                        self.changed(user={'state': 'MO'}), self.changed(reason={'code': 'sensitive_data'})]:
            result, strategy = self.engine.resolve(finding)
            self.assertEqual(result['status'], 'UNSUPPORTED')
            self.assertIsNone(result['destination'])
            self.assertIsNone(strategy)

    def test_mapping_and_deletion(self):
        sharing, _ = self.engine.resolve(self.changed(reason={'code': 'sale_or_sharing'}))
        self.assertEqual(sharing['privacy_right'], 'sale_sharing_opt_out')
        result = self.store.run(self.provider.getPrivacyFinding('mock-microsoft-delete-001'), self.engine)
        self.assertEqual(result['privacy_right'], 'deletion')
        self.assertEqual(result['status'], 'ACTION_REQUIRED')
        self.assertIn('account_login', result['verification_requirements'])
        self.assertIsNone(result['submitted_at'])

    def test_stale_unverified_future_strategy_and_rule(self):
        for value in ['2025-01-01', '2027-01-01', 'invalid']:
            strategies = copy.deepcopy(self.engine.strategies)
            for s in strategies: s['last_verified'] = value
            self.assertEqual(OptOutEngine(strategies=strategies, today=date(2026, 9, 26)).resolve(self.finding)[0]['status'], 'UNSUPPORTED')
        strategies = copy.deepcopy(self.engine.strategies)
        for s in strategies: s['status'] = 'unverified'
        self.assertEqual(OptOutEngine(strategies=strategies).resolve(self.finding)[0]['status'], 'UNSUPPORTED')
        rules = copy.deepcopy(self.engine.rules)
        rules['jurisdictions']['CA']['effective'] = '2027-01-01'
        self.assertEqual(OptOutEngine(rules=rules, today=date(2026, 9, 26)).resolve(self.finding)[0]['status'], 'UNSUPPORTED')

    def automated_engine(self, adapter, required_fields=None):
        # Test-only submission contract; no claim that a live endpoint is automatable.
        strategy = copy.deepcopy(self.engine.strategies[0])
        strategy.update(submission_method='http', verification_requirements=[], safe_automation=True,
                        required_fields=required_fields or ['email'])
        return OptOutEngine(strategies=[strategy], adapters={strategy['id']: adapter}, today=date(2026, 9, 26))

    def test_submission_minimum_fields_and_idempotency(self):
        calls = []
        class Adapter:
            def submit(self, strategy, right, fields, event_id):
                calls.append((right, fields, event_id))
                return {'status': 'SUBMITTED', 'reference': 'test-receipt-1'}
        engine = self.automated_engine(Adapter())
        result = self.store.run(self.finding, engine)
        self.assertEqual(result['status'], 'SUBMITTED')
        self.assertIsNotNone(result['submitted_at'])
        self.assertIsNone(result['completed_at'])
        self.store.run(self.finding, engine)
        self.assertEqual(calls, [('targeted_advertising_opt_out', {'email': 'jane@example.com'}, self.finding.event_id)])

    def test_missing_fields_and_blockers_do_not_submit(self):
        class Adapter:
            def submit(self, *args): raise AssertionError('must not submit')
        self.assertEqual(self.store.run(self.finding, self.automated_engine(Adapter(), ['phone']))['status'], 'ACTION_REQUIRED')
        for blocker in ['captcha', 'mfa', 'login', 'authorization']:
            engine = self.automated_engine(Adapter())
            engine.strategies[0]['verification_requirements'] = [blocker]
            result, strategy = engine.resolve(self.finding)
            self.assertEqual(engine.execute(self.finding, result, strategy)['status'], 'ACTION_REQUIRED')

    def test_failure_uncertain_receipt_and_completion(self):
        class Adapter:
            def __init__(self, receipt): self.receipt = receipt
            def submit(self, *args):
                if isinstance(self.receipt, Exception): raise self.receipt
                return self.receipt
        for receipt, expected in [(RuntimeError('secret'), 'FAILED'),
                                  ({'status': 'COMPLETED', 'reference': 'r'}, 'FAILED'),
                                  ({'status': 'SUBMITTED'}, 'FAILED'),
                                  ({'status': 'COMPLETED', 'reference': 'r', 'completion_evidence': 'company receipt'}, 'COMPLETED')]:
            engine = self.automated_engine(Adapter(receipt))
            result, strategy = engine.resolve(self.finding)
            result = engine.execute(self.finding, result, strategy)
            self.assertEqual(result['status'], expected)
            self.assertNotIn('secret', json.dumps(result))

    def test_interrupted_ready_does_not_resubmit(self):
        self.store.run(self.finding, self.engine)
        row = self.store.list()[0]
        row['status'] = 'READY'
        with self.store.connect() as db: db.execute('UPDATE opt_out_results SET result = ?', (json.dumps(row),))
        result = self.store.run(self.finding, self.engine)
        self.assertEqual(result['status'], 'ACTION_REQUIRED')
        self.assertIn('interrupted', result['message'])

    def test_replacement_provider_uses_same_pipeline(self):
        finding = self.finding
        class ReplacementProvider:
            def getPrivacyFinding(self, event_id):
                if event_id != finding.event_id: raise KeyError(event_id)
                return PrivacyFinding.parse(finding.to_dict())
            def listPrivacyFindings(self): return [finding]
        provider = ReplacementProvider()
        self.assertEqual(self.store.run(provider.getPrivacyFinding(finding.event_id), self.engine)['status'], 'ACTION_REQUIRED')
        self.assertEqual(len(provider.listPrivacyFindings()), 1)

    def test_gpc_is_never_emitted_by_server(self):
        class Adapter:
            def submit(self, *args): raise AssertionError('GPC needs user browser context')
        engine = OptOutEngine(adapters={'microsoft-gpc': Adapter()}, today=date(2026, 9, 26))
        engine.strategies[0]['safe_automation'] = True
        result = self.store.run(self.finding, engine)
        self.assertEqual(result['status'], 'ACTION_REQUIRED')
        self.assertIsNone(result['submitted_at'])

    def test_http_pipeline_security_and_persistence(self):
        server = create_server(0, local=True, db_path=Path(self.tmp.name) / 'http.sqlite3')
        server.engine = self.engine
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f'http://127.0.0.1:{server.server_port}/api/privacy/'
        def call(path, body=None, headers=None):
            req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Content-Type': 'application/json', **(headers or {})})
            with urllib.request.urlopen(req) as response: return json.load(response)
        self.assertEqual(len(call('findings')['findings']), 3)
        result = call('run', {'event_id': self.finding.event_id})
        self.assertEqual(result['status'], 'ACTION_REQUIRED')
        self.assertEqual(call('results')['results'], [result])
        self.assertEqual(call('run', {'event_id': self.finding.event_id}), result)
        extension_id = 'a' * 32
        origin = f'chrome-extension://{extension_id}'
        extension_headers = {'Origin': origin, 'X-HealthTrace-Extension': extension_id, 'Sec-Fetch-Site': 'cross-site'}
        previews = call('findings', headers=extension_headers)
        self.assertEqual(len(previews['findings']), 3)
        self.assertNotIn('jane@example.com', json.dumps(previews))
        request = urllib.request.Request(base + 'findings', method='OPTIONS', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'x-healthtrace-extension',
        })
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], origin)
            self.assertEqual(response.headers['Access-Control-Allow-Methods'], 'GET')
        for path, headers in [('results', extension_headers),
                              ('findings', {'Origin': origin, 'X-HealthTrace-Extension': 'b' * 32})]:
            with self.assertRaises(urllib.error.HTTPError) as error: call(path, headers=headers)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        for headers in [{'Origin': 'https://evil.com'}, {'Host': 'evil.com'}, {'Sec-Fetch-Site': 'cross-site'}]:
            with self.assertRaises(urllib.error.HTTPError) as error: call('results', headers=headers)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        for body, code in [({'event_id': 'missing'}, 404), ({'event_id': self.finding.event_id, 'destination': 'evil'}, 400)]:
            with self.assertRaises(urllib.error.HTTPError) as error: call('run', body)
            self.assertEqual(error.exception.code, code)
            error.exception.close()


if __name__ == '__main__': unittest.main()
