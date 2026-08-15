"""Regressions for OCI CLI public metadata collected from the final Click tree."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from oci_cli_click import load_click_tree
from oci_cli_source import ensure_release_asset, load_lock


SITE = Path(__file__).resolve().parent.parent
CATALOG = SITE / ".protected-cache" / "cliCatalog.json"
GENERATOR = SITE / "scripts" / "generate-cli-catalog.py"


def fail(message: str) -> None:
    raise RuntimeError(message)


def option_names(command: dict) -> set[str]:
    return {option["name"] for option in command.get("options", [])}


def catalog_option_names(command: dict) -> set[str]:
    names = {option["name"] for section in command.get("sections", []) for option in section["options"]}
    names.update(option["name"] for option in command.get("advanced", []))
    return names


def main() -> None:
    lock = load_lock()
    tree = load_click_tree()
    commands = tree["commands"]
    generator_source = GENERATOR.read_text(encoding="utf-8")
    if "parse-oci-cli" in generator_source or "parse_cli_file" in generator_source:
        fail("Catalog generation still depends on the generated-file AST parser")
    regressions = {
        "oci monitoring alarm create": ("--query-text", "--query-parameterconflict"),
        "oci ons subscription create": ("--subscription-endpoint", "--endpoint-parameterconflict"),
    }
    for path, (expected, forbidden) in regressions.items():
        command = commands.get(path)
        if not command:
            fail(f"Final Click tree is missing {path}")
        names = option_names(command)
        if expected not in names or forbidden in names:
            fail(f"{path}: expected public {expected}, got {sorted(names)}")

    if not CATALOG.is_file():
        fail("Generated CLI catalog is missing; run the catalog generator first")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    for resource, command in catalog.get("commands", {}).items():
        if command.get("source", {}).get("kind") != "generated":
            continue
        if command["cmd"] not in commands:
            fail(f"{resource}: primary command is not in the final Click tree: {command['cmd']}")
        for operation, metadata in command.get("operations", {}).items():
            if metadata["cmd"] not in commands:
                fail(f"{resource}:{operation}: command is not in the final Click tree: {metadata['cmd']}")

    alarm_names = catalog_option_names(catalog["commands"]["alarm"]["operations"]["create"])
    subscription_names = catalog_option_names(catalog["commands"]["subscription"]["operations"]["create"])
    if "--query-text" not in alarm_names or "--query-parameterconflict" in alarm_names:
        fail("Generated Alarm CREATE form does not expose --query-text")
    if "--subscription-endpoint" not in subscription_names or "--endpoint-parameterconflict" in subscription_names:
        fail("Generated ONS Subscription CREATE form does not expose --subscription-endpoint")

    asset = ensure_release_asset()
    docs = {
        "oci-cli/oci_cli_docs/cmdref/monitoring/alarm/create.html": "--query-text",
        "oci-cli/oci_cli_docs/cmdref/ons/subscription/create.html": "--subscription-endpoint",
    }
    with zipfile.ZipFile(asset) as release:
        for path, expected in docs.items():
            content = release.read(path).decode("utf-8")
            if expected not in content:
                fail(f"Official v{lock['version']} cmdref does not contain {expected}: {path}")

    print(json.dumps({
        "tag": tree["tag"],
        "commit": tree["commit"],
        "collector": "final-click-tree",
        "click": tree["click"],
        "ociSdk": tree["ociSdk"],
        "services": len(tree["services"]),
        "publicCommands": len(commands),
        "generatedResources": sum(
            command.get("source", {}).get("kind") == "generated"
            for command in catalog.get("commands", {}).values()
        ),
        "cmdrefRegressions": len(docs),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
