# Drop-in compatibility proof: the OFFICIAL Firecrawl Python SDK (firecrawl-py)
# pointed at the fuegol.ink API with a fuegol key. No business-logic changes.
import os, sys, json, urllib.request
from firecrawl import Firecrawl

API = os.environ.get("FUEGOL_API", "https://fuegol-api.manhattan.workers.dev")

# Issue a fuegol key (never a Firecrawl fc- key).
req = urllib.request.Request(
    API + "/v2/keys",
    data=json.dumps({"name": "py-sdk-compat"}).encode(),
    headers={"content-type": "application/json", "user-agent": "Mozilla/5.0 fuegol-sdk-compat"},
)
key = json.loads(urllib.request.urlopen(req).read())["apiKey"]
print("issued fuegol key:", key[:16] + "…\n")

app = Firecrawl(api_key=key, api_url=API)

passed = 0
failed = 0


def field(obj, k):
    if isinstance(obj, dict):
        return obj.get(k)
    return getattr(obj, k, None)


def ok(name, cond, extra=""):
    global passed, failed
    print(("✅ " if cond else "❌ ") + name + ((" — " + str(extra)) if (not cond and extra) else ""))
    if cond:
        passed += 1
    else:
        failed += 1


try:
    d = app.scrape("https://example.com", formats=["markdown"])
    md = field(d, "markdown")
    ok("py SDK.scrape → markdown", isinstance(md, str) and "domain" in md.lower())
except Exception as e:
    ok("py SDK.scrape", False, e)

try:
    m = app.map("https://example.com", limit=10)
    ok("py SDK.map → links", field(m, "links") is not None)
except Exception as e:
    ok("py SDK.map", False, e)

try:
    s = app.search("cloudflare workers durable objects", limit=3)
    web = field(s, "web") or field(field(s, "data") or {}, "web")
    ok("py SDK.search → web results", bool(web))
except Exception as e:
    ok("py SDK.search", False, e)

try:
    c = app.crawl("https://books.toscrape.com", limit=3)
    status, data = field(c, "status"), field(c, "data")
    ok("py SDK.crawl → completed + data", status == "completed" and data and len(data) > 0, f"status={status}")
except Exception as e:
    ok("py SDK.crawl", False, e)

print(f"\nPY SDK COMPAT: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
