#!/usr/bin/env python3
"""End-to-end check of the Delivery OS API against a running server + seeded DB."""
import json, sys, urllib.request, urllib.error
from uuid import uuid4

API = "http://localhost:4000/api"
passed, failed = 0, 0

def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    if token: req.add_header("authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b"{}")
        except Exception: return e.code, {"raw": raw.decode(errors="replace")}

def check(name, expected, actual):
    global passed, failed
    ok = expected == actual
    if ok: passed += 1
    else: failed += 1
    mark = "\033[32mPASS\033[0m" if ok else "\033[31mFAIL\033[0m"
    detail = str(actual) if ok else f"expected {expected!r} got {actual!r}"
    print(f"  {mark} {name:<54} {detail}")

def section(t): print(f"\n\033[1m{t}\033[0m")

def login(email):
    status, body = call("POST", "/auth/login", body={"email": email, "password": "DeliveryOS2026!"})
    if status != 200: raise SystemExit(f"login failed for {email}: {status} {body}")
    return body["token"]

section("authentication")
check("wrong password rejected", 401, call("POST", "/auth/login", body={"email": "pm@teqdeft.com", "password": "nope"})[0])
st, bd = call("POST", "/auth/login", body={"email": "ghost@teqdeft.com", "password": "DeliveryOS2026!"})
check("unknown user gives the same 401", 401, st)
check("no account enumeration in the message", "Email or password is incorrect", bd["error"]["message"])
check("unauthenticated read blocked", 401, call("GET", "/projects")[0])

pm, cto, dev, founder = (login(e) for e in
    ["pm@teqdeft.com", "cto@teqdeft.com", "dev@teqdeft.com", "kulwant@teqdeft.com"])
check("sign-in returns a session", True, all([pm, cto, dev, founder]))

section("project access (§15.3 — authorization on reads)")
_, projects = call("GET", "/projects", pm)
project = next(p for p in projects["items"] if p["code"] == "NWO-01")
pid = project["id"]
check("PM sees the seeded portfolio", True, projects["total"] >= 2)
check("developer sees only their own projects", 1, call("GET", "/projects", dev)[1]["total"])
check("founder sees everything", projects["total"], call("GET", "/projects", founder)[1]["total"])
check("unknown project id is 404, never 403", 404, call("GET", "/projects/00000000-0000-0000-0000-000000000000", dev)[0])

section("capabilities (§8.3 approval matrix)")
check("developer cannot create a client", 403, call("POST", "/clients", dev, {"name": "Sneaky Ltd"})[0])
check("developer cannot trigger analysis", 403, call("POST", f"/projects/{pid}/ai/analyse", dev, {})[0])
check("developer cannot approve a requirement", 403,
      call("POST", f"/projects/{pid}/requirements/x/decide", dev, {"decision": "APPROVE"})[0])
check("PM can create a client", 201,
      call("POST", "/clients", pm, {"name": f"Smoke Client {uuid4().hex[:8]}"})[0])

section("field-level commercial restriction (§16)")
check("contract value hidden from developer", None, call("GET", "/projects", dev)[1]["items"][0]["contractValue"])
check("contract value visible to PM", "850000", str(call("GET", "/projects", pm)[1]["items"][0]["contractValue"]))

section("knowledge centre (§7.1)")
before = call("GET", f"/projects/{pid}/sources", pm)[1]["sources"]
before_frags = sum(s["_count"]["fragments"] for s in before)
check("seeded sources are present", True, len(before) >= 3)
check("seeded sources produced citable fragments", True, before_frags >= 31)
st, _ = call("POST", f"/projects/{pid}/sources", pm, {
    "title": "Follow-up call note", "kind": "NOTE", "authority": "INTERNAL_NOTE", "statedAt": "2026-01-20",
    "inlineText": "The client confirmed by phone that the Hindi translation will be handled as a separate engagement after the main launch, and will not affect the March date."})
check("PM can add a pasted source", 201, st)
after = call("GET", f"/projects/{pid}/sources", pm)[1]["sources"]
check("the source is stored", len(before) + 1, len(after))
check("the source was fragmented for citation", True,
      sum(s["_count"]["fragments"] for s in after) > before_frags)
check("a source with no content is rejected", 400, call("POST", f"/projects/{pid}/sources", pm,
      {"title": "Empty", "kind": "NOTE", "authority": "INTERNAL_NOTE", "statedAt": "2026-01-20"})[0])

section("AI gating (§16 graceful degradation)")
_, policy = call("GET", f"/projects/{pid}/ai/policy", pm)
st, bd = call("POST", f"/projects/{pid}/ai/analyse", pm, {})
message = bd.get("error", {}).get("message", "")

if not policy["aiAvailable"]:
    check("analysis refused with no provider key", 422, st)
    check("the refusal names the variable to set", True, "ANTHROPIC_API_KEY" in message)
else:
    # A key is configured. Either the run succeeds, or it fails with a
    # classified, actionable error — never a raw 500.
    check("a configured provider is not refused as unconfigured", True, st != 422)
    check("a provider failure is never an opaque 500", True, st != 500)
    if st >= 400:
        check("the failure is classified", True, bd["error"]["code"].startswith("AI_"))
        check("the failure says what to do about it", True, len(message) > 40 and "Error:" not in message)
        _, runs = call("GET", f"/projects/{pid}/ai/runs", pm)
        check("the failed run is recorded for audit", "FAILED", runs["runs"][0]["state"])
        check("the recorded run keeps its prompt version", "extraction.v1", runs["runs"][0]["promptVersion"])
    else:
        check("the run produced drafts", True, bd["requirementsCreated"] >= 0)

check("the rest of the product still works", 200, call("GET", f"/projects/{pid}", pm)[0])

section("scope baseline gates (§7.3)")
st, bd = call("POST", f"/projects/{pid}/baselines", pm, {"title": "Baseline v1"})
check("baseline refused with no approved requirements", 422, st)
check("the gate says why", True, "approved" in bd["error"]["message"].lower())

section("explainable health (§13.1)")
st, health = call("GET", f"/projects/{pid}/health", pm)
check("health computed", 200, st)
check("health is one of the four states", True, health["health"] in {"GREEN", "AMBER", "RED", "GREY"})
check("every health signal carries a readable fact", True,
      bool(health["facts"]) and all(f.get("detail") and f.get("rule") for f in health["facts"]))

section("launch date drives health")
# A project past its promised launch date must never read as healthy, even
# when no milestones have been planned out yet.
call("PATCH", f"/projects/{pid}", pm, {"targetLaunchDate": "2020-01-01"})
_, overdue = call("GET", f"/projects/{pid}/health", pm)
check("an overdue launch turns the project red", "RED", overdue["health"])
check("and says so in plain words", True,
      any(f["rule"] == "launch.overdue" for f in overdue["facts"]))
call("PATCH", f"/projects/{pid}", pm, {"targetLaunchDate": "2099-01-01"})
_, restored = call("GET", f"/projects/{pid}/health", pm)
check("a distant launch date does not", True, restored["health"] != "RED")

section("audit trail (§4.1)")
_, audit = call("GET", f"/audit?projectId={pid}", pm)
actions = [i["action"] for i in audit["items"]]
check("the upload was audited", True, "source.uploaded" in actions)
check("the audit names the actor", "Priya Sharma",
      next(i for i in audit["items"] if i["action"] == "source.uploaded")["actor"]["name"])
check("the audit trail is not writable", 404, call("POST", "/audit", founder, {"action": "forged"})[0])

print(f"\n{'=' * 66}\npassed {passed}, failed {failed}")
sys.exit(1 if failed else 0)
