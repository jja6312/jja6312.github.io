"""Collect public commands from an installed OCI CLI's final Click tree.

This worker runs inside the isolated, pinned OCI CLI runtime prepared by
``oci_cli_click.py``. It deliberately observes the tree after generated and
extended modules have both been loaded.
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import sys
from pathlib import Path


SCHEMA_VERSION = 1
INFRASTRUCTURE_OPTIONS = {"--from-json", "--help"}
REQUIRED_MARKER = re.compile(r"\s*\[required\]\s*$", re.IGNORECASE)
DEPRECATED_MARKER = re.compile(r"^\s*(?:\[|\*\*)?\s*deprecated(?:\]|\*\*)?[\s.:]", re.IGNORECASE)


def first_sentence(value: str | None) -> str:
    if not value:
        return ""
    text = " ".join(value.split())
    marker = text.find(". ")
    return text[: marker + 1].strip() if 0 < marker < 240 else text[:240].strip()


def public_name(parameter) -> str | None:
    names = list(parameter.opts) + list(parameter.secondary_opts)
    return next(
        (name for name in names if name.startswith("--") and name not in INFRASTRUCTURE_OPTIONS),
        None,
    )


def option_metadata(parameter) -> dict | None:
    name = public_name(parameter)
    if not name:
        return None
    help_text = parameter.help or ""
    deprecated = bool(DEPRECATED_MARKER.search(help_text))
    required = bool(parameter.required or REQUIRED_MARKER.search(help_text))
    help_text = REQUIRED_MARKER.sub("", help_text)
    choices = getattr(parameter.type, "choices", None)
    if choices is not None:
        choices = list(choices)
    type_class = type(parameter.type).__name__
    type_name = getattr(parameter.type, "name", "") or ""
    is_flag = bool(parameter.is_flag)
    is_json = type_class == "CliComplexType" or type_name == "complex type"
    if is_json:
        type_label = "json"
    elif choices is not None:
        type_label = "choice"
    elif is_flag or type_name == "boolean":
        type_label = "bool"
    elif type_class == "CliDatetime" or "datetime" in type_name.lower():
        type_label = "datetime"
    elif type_name == "integer":
        type_label = "int"
    elif type_name == "float":
        type_label = "float"
    elif type_class in {"File", "FileType", "Path"} or type_name in {"file", "path"}:
        type_label = "file"
    else:
        type_label = "str"
    return {
        "name": name,
        "required": required,
        "json": is_json,
        "type": type_label,
        "typeClass": type_class,
        "typeName": type_name,
        "choices": choices,
        "flag": is_flag,
        "multiple": bool(parameter.multiple),
        "deprecated": deprecated,
        "deprecation": first_sentence(help_text) if deprecated else None,
        "help": first_sentence(help_text),
    }


def walk(command, path: tuple[str, ...], output: dict[str, dict]) -> None:
    import click

    if isinstance(command, click.Group):
        for name, child in sorted(command.commands.items()):
            walk(child, (*path, name), output)
        return
    options = []
    for parameter in command.params:
        if not isinstance(parameter, click.Option) or getattr(parameter, "hidden", False):
            continue
        metadata = option_metadata(parameter)
        if metadata:
            options.append(metadata)
    full_path = "oci " + " ".join(path)
    output[full_path] = {
        "path": full_path,
        "group": "oci " + " ".join(path[:-1]),
        "verb": path[-1],
        "func": getattr(command.callback, "__name__", None),
        "help": first_sentence(command.help),
        "options": options,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--collector-sha256", required=True)
    parser.add_argument("--requirements-sha256", required=True)
    parser.add_argument("--runtime-lock-sha256", required=True)
    parser.add_argument("services", nargs="+")
    args = parser.parse_args()

    sys.path.insert(0, str(Path(args.runtime).resolve()))
    # OCI CLI imports inspect argv and otherwise try to load this worker's
    # arguments as a service invocation.
    sys.argv = ["oci"]
    from oci_cli import cli_root, dynamic_loader
    from oci_cli.version import __version__
    import oci

    if __version__ != args.version:
        raise RuntimeError(f"OCI CLI runtime mismatch: expected {args.version}, got {__version__}")
    for service in args.services:
        dynamic_loader.load_service(service)

    commands: dict[str, dict] = {}
    for service in args.services:
        root = cli_root.cli.commands.get(service)
        if root is None:
            raise RuntimeError(f"OCI CLI Click tree did not register service: {service}")
        walk(root, (service,), commands)

    result = {
        "schemaVersion": SCHEMA_VERSION,
        "tag": args.tag,
        "version": args.version,
        "commit": args.commit,
        "collectorSha256": args.collector_sha256,
        "requirementsSha256": args.requirements_sha256,
        "runtimeLockSha256": args.runtime_lock_sha256,
        "services": args.services,
        "python": ".".join(map(str, sys.version_info[:3])),
        "click": importlib.metadata.version("click"),
        "ociSdk": oci.__version__,
        "commands": dict(sorted(commands.items())),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({
        "version": args.version,
        "services": len(args.services),
        "commands": len(commands),
        "output": str(output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
