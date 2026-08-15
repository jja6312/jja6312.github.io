"""Gate the public OCI CLI catalog against the pinned final Click metadata.

The committed contract is deliberately reviewable and contains no protected
values.  Locally, it must also match the freshly generated protected catalog.
Every difference needs an exact, guarded approval; unknown and stale approvals
both fail the gate.
"""

from __future__ import annotations

import argparse
import copy
import json
from collections import Counter
from pathlib import Path

from oci_cli_click import load_click_tree
from oci_cli_source import load_lock


SITE = Path(__file__).resolve().parent.parent
CATALOG = SITE / ".protected-cache" / "cliCatalog.json"
CONTRACT = SITE / "scripts" / "oci-cli-metadata-contract.json"
APPROVALS = SITE / "scripts" / "oci-cli-metadata-approvals.json"
REPORT = SITE / ".protected-cache" / "oci-cli-metadata-report.json"
CRUD_PREFIXES = {
    "get": ("get",),
    "list": ("list",),
    "create": ("create",),
    "update": ("update",),
    "delete": ("delete", "terminate"),
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def options_of(surface: dict) -> list[dict]:
    return [
        option
        for section in surface.get("sections", [])
        for option in section.get("options", [])
    ] + surface.get("advanced", [])


def sorted_choices(value: list | None) -> list | None:
    if value is None:
        return None
    return sorted(value, key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True))


def catalog_option(option: dict) -> dict:
    result = {
        "required": bool(option.get("required")),
        "type": option.get("type", "str"),
        "flag": bool(option.get("flag")),
        "multiple": bool(option.get("multiple")),
        "choices": sorted_choices(option.get("choices")),
        "deprecated": bool(option.get("deprecated")),
    }
    if option.get("lookupOnly"):
        result["lookupOnly"] = True
    return result


def official_option(option: dict) -> dict:
    option_type = "json" if option.get("json") else option.get("type", "str")
    choices = option.get("choices")
    if option.get("flag"):
        choices = None
    elif option_type == "bool":
        choices = ["true", "false"]
    return {
        "required": bool(option.get("required")),
        "type": option_type,
        "flag": bool(option.get("flag")),
        "multiple": bool(option.get("multiple")),
        "choices": sorted_choices(choices),
        "deprecated": bool(option.get("deprecated")),
    }


def build_contract(catalog: dict, tree: dict, approvals: dict, lock: dict) -> dict:
    source = catalog.get("source", {})
    if source.get("tag") != lock["tag"] or source.get("commit") != lock["commit"]:
        raise RuntimeError("Generated catalog source does not match the OCI CLI lock")
    official_manual = set(approvals.get("officialManualResources", []))
    resources = {}
    manual_surfaces = []
    for resource, command in sorted(catalog.get("commands", {}).items()):
        source_kind = command.get("source", {}).get("kind")
        audited = source_kind == "generated" or resource in official_manual
        operations = {}
        for operation, surface in sorted(command.get("operations", {}).items()):
            normalized = {
                "command": surface["cmd"],
                "options": {
                    option["name"]: catalog_option(option)
                    for option in sorted(options_of(surface), key=lambda item: item["name"])
                },
            }
            if audited:
                operations[operation] = normalized
            else:
                manual_surfaces.append({
                    "resource": resource,
                    "operation": operation,
                    "command": surface["cmd"],
                    "presentInPinnedClickTree": surface["cmd"] in tree["commands"],
                })
        if audited:
            resources[resource] = {
                "sourceKind": source_kind,
                "coverage": "derived-crud" if source_kind == "generated" else "explicit-official",
                "primaryCommand": command["cmd"],
                "operations": operations,
            }
    return {
        "schemaVersion": 1,
        "source": {
            "tag": lock["tag"],
            "version": lock["version"],
            "commit": lock["commit"],
            "collector": "final-click-tree",
        },
        "resources": resources,
        "manualSurfaces": manual_surfaces,
    }


def make_issue(resource: str, operation: str, kind: str, subject: str, **details) -> dict:
    return {
        "id": f"{resource}:{operation}:{kind}:{subject}",
        "resource": resource,
        "operation": operation,
        "kind": kind,
        "subject": subject,
        **details,
    }


def expected_crud(primary: dict, commands: dict) -> dict[str, str]:
    same_group = [command for command in commands.values() if command.get("group") == primary.get("group")]
    expected = {}
    for operation, prefixes in CRUD_PREFIXES.items():
        primary_verb = primary.get("verb")
        primary_is_create = operation == "create" and primary_verb not in (
            "get", "list", "update", "delete", "terminate"
        )
        found = primary if primary_verb == operation or primary_is_create else None
        if not found:
            for prefix in prefixes:
                found = next((item for item in same_group if item.get("verb") == prefix), None)
                if not found:
                    candidates = sorted(
                        (item for item in same_group if (item.get("verb") or "").startswith(prefix + "-")),
                        key=lambda item: len(item["verb"]),
                    )
                    found = candidates[0] if candidates else None
                if found:
                    break
        if found:
            expected[operation] = found["path"]
    return expected


def compare_contract(contract: dict, tree: dict, lock: dict, official_manual: set[str]) -> list[dict]:
    issues = []
    source = contract.get("source", {})
    for field in ("tag", "version", "commit"):
        if source.get(field) != lock[field]:
            issues.append(make_issue("__contract__", "source", "sourceMismatch", field,
                                     expected=lock[field], actual=source.get(field)))
    commands = tree["commands"]
    for surface in contract.get("manualSurfaces", []):
        if surface.get("presentInPinnedClickTree") and surface["resource"] not in official_manual:
            issues.append(make_issue(
                surface["resource"], surface["operation"], "unauditedOfficialSurface", surface["command"],
                actual="present in final Click tree",
            ))

    for resource, metadata in contract.get("resources", {}).items():
        operations = metadata.get("operations", {})
        if metadata.get("coverage") == "derived-crud":
            primary_path = metadata.get("primaryCommand")
            primary = commands.get(primary_path)
            if not primary:
                issues.append(make_issue(resource, "primary", "missingCommand", primary_path,
                                         expected="present in final Click tree", actual=None))
                expected_operations = {}
            else:
                expected_operations = expected_crud(primary, commands)
            for operation in sorted(expected_operations.keys() - operations.keys()):
                issues.append(make_issue(resource, operation, "missingOperation", expected_operations[operation],
                                         expected=expected_operations[operation], actual=None))
            for operation in sorted(operations.keys() - expected_operations.keys()):
                issues.append(make_issue(resource, operation, "extraOperation", operations[operation]["command"],
                                         expected=None, actual=operations[operation]["command"]))
            for operation in sorted(expected_operations.keys() & operations.keys()):
                actual_path = operations[operation]["command"]
                if actual_path != expected_operations[operation]:
                    issues.append(make_issue(resource, operation, "commandPath", actual_path,
                                             expected=expected_operations[operation], actual=actual_path))

        for operation, surface in operations.items():
            command_path = surface["command"]
            official = commands.get(command_path)
            if not official:
                issues.append(make_issue(resource, operation, "missingCommand", command_path,
                                         expected="present in final Click tree", actual=None))
                continue
            expected_options = {option["name"]: official_option(option) for option in official["options"]}
            actual_options = surface.get("options", {})
            for name in sorted(expected_options.keys() - actual_options.keys()):
                issues.append(make_issue(resource, operation, "missingOption", name,
                                         expected=expected_options[name], actual=None))
            for name in sorted(actual_options.keys() - expected_options.keys()):
                issues.append(make_issue(resource, operation, "extraOption", name,
                                         expected=None, actual=actual_options[name]))
            for name in sorted(expected_options.keys() & actual_options.keys()):
                for field in ("required", "type", "flag", "multiple", "choices", "deprecated"):
                    expected = expected_options[name][field]
                    actual = actual_options[name].get(field)
                    if actual != expected:
                        issues.append(make_issue(resource, operation, field, name,
                                                 expected=expected, actual=actual))
    return sorted(issues, key=lambda item: item["id"])


def apply_approvals(issues: list[dict], approvals: dict) -> tuple[list[dict], list[dict], list[dict]]:
    configured = approvals.get("approvedDifferences", [])
    by_id = {approval["id"]: approval for approval in configured}
    if len(by_id) != len(configured):
        raise RuntimeError("OCI CLI metadata approvals contain duplicate IDs")
    approved = []
    unapproved = []
    matched = set()
    for issue in issues:
        approval = by_id.get(issue["id"])
        if not approval:
            unapproved.append(issue)
            continue
        for field in ("kind", "resource", "operation", "subject"):
            if approval.get(field) != issue.get(field):
                raise RuntimeError(f"Approval {approval['id']} does not match issue field {field}")
        if not approval.get("reason", "").strip():
            raise RuntimeError(f"Approval {approval['id']} needs a reason")
        guard = approval.get("guard", {})
        if guard.get("lookupOnly") is True and issue.get("actual", {}).get("lookupOnly") is not True:
            raise RuntimeError(f"Approval {approval['id']} requires lookupOnly=true")
        matched.add(approval["id"])
        approved.append({**issue, "reason": approval["reason"]})
    stale = [approval for approval in configured if approval["id"] not in matched]
    return approved, unapproved, stale


def run_self_test(contract: dict, tree: dict, lock: dict, official_manual: set[str]) -> int:
    generated = next(
        (resource, metadata)
        for resource, metadata in contract["resources"].items()
        if metadata["coverage"] == "derived-crud" and metadata["operations"]
    )
    resource, metadata = generated
    operation = next(iter(metadata["operations"]))
    surface = metadata["operations"][operation]
    option_name = next(iter(surface["options"]))
    choice_name = next((name for name, option in surface["options"].items() if option["choices"]), option_name)
    cases = []

    def mutated(kind: str, mutate) -> None:
        value = copy.deepcopy(contract)
        mutate(value["resources"][resource]["operations"])
        cases.append((kind, value))

    mutated("missingOperation", lambda operations: operations.pop(operation))
    mutated("extraOperation", lambda operations: operations.__setitem__("unexpected", {
        "command": surface["command"], "options": copy.deepcopy(surface["options"]),
    }))
    mutated("commandPath", lambda operations: operations[operation].__setitem__(
        "command", next(path for path in tree["commands"] if path != surface["command"])
    ))
    mutated("missingOption", lambda operations: operations[operation]["options"].pop(option_name))
    mutated("extraOption", lambda operations: operations[operation]["options"].__setitem__(
        "--metadata-gate-self-test", {"required": False, "type": "str", "flag": False,
                                      "multiple": False, "choices": None, "deprecated": False}
    ))
    for field, replacement in (
        ("required", lambda current: not current),
        ("type", lambda _current: "__metadata_gate_drift__"),
        ("flag", lambda current: not current),
        ("multiple", lambda current: not current),
        ("deprecated", lambda current: not current),
    ):
        mutated(field, lambda operations, field=field, replacement=replacement: operations[operation]["options"][option_name].__setitem__(
            field, replacement(operations[operation]["options"][option_name][field])
        ))
    mutated("choices", lambda operations: operations[operation]["options"][choice_name].__setitem__(
        "choices", ["__metadata_gate_drift__"]
    ))
    for expected_kind, value in cases:
        kinds = {issue["kind"] for issue in compare_contract(value, tree, lock, official_manual)}
        if expected_kind not in kinds:
            raise RuntimeError(f"OCI CLI metadata self-test did not detect {expected_kind}: {sorted(kinds)}")
    probe = make_issue("self-test", "get", "extraOption", "--probe", expected=None, actual={
        "required": False, "type": "str", "flag": False, "multiple": False,
        "choices": None, "deprecated": False,
    })
    _approved, unapproved, stale = apply_approvals([probe], {"approvedDifferences": []})
    if [issue["id"] for issue in unapproved] != [probe["id"]] or stale:
        raise RuntimeError("OCI CLI metadata self-test did not reject an unapproved difference")
    stale_approval = {**probe, "reason": "self-test"}
    _approved, unapproved, stale = apply_approvals([], {"approvedDifferences": [stale_approval]})
    if unapproved or [approval["id"] for approval in stale] != [probe["id"]]:
        raise RuntimeError("OCI CLI metadata self-test did not reject a stale approval")
    guarded_approval = {**probe, "reason": "self-test", "guard": {"lookupOnly": True}}
    try:
        apply_approvals([probe], {"approvedDifferences": [guarded_approval]})
    except RuntimeError as error:
        if "lookupOnly=true" not in str(error):
            raise
    else:
        raise RuntimeError("OCI CLI metadata self-test did not enforce the lookupOnly approval guard")
    return len(cases) + 3


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-contract", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument("--contract", type=Path, default=CONTRACT)
    parser.add_argument("--approvals", type=Path, default=APPROVALS)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args()

    lock = load_lock()
    tree = load_click_tree()
    approvals = read_json(args.approvals)
    if approvals.get("schemaVersion") != 1:
        raise RuntimeError("Unsupported OCI CLI metadata approval schema")
    if approvals.get("source", {}).get("tag") != lock["tag"] or approvals.get("source", {}).get("commit") != lock["commit"]:
        raise RuntimeError("OCI CLI metadata approvals are not pinned to the current source lock")
    official_manual = set(approvals.get("officialManualResources", []))

    if args.catalog.is_file():
        proposed = build_contract(read_json(args.catalog), tree, approvals, lock)
        if args.write_contract:
            contract = proposed
        else:
            if not args.contract.is_file():
                raise RuntimeError("OCI CLI metadata contract is missing; run with --write-contract")
            contract = read_json(args.contract)
            if proposed != contract:
                raise RuntimeError("Generated OCI CLI catalog and committed metadata contract differ; review and regenerate the contract")
    else:
        if args.write_contract:
            raise RuntimeError("Cannot write the metadata contract without a generated catalog")
        contract = read_json(args.contract)

    issues = compare_contract(contract, tree, lock, official_manual)
    approved, unapproved, stale = apply_approvals(issues, approvals)
    self_tests = run_self_test(contract, tree, lock, official_manual) if args.self_test else 0
    operation_count = sum(len(resource["operations"]) for resource in contract["resources"].values())
    option_count = sum(
        len(surface["options"])
        for resource in contract["resources"].values()
        for surface in resource["operations"].values()
    )
    kinds = Counter(issue["kind"] for issue in issues)
    report = {
        "schemaVersion": 1,
        "source": contract["source"],
        "summary": {
            "resources": len(contract["resources"]),
            "operations": operation_count,
            "options": option_count,
            "manualSurfacesExcluded": len(contract.get("manualSurfaces", [])),
            "differences": len(issues),
            "approved": len(approved),
            "unapproved": len(unapproved),
            "staleApprovals": len(stale),
            "commandDifferences": sum(kinds[kind] for kind in (
                "missingCommand", "missingOperation", "extraOperation", "commandPath"
            )),
            "missingOptions": kinds["missingOption"],
            "extraOptions": kinds["extraOption"],
            "metadataDifferences": sum(kinds[kind] for kind in (
                "required", "type", "flag", "multiple", "choices", "deprecated"
            )),
            "selfTests": self_tests,
        },
        "differencesByKind": dict(sorted(kinds.items())),
        "approvedDifferences": approved,
        "unapprovedDifferences": unapproved,
        "staleApprovals": stale,
    }
    write_json(args.report, report)
    if unapproved or stale:
        raise RuntimeError(
            "OCI CLI metadata gate failed: "
            f"unapproved={len(unapproved)}, staleApprovals={len(stale)}; report={args.report}"
        )
    if args.write_contract:
        write_json(args.contract, contract)
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
