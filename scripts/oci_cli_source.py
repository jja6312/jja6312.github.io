"""Fetch and verify the immutable OCI CLI source files used by the catalog."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath


SITE = Path(__file__).resolve().parent.parent
LOCK_PATH = Path(__file__).resolve().with_name("oci-cli-source.lock.json")
CACHE_ROOT = SITE / ".protected-cache" / "oci-cli-source"
RUNTIME_CACHE_ROOT = SITE / ".protected-cache" / "oci-cli-runtime"


def load_lock() -> dict:
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    required = {
        "schemaVersion", "repository", "releaseUrl", "rawBaseUrl", "tag", "version",
        "commit", "tree", "publishedAt", "collectedAt", "releaseAsset", "sources",
    }
    missing = sorted(required - lock.keys())
    if missing:
        raise RuntimeError(f"OCI CLI source lock is missing fields: {', '.join(missing)}")
    if lock["schemaVersion"] != 1:
        raise RuntimeError(f"Unsupported OCI CLI source lock schema: {lock['schemaVersion']}")
    if lock["tag"] != f"v{lock['version']}":
        raise RuntimeError("OCI CLI source lock tag/version mismatch")
    if not re.fullmatch(r"[0-9a-f]{40}", lock["commit"]):
        raise RuntimeError("OCI CLI source lock commit must be a full 40-character SHA")
    release_asset = lock["releaseAsset"]
    if not all(key in release_asset for key in ("name", "bytes", "sha256")):
        raise RuntimeError("OCI CLI source lock releaseAsset is incomplete")
    if not re.fullmatch(r"[0-9a-f]{64}", release_asset["sha256"]):
        raise RuntimeError("OCI CLI release asset SHA must be a full SHA-256")
    return lock


def source_index(lock: dict | None = None) -> dict[str, dict]:
    lock = lock or load_lock()
    entries = {entry["path"]: entry for entry in lock["sources"]}
    if len(entries) != len(lock["sources"]):
        raise RuntimeError("OCI CLI source lock contains duplicate paths")
    return entries


def source_root(lock: dict | None = None) -> Path:
    lock = lock or load_lock()
    return CACHE_ROOT / f"{lock['tag']}-{lock['commit'][:12]}"


def normalize_source_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    marker = "services/"
    marker_index = normalized.lower().find(marker)
    if marker_index >= 0:
        normalized = normalized[marker_index:]
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts or not normalized.startswith(marker):
        raise RuntimeError(f"OCI CLI source path must be repository-relative: {value}")
    return path.as_posix()


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate(target: Path, entry: dict) -> bool:
    if not target.is_file() or target.stat().st_size != entry["bytes"]:
        return False
    return _digest(target.read_bytes()) == entry["sha256"]


def _download(lock: dict, entry: dict, target: Path) -> None:
    if os.environ.get("OCI_CLI_SOURCE_OFFLINE") == "1":
        raise RuntimeError(f"Pinned OCI CLI source is not cached in offline mode: {entry['path']}")
    quoted_path = urllib.parse.quote(entry["path"], safe="/")
    url = f"{lock['rawBaseUrl'].rstrip('/')}/{lock['commit']}/{quoted_path}"
    request = urllib.request.Request(url, headers={"User-Agent": "jja6312-oci-cli-catalog/1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
    if len(data) != entry["bytes"] or _digest(data) != entry["sha256"]:
        raise RuntimeError(f"Pinned OCI CLI source checksum mismatch: {entry['path']}")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".download-", delete=False) as handle:
        handle.write(data)
        temporary = Path(handle.name)
    try:
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def ensure_release_asset() -> Path:
    """Download and verify Oracle's immutable release bundle."""
    lock = load_lock()
    entry = lock["releaseAsset"]
    target = RUNTIME_CACHE_ROOT / lock["tag"] / entry["name"]
    if _validate(target, entry):
        return target
    if os.environ.get("OCI_CLI_SOURCE_OFFLINE") == "1":
        raise RuntimeError(f"Pinned OCI CLI release asset is not cached in offline mode: {entry['name']}")
    repository = lock["repository"].rstrip("/")
    url = f"{repository}/releases/download/{urllib.parse.quote(lock['tag'], safe='')}/{urllib.parse.quote(entry['name'])}"
    request = urllib.request.Request(url, headers={"User-Agent": "jja6312-oci-cli-catalog/1"})
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(request, timeout=180) as response, tempfile.NamedTemporaryFile(
        dir=target.parent, prefix=".release-", delete=False
    ) as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)
        temporary = Path(handle.name)
    try:
        if not _validate(temporary, entry):
            raise RuntimeError(f"Pinned OCI CLI release asset checksum mismatch: {entry['name']}")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    if not _validate(target, entry):
        raise RuntimeError(f"Pinned OCI CLI release asset verification failed: {entry['name']}")
    return target


def ensure_source(paths: list[str] | None = None) -> Path:
    lock = load_lock()
    entries = source_index(lock)
    selected = list(entries) if paths is None else [normalize_source_path(path) for path in paths]
    unknown = sorted(set(selected) - entries.keys())
    if unknown:
        raise RuntimeError(f"OCI CLI source paths are not in the lock: {', '.join(unknown)}")
    root = source_root(lock)
    for path in selected:
        entry = entries[path]
        target = root / PurePosixPath(path)
        if not _validate(target, entry):
            _download(lock, entry, target)
        if not _validate(target, entry):
            raise RuntimeError(f"Pinned OCI CLI source verification failed: {path}")
    version_path = root / "src/oci_cli/version.py"
    if version_path.exists():
        match = re.search(r"__version__\s*=\s*['\"]([^'\"]+)", version_path.read_text(encoding="utf-8"))
        if not match or match.group(1) != lock["version"]:
            raise RuntimeError("Pinned OCI CLI version.py does not match the source lock")
    return root


def resolve_source_path(value: str, root: Path | None = None) -> Path:
    lock = load_lock()
    normalized = normalize_source_path(value)
    if normalized not in source_index(lock):
        raise RuntimeError(f"OCI CLI source file is not pinned: {normalized}")
    root = root or ensure_source([normalized, "src/oci_cli/version.py"])
    target = root / PurePosixPath(normalized)
    if not _validate(target, source_index(lock)[normalized]):
        raise RuntimeError(f"OCI CLI source file failed validation: {normalized}")
    return target


if __name__ == "__main__":
    locked = load_lock()
    root = ensure_source()
    print(json.dumps({
        "tag": locked["tag"],
        "version": locked["version"],
        "commit": locked["commit"],
        "sources": len(locked["sources"]),
        "cache": str(root),
    }, ensure_ascii=False))
