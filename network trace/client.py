import json
import urllib.request

data = {
    "user_id": "12345",
    "birth_control": "IUD",
    "pregnancy_goal": "trying_to_conceive",
    "symptom": "nausea"
}

req = urllib.request.Request(
    "http://fly-analytics.fly.dev/collect",
    data=json.dumps(data).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)

with urllib.request.urlopen(req) as response:
    print(response.read().decode())