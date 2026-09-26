from datetime import date, datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlsplit
from .contract import PrivacyFinding, text

ROOT = Path(__file__).parent
PRIORITY = {'gpc': 0, 'government': 0, 'http': 1, 'portal': 2, 'email': 3}
STATUSES = {'READY', 'SUBMITTED', 'ACTION_REQUIRED', 'COMPLETED', 'UNSUPPORTED', 'FAILED'}


def now():
    return datetime.now(timezone.utc).isoformat()


class OptOutEngine:
    """Pure resolution, then adapter execution. Never uses the fixture's destination."""
    def __init__(self, rules=None, strategies=None, adapters=None, today=None):
        self.rules = rules if rules is not None else json.loads((ROOT / 'rules.json').read_text())
        self.strategies = strategies if strategies is not None else json.loads((ROOT / 'strategies.json').read_text())
        self.adapters = adapters or {}
        self.today = today or date.today()

    def resolve(self, finding):
        finding = PrivacyFinding.parse(finding.to_dict())
        right = self.rules['reason_to_right'].get(finding.reason.code)
        result = {
            'event_id': finding.event_id,
            'company': finding.company.name, 'company_domain': finding.company.domain,
            'reason': finding.reason.code, 'reason_label': finding.reason.label,
            'privacy_right': right, 'jurisdiction': None,
            'submission_method': None, 'destination': None, 'submitted_at': None,
            'confirmation': None, 'completed_at': None, 'processed_at': now(), 'status': 'UNSUPPORTED',
            'evidence': [], 'message': '', 'strategy_id': None,
        }
        def skip(message):
            result['message'] = message
            result['evidence'] = [{'at': now(), 'status': 'UNSUPPORTED', 'message': message}]
            return result, None
        if not right:
            return skip('Unknown reason; no action was guessed.')
        matches = [s for s in self.strategies
                   if finding.company.domain in s['domains']
                   and finding.company.name.casefold() in
                   [n.casefold() for n in [s['company'], *s.get('aliases', [])]]]
        if len({s['canonical_domain'] for s in matches}) != 1:
            return skip('Company name and exact domain do not identify a configured company.')
        rule = self.rules['jurisdictions'].get(finding.user.state)
        if not rule or right not in rule['rights'] or self.today < date.fromisoformat(rule['effective']):
            return skip('No supported, effective U.S. rule for this state and action.')
        candidates = []
        for s in matches:
            if right not in s['rights'] or finding.user.state not in s['jurisdiction'] or not s.get('applicability'):
                continue
            try:
                age = (self.today - date.fromisoformat(s['last_verified'])).days
                endpoint, source = urlsplit(s['verified_endpoint']), urlsplit(s['source'])
                verified = (s['status'] == 'verified' and 0 <= age <= self.rules['verification_max_age_days']
                            and endpoint.scheme == 'https' and endpoint.hostname
                            and not endpoint.username and not endpoint.password
                            and source.scheme == 'https' and source.hostname)
            except (ValueError, KeyError):
                verified = False
            if verified and s['submission_method'] in PRIORITY:
                candidates.append(s)
        if not candidates:
            return skip('No current verified strategy supports this company, action, and jurisdiction.')
        strategy = sorted(candidates, key=lambda s: (PRIORITY[s['submission_method']], s['id']))[0]
        result.update(company=strategy['company'], jurisdiction=rule['name'],
                      destination=strategy['verified_endpoint'], submission_method=strategy['submission_method'],
                      strategy_id=strategy['id'], status='READY', message='Verified mechanism resolved.',
                      instructions=strategy['instructions'], required_fields=strategy['required_fields'],
                      verification_requirements=strategy['verification_requirements'])
        result['evidence'] = [{'at': now(), 'status': 'READY', 'source': strategy['source'],
                               'last_verified': strategy['last_verified'], 'rule_source': rule['source'],
                               'applicability': strategy['applicability']}]
        missing = [f for f in strategy['required_fields'] if not getattr(finding.user, f, None)]
        if missing:
            result.update(status='ACTION_REQUIRED', message='Missing required user fields: ' + ', '.join(missing))
        return result, strategy

    def execute(self, finding, result, strategy):
        if result['status'] != 'READY':
            return result
        method = strategy['submission_method']
        # GPC must originate from the user's browser, not a server-side header.
        # A portal URL is not a verified POST contract. All shipped flows stop here.
        adapter = self.adapters.get(strategy['id'])
        if method in {'gpc', 'portal', 'government'} or strategy['verification_requirements'] or not adapter or not strategy.get('safe_automation'):
            result.update(status='ACTION_REQUIRED', message='Continue in the official mechanism yourself. No request has been submitted.')
        else:
            # Only a specifically installed, reviewed adapter receives minimum fields.
            fields = {f: getattr(finding.user, f) for f in strategy['required_fields']}
            try:
                receipt = adapter.submit(strategy, result['privacy_right'], fields, finding.event_id)
                if receipt['status'] not in {'SUBMITTED', 'COMPLETED'} or not receipt.get('reference'):
                    raise ValueError('Adapter must provide a verified receipt')
                if receipt['status'] == 'COMPLETED' and not receipt.get('completion_evidence'):
                    raise ValueError('Completion needs explicit company evidence')
                reference = text(receipt['reference'], 'adapter.reference', 200)
                completion = text(receipt['completion_evidence'], 'adapter.completion_evidence', 1000) if receipt['status'] == 'COMPLETED' else None
                result.update(status=receipt['status'], submitted_at=now(), confirmation=reference,
                              message='Company confirmed completion.' if receipt['status'] == 'COMPLETED' else 'Request submitted; completion is not confirmed.')
                if receipt['status'] == 'COMPLETED':
                    result['completed_at'] = now()
                    result['evidence'].append({'at': now(), 'completion_evidence': completion})
            except Exception:
                # Avoid logging an exception containing a submitted payload or credentials.
                result.update(status='FAILED', message='Submission failed or the outcome is uncertain. Check the official mechanism before retrying.')
        result['evidence'].append({'at': now(), 'status': result['status'], 'message': result['message']})
        return result
