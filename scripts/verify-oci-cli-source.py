"""Regression checks for the pinned OCI CLI source and catalog provenance."""

from __future__ import annotations

import json
from pathlib import Path, PurePosixPath

from oci_cli_source import ensure_source, load_lock, source_index, source_root


SITE = Path(__file__).resolve().parent.parent
DATA = SITE.parent / "blog-db" / "knowledge" / "oci-cli" / "_data"
CATALOG = SITE / ".protected-cache" / "cliCatalog.json"


def fail(message: str) -> None:
    raise RuntimeError(message)


def main() -> None:
    lock = load_lock()
    root = ensure_source()
    locked_sources = source_index(lock)
    generated = curated = 0
    for path in sorted(DATA.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        prefix = path.name
        if data.get("cli_version") != lock["version"]:
            fail(f"{prefix}: cli_version is not pinned to {lock['version']}")
        if data.get("source_tag") != lock["tag"] or data.get("source_commit") != lock["commit"]:
            fail(f"{prefix}: source tag/commit mismatch")
        kind = data.get("source_kind")
        if kind == "generated":
            generated += 1
            source_file = data.get("source_file", "")
            if PurePosixPath(source_file).is_absolute() or "\\" in source_file or source_file not in locked_sources:
                fail(f"{prefix}: source_file must be a locked repository-relative path")
            if not (root / PurePosixPath(source_file)).is_file():
                fail(f"{prefix}: pinned source file was not materialized")
        elif kind == "manual-curation":
            curated += 1
            if data.get("source_file") or not data.get("commands"):
                fail(f"{prefix}: manual curation metadata is inconsistent")
        else:
            fail(f"{prefix}: invalid source_kind {kind!r}")
    if not CATALOG.is_file():
        fail("Generated CLI catalog is missing; run the catalog generator first")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    provenance = catalog.get("source", {})
    for key in ("repository", "releaseUrl", "tag", "version", "commit", "publishedAt", "collectedAt"):
        if provenance.get(key) != lock.get(key):
            fail(f"Catalog source provenance mismatch: {key}")
    if provenance.get("metadataCollector") != "final-click-tree":
        fail("Catalog metadata was not collected from the final OCI CLI Click tree")
    for resource, command in catalog.get("commands", {}).items():
        command_source = command.get("source", {})
        if command_source.get("tag") != lock["tag"] or command_source.get("commit") != lock["commit"]:
            fail(f"{resource}: command source provenance is missing or mixed")
        if command_source.get("kind") not in ("generated", "manual-curation"):
            fail(f"{resource}: invalid command source kind")
    print(json.dumps({
        "tag": lock["tag"],
        "commit": lock["commit"],
        "lockedSources": len(locked_sources),
        "generatedResources": generated,
        "curatedResources": curated,
        "catalogCommands": len(catalog.get("commands", {})),
        "cache": str(source_root(lock)),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
