import contextlib
import io
import json
import re
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'fly-analytics'))
import demo_config
import event_store
from classifier import _origin_label, _third_party, analyze
from demo_config import DEFAULT_ORIGINS, is_scriptwell_origin, normalize_origin, parse_origins
from event_filters import is_demo_relevant
from server import DEFAULT_ALLOWED_ORIGINS, create_server as receiver_server, parse_allowed_origins

LOCAL, DEPLOYED, RECEIVER = 'http://localhost:5173', 'https://scriptwell.fly.dev', 'fly-analytics.fly.dev'
DEMO = json.loads((ROOT / 'tests/demo-payload.json').read_text())


class OriginRecognitionTests(unittest.TestCase):
    def test_local_and_deployed_origins_are_scriptwell(self):
        for origin in [LOCAL, 'http://127.0.0.1:5173', DEPLOYED, 'https://scriptwell.fly.dev/', 'https://ScriptWell.fly.dev:443/page']:
            self.assertTrue(is_scriptwell_origin(origin), origin)

    def test_lookalike_and_unrelated_origins_are_rejected(self):
        for origin in ['http://scriptwell.fly.dev', 'https://other-app.fly.dev', 'https://scriptwell.fly.dev.evil.test',
                       'https://evil.test/?next=https://scriptwell.fly.dev', 'http://localhost:3000', 'https://localhost:5173',
                       'https://www.google.com', 'null', '', None, 'chrome-extension://abc']:
            self.assertFalse(is_scriptwell_origin(origin), origin)

    def test_configured_origins_are_exact(self):
        origins = parse_origins('https://scriptwell-test.example, *.fly.dev, https://*.fly.dev, ftp://x.test')
        self.assertEqual(origins, {('https', 'scriptwell-test.example', 443)})
        with patch.object(demo_config, 'SCRIPTWELL_ORIGINS', origins):
            self.assertTrue(is_demo_relevant({'host': 'other.test', 'initiator': 'https://scriptwell-test.example'}))
            self.assertFalse(is_demo_relevant({'host': 'other.test', 'initiator': DEPLOYED}))
            self.assertFalse(is_demo_relevant({'host': 'other.test', 'initiator': LOCAL}))

    def test_friendly_label_keeps_address(self):
        self.assertEqual(_origin_label(LOCAL), 'ScriptWell (localhost:5173)')
        self.assertEqual(_origin_label(DEPLOYED), 'ScriptWell (scriptwell.fly.dev:443)')
        self.assertEqual(_origin_label('https://www.google.com'), 'www.google.com:443')


class FilterAndThirdPartyTests(unittest.TestCase):
    def test_filter_accepts_both_scriptwell_environments(self):
        self.assertTrue(is_demo_relevant({'host': 'other.test', 'initiator': LOCAL}))
        self.assertTrue(is_demo_relevant({'host': 'other.test', 'initiator': DEPLOYED}))
        self.assertTrue(is_demo_relevant({'host': RECEIVER, 'initiator': None}))
        self.assertTrue(is_demo_relevant({'host': 'scriptwell.fly.dev', 'destination_port': 443}))
        self.assertTrue(is_demo_relevant({'host': 'localhost:5173'}))

    def test_filter_still_suppresses_unrelated_traffic(self):
        for event in [{'host': 'www.google.com', 'initiator': 'https://www.google.com', 'destination_port': 443},
                      {'host': 'api2.cursor.sh', 'destination_port': 443},
                      {'host': 'gateway.icloud.com', 'initiator': None},
                      {'host': 'other-app.fly.dev', 'initiator': 'https://other-app.fly.dev'},
                      {'host': 'scriptwell.fly.dev', 'destination_port': 80},
                      {'host': '127.0.0.1', 'destination_port': 8765, 'initiator': DEPLOYED}]:
            self.assertFalse(is_demo_relevant(event), event)

    def test_third_party_derives_from_hostnames(self):
        self.assertIs(_third_party(LOCAL, RECEIVER), True)
        self.assertIs(_third_party(DEPLOYED, RECEIVER), True)
        self.assertIs(_third_party(DEPLOYED, 'scriptwell.fly.dev'), False)
        self.assertIsNone(_third_party(None, RECEIVER))

    def test_deployed_mitm_capture_classifies_locally(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(event_store, 'EVENTS_PATH', Path(directory) / 'e.jsonl'):
            event = {'source': 'mitm', 'scheme': 'https', 'method': 'POST', 'host': RECEIVER, 'path': '/collect',
                     'destination_port': 443, 'content_type': 'application/json', 'initiator': DEPLOYED,
                     'body': json.dumps(dict(DEMO, source={**DEMO['source'], 'origin': DEPLOYED})).encode()}
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                findings = analyze(event)
            stored = event_store.read_events()
        self.assertTrue(findings)
        self.assertEqual((stored[0]['initiator'], stored[0]['third_party']), (DEPLOYED, True))
        self.assertIn('ScriptWell (scriptwell.fly.dev:443)', output.getvalue())


class ReceiverCorsTests(unittest.TestCase):
    def preflight(self, server, origin):
        url = f'http://127.0.0.1:{server.server_port}/collect'
        return urlopen(Request(url, method='OPTIONS', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'}))

    def serve(self, **kwargs):
        server = receiver_server(0, **kwargs)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (server.shutdown(), server.server_close(), thread.join()))
        return server

    def test_both_scriptwell_origins_allowed_and_others_not(self):
        server = self.serve()
        for origin in [LOCAL, DEPLOYED]:
            response = self.preflight(server, origin)
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], origin)
            self.assertEqual(response.headers['Vary'], 'Origin')
            self.assertIn('POST', response.headers['Access-Control-Allow-Methods'])
            self.assertEqual(response.headers['Access-Control-Allow-Headers'], 'Content-Type')
            post = urlopen(Request(f'http://127.0.0.1:{server.server_port}/collect', data=b'{"synthetic":true}',
                                   headers={'Origin': origin, 'Content-Type': 'application/json'}))
            self.assertEqual((post.status, post.headers['Access-Control-Allow-Origin']), (200, origin))
        for origin in ['https://other-app.fly.dev', 'http://scriptwell.fly.dev', 'https://evil.test']:
            self.assertIsNone(self.preflight(server, origin).headers['Access-Control-Allow-Origin'])

    def test_configured_origins_never_include_wildcard(self):
        self.assertEqual(parse_allowed_origins('*, https://scriptwell-test.example/ ,https://*.fly.dev,null'),
                         {'https://scriptwell-test.example'})
        server = self.serve(allowed_origins=parse_allowed_origins('https://scriptwell-test.example'))
        self.assertEqual(self.preflight(server, 'https://scriptwell-test.example').headers['Access-Control-Allow-Origin'],
                         'https://scriptwell-test.example')
        self.assertIsNone(self.preflight(server, DEPLOYED).headers['Access-Control-Allow-Origin'])

    def test_receiver_privacy_routes_stay_disabled_remotely(self):
        server = self.serve()
        with self.assertRaises(Exception) as caught:
            urlopen(f'http://127.0.0.1:{server.server_port}/api/privacy/findings')
        self.assertEqual(caught.exception.code, 404)


class ConfigDriftTests(unittest.TestCase):
    def test_receiver_and_extension_cover_every_scriptwell_origin(self):
        expected = parse_origins(DEFAULT_ORIGINS)
        self.assertLessEqual(expected, {normalize_origin(o) for o in parse_allowed_origins(DEFAULT_ALLOWED_ORIGINS)})
        background = (ROOT.parent / 'extension/background.js').read_text()
        listed = re.search(r'SCRIPTWELL_ORIGINS = \[([^\]]+)\]', background).group(1)
        self.assertEqual({normalize_origin(o) for o in re.findall(r'"([^"]+)"', listed)}, expected)
        manifest = json.loads((ROOT.parent / 'extension/manifest.json').read_text())
        for scheme, host, port in expected:
            default = {'http': 80, 'https': 443}[scheme] == port
            self.assertIn(f'{scheme}://{host}{"" if default else f":{port}"}/*', manifest['host_permissions'])


if __name__ == '__main__': unittest.main()
