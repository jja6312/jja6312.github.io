"""Prepare the pinned OCI CLI runtime and expose its final Click tree."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import venv
import zipfile
from pathlib import Path, PurePosixPath

from oci_cli_source import ensure_release_asset, load_lock


SITE = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
REQUIREMENTS = SCRIPTS / "oci-cli-runtime-requirements.txt"
COLLECTOR = SCRIPTS / "collect-oci-cli-click-tree.py"
RUNTIME_ROOT = SITE / ".protected-cache" / "oci-cli-runtime"
CORE_PREFIXES = (
    "alloy/", "common_util/", "interactive/", "oci_cli/aliasing/",
    "oci_cli/custom_types/", "oci_cli/file_filters/", "oci_cli/help_text_producer/",
    "oci_cli/util/",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def configuration_digest(config: dict) -> str:
    encoded = json.dumps(config, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def runtime_configuration(lock: dict) -> dict:
    config = lock.get("clickTree")
    required = {"schemaVersion", "wheel", "pythonRequirements"}
    if not isinstance(config, dict) or required - config.keys():
        raise RuntimeError("OCI CLI source lock is missing the final Click-tree runtime configuration")
    if config["schemaVersion"] not in {1, 2}:
        raise RuntimeError(f"Unsupported OCI CLI Click-tree schema: {config['schemaVersion']}")
    if config["schemaVersion"] == 1:
        if {"services", "servicePackages"} - config.keys():
            raise RuntimeError("OCI CLI Click-tree v1 requires selected services and packages")
    elif config.get("scope") != "all-public-services" or not isinstance(config.get("expectedServiceCount"), int):
        raise RuntimeError("OCI CLI Click-tree v2 must pin the complete public service scope")
    if config["pythonRequirements"] != REQUIREMENTS.name:
        raise RuntimeError("OCI CLI Click-tree requirements file does not match the source lock")
    return config


def extract_runtime(lock: dict, release_asset: Path) -> Path:
    config = runtime_configuration(lock)
    root = RUNTIME_ROOT / lock["tag"]
    wheel_path = root / "package" / config["wheel"]["name"]
    site_packages = root / "runtime" / "site-packages"
    manifest_path = root / "runtime-manifest.json"
    expected_manifest = {
        "releaseAssetSha256": lock["releaseAsset"]["sha256"],
        "wheelSha256": config["wheel"]["sha256"],
        "scope": config.get("scope", "selected-services"),
        "servicePackages": config.get("servicePackages", ["*"]),
    }
    try:
        current = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        current = None
    version_file = site_packages / "oci_cli" / "version.py"
    if current == expected_manifest and version_file.is_file() and wheel_path.is_file():
        if wheel_path.stat().st_size == config["wheel"]["bytes"] and digest(wheel_path) == config["wheel"]["sha256"]:
            return site_packages

    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(release_asset) as release:
        entry_name = f"oci-cli/{config['wheel']['name']}"
        try:
            entry = release.getinfo(entry_name)
        except KeyError as error:
            raise RuntimeError(f"Official release asset is missing {entry_name}") from error
        if entry.file_size != config["wheel"]["bytes"]:
            raise RuntimeError("OCI CLI wheel byte length does not match the source lock")
        wheel_path.parent.mkdir(parents=True, exist_ok=True)
        with release.open(entry) as source, tempfile.NamedTemporaryFile(
            dir=wheel_path.parent, prefix=".wheel-", delete=False
        ) as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
            temporary = Path(target.name)
        try:
            if digest(temporary) != config["wheel"]["sha256"]:
                raise RuntimeError("OCI CLI wheel checksum does not match the source lock")
            os.replace(temporary, wheel_path)
        finally:
            temporary.unlink(missing_ok=True)

    service_prefixes = ("services/",) if config.get("scope") == "all-public-services" else tuple(
        f"services/{name}/" for name in config["servicePackages"]
    )
    selected_prefixes = service_prefixes + CORE_PREFIXES
    with zipfile.ZipFile(wheel_path) as wheel:
        for entry in wheel.infolist():
            name = entry.filename
            selected = name.startswith(selected_prefixes) or (
                name.startswith("oci_cli/") and name.count("/") == 1 and name.endswith(".py")
            )
            if not selected or name.startswith("oci_cli/help_text_producer/data_files/"):
                continue
            target = site_packages / PurePosixPath(name)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with wheel.open(entry) as source, target.open("wb") as destination:
                while chunk := source.read(1024 * 1024):
                    destination.write(chunk)
    manifest_path.write_text(json.dumps(expected_manifest, indent=2) + "\n", encoding="utf-8")
    return site_packages


def ensure_python_runtime(lock: dict) -> Path:
    if sys.version_info < (3, 11):
        raise RuntimeError("OCI CLI Click-tree collection requires Python 3.11 or newer")
    root = RUNTIME_ROOT / lock["tag"]
    environment = root / f"venv-py{sys.version_info.major}{sys.version_info.minor}"
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    requirement_hash = digest(REQUIREMENTS)
    ready = environment / ".oci-click-runtime.json"
    expected = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "requirementsSha256": requirement_hash,
    }
    try:
        current = json.loads(ready.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        current = None
    if current == expected and python.is_file():
        return python
    if not python.is_file():
        venv.EnvBuilder(with_pip=True, clear=False).create(environment)
    subprocess.run([
        str(python), "-m", "pip", "install", "--disable-pip-version-check",
        "--no-compile", "--requirement", str(REQUIREMENTS),
    ], check=True)
    ready.write_text(json.dumps(expected, indent=2) + "\n", encoding="utf-8")
    return python


def click_tree_cache(lock: dict) -> Path:
    return RUNTIME_ROOT / lock["tag"] / "click-tree.json"


def load_click_tree(force: bool = False) -> dict:
    lock = load_lock()
    config = runtime_configuration(lock)
    collector_hash = digest(COLLECTOR)
    requirements_hash = digest(REQUIREMENTS)
    runtime_lock_hash = configuration_digest(config)
    cache = click_tree_cache(lock)
    if not force:
        try:
            result = json.loads(cache.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            result = None
        complete_scope = config.get("scope") == "all-public-services"
        services_match = (
            result.get("scope") == "all-public-services"
            and len(result.get("services", [])) == config.get("expectedServiceCount")
            and len(result.get("serviceMap", {})) == config.get("expectedServiceCount")
        ) if complete_scope else result.get("services") == config["services"]
        if result and all((
            result.get("schemaVersion") == config["schemaVersion"],
            result.get("tag") == lock["tag"],
            result.get("commit") == lock["commit"],
            result.get("collectorSha256") == collector_hash,
            result.get("requirementsSha256") == requirements_hash,
            result.get("runtimeLockSha256") == runtime_lock_hash,
            services_match,
        )):
            return result

    release_asset = ensure_release_asset()
    runtime = extract_runtime(lock, release_asset)
    python = ensure_python_runtime(lock)
    collector_scope = ["--all-services"] if config.get("scope") == "all-public-services" else config["services"]
    subprocess.run([
        str(python), str(COLLECTOR),
        "--runtime", str(runtime),
        "--output", str(cache),
        "--tag", lock["tag"],
        "--version", lock["version"],
        "--commit", lock["commit"],
        "--collector-sha256", collector_hash,
        "--requirements-sha256", requirements_hash,
        "--runtime-lock-sha256", runtime_lock_hash,
        *collector_scope,
    ], check=True)
    result = json.loads(cache.read_text(encoding="utf-8"))
    if result.get("version") != lock["version"] or not result.get("commands"):
        raise RuntimeError("OCI CLI final Click-tree collection produced invalid metadata")
    if config.get("scope") == "all-public-services" and len(result.get("services", [])) != config["expectedServiceCount"]:
        raise RuntimeError("OCI CLI complete service count differs from the pinned source contract")
    return result


if __name__ == "__main__":
    tree = load_click_tree(force="--force" in sys.argv)
    print(json.dumps({
        "tag": tree["tag"],
        "commit": tree["commit"],
        "services": len(tree["services"]),
        "commands": len(tree["commands"]),
        "click": tree["click"],
        "ociSdk": tree["ociSdk"],
        "cache": str(click_tree_cache(load_lock())),
    }, ensure_ascii=False))
