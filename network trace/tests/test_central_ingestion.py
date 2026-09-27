import contextlib
import gzip
import io
import json
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'collectors'))
sys.modules.setdefault('mitmproxy', types.SimpleNamespace(http=types.SimpleNamespace(HTTPFlow=object)))
import event_store
import local_api
import local_sink
import mitm_collector
from semantic_classifier import get_classifier
from tshark_collector import parse_tshark_line

DEMO = (ROOT / 'tests/demo-payload.json').read_bytes()
EXTENSION = 'chrome-extension://' + 'a' * 32
BLOCK_ML = "import sys; sys.modules['numpy'] = None; sys.modules['onnxruntime'] = None; "


def mitm_flow(host, body, origin='https://scriptwell.fly.dev', encoding=None):
    headers = {'Content-Type': 'application/json', 'Origin': origin}
    if encoding:
        headers['Content-Encoding'] = encoding
    request = types.SimpleNamespace(scheme='https', method='POST', host=host, path='/collect', port=443,
                                    headers=headers, raw_content=body)
    return types.SimpleNamespace(request=request, server_conn=types.SimpleNamespace(peername=('203.0.113.9', 443)))


class CentralIngestionTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.events = Path(directory.name) / 'events.jsonl'
        store_patch = patch.object(event_store, 'EVENTS_PATH', self.events)
        store_patch.start()
        self.addCleanup(store_patch.stop)
        self.server = local_api.create_server(0, Path(directory.name) / 'privacy.db')
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (self.server.shutdown(), self.server.server_close(), thread.join()))
        url_patch = patch.object(local_sink, 'LOCAL_EVENTS_URL', f'http://127.0.0.1:{self.server.server_port}/events')
        url_patch.start()
        self.addCleanup(url_patch.stop)
        self.output = io.StringIO()
        quiet = contextlib.redirect_stdout(self.output)
        quiet.__enter__()
        self.addCleanup(quiet.__exit__, None, None, None)

    def stored(self):
        return [json.loads(line) for line in self.events.read_text().splitlines()] if self.events.exists() else []

    def assert_semantic(self, event):
        if get_classifier():
            self.assertTrue(any('semantic' in f['detection_method'] for f in event['findings']))
            self.assertEqual(event['findings_by_field']['interaction.search_term'], 'semantic')

    def summarize(self, event):
        event['findings_by_field'] = {f['field']: f['detection_method'] for f in event['findings']}
        return event

    def test_extension_metadata_goes_through_central_classifier_once(self):
        event = {'source': 'mitm', 'scheme': 'https', 'method': 'POST', 'host': 'fly-analytics.fly.dev', 'path': '/collect',
                 'destination_port': 443, 'initiator': 'https://scriptwell.fly.dev', 'tab_id': 3,
                 'body': {'email': 'a@b.test'}, 'body_base64': 'e30='}
        response = urlopen(Request(f'http://127.0.0.1:{self.server.server_port}/events', data=json.dumps(event).encode(),
                                   headers={'Origin': EXTENSION, 'Content-Type': 'application/json'}))
        self.assertTrue(json.load(response)['accepted'])
        [stored] = self.stored()
        self.assertEqual((stored['source'], stored['body'], stored['findings'], stored['third_party']),
                         ('browser_extension', None, [], True))

    def test_mitm_event_is_classified_centrally_with_semantics_and_stored_once(self):
        mitm_collector.response(mitm_flow('fly-analytics.fly.dev', DEMO))
        [stored] = self.stored()
        self.summarize(stored)
        self.assertEqual((stored['source'], stored['scheme'], stored['body_type'], stored['third_party']),
                         ('mitm', 'https', 'json', True))
        self.assertEqual(stored['body']['person']['email'], 'avery@example.test')
        self.assertGreaterEqual(len(stored['findings']), 17)
        self.assert_semantic(stored)
        self.assertIn('[mitm] POST fly-analytics.fly.dev/collect -> local classifier', self.output.getvalue())
        self.assertIn('From:        ScriptWell (scriptwell.fly.dev:443)', self.output.getvalue())

    def test_tshark_event_is_classified_centrally_with_semantics_and_stored_once(self):
        line = 'POST\t/collect\t203.0.113.9\t80\tfly-analytics.fly.dev\tapplication/json\t\t' + DEMO.hex()
        self.assertTrue(local_sink.send_event(parse_tshark_line(line), 'tshark'))
        [stored] = self.stored()
        self.summarize(stored)
        self.assertEqual((stored['source'], stored['scheme'], stored['body_type']), ('tshark', 'http', 'json'))
        self.assertGreaterEqual(len(stored['findings']), 17)
        self.assert_semantic(stored)

    def test_compressed_bodies_are_still_not_stored(self):
        mitm_collector.response(mitm_flow('fly-analytics.fly.dev', gzip.compress(DEMO), encoding='gzip'))
        [stored] = self.stored()
        self.assertEqual((stored['body'], stored['body_type'], stored['findings']), (None, 'compressed', []))

    def test_unrelated_traffic_is_filtered_and_not_stored(self):
        mitm_collector.response(mitm_flow('www.google.com', b'{"q":"anxiety"}', origin='https://www.google.com'))
        self.assertFalse(local_sink.send_event(parse_tshark_line('GET\t/\t1.2.3.4\t80\tapple.com\t\t\t'), 'tshark'))
        self.assertEqual(self.stored(), [])
        self.assertNotIn('local classifier', self.output.getvalue())

    def test_browser_origin_cannot_claim_collector_source(self):
        event = {'source': 'tshark', 'host': 'fly-analytics.fly.dev', 'body_base64': 'eyJlbWFpbCI6ImFAYi50ZXN0In0='}
        urlopen(Request(f'http://127.0.0.1:{self.server.server_port}/events', data=json.dumps(event).encode(),
                        headers={'Origin': 'http://localhost:5174', 'Content-Type': 'application/json'}))
        [stored] = self.stored()
        self.assertEqual((stored['source'], stored['body']), ('browser_extension', None))

    def test_local_api_requests_are_never_reforwarded(self):
        with patch.object(local_sink._opener, 'open', side_effect=AssertionError('forwarded')):
            for host, port in [('127.0.0.1:8765', None), ('localhost', 8765), ('[::1]:8765', None), ('::1', 8765)]:
                self.assertFalse(local_sink.send_event({'host': host, 'destination_port': port, 'method': 'POST'}, 'mitm'))

    def test_observability_only_goes_to_loopback(self):
        self.assertEqual(urlsplit(local_sink.LOCAL_EVENTS_URL).hostname, '127.0.0.1')
        self.assertEqual(self.server.server_address[0], '127.0.0.1')
        self.assertEqual(local_api.HOST, '127.0.0.1')
        sent = []
        real_open = local_sink._opener.open
        with patch.object(local_sink._opener, 'open', side_effect=lambda req, timeout: sent.append(req.full_url) or real_open(req, timeout=timeout)):
            mitm_collector.response(mitm_flow('fly-analytics.fly.dev', DEMO))
        self.assertEqual({urlsplit(url).hostname for url in sent}, {'127.0.0.1'})
        for name in ['mitm_collector.py', 'tshark_collector.py', 'local_sink.py']:
            self.assertNotIn('fly.dev', (ROOT / 'collectors' / name).read_text())


class CollectorDependencyTests(unittest.TestCase):
    def test_collectors_run_without_ml_or_classifier_modules(self):
        script = BLOCK_ML + (
            "import types; sys.modules['mitmproxy'] = types.SimpleNamespace(http=types.SimpleNamespace(HTTPFlow=object)); "
            f"sys.path.insert(0, {str(ROOT / 'collectors')!r}); "
            "import mitm_collector, tshark_collector; "
            "e = tshark_collector.parse_tshark_line('POST\\t/collect\\t1.2.3.4\\t80\\tfly-analytics.fly.dev\\t\\t\\t7b7d'); "
            "assert e['body'] == b'{}'; "
            "bad = {'numpy', 'onnxruntime', 'classifier', 'semantic_classifier', 'event_store', 'event_filters'} & "
            "{k for k, v in sys.modules.items() if v is not None}; "
            "assert not bad, bad; print('ok')")
        result = subprocess.run([sys.executable, '-c', script], capture_output=True, text=True)
        self.assertEqual(result.stdout.strip(), 'ok', result.stderr)


if __name__ == '__main__': unittest.main()
