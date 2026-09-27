import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
import event_store
from event_store import start_new_session

OLD_EVENT = {'event_id': 'old-1', 'source': 'mitm', 'host': 'fly-analytics.fly.dev', 'method': 'POST',
             'path': '/collect', 'initiator': 'http://localhost:3000', 'timestamp': '2026-09-26T22:00:00+00:00',
             'body': {'email': 'old@example.test'}, 'findings': [{'field': 'email', 'category': 'identity'}]}


def git(*args):
    return subprocess.run(['git', *args], cwd=REPO, capture_output=True, text=True)


class NewSessionTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.dir = Path(directory.name)
        self.log = self.dir / 'events.jsonl'

    def test_non_empty_log_is_archived_and_replaced_with_an_empty_log(self):
        self.log.write_text(json.dumps(OLD_EVENT) + '\n')
        archived = start_new_session(self.log)
        self.assertEqual(self.log.read_text(), '')
        self.assertRegex(archived.name, r'^events\.session-\d{8}-\d{6}-\d{6}\.jsonl$')
        self.assertEqual(json.loads(archived.read_text())['event_id'], 'old-1')

    def test_missing_or_empty_log_just_starts_empty(self):
        self.assertIsNone(start_new_session(self.log))
        self.assertEqual(self.log.read_text(), '')
        self.assertIsNone(start_new_session(self.log))
        self.assertEqual(list(self.dir.glob('events.session-*.jsonl')), [])

    def test_archives_are_pruned_and_other_logs_are_untouched(self):
        other = self.dir / 'events.before-validation.jsonl'
        other.write_text('keep\n')
        for index in range(7):
            self.log.write_text(f'{{"n": {index}}}\n')
            start_new_session(self.log, keep=3)
        archives = sorted(self.dir.glob('events.session-*.jsonl'))
        self.assertEqual([json.loads(p.read_text())['n'] for p in archives], [4, 5, 6])
        self.assertEqual(other.read_text(), 'keep\n')

    def test_new_session_does_not_show_previous_session_events(self):
        self.log.write_text(json.dumps(OLD_EVENT) + '\n')
        with patch.object(event_store, 'EVENTS_PATH', self.log):
            self.assertEqual([e['event_id'] for e in event_store.read_events()], ['old-1'])
            start_new_session()
            self.assertEqual(event_store.read_events(), [])

    def test_cli_resets_the_configured_runtime_log(self):
        self.log.write_text(json.dumps(OLD_EVENT) + '\n')
        env = {**os.environ, 'HEALTHTRACE_EVENTS_PATH': str(self.log), 'PYTHONDONTWRITEBYTECODE': '1'}
        result = subprocess.run([sys.executable, str(ROOT / 'event_store.py'), '--new-session'],
                                env=env, capture_output=True, text=True, check=True)
        self.assertIn('Event log: cleared for new demo session', result.stdout)
        self.assertEqual(self.log.read_text(), '')
        self.assertNotEqual(subprocess.run([sys.executable, str(ROOT / 'event_store.py')], env=env,
                                           capture_output=True).returncode, 0)


class StartupScriptTests(unittest.TestCase):
    def test_log_is_reset_after_port_checks_and_before_the_local_api_starts(self):
        script = (REPO / 'start_demo.sh').read_text()
        reset = script.index("python3 'network trace/event_store.py' --new-session")
        self.assertLess(script.index('lsof -nP -iTCP:"$port"'), reset)
        self.assertLess(reset, script.index('start "Local API"'))


@unittest.skipUnless(shutil.which('git') and git('rev-parse').returncode == 0, 'not a git checkout')
class GeneratedLogsAreNotTrackedTests(unittest.TestCase):
    def test_runtime_logs_are_ignored_but_fixtures_are_not(self):
        for path in ('network trace/events.jsonl', 'network trace/events.before-validation.jsonl',
                     'network trace/events.session-20260927-000000-000000.jsonl'):
            self.assertEqual(git('check-ignore', '-q', '--no-index', path).returncode, 0, path)
        for path in ('network trace/tests/demo-payload.json', 'network trace/tests/fixture.jsonl'):
            self.assertNotEqual(git('check-ignore', '-q', '--no-index', path).returncode, 0, path)

    def test_no_runtime_log_is_tracked(self):
        tracked = git('ls-files', '--', 'network trace/events*.jsonl').stdout.split()
        self.assertEqual(tracked, [])


if __name__ == '__main__': unittest.main()
