"""Verify that Vite copied every official OCI CLI reference asset byte-for-byte."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


SITE = Path(__file__).resolve().parent.parent
SOURCE = SITE / "public" / "oci-cli"
BUILT = SITE / "dist" / "oci-cli"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def files(root: Path) -> dict[str, Path]:
    if not root.is_dir():
        raise RuntimeError(f"OCI CLI asset root is missing: {root}")
    return {path.relative_to(root).as_posix(): path for path in root.rglob("*") if path.is_file()}


def main() -> None:
    source_files = files(SOURCE)
    built_files = files(BUILT)
    if set(source_files) != set(built_files):
        missing = sorted(set(source_files) - set(built_files))[:5]
        extra = sorted(set(built_files) - set(source_files))[:5]
        raise RuntimeError(f"OCI CLI deploy assets differ: missing={missing}, extra={extra}")
    for relative, source in source_files.items():
        if source.stat().st_size != built_files[relative].stat().st_size or digest(source) != digest(built_files[relative]):
            raise RuntimeError(f"OCI CLI deploy asset digest differs: {relative}")
    pointer = json.loads(source_files["current.json"].read_text(encoding="utf-8"))
    index = json.loads(source_files[pointer["index"]].read_text(encoding="utf-8"))
    if len(index["services"]) != index["totals"]["services"]:
        raise RuntimeError("OCI CLI deploy index service count differs")
    print(json.dumps({
        "version": pointer["version"],
        "files": len(source_files),
        "services": index["totals"]["services"],
        "commands": index["totals"]["commands"],
        "status": "byte-identical",
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
