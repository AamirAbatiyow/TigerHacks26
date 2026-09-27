"""Adapt local observations to the existing privacy contract without copying PII."""
from event_store import read_events
from event_filters import host_port
from privacy.contract import PrivacyFinding


class EventPrivacyFindingProvider:
    def listPrivacyFindings(self):
        result = []
        for event in read_events():
            if not event['findings']:
                continue
            host, _ = host_port(event.get('host'))
            if not host or '.' not in host or host.replace('.', '').isdigit():
                continue
            result.append(PrivacyFinding.parse({
                'event_id': event['event_id'],
                'company': {'name': host, 'domain': host},
                'reason': {'code': 'sensitive_data', 'label': 'Sensitive data observed',
                           'description': ', '.join(sorted({f['category'] for f in event['findings']}))},
                # Observing a request establishes neither residency nor company identity.
                'user': {'state': None},
            }))
        return result

    def getPrivacyFinding(self, event_id):
        for finding in self.listPrivacyFindings():
            if finding.event_id == event_id:
                return finding
        raise KeyError(event_id)
