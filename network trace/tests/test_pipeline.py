import contextlib
import io
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from classifier import collect_findings, analyze
from event_filters import sanitize_body, is_demo_relevant
from collectors.tshark_collector import parse_tshark_line
import event_store
from local_api import create_server


class PipelineTests(unittest.TestCase):
    def test_recursive_aliases(self):
        body = {'reproductive_health': {'birthControl': 'pill'}, 'pregnancy-goal': 'avoid',
                'last_period': '2026-01-01', 'symptoms': {'nausea': True},
                'medical': {'medications': ['sertraline']}, 'conditions': ['asthma'],
                'depressionScreenScore': 7, 'email': 'demo@example.test', 'phone': '555-0100',
                'insurance_id': 'synthetic', 'gps': {'latitude': 1}, 'deviceId': 'demo',
                'heartRate': 70, 'sexualHealth': {'test': 'negative'}, 'substanceUse': {'alcohol': False},
                'appointment': {'provider': 'Demo Clinic'}, 'arbitrary': 'person@example.test',
                'reproductive_health.birth_control': 'nested-path'}
        found = {f['field']: f for f in collect_findings(body)}
        self.assertEqual(found['medical.medications[0]']['value'], 'sertraline')
        self.assertEqual(found['depressionScreenScore']['category'], 'mental_health')
        self.assertEqual(len(found), 18)
        self.assertEqual(len({f['category'] for f in found.values()}), 13)
        self.assertFalse(collect_findings({'timestamp': 'now', 'method': 'POST', 'price': 3, 'emailing': 'x'}))

    def test_real_demo_payload(self):
        # Generated from createOfferEvent by demoapp/tests/export-payload.ts.
        body = json.loads((ROOT / 'tests/demo-payload.json').read_text())
        found = {f['field']: f for f in collect_findings(body)}
        for key in ['person.full_name', 'person.email', 'person.zip_code', 'health.weight_lb',
                    'health.concern', 'health.symptoms', 'health.duration', 'health.current_medications',
                    'health.medication_allergies', 'prescription.medication', 'prescription.strength',
                    'prescription.quantity', 'offer.pharmacy_name', 'interaction.pharmacy_preference']:
            self.assertIn(key, found)
        self.assertEqual(found['health.weight_lb']['value'], 160)

    def test_legacy_captures_have_stable_ids_and_updated_findings(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(event_store, 'EVENTS_PATH', Path(directory) / 'events.jsonl'):
            event_store.EVENTS_PATH.write_text(json.dumps({'host':'fly-analytics.fly.dev', 'source':'mitm',
                'body':{'medical':{'medications':['synthetic']}}, 'findings':[]}) + '\n' + '{partial')
            first = event_store.read_events()
            self.assertEqual(len(first), 1)
            self.assertEqual(first[0]['event_id'], event_store.read_events()[0]['event_id'])
            self.assertEqual(first[0]['findings'][0]['category'], 'medications')

    def test_filter_and_binary(self):
        self.assertTrue(is_demo_relevant({'host': 'other.test', 'initiator': 'http://localhost:5173'}))
        self.assertTrue(is_demo_relevant({'host': 'apple.com'}))
        self.assertTrue(is_demo_relevant({'host': 'localhost', 'destination_port': 3000}))
        self.assertTrue(is_demo_relevant({'host': 'other.test', 'initiator': 'http://localhost:3000'}))
        self.assertFalse(is_demo_relevant({'host': '127.0.0.1', 'destination_port': 8765, 'initiator': 'http://localhost:5173'}))
        for body, content_type, encoding in [(b'\x1f\x8babc', None, None), (b'abc', 'image/png', None), (b'abc', None, 'gzip')]:
            self.assertIsNone(sanitize_body(body, content_type, encoding)[0])

    def test_local_http_pipeline_and_privacy(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(event_store, 'EVENTS_PATH', Path(directory) / 'events.jsonl'):
            server = create_server(0, Path(directory) / 'privacy.db')
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            base = f'http://127.0.0.1:{server.server_port}'
            def call(path, data=None, origin='http://localhost:5174'):
                return urlopen(Request(base + path, data=json.dumps(data).encode() if data else None,
                                       headers={'Origin': origin, 'Content-Type': 'application/json'}))
            try:
                metadata = {'host': 'fly-analytics.fly.dev', 'path': '/collect', 'method': 'POST', 'scheme': 'https'}
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertTrue(json.load(call('/events', metadata))['accepted'])
                    wire = json.dumps({'medical': {'medications': ['sertraline']}}).encode().hex()
                    event = parse_tshark_line('POST\t/collect\t1.2.3.4\t80\tfly-analytics.fly.dev\tapplication/json\t\t' + wire)
                    analyze(event)
                events = json.load(call('/events'))['events']
                self.assertEqual([e['source'] for e in events], ['browser_extension', 'tshark'])
                self.assertEqual(events[1]['findings'][0]['value'], 'sertraline')
                findings = json.load(call('/api/privacy/findings'))['findings']
                self.assertEqual(len(findings), 1)
                self.assertEqual(findings[0]['status'], 'UNSUPPORTED')
                self.assertNotIn('sertraline', json.dumps(findings))
                result = json.load(call('/api/privacy/run', {'event_id': findings[0]['event_id']}))
                self.assertIsNone(result['submitted_at'])
                self.assertEqual(len(json.load(call('/api/privacy/results'))['results']), 1)
                with self.assertRaises(HTTPError) as caught:
                    call('/events', origin='https://untrusted.test')
                self.assertEqual(caught.exception.code, 403)
            finally:
                server.shutdown(); server.server_close(); thread.join()

    def test_receiver_collect_cors_and_no_body_logging(self):
        from server import create_server as receiver_server
        server = receiver_server(0)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        url = f'http://127.0.0.1:{server.server_port}/collect'
        try:
            for origin, expected in [('http://localhost:5173', 'http://localhost:5173'),
                                     ('https://untrusted.test', None)]:
                response = urlopen(Request(url, method='OPTIONS', headers={'Origin': origin}))
                self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), expected)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                response = urlopen(Request(url, data=b'{"email":"synthetic@example.test"}',
                    headers={'Origin':'http://localhost:5173', 'Content-Type':'application/json'}))
            self.assertEqual(json.load(response), {'ok': True})
            self.assertNotIn('synthetic@example.test', output.getvalue())
            with self.assertRaises(HTTPError):
                urlopen(Request(url, data=b'\x1f\x8babc', headers={'Content-Encoding': 'gzip'}))
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__': unittest.main()
