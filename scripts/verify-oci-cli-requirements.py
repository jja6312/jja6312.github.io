"""Verify required/conditional/exclusive/deprecated OCI CLI option semantics."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from oci_cli_click import load_click_tree
from oci_cli_source import ensure_release_asset


SITE = Path(__file__).resolve().parent.parent
CATALOG = SITE / ".protected-cache" / "cliCatalog.json"
GENERATOR = SITE / "scripts" / "generate-cli-catalog.py"
BUILDER = SITE / "src" / "pages" / "CliBuilderPage.tsx"


def fail(message: str) -> None:
    raise RuntimeError(message)


def options_of(command: dict) -> list[dict]:
    return [
        option
        for section in command.get("sections", [])
        for option in section.get("options", [])
    ] + command.get("advanced", [])


def main() -> None:
    tree = load_click_tree()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    required_mismatches = []
    checked_operations = 0
    deprecated_options = 0
    for resource, command in catalog["commands"].items():
        for operation, metadata in command.get("operations", {}).items():
            source = tree["commands"].get(metadata["cmd"])
            if not source:
                continue
            checked_operations += 1
            source_options = {option["name"]: option for option in source["options"]}
            for option in options_of(metadata):
                if option.get("console"):
                    fail(f"{resource}:{operation} still promotes a CLI optional field: {option['name']}")
                original = source_options.get(option["name"])
                if not original:
                    continue
                if option["required"] != original["required"]:
                    required_mismatches.append((resource, operation, option["name"]))
                expected = "required" if original["required"] else "optional"
                if option.get("requirement") not in (expected, "conditional"):
                    fail(f"{resource}:{operation} invalid requirement metadata: {option['name']}")
                if original.get("deprecated") != bool(option.get("deprecated")):
                    fail(f"{resource}:{operation} deprecated metadata mismatch: {option['name']}")
                deprecated_options += bool(option.get("deprecated"))
    if required_mismatches:
        fail(f"CLI required metadata was changed by presentation curation: {required_mismatches}")

    instance = catalog["commands"]["instance"]["operations"]["create"]
    instance_options = {option["name"]: option for option in options_of(instance)}
    required = sorted(name for name, option in instance_options.items() if option["required"])
    if required != ["--availability-domain", "--compartment-id", "--subnet-id"]:
        fail(f"Instance launch required options do not match final Click: {required}")
    boot_sources = ["--image-id", "--source-details", "--source-boot-volume-id"]
    if any(instance_options[name].get("requirement") != "conditional" for name in boot_sources):
        fail("Instance boot sources must be conditional-required")
    one_of = next((rule for rule in instance.get("rules", []) if rule["id"] == "instance-boot-source"), None)
    if not one_of or one_of["kind"] != "oneOf" or one_of["options"] != boot_sources:
        fail("Instance boot source one-of rule is missing")
    for left in boot_sources:
        expected_conflicts = set(boot_sources) - {left}
        if not expected_conflicts.issubset(instance_options[left].get("conflictsWith", [])):
            fail(f"Instance boot source conflict metadata is incomplete: {left}")
    requires = next((rule for rule in instance.get("rules", []) if rule["id"] == "instance-boot-size-requires-image"), None)
    if not requires or requires.get("when") != "--boot-volume-size-in-gbs" or requires.get("requires") != ["--image-id"]:
        fail("Instance boot volume size dependency is missing")
    notices = instance.get("optionNotices", [])
    if "--create-vnic-details" in instance_options or not any(
        notice.get("option") == "--create-vnic-details" and "--subnet-id" in notice.get("replacements", [])
        for notice in notices
    ):
        fail("Final Instance launch VNIC interface notice is missing")

    for command, name, replacement in (
        (catalog["commands"]["block-volume"]["operations"]["create"], "--size-in-mbs", "--size-in-gbs"),
        (catalog["commands"]["vcn"]["operations"]["create"], "--cidr-block", "--cidr-blocks"),
    ):
        option = next((item for item in options_of(command) if item["name"] == name), None)
        if not option or not option.get("deprecated") or replacement not in option.get("replacement", []):
            fail(f"Deprecated replacement metadata is missing: {command['cmd']} {name}")

    generator = GENERATOR.read_text(encoding="utf-8")
    if "['required'] = True" in generator or "['console'] = True" in generator or "'promote':" in generator:
        fail("Generator still contains console-based required promotion")
    builder = BUILDER.read_text(encoding="utf-8")
    for marker in ("visibleFormSections", "showDeprecated", "cli-rule-panel", "조건부 필수"):
        if marker not in builder:
            fail(f"Requirement/deprecation UI is missing: {marker}")

    launch = tree["commands"]["oci compute instance launch"]
    click_names = {option["name"] for option in launch["options"]}
    if "--create-vnic-details" in click_names or not set(boot_sources + ["--subnet-id"]).issubset(click_names):
        fail("Pinned final Click launch interface is unexpected")
    with zipfile.ZipFile(ensure_release_asset()) as release:
        cmdref = release.read("oci-cli/oci_cli_docs/cmdref/compute/instance/launch.html").decode("utf-8")
        if "--create-vnic-details" in cmdref or not all(name in cmdref for name in boot_sources + ["--subnet-id"]):
            fail("Official Instance launch cmdref does not match the modeled interface")

    print(json.dumps({
        "checkedOperations": checked_operations,
        "requiredMismatches": len(required_mismatches),
        "instanceRequired": required,
        "instanceConditional": boot_sources,
        "deprecatedOptions": deprecated_options,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
