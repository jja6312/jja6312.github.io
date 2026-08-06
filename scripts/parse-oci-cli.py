"""OCI CLI generated Python source에서 command와 option 메타데이터를 추출한다."""
import ast


def _literal(node):
    try:
        return ast.literal_eval(node)
    except Exception:
        return None


def _first_sentence(text):
    if not text:
        return ""
    value = " ".join(text.split())
    marker = value.find(". ")
    return value[: marker + 1].strip() if 0 < marker < 240 else value[:240].strip()


def _option_name(call):
    values = [_literal(arg) for arg in call.args]
    return next((value for value in values if isinstance(value, str) and value.startswith("--")), None)


def _type_info(call):
    is_json, type_label, choices = False, "str", None
    for keyword in call.keywords:
        if keyword.arg != "type":
            continue
        node = keyword.value
        if isinstance(node, ast.Attribute) and node.attr == "CLI_COMPLEX_TYPE":
            is_json, type_label = True, "json"
        elif isinstance(node, ast.Attribute):
            type_label = node.attr.lower()
        elif isinstance(node, ast.Call):
            name = getattr(node.func, "attr", getattr(node.func, "id", ""))
            if name == "File":
                type_label = "file"
            elif name in ("CliCaseInsensitiveChoice", "Choice"):
                type_label = "choice"
                if node.args:
                    value = _literal(node.args[0])
                    if isinstance(value, (list, tuple)):
                        choices = list(value)
    return is_json, type_label, choices


def _keyword_bool(call, name):
    for keyword in call.keywords:
        if keyword.arg == name:
            return bool(_literal(keyword.value))
    return False


def _keyword_help(call):
    for keyword in call.keywords:
        if keyword.arg != "help":
            continue
        node = keyword.value.left if isinstance(keyword.value, ast.BinOp) else keyword.value
        value = _literal(node)
        return value if isinstance(value, str) else ""
    return ""


def _command_meta(call):
    override, verb = None, None
    for keyword in call.keywords:
        if keyword.arg != "name":
            continue
        node = keyword.value
        if isinstance(node, ast.Call):
            values = [_literal(arg) for arg in node.args]
            strings = [value for value in values if isinstance(value, str)]
            if strings:
                override = strings[0].replace(".command_name", "")
                verb = strings[-1]
        else:
            value = _literal(node)
            if isinstance(value, str):
                verb = value
    return override, verb, _keyword_help(call)


def parse_file(path):
    with open(path, "r", encoding="utf-8") as source:
        tree = ast.parse(source.read(), filename=path)
    commands = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        command_call, group, options = None, None, []
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                continue
            if decorator.func.attr == "command":
                command_call = decorator
                if isinstance(decorator.func.value, ast.Name):
                    group = decorator.func.value.id
            elif decorator.func.attr == "option":
                name = _option_name(decorator)
                if not name:
                    continue
                is_json, type_label, choices = _type_info(decorator)
                options.append({
                    "name": name,
                    "required": _keyword_bool(decorator, "required"),
                    "json": is_json,
                    "type": type_label,
                    "choices": choices,
                    "multiple": _keyword_bool(decorator, "multiple"),
                    "help": _first_sentence(_keyword_help(decorator)),
                })
        if command_call is None:
            continue
        override, verb, help_text = _command_meta(command_call)
        if verb is not None:
            commands.append({
                "override": override,
                "verb": verb,
                "group": group,
                "func": node.name,
                "help": _first_sentence(help_text),
                "options": options,
            })
    return commands
