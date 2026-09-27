"""Local privacy-request drafts. Nothing in this module contacts Gmail or the network."""
import re
from urllib.parse import urlsplit, unquote
from datetime import date

from demo_config import APP_NAME, RECEIVER_HOSTS, is_scriptwell_origin
from privacy.contract import PrivacyFinding, US_STATES, ValidationError

EMAIL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}")
DEFAULT_ACTION = (
    "Please delete my personal information and cease retaining or using it to the extent required by applicable law. "
    "Please confirm receipt and completion within any applicable statutory period. "
    "I reserve all rights and remedies available to me."
)
DEMO_PRIVACY_EMAIL = "scriptwellcontact@gmail.com"
DEMO_ANALYTICS_HOST = "fly-analytics.fly.dev"
SCRIPTWELL_SUBJECT = "Request to Delete and Limit Use of My Personal Information"
# Overlapping health categories share one phrase. Medication findings, including the prescription, share another.
_CATEGORY_PHRASES = {
    "diagnoses": "health information",
    "symptoms": "health information",
    "biometrics": "health information",
    "medications": "prescription and medication information",
    "identity": "identifying information",
    "location": "location information",
    "device_identifiers": "device information",
    "financial": "payment information",
    "appointments": "pharmacy or care-related information",
}
_PHRASE_ORDER = (
    "health information",
    "prescription and medication information",
    "identifying information",
    "location information",
    "device information",
    "payment information",
    "pharmacy or care-related information",
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


def human_categories(description):
    """Readable phrases for classifier categories. Identical phrases are stated once."""
    phrases = []
    for category in (part.strip() for part in str(description or "").split(",")):
        if not category:
            continue
        phrase = _CATEGORY_PHRASES.get(category, category.replace("_", " "))
        if phrase not in phrases:
            phrases.append(phrase)
    ordered = [phrase for phrase in _PHRASE_ORDER if phrase in phrases]
    ordered.extend(phrase for phrase in phrases if phrase not in ordered)
    if not ordered:
        return "personal information"
    if len(ordered) == 1:
        return ordered[0]
    return ", ".join(ordered[:-1]) + ", and " + ordered[-1]


def _scriptwell_request(finding, event):
    domain = str(finding.company.domain or "").lower()
    if domain == DEMO_ANALYTICS_HOST or domain in RECEIVER_HOSTS:
        return True
    event = event or {}
    if is_scriptwell_origin(event.get("initiator")):
        return True
    return str(event.get("host") or "").lower() in RECEIVER_HOSTS


def _captured_person(event):
    """Name and email from the ScriptWell payload. Support addresses are not the patient."""
    body = event.get("body") if isinstance(event, dict) else None
    person = body.get("person") if isinstance(body, dict) else None
    if not isinstance(person, dict):
        return "", ""
    name = person.get("full_name")
    email = person.get("email")
    name = " ".join(name.split()) if isinstance(name, str) else ""
    email = email.strip() if isinstance(email, str) else ""
    if not name or any(ord(char) < 32 for char in name) or len(name) > 200:
        name = ""
    if not EMAIL.fullmatch(email) or any(char in email for char in "\r\n"):
        email = ""
    return name, email


def _scriptwell_body(name, email, categories):
    intro = f"My name is {name}, and I’m writing" if name else "I’m writing"
    identified = [
        f"Name: {name or 'not included in the captured request'}",
        f"Email: {email or 'not included in the captured request'}",
    ]
    lines = [
        "Hello ScriptWell Privacy Team,",
        "",
        f"{intro} regarding personal information I provided through ScriptWell.",
        "",
        "PatientPrivy detected that information associated with my use of ScriptWell was transmitted to a third-party service. "
        f"The categories observed included {categories}.",
        "",
        "I am requesting that ScriptWell:",
        "",
        "- delete personal information associated with my account or activity, to the extent required by applicable law;",
        "- stop retaining or using that information where it is no longer necessary;",
        "- stop sharing it with third parties except where legally required or necessary to provide the service; and",
        "- confirm when this request has been completed.",
        "",
        "For identification purposes:",
        "",
        *identified,
        "",
        "Please reply to this email confirming receipt of my request and let me know if you need any additional information to verify my identity.",
        "",
        "Thank you,",
    ]
    if name:
        lines.append(name)
    return "\n".join(lines).strip() + "\n"


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
    # ScriptWell's demo inbox. Page discovery can still surface the retired mailbox.
    if not supplied and finding.company.domain == DEMO_ANALYTICS_HOST:
        recipient, source = DEMO_PRIVACY_EMAIL, "demo"
        recipient_evidence = None
        organization, organization_domain = finding.company.name, finding.company.domain
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
    category_list = [c.strip() for c in categories.split(',') if c.strip()]
    identity_lines = _selected_identity(include_identity, identity)
    scriptwell = _scriptwell_request(finding, event)
    if scriptwell:
        organization = APP_NAME
        name, email = _captured_person(event or {})
        subject = SCRIPTWELL_SUBJECT
        body = _scriptwell_body(name, email, human_categories(categories))
        if identity_lines:
            body = body.rstrip() + "\n\nAdditional identifying details I chose to include:\n" + "\n".join(identity_lines) + "\n"
        category_summary = human_categories(categories)
    else:
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
        if identity_lines:
            lines.append("Identifying details I chose to include:")
            lines.extend(identity_lines)
            lines.append("")
        lines.append("Please reply to this email address.")
        subject = f"Privacy request regarding {organization}"
        body = "\n".join(lines).strip() + "\n"
        category_summary = categories
    return {
        "to": recipient,
        "recipient_source": source,
        "event_id": finding.event_id,
        "organization": organization,
        "observed_destination": finding.company.domain,
        "categories": category_list,
        "category_summary": category_summary,
        "request_type": request_type,
        "legal_basis": 'verified' if legal else 'general',
        "legal_source": strategy['source'] if legal else None,
        "official_destination": resolution['destination'] if legal and strategy['submission_method'] != 'email' else None,
        "instructions": strategy['instructions'] if legal else 'General request; no jurisdiction-specific right or deadline has been established.',
        "recipient_evidence": recipient_evidence,
        "recipient_candidates": [] if source in {"verified", "demo"} else candidates,
        "requires_recipient_confirmation": source == 'discovered',
        "subject": subject,
        "body": body,
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
