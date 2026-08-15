"""Normalize blog-db OCI CLI metadata to the source lock used by the site."""

from __future__ import annotations

import json
import re
from pathlib import Path

from oci_cli_source import load_lock, normalize_source_path, source_index


SITE = Path(__file__).resolve().parent.parent
DATA = SITE.parent / "blog-db" / "knowledge" / "oci-cli" / "_data"


def main() -> None:
    lock = load_lock()
    locked_sources = source_index(lock)
    changed = 0
    for path in sorted(DATA.glob("*.json")):
        original = path.read_text(encoding="utf-8")
        data = json.loads(original)
        source_file = data.get("source_file")
        if source_file:
            normalized = normalize_source_path(source_file)
            if normalized not in locked_sources:
                raise RuntimeError(f"{path.name}: source is not present in the lock: {normalized}")
            source_kind = "generated"
        elif data.get("commands"):
            normalized = None
            source_kind = "manual-curation"
        else:
            raise RuntimeError(f"{path.name}: neither a pinned source file nor curated commands exist")

        # Preserve hand-curated command formatting; only replace the provenance header fields.
        updated = re.sub(
            r'^  "source_(?:kind|tag|commit)":.*\n',
            '',
            original,
            flags=re.MULTILINE,
        )
        header = (
            f'  "cli_version": "{lock["version"]}",\n'
            f'  "source_kind": "{source_kind}",\n'
            f'  "source_tag": "{lock["tag"]}",\n'
            f'  "source_commit": "{lock["commit"]}",'
        )
        updated, count = re.subn(r'^  "cli_version": ".*",$', header, updated, count=1, flags=re.MULTILINE)
        if count != 1:
            raise RuntimeError(f"{path.name}: cli_version header was not found")
        if normalized:
            source_line = f'  "source_file": {json.dumps(normalized)},'
            updated, count = re.subn(r'^  "source_file": ".*",$', source_line, updated, count=1, flags=re.MULTILINE)
            if count != 1:
                raise RuntimeError(f"{path.name}: source_file header was not found")
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    markdown_changed = 0
    for path in sorted(DATA.parent.glob("ocicli_*.md")):
        original = path.read_text(encoding="utf-8")
        updated = original.replace(
            "CLI v3.51.0 (로컬 설치본 소스 기준)",
            f"CLI v{lock['version']} (공식 {lock['tag']} 고정 소스 기준)",
        )
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            markdown_changed += 1
    print(
        f"OCI CLI source metadata normalized: {changed} JSON / {markdown_changed} Markdown changed "
        f"({len(list(DATA.glob('*.json')))} JSON total)"
    )


if __name__ == "__main__":
    main()
