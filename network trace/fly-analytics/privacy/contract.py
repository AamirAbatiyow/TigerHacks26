"""The source-independent boundary. Providers must return this validated type."""
from dataclasses import asdict, dataclass
from typing import Protocol
import json
import re
from pathlib import Path

US_STATES = frozenset('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split())


class ValidationError(ValueError):
    pass


def text(value, field, limit=200):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ValidationError(f'{field} must be a nonempty string (maximum {limit} characters)')
    return value.strip()


def obj(value, field, allowed):
    if not isinstance(value, dict) or set(value) - set(allowed):
        raise ValidationError(f'{field} must be an object with only: {", ".join(allowed)}')
    return value


@dataclass(frozen=True)
class Company:
    name: str
    domain: str


@dataclass(frozen=True)
class Reason:
    code: str
    label: str
    description: str


@dataclass(frozen=True)
class User:
    state: str | None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None


@dataclass(frozen=True)
class PrivacyFinding:
    event_id: str
    company: Company
    reason: Reason
    user: User

    @classmethod
    def parse(cls, raw):
        raw = obj(raw, 'finding', ['event_id', 'company', 'reason', 'user'])
        company = obj(raw.get('company'), 'company', ['name', 'domain'])
        reason = obj(raw.get('reason'), 'reason', ['code', 'label', 'description'])
        user = obj(raw.get('user'), 'user', ['state', 'first_name', 'last_name', 'email'])
        event_id = text(raw.get('event_id'), 'event_id', 100)
        if not re.fullmatch(r'[A-Za-z0-9_.:-]+', event_id):
            raise ValidationError('event_id contains invalid characters')
        domain = text(company.get('domain'), 'company.domain', 253).lower()
        if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', domain):
            raise ValidationError('company.domain must be a bare DNS domain, not a URL')
        state = text(user['state'], 'user.state', 2).upper() if user.get('state') is not None else None
        if state is not None and state not in US_STATES:
            raise ValidationError('user.state must be a U.S. state abbreviation or DC')
        optional = {key: text(user[key], f'user.{key}') if key in user else None
                    for key in ['first_name', 'last_name', 'email']}
        if optional['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', optional['email']):
            raise ValidationError('user.email must be a valid email address')
        return cls(event_id, Company(text(company.get('name'), 'company.name'), domain),
                   Reason(text(reason.get('code'), 'reason.code', 100),
                          text(reason.get('label'), 'reason.label'),
                          text(reason.get('description'), 'reason.description', 1000)), User(state, **optional))

    def to_dict(self):
        raw = asdict(self)
        raw['user'] = {key: value for key, value in raw['user'].items() if value is not None}
        return raw


class PrivacyFindingProvider(Protocol):
    def getPrivacyFinding(self, event_id: str) -> PrivacyFinding: ...
    def listPrivacyFindings(self) -> list[PrivacyFinding]: ...


class LocalPrivacyFindingProvider:
    def __init__(self, directory: Path):
        self.directory = directory

    def findings(self):
        findings = []
        for path in sorted(self.directory.glob('*.json')):
            try:
                findings.append(PrivacyFinding.parse(json.loads(path.read_text())))
            except (ValueError, OSError) as exc:
                raise ValidationError(f'Invalid fixture {path.name}: {exc}') from None
        ids = [f.event_id for f in findings]
        if len(ids) != len(set(ids)):
            raise ValidationError('Fixture event_id values must be unique')
        return findings

    def listPrivacyFindings(self):
        return self.findings()

    def getPrivacyFinding(self, event_id):
        for finding in self.findings():
            if finding.event_id == event_id:
                return finding
        raise KeyError(event_id)
