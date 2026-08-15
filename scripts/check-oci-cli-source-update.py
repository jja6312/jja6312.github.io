"""Report immutable source-file differences between the pin and the latest release."""

from __future__ import annotations

import hashlib
import json
import urllib.parse
import urllib.request

from oci_cli_source import load_lock


API = "https://api.github.com/repos/oracle/oci-cli"


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "jja6312-oci-cli-catalog/1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def resolve_commit(tag: str) -> str:
    reference = get_json(f"{API}/git/ref/tags/{urllib.parse.quote(tag, safe='')}")
    target = reference["object"]
    if target["type"] == "tag":
        target = get_json(target["url"])["object"]
    if target["type"] != "commit":
        raise RuntimeError(f"Latest OCI CLI tag does not resolve to a commit: {target['type']}")
    return target["sha"]


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "jja6312-oci-cli-catalog/1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main() -> None:
    lock = load_lock()
    latest = get_json(f"{API}/releases/latest")
    latest_tag = latest["tag_name"]
    latest_commit = resolve_commit(latest_tag)
    changes = []
    for entry in lock["sources"]:
        path = urllib.parse.quote(entry["path"], safe="/")
        data = fetch_bytes(f"{lock['rawBaseUrl'].rstrip('/')}/{latest_commit}/{path}")
        digest = hashlib.sha256(data).hexdigest()
        changes.append({
            "path": entry["path"],
            "status": "unchanged" if digest == entry["sha256"] else "changed",
            "pinnedSha256": entry["sha256"],
            "latestSha256": digest,
            "latestBytes": len(data),
        })
    report = {
        "pinned": {"tag": lock["tag"], "commit": lock["commit"]},
        "latest": {"tag": latest_tag, "commit": latest_commit, "releaseUrl": latest["html_url"]},
        "updateAvailable": latest_tag != lock["tag"] or latest_commit != lock["commit"],
        "changedSources": sum(item["status"] == "changed" for item in changes),
        "sources": changes,
        "nextStep": "Review the generated catalog diff before changing the lock." if latest_tag != lock["tag"] else "No lock update is required.",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
