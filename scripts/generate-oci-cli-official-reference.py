"""Generate a complete, lazy-loadable OCI CLI reference from the pinned Click tree.

The public reference is immutable product metadata.  Private operational curation
stays in ``cliCatalog.json`` and is merged only in the browser, so regenerating an
official release can never erase dynamic lookups, safe defaults, or custom flows.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path

from oci_cli_click import load_click_tree
from oci_cli_source import load_lock


SITE = Path(__file__).resolve().parent.parent
PUBLIC_ROOT = SITE / "public" / "oci-cli"
SCHEMA_VERSION = 1


def compact_option(option: dict) -> dict:
    result = {
        "name": option["name"],
        "required": bool(option.get("required")),
        "type": option.get("type", "str"),
        "help": option.get("help", ""),
    }
    for source, target in (
        ("choices", "choices"),
        ("deprecation", "deprecation"),
    ):
        value = option.get(source)
        if value:
            result[target] = value
    for key in ("flag", "multiple", "deprecated", "json"):
        if option.get(key):
            result[key] = True
    return result


def command_docs_url(version: str, path: str) -> str:
    segments = path.split()[1:]
    return (
        f"https://docs.oracle.com/en-us/iaas/tools/oci-cli/{version}/"
        f"oci_cli_docs/cmdref/{'/'.join(segments)}.html"
    )


def write_json(path: Path, value: object) -> tuple[int, str]:
    payload = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return len(payload), hashlib.sha256(payload).hexdigest()


def main() -> None:
    lock = load_lock()
    tree = load_click_tree()
    service_map = tree.get("serviceMap", {})
    if tree.get("scope") != "all-public-services":
        raise RuntimeError("Official reference requires the complete OCI CLI service scope")
    if set(service_map) != set(tree.get("services", [])):
        raise RuntimeError("OCI CLI service metadata and final Click roots differ")

    commands_by_service: dict[str, list[dict]] = defaultdict(list)
    total_options = 0
    for path, command in sorted(tree["commands"].items()):
        segments = path.split()
        if len(segments) < 3 or segments[0] != "oci":
            raise RuntimeError(f"Unexpected OCI CLI leaf path: {path}")
        service = segments[1]
        if service not in service_map:
            raise RuntimeError(f"Command is outside the pinned service map: {path}")
        options = [compact_option(option) for option in command.get("options", [])]
        total_options += len(options)
        commands_by_service[service].append({
            "path": path,
            "segments": segments[2:],
            "verb": command.get("verb", segments[-1]),
            "help": command.get("help", ""),
            "options": options,
            "docsUrl": command_docs_url(lock["version"], path),
        })

    version_root = PUBLIC_ROOT / lock["version"]
    service_entries = []
    search_index = []
    group_services: dict[str, list[str]] = defaultdict(list)
    for service in sorted(service_map):
        metadata = service_map[service]
        commands = commands_by_service.get(service, [])
        if not commands:
            raise RuntimeError(f"Public OCI CLI service has no leaf commands: {service}")
        shard = {
            "schemaVersion": SCHEMA_VERSION,
            "source": {
                "tag": lock["tag"],
                "version": lock["version"],
                "commit": lock["commit"],
                "collector": "final-click-tree",
            },
            "service": {
                "key": service,
                "label": metadata["label"],
                "group": metadata["group"],
            },
            "commands": commands,
        }
        relative = f"services/{service}.json"
        byte_length, digest = write_json(version_root / relative, shard)
        service_entries.append({
            "key": service,
            "label": metadata["label"],
            "group": metadata["group"],
            "commandCount": len(commands),
            "file": relative,
            "bytes": byte_length,
            "sha256": digest,
        })
        group_services[metadata["group"]].append(service)
        search_index.extend({
            "path": command["path"],
            "service": service,
            "help": command["help"],
        } for command in commands)

    groups = [
        {"label": group, "services": sorted(services)}
        for group, services in sorted(group_services.items())
    ]
    index = {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "repository": lock["repository"],
            "releaseUrl": lock["releaseUrl"],
            "tag": lock["tag"],
            "version": lock["version"],
            "commit": lock["commit"],
            "tree": lock["tree"],
            "publishedAt": lock["publishedAt"],
            "collector": "final-click-tree",
            "scope": "all-public-services",
        },
        "totals": {
            "groups": len(groups),
            "services": len(service_entries),
            "commands": len(tree["commands"]),
            "options": total_options,
        },
        "groups": groups,
        "services": service_entries,
        "commandIndex": search_index,
    }
    index_bytes, index_sha256 = write_json(version_root / "index.json", index)
    write_json(PUBLIC_ROOT / "current.json", {
        "schemaVersion": SCHEMA_VERSION,
        "version": lock["version"],
        "index": f"{lock['version']}/index.json",
        "indexBytes": index_bytes,
        "indexSha256": index_sha256,
    })
    print(json.dumps({
        "version": lock["version"],
        **index["totals"],
        "indexBytes": index_bytes,
        "output": str(version_root),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
