import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from test_gmail import finding, Provider, EMAIL_STRATEGY, TODAY, rules_with_deadline
import event_store
from local_api import create_server
from privacy.engine import OptOutEngine
from privacy_email import build_privacy_email, DEFAULT_ACTION, DEMO_PRIVACY_EMAIL
from gmail_service import GmailError


class ActionsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        path = Path(self.directory.name)
        self.log = path / 'events.jsonl'
        self.log.write_text(json.dumps({'event_id':'evt-1','source':'mitm','host':'example.test','scheme':'https',
            'initiator':'https://app.test','body':None,'findings':[]})+'\n')
        self.patcher = patch.object(event_store, 'EVENTS_PATH', self.log); self.patcher.start()
        class Gmail:
            def __init__(self): self.sent=[]; self.connected=False
            def status(self): return {'connected':self.connected, 'email':'me@gmail.com' if self.connected else None}
            def send_message(self,*args):
                if not self.connected: raise GmailError('Gmail not connected')
                self.sent.append(args); return {'message_id':'sent-1','email':'me@gmail.com'}
        self.gmail=Gmail()
        self.server=create_server(0,path/'privacy.db',gmail=self.gmail)
        self.server.provider=Provider(finding(state=None))
        self.server.engine=OptOutEngine(strategies=[],today=TODAY)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.patcher.stop();self.directory.cleanup()

    def call(self,path,payload=None,origin='chrome-extension://'+'a'*32):
        try:
            response=urlopen(Request(f'http://127.0.0.1:{self.server.server_port}{path}',
                data=json.dumps(payload).encode() if payload is not None else None,
                headers={'Origin':origin,'Content-Type':'application/json'}))
            return response.status,json.load(response)
        except HTTPError as error: return error.code,json.load(error)

    def draft(self,**kwargs):
        code,draft=self.call('/api/privacy/actions/draft',{'event_id':'evt-1',**kwargs});self.assertEqual(code,200,draft);return draft

    def approved(self,draft,**kwargs):
        return {'approved':True,'draft_id':draft['draft_id'],'to':draft['to'] or 'contact@example.test',
                'subject':draft['subject'],'body':draft['body'],'recipient_source':draft['recipient_source'] or 'user',**kwargs}

    def test_scriptwell_demo_contact_is_sent_without_discovery_confirmation(self):
        self.server.provider = Provider(finding(state=None, company='fly-analytics.fly.dev', domain='fly-analytics.fly.dev'))
        draft = self.draft(contacts=[{'email': 'Scriptwell@gmail.com', 'source_url': 'https://scriptwell.fly.dev/privacy'}])
        self.assertEqual(draft['to'], DEMO_PRIVACY_EMAIL)
        self.assertEqual(draft['recipient_source'], 'demo')
        self.gmail.connected = True
        self.assertEqual(self.call('/api/privacy/actions/send', self.approved(draft))[0], 200)
        self.assertEqual(self.gmail.sent[0][0], DEMO_PRIVACY_EMAIL)
        self.assertEqual(self.call('/api/privacy/actions/send', self.approved(draft, to='Scriptwell@gmail.com'))[0], 400)

    def test_general_request_manual_fallback_no_deadline_no_auto_send(self):
        draft=self.draft()
        self.assertIsNone(draft['to']);self.assertEqual(draft['legal_basis'],'general')
        self.assertIn(DEFAULT_ACTION,draft['body']);self.assertIsNone(draft['deadline'])
        self.assertNotIn('45 days',draft['body']);self.assertEqual(self.gmail.sent,[])
        self.assertEqual(self.call('/api/privacy/actions/draft?id='+draft['draft_id'])[1],draft)
        self.gmail.connected=True
        self.assertEqual(self.call('/api/privacy/actions/send',self.approved(draft,approved=False))[0],400)
        payload=self.approved(draft)
        self.assertEqual(self.call('/api/privacy/actions/send',payload)[1]['delivery_status'],'gmail_sent')
        self.assertEqual(self.call('/api/privacy/actions/send',payload)[0],200)
        self.assertEqual(len(self.gmail.sent),1,'repeated approved POST must not resend')

    def test_discovered_app_contact_must_be_confirmed_and_is_not_third_party_identity(self):
        draft=self.draft(contacts=[{'email':'data@app.test','source_url':'https://app.test/privacy?token=secret'}])
        self.assertEqual(draft['recipient_source'],'discovered');self.assertEqual(draft['to'],'data@app.test')
        self.assertEqual(draft['organization'],'app.test');self.assertEqual(draft['observed_destination'],'example.test')
        self.assertEqual(draft['recipient_evidence'],'https://app.test/privacy')
        self.assertEqual(draft['legal_basis'],'general')
        self.gmail.connected=True
        payload=self.approved(draft)
        self.assertEqual(self.call('/api/privacy/actions/send',payload)[0],400)
        self.assertEqual(self.gmail.sent,[])
        self.assertEqual(self.call('/api/privacy/actions/send',{**payload,'recipient_confirmed':True})[0],200)

    def test_unrelated_page_ignored_multiple_contacts_not_guessed(self):
        self.assertIsNone(self.draft(contacts=[{'email':'data@evil.test','source_url':'https://evil.test/privacy'}])['to'])
        draft=self.draft(contacts=[{'email':email,'source_url':'https://app.test/privacy'} for email in ['one@app.test','two@app.test']])
        self.assertIsNone(draft['to']);self.assertEqual(len(draft['recipient_candidates']),2)
        self.gmail.connected=True
        self.assertEqual(self.call('/api/privacy/actions/send',self.approved(draft,to='guessed@app.test',recipient_source='discovered',recipient_confirmed=True))[0],400)

    def test_verified_strategy_wins_over_discovery_and_staleness_is_rechecked(self):
        self.server.provider=Provider(finding())
        self.server.engine=OptOutEngine(strategies=[EMAIL_STRATEGY],rules=rules_with_deadline(),today=TODAY)
        draft=self.draft(contacts=[{'email':'discovered@app.test','source_url':'https://app.test/privacy'}])
        self.assertEqual(draft['recipient_source'],'verified');self.assertEqual(draft['legal_basis'],'verified')
        self.assertEqual(draft['deadline']['days'],45)
        self.server.engine.strategies=[]
        self.gmail.connected=True
        self.assertEqual(self.call('/api/privacy/actions/send',self.approved(draft))[0],400)
        self.assertEqual(self.gmail.sent,[])

    def test_general_request_has_no_deadline_even_if_jurisdiction_rule_has_one(self):
        draft=build_privacy_email(OptOutEngine(strategies=[],rules=rules_with_deadline(),today=TODAY),finding())
        self.assertIsNone(draft['deadline']);self.assertEqual(draft['legal_basis'],'general')

    def test_gmail_unavailable_does_not_destroy_draft_or_claim_sent(self):
        draft=self.draft(to='contact@example.test')
        status, result=self.call('/api/privacy/actions/send',self.approved(draft))
        self.assertEqual(status,409);self.assertNotIn('delivery_status',result)
        self.assertEqual(self.call('/api/privacy/actions/draft?id='+draft['draft_id'])[0],200)
        self.assertEqual(self.gmail.sent,[])
        self.assertEqual(self.call('/api/privacy/actions/send',self.approved(draft))[0],400)

    def test_old_email_routes_retired_and_untrusted_origin_rejected(self):
        self.assertEqual(self.call('/api/gmail/draft',{'event_id':'evt-1'})[0],404)
        self.assertEqual(self.call('/api/gmail/send',{})[0],404)
        self.assertEqual(self.call('/api/privacy/actions/draft',{'event_id':'evt-1'},'https://evil.test')[0],403)
        self.assertEqual(self.gmail.sent,[])

    def test_registry_contact_can_support_a_general_request_without_claiming_a_right(self):
        strategy = {**EMAIL_STRATEGY, 'rights': ['deletion'], 'submission_method': 'portal',
                    'verified_endpoint': 'https://example.test/privacy', 'contact_email': 'contact@example.test'}
        draft = build_privacy_email(OptOutEngine(strategies=[strategy], today=TODAY), finding())
        self.assertEqual(draft['to'], 'contact@example.test')
        self.assertEqual(draft['recipient_source'], 'verified')
        self.assertEqual(draft['legal_basis'], 'general')
        self.assertIsNone(draft['deadline'])

    def test_exact_registry_domain_can_resolve_an_observed_organization(self):
        draft = build_privacy_email(OptOutEngine(strategies=[EMAIL_STRATEGY], today=TODAY),
                                    finding(company='example.test'))
        self.assertEqual(draft['organization'], 'Example Health')
        self.assertEqual(draft['legal_basis'], 'verified')
