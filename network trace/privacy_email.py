"""Local privacy-request drafts. Nothing in this module contacts Gmail or the network."""
import re
from urllib.parse import urlsplit, unquote
from datetime import date

from privacy.contract import PrivacyFinding, US_STATES, ValidationError

EMAIL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}")
DEFAULT_ACTION = (
    "Please delete my personal information and cease retaining or using it to the extent required by applicable law. "
    "Please confirm receipt and completion within any applicable statutory period. "
    "I reserve all rights and remedies available to me."
)


def _company_matches(strategy, finding):
    names = [strategy.get("company"), *strategy.get("aliases", [])]
    return (finding.company.domain in strategy.get("domains", [])
            and finding.company.name.casefold() in [str(name).casefold() for name in names if isinstance(name, str)])


def _strategy_address(strategy):
    if strategy.get("status") != "verified":
        return None
    if not str(strategy.get("applicability") or "").strip():
        return None
    endpoint = str(strategy.get("verified_endpoint") or "")
    if endpoint.lower().startswith("mailto:"):
        address = unquote(endpoint[7:]).strip() if "?" not in endpoint else ""
    else:
        address = str(strategy.get("contact_email") or "").strip()
    return address if EMAIL.fullmatch(address) else None


def _strategy_fresh(strategy, engine):
    source = str(strategy.get("source") or "")
    if not source.startswith("https://"):
        return False
    try:
        verified = date.fromisoformat(str(strategy.get("last_verified")))
        age = (engine.today - verified).days
    except (TypeError, ValueError):
        return False
    return 0 <= age <= engine.rules["verification_max_age_days"]


def verified_email_recipient(engine, finding):
    """The single fresh verified privacy mailbox for this company, or None. Never invent one."""
    matches = []
    for strategy in engine.strategies:
        address = _strategy_address(strategy)
        if not address or not _company_matches(strategy, finding) or not _strategy_fresh(strategy, engine):
            continue
        matches.append(address)
    unique = sorted(set(matches))
    if len(unique) != 1:
        return None
    return unique[0]


def verified_response_deadline(engine, finding):
    """Days from a jurisdiction rule only when that rule is effective and states the number itself."""
    state = finding.user.state
    if not state:
        return None
    right = engine.rules["reason_to_right"].get(finding.reason.code)
    rule = engine.rules["jurisdictions"].get(state)
    if not rule or not right or right not in rule.get("rights", []):
        return None
    try:
        if engine.today < date.fromisoformat(str(rule.get("effective"))):
            return None
    except (TypeError, ValueError):
        return None
    days = rule.get("response_deadline_days")
    source = rule.get("source")
    if isinstance(days, bool) or not isinstance(days, int) or days <= 0:
        return None
    if not isinstance(source, str) or not source.startswith("https://"):
        return None
    name = rule.get("name") if isinstance(rule.get("name"), str) and rule.get("name").strip() else state
    return {"days": days, "jurisdiction": name.strip(), "source": source}


def _with_state(finding, state):
    if not state:
        return finding
    if state not in US_STATES:
        raise ValidationError("state must be a U.S. state abbreviation or DC")
    raw = finding.to_dict()
    raw["user"] = {**raw.get("user", {}), "state": state}
    return PrivacyFinding.parse(raw)


def _selected_identity(include_identity, identity):
    if include_identity is None:
        include_identity = {}
    if identity is None:
        identity = {}
    if not isinstance(include_identity, dict) or not isinstance(identity, dict):
        raise ValidationError("include_identity and identity must be objects")
    allowed = {"first_name", "last_name", "email"}
    if set(include_identity) - allowed or set(identity) - allowed:
        raise ValidationError("identity only accepts first_name, last_name, and email")
    lines = []
    labels = {"first_name": "First name", "last_name": "Last name", "email": "Email"}
    for key in ("first_name", "last_name", "email"):
        if include_identity.get(key) is not True:
            continue
        value = identity.get(key)
        if not isinstance(value, str) or not value.strip() or any(ord(char) < 32 for char in value):
            continue
        value = value.strip()
        if key == "email" and not EMAIL.fullmatch(value):
            raise ValidationError("identity email must be an email address")
        if len(value) > 200:
            raise ValidationError("identity values must be 200 characters or fewer")
        lines.append(f"{labels[key]}: {value}")
    return lines


def build_privacy_email(engine, finding, *, to=None, state=None, include_identity=None, identity=None, event=None, contacts=None):
    """Draft one message. `to` is used only when the caller supplies it; otherwise only a verified mailbox is used."""
    # Resolve an observed bare domain only through an exact existing registry entry.
    if finding.company.name == finding.company.domain:
        known = {(s['company'], s['canonical_domain']) for s in engine.strategies
                 if finding.company.domain in s.get('domains', []) and _strategy_fresh(s, engine)}
        if len(known) == 1:
            raw = finding.to_dict()
            raw['company']['name'] = next(iter(known))[0]
            finding = PrivacyFinding.parse(raw)
    finding = _with_state(finding, state.strip().upper() if isinstance(state, str) and state.strip() else None)
    supplied = to.strip() if isinstance(to, str) else ""
    if supplied:
        if not EMAIL.fullmatch(supplied) or any(char in supplied for char in "\r\n"):
            raise ValidationError("to must be a single email address")
        recipient, source = supplied, "user"
    else:
        recipient = verified_email_recipient(engine, finding)
        source = "verified" if recipient else None
    candidates = discovered_contacts(event or {}, contacts or [])
    recipient_evidence = None
    organization = finding.company.name
    organization_domain = finding.company.domain
    if source == "verified":
        recipient_evidence = next((s['source'] for s in engine.strategies
            if _company_matches(s, finding) and _strategy_address(s) == recipient and _strategy_fresh(s, engine)), None)
    elif source is None and len(candidates) == 1:
        recipient, source = candidates[0]['email'], 'discovered'
        recipient_evidence = candidates[0]['source_url']
        organization = organization_domain = urlsplit(recipient_evidence).hostname
    if source is None and candidates:
        domains = {urlsplit(c['source_url']).hostname for c in candidates}
        if len(domains) == 1:
            organization = organization_domain = next(iter(domains))
    resolution, strategy = engine.resolve(finding)
    # An observed app's contact is not the observed third party's legal mechanism.
    legal = bool(strategy and organization_domain == finding.company.domain)
    deadline = verified_response_deadline(engine, finding) if legal else None
    right = resolution.get('privacy_right') if legal else None
    request_type = right.replace('_', ' ').capitalize() if right else 'General privacy / deletion request'
    categories = " ".join(finding.reason.description.split())
    lines = [
        f"I am writing to {organization} ({organization_domain}).",
        "",
        f"Request: {request_type}.",
    ]
    if categories:
        lines.append(f"Categories observed: {categories}.")
        lines.append("This list names categories only.")
    action = {
        'targeted_advertising_opt_out': 'Please stop using my personal information for targeted advertising to the extent required by applicable law.',
        'sale_sharing_opt_out': 'Please stop selling or sharing my personal information to the extent required by applicable law.',
        'limit_sensitive_data': 'Please limit retaining or using my sensitive personal information to the extent required by applicable law.',
    }.get(right, DEFAULT_ACTION)
    lines.extend(["", action, ""])
    if organization_domain != finding.company.domain:
        lines.extend([f"This concerns data sent from your app to {finding.company.domain}.", ""])
    if legal and strategy['submission_method'] != 'email':
        lines.extend(["Please advise how to complete this request through your official mechanism. This email does not complete that process.", ""])

    if deadline:
        lines.append(
            f"The verified {deadline['jurisdiction']} rule states a response period of "
            f"{deadline['days']} days ({deadline['source']})."
        )
        lines.append("")
    identity_lines = _selected_identity(include_identity, identity)
    if identity_lines:
        lines.append("Identifying details I chose to include:")
        lines.extend(identity_lines)
        lines.append("")
    lines.append("Please reply to this email address.")
    return {
        "to": recipient,
        "recipient_source": source,
        "event_id": finding.event_id,
        "organization": organization,
        "observed_destination": finding.company.domain,
        "categories": [c.strip() for c in categories.split(',') if c.strip()],
        "request_type": request_type,
        "legal_basis": 'verified' if legal else 'general',
        "legal_source": strategy['source'] if legal else None,
        "official_destination": resolution['destination'] if legal and strategy['submission_method'] != 'email' else None,
        "instructions": strategy['instructions'] if legal else 'General request; no jurisdiction-specific right or deadline has been established.',
        "recipient_evidence": recipient_evidence,
        "recipient_candidates": candidates if source != 'verified' else [],
        "requires_recipient_confirmation": source == 'discovered',
        "subject": f"Privacy request regarding {organization}",
        "body": "\n".join(lines).strip() + "\n",
        "deadline": deadline,
    }


def discovered_contacts(event, contacts):
    """Only user-invoked mailto candidates on the observed destination/app; never crawl URLs."""
    if not isinstance(contacts, list) or len(contacts) > 10:
        raise ValidationError('Provide at most ten discovered contacts')
    allowed = set()
    for url in (event.get('initiator'), f"{event.get('scheme') or 'https'}://{event.get('host') or ''}"):
        try:
            parsed = urlsplit(url or '')
            if parsed.scheme in {'http', 'https'} and parsed.hostname:
                allowed.add((parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80)))
        except ValueError:
            continue
    result = []
    for contact in contacts:
        if not isinstance(contact, dict) or set(contact) != {'email', 'source_url'}:
            raise ValidationError('Discovered contacts need email and source_url only')
        email, url = contact['email'], contact['source_url']
        if not isinstance(email, str) or not EMAIL.fullmatch(email) or len(email) > 254 or not isinstance(url, str) or len(url) > 2048:
            raise ValidationError('Invalid discovered contact')
        try:
            parsed = urlsplit(url)
            origin = (parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
        except ValueError:
            raise ValidationError('Invalid contact source') from None
        if origin not in allowed or parsed.username or parsed.password:
            continue
        candidate = {'email': email, 'source_url': parsed._replace(query='', fragment='').geturl()}
        if candidate not in result:
            result.append(candidate)
    return result
