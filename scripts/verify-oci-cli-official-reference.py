"""Verify the generated complete OCI CLI reference against the pinned Click tree."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from oci_cli_click import load_click_tree
from oci_cli_source import load_lock


SITE = Path(__file__).resolve().parent.parent
PUBLIC_ROOT = SITE / "public" / "oci-cli"


def fail(message: str) -> None:
    raise RuntimeError(message)


def load(path: Path) -> dict:
    if not path.is_file():
        fail(f"Missing official OCI CLI reference asset: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def normalized_option(option: dict) -> dict:
    return {
        "name": option["name"],
        "required": bool(option.get("required")),
        "type": option.get("type", "str"),
        "choices": option.get("choices") or None,
        "flag": bool(option.get("flag")),
        "multiple": bool(option.get("multiple")),
        "deprecated": bool(option.get("deprecated")),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=PUBLIC_ROOT)
    args = parser.parse_args()
    reference_root = args.root.resolve()
    lock = load_lock()
    tree = load_click_tree()
    current = load(reference_root / "current.json")
    if current.get("version") != lock["version"]:
        fail("Official OCI CLI current pointer is not pinned to the source lock")
    index_path = reference_root / current["index"]
    index_payload = index_path.read_bytes()
    if len(index_payload) != current.get("indexBytes") or hashlib.sha256(index_payload).hexdigest() != current.get("indexSha256"):
        fail("Official OCI CLI index digest differs from current.json")
    index = json.loads(index_payload)
    if index.get("source", {}).get("commit") != lock["commit"] or index.get("source", {}).get("scope") != "all-public-services":
        fail("Official OCI CLI index provenance is incomplete")
    if index.get("totals", {}).get("services") != lock["clickTree"]["expectedServiceCount"]:
        fail("Official OCI CLI service coverage is not complete")
    if index.get("totals", {}).get("commands") != len(tree["commands"]):
        fail("Official OCI CLI command total differs from the pinned Click tree")

    generated: dict[str, dict] = {}
    shard_bytes = 0
    for service in index.get("services", []):
        shard_path = index_path.parent / service["file"]
        payload = shard_path.read_bytes()
        shard_bytes += len(payload)
        if len(payload) != service["bytes"] or hashlib.sha256(payload).hexdigest() != service["sha256"]:
            fail(f"Official OCI CLI shard digest differs: {service['key']}")
        shard = json.loads(payload)
        if shard.get("service", {}).get("key") != service["key"]:
            fail(f"Official OCI CLI shard service differs: {service['key']}")
        for command in shard.get("commands", []):
            path = command["path"]
            if path in generated:
                fail(f"Duplicate official OCI CLI command: {path}")
            generated[path] = command
            expected_url = (
                f"https://docs.oracle.com/en-us/iaas/tools/oci-cli/{lock['version']}/"
                f"oci_cli_docs/cmdref/{'/'.join(path.split()[1:])}.html"
            )
            if command.get("docsUrl") != expected_url:
                fail(f"Pinned command documentation URL differs: {path}")

    if set(generated) != set(tree["commands"]):
        missing = sorted(set(tree["commands"]) - set(generated))[:5]
        extra = sorted(set(generated) - set(tree["commands"]))[:5]
        fail(f"Official OCI CLI leaf coverage differs: missing={missing}, extra={extra}")
    for path, official in tree["commands"].items():
        actual = generated[path]
        expected_options = [normalized_option(option) for option in official.get("options", [])]
        actual_options = [normalized_option(option) for option in actual.get("options", [])]
        if actual_options != expected_options:
            fail(f"Official OCI CLI option metadata differs: {path}")

    search_paths = [entry.get("path") for entry in index.get("commandIndex", [])]
    if len(search_paths) != len(set(search_paths)) or set(search_paths) != set(tree["commands"]):
        fail("Official OCI CLI global search index is incomplete or duplicated")
    print(json.dumps({
        "version": lock["version"],
        "groups": index["totals"]["groups"],
        "services": index["totals"]["services"],
        "commands": len(generated),
        "options": index["totals"]["options"],
        "shardBytes": shard_bytes,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
