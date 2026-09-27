"""Which traffic belongs to the ScriptWell demo. Local configuration only.

SCRIPTWELL_ORIGINS: comma-separated exact origins (scheme://host[:port]) of the
ScriptWell app, local and deployed. Matching is exact on scheme, host, and port;
there are no wildcards, so other *.fly.dev apps are never treated as ScriptWell.
SCRIPTWELL_RECEIVER_HOSTS: comma-separated hostnames of the synthetic-data receiver.
"""
import os
from urllib.parse import urlsplit

APP_NAME = "ScriptWell"
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,https://scriptwell.fly.dev"
DEFAULT_RECEIVER_HOSTS = "fly-analytics.fly.dev"
DEFAULT_PORTS = {"http": 80, "https": 443}


def normalize_origin(value):
    """(scheme, host, port) for an origin or URL, or None. Paths are ignored; default ports are filled."""
    if not isinstance(value, str) or not value.strip() or value.strip() == "null":
        return None
    text = value.strip()
    try:
        parts = urlsplit(text if "://" in text else "http://" + text)
        port = parts.port
    except ValueError:
        return None
    host = (parts.hostname or "").rstrip(".").lower()
    scheme = parts.scheme.lower()
    if scheme not in DEFAULT_PORTS or not host or "*" in host:
        return None
    return scheme, host, port or DEFAULT_PORTS[scheme]


def parse_origins(text):
    origins = {normalize_origin(item) for item in str(text).split(",")}
    return frozenset(origin for origin in origins if origin)


SCRIPTWELL_ORIGINS = parse_origins(os.environ.get("SCRIPTWELL_ORIGINS", DEFAULT_ORIGINS))
RECEIVER_HOSTS = frozenset(
    host.strip().lower() for host in os.environ.get("SCRIPTWELL_RECEIVER_HOSTS", DEFAULT_RECEIVER_HOSTS).split(",")
    if host.strip())


def is_scriptwell_origin(value, origins=None):
    origin = normalize_origin(value)
    return origin is not None and origin in (SCRIPTWELL_ORIGINS if origins is None else origins)


def is_scriptwell_host(host, port, origins=None):
    """Destination host/port serves ScriptWell (page and asset loads)."""
    if not host:
        return False
    return any(host.lower() == o_host and port == o_port
               for _, o_host, o_port in (SCRIPTWELL_ORIGINS if origins is None else origins))
