"""Local privacy-request drafts. Nothing in this module contacts Gmail or the network."""
import re
from datetime import date

from privacy.contract import PrivacyFinding, US_STATES, ValidationError

EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
DEFAULT_ACTION = (
    "Please delete my personal information and cease retaining it to the extent required by applicable law. "
    "Please confirm receipt and completion within any applicable statutory period. "
    "I reserve all rights and remedies available to me."
)


def _company_matches(strategy, finding):
    names = [strategy.get("company"), *strategy.get("aliases", [])]
    return (finding.company.domain in strategy.get("domains", [])
            and finding.company.name.casefold() in [str(name).casefold() for name in names if isinstance(name, str)])


def _strategy_address(strategy):
    if strategy.get("submission_method") != "email" or strategy.get("status") != "verified":
        return None
    if not str(strategy.get("applicability") or "").strip():
        return None
    endpoint = str(strategy.get("verified_endpoint") or "")
    if endpoint.lower().startswith("mailto:"):
        address = endpoint[7:].split("?", 1)[0].strip()
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
    right = engine.rules["reason_to_right"].get(finding.reason.code)
    matches = []
    for strategy in engine.strategies:
        address = _strategy_address(strategy)
        if not address or not _company_matches(strategy, finding) or not _strategy_fresh(strategy, engine):
            continue
        if right and right not in strategy.get("rights", []):
            continue
        if finding.user.state and finding.user.state not in strategy.get("jurisdiction", []):
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


def build_privacy_email(engine, finding, *, to=None, state=None, include_identity=None, identity=None):
    """Draft one message. `to` is used only when the caller supplies it; otherwise only a verified mailbox is used."""
    finding = _with_state(finding, state.strip().upper() if isinstance(state, str) and state.strip() else None)
    supplied = to.strip() if isinstance(to, str) else ""
    if supplied:
        if not EMAIL.fullmatch(supplied) or any(char in supplied for char in "\r\n"):
            raise ValidationError("to must be a single email address")
        recipient, source = supplied, "user"
    else:
        recipient = verified_email_recipient(engine, finding)
        source = "verified" if recipient else None
    deadline = verified_response_deadline(engine, finding)
    categories = " ".join(finding.reason.description.split())
    lines = [
        f"I am writing to {finding.company.name} ({finding.company.domain}).",
        "",
        f"Request: {finding.reason.label}.",
    ]
    if categories:
        lines.append(f"Categories observed: {categories}.")
        lines.append("This list names categories only.")
    lines.extend(["", DEFAULT_ACTION, ""])
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
        "subject": f"Privacy request regarding {finding.company.name}",
        "body": "\n".join(lines).strip() + "\n",
        "deadline": deadline,
    }
