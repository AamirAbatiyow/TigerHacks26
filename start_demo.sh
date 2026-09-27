#!/usr/bin/env bash
# Start the local PatientPrivy demo services. Ctrl-C stops everything this script started.
# ScriptWell itself is not started: the demo uses https://scriptwell.fly.dev.
set -u
cd "$(dirname "$0")"

# The browser's HTTPS must go through mitmproxy to be decrypted locally. The launcher owns
# the macOS secure web proxy so it points at mitmproxy only while mitmproxy is running, and
# the previous settings come back on every exit path instead of leaving HTTPS on a dead proxy.
PROXY_HOST=127.0.0.1
PROXY_PORT=18080
PROXY_SERVICE=${PROXY_SERVICE:-}  # e.g. "Wi-Fi"; empty = the service behind the default route

for cmd in python3 mitmdump tshark npm curl lsof networksetup; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done
for port in 8765 "$PROXY_PORT" 5174; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; then
    echo "Port $port is already in use (is the demo already running?)." >&2
    exit 1
  fi
done

detect_service() {
  local device
  device=$(route -n get default 2>/dev/null | awk '/interface:/ { print $2 }')
  [ -n "$device" ] || return
  networksetup -listnetworkserviceorder | awk -v dev="$device" '
    /^\(([0-9]+|\*)\) / { name = $0; sub(/^\([^)]*\) /, "", name) }
    index($0, "Device: " dev ")") { print name; exit }'
}

# Prints "Enabled|Server|Port|Authenticated", e.g. "No|127.0.0.1|8081|0".
read_proxy() {
  networksetup "-get$1" "$PROXY_SERVICE" | awk -F': ' '
    /^Enabled:/ { e = $2 } /^Server:/ { s = $2 } /^Port:/ { p = $2 } /^Authenticated Proxy Enabled:/ { a = $2 }
    END { if (e == "") exit 1; print e "|" s "|" p "|" a }'
}

[ -n "$PROXY_SERVICE" ] || PROXY_SERVICE=$(detect_service)
[ -n "$PROXY_SERVICE" ] || PROXY_SERVICE="Wi-Fi"
if ! saved_proxy=$(read_proxy securewebproxy); then
  echo "ERROR: cannot read the secure web proxy for network service '$PROXY_SERVICE'." >&2
  echo "Set PROXY_SERVICE to a name from 'networksetup -listallnetworkservices'." >&2
  exit 1
fi
IFS='|' read -r saved_enabled saved_server saved_port saved_auth <<<"$saved_proxy"
if [ "$saved_auth" != 0 ]; then
  echo "ERROR: '$PROXY_SERVICE' uses an authenticated secure proxy, which this launcher cannot restore." >&2
  exit 1
fi
case "$(read_proxy webproxy)" in
  Yes*)
    echo "ERROR: the HTTP web proxy is ON for '$PROXY_SERVICE'; the demo needs it off." >&2
    echo "Turn it off with: networksetup -setwebproxystate '$PROXY_SERVICE' off" >&2
    exit 1 ;;
esac

names=()
pids=()
proxy_changed=0

start() {
  local name=$1
  shift
  "$@" &
  names+=("$name")
  pids+=("$!")
}

enable_proxy() {
  proxy_changed=1
  if ! networksetup -setsecurewebproxy "$PROXY_SERVICE" "$PROXY_HOST" "$PROXY_PORT" ||
     [ "$(read_proxy securewebproxy)" != "Yes|$PROXY_HOST|$PROXY_PORT|0" ]; then
    echo "ERROR: could not set the secure web proxy for '$PROXY_SERVICE'. Shutting down." >&2
    exit 1
  fi
  echo "Secure proxy: enabled -> $PROXY_HOST:$PROXY_PORT ($PROXY_SERVICE)"
}

restore_proxy() {
  [ "$proxy_changed" = 1 ] || return 0
  local state=off
  [ "$saved_enabled" = Yes ] && state=on
  networksetup -setsecurewebproxy "$PROXY_SERVICE" "$saved_server" "$saved_port" &&
    networksetup -setsecurewebproxystate "$PROXY_SERVICE" "$state"
  if [ "$(read_proxy securewebproxy)" = "$saved_proxy" ]; then
    echo "Secure proxy: restored previous state ($state, ${saved_server:-no server}:$saved_port)"
  else
    echo "WARNING: could not restore the secure web proxy for '$PROXY_SERVICE'." >&2
    echo "Previous settings: enabled=$saved_enabled server=$saved_server port=$saved_port" >&2
  fi
}

stop() {
  trap - INT TERM EXIT
  echo
  restore_proxy
  echo "Stopping demo services..."
  # Each service is its own process group, so its children (tshark, vite) stop too.
  for pid in ${pids[@]+"${pids[@]}"}; do kill -TERM -- "-$pid" 2>/dev/null; done
  for _ in 1 2 3 4 5; do
    alive=0
    for pid in ${pids[@]+"${pids[@]}"}; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 1
  done
  for pid in ${pids[@]+"${pids[@]}"}; do kill -KILL -- "-$pid" 2>/dev/null; done
  wait 2>/dev/null
  echo "All demo services stopped."
}

check_children() {
  local i
  for i in "${!pids[@]}"; do
    if ! kill -0 "${pids[$i]}" 2>/dev/null; then
      wait "${pids[$i]}"
      echo "ERROR: ${names[$i]} exited (status $?). Shutting down the rest." >&2
      exit 1
    fi
  done
}

trap stop EXIT
trap 'exit 130' INT TERM

# Nothing is writing yet (the ports above are free), so the runtime log can be rotated safely.
python3 'network trace/event_store.py' --new-session || exit 1

set -m
start "Local API" python3 'network trace/local_api.py'
set +m
echo "Waiting for the local API..."
until curl -s -o /dev/null http://127.0.0.1:8765/events; do
  check_children
  sleep 0.5
done

set -m
start "mitmproxy collector" mitmdump --listen-host "$PROXY_HOST" --listen-port "$PROXY_PORT" -s 'network trace/collectors/mitm_collector.py'
set +m
echo "Waiting for mitmproxy..."
until lsof -nP -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null; do
  check_children
  sleep 0.5
done
enable_proxy

set -m
start "tshark collector" env TSHARK_INTERFACE=en0 python3 'network trace/collectors/tshark_collector.py'
start "Dashboard" npm run dev --prefix frontend
set +m
sleep 3
check_children

cat <<EOF

PatientPrivy demo is running (Ctrl-C to stop everything):
  ScriptWell:  https://scriptwell.fly.dev
  Dashboard:   http://localhost:5174
  Local API:   http://127.0.0.1:8765
  mitmproxy:   $PROXY_HOST:$PROXY_PORT  (macOS secure web proxy for '$PROXY_SERVICE' while running)

EOF

while :; do
  check_children
  sleep 1
done
