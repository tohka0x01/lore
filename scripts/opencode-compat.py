#!/usr/bin/env python3
"""Safely patch and restore the OpenCode Claude compatibility import for Lore.

This helper only edits an existing user-level oh-my-openagent/oh-my-opencode
JSON or JSONC file. It never creates third-party configuration and records the
single value it changed under Lore-owned state so uninstall can restore it.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MAX_CONFIG_BYTES = 4 * 1024 * 1024
STATE_VERSION = 1
STATE_ABSENT = "absent"
MISSING = object()
CONFIG_NAMES = (
    "oh-my-openagent.jsonc",
    "oh-my-openagent.json",
    "oh-my-opencode.jsonc",
    "oh-my-opencode.json",
)


class UnsafeConfig(Exception):
    pass


@dataclass(frozen=True)
class Member:
    key: str
    key_start: int
    value_start: int
    value_end: int
    comma: int | None


@dataclass(frozen=True)
class ObjectInfo:
    start: int
    close: int
    members: tuple[Member, ...]


def skip_trivia(text: str, index: int) -> int:
    length = len(text)
    while index < length:
        if text[index].isspace():
            index += 1
            continue
        if text.startswith("//", index):
            newline = text.find("\n", index + 2)
            return length if newline < 0 else skip_trivia(text, newline + 1)
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            if end < 0:
                raise UnsafeConfig("unterminated block comment")
            index = end + 2
            continue
        return index
    return index


def scan_string(text: str, index: int) -> int:
    if index >= len(text) or text[index] != '"':
        raise UnsafeConfig("expected JSON string")
    index += 1
    while index < len(text):
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == '"':
            return index + 1
        index += 1
    raise UnsafeConfig("unterminated JSON string")


def scan_compound(text: str, index: int) -> int:
    opening = text[index]
    if opening not in "{[":
        raise UnsafeConfig("expected object or array")
    stack = ["}" if opening == "{" else "]"]
    index += 1
    while index < len(text):
        if text[index] == '"':
            index = scan_string(text, index)
            continue
        if text.startswith("//", index):
            newline = text.find("\n", index + 2)
            index = len(text) if newline < 0 else newline + 1
            continue
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            if end < 0:
                raise UnsafeConfig("unterminated block comment")
            index = end + 2
            continue
        if text[index] == "{":
            stack.append("}")
        elif text[index] == "[":
            stack.append("]")
        elif text[index] == stack[-1]:
            stack.pop()
            if not stack:
                return index + 1
        index += 1
    raise UnsafeConfig("unterminated object or array")


def scan_value(text: str, index: int) -> int:
    index = skip_trivia(text, index)
    if index >= len(text):
        raise UnsafeConfig("missing JSON value")
    if text[index] == '"':
        return scan_string(text, index)
    if text[index] in "{[":
        return scan_compound(text, index)
    end = index
    while end < len(text):
        if text.startswith("//", end) or text.startswith("/*", end):
            break
        if text[end] in ",}]" or text[end].isspace():
            break
        end += 1
    if end == index:
        raise UnsafeConfig("invalid JSON value")
    return end


def object_info(text: str, start: int) -> ObjectInfo:
    start = skip_trivia(text, start)
    if start >= len(text) or text[start] != "{":
        raise UnsafeConfig("expected JSON object")
    index = start + 1
    members: list[Member] = []
    while True:
        index = skip_trivia(text, index)
        if index >= len(text):
            raise UnsafeConfig("unterminated JSON object")
        if text[index] == "}":
            return ObjectInfo(start=start, close=index, members=tuple(members))
        key_start = index
        key_end = scan_string(text, key_start)
        try:
            key = json.loads(text[key_start:key_end])
        except json.JSONDecodeError as error:
            raise UnsafeConfig("invalid object key") from error
        index = skip_trivia(text, key_end)
        if index >= len(text) or text[index] != ":":
            raise UnsafeConfig("missing object colon")
        value_start = skip_trivia(text, index + 1)
        value_end = scan_value(text, value_start)
        index = skip_trivia(text, value_end)
        comma = index if index < len(text) and text[index] == "," else None
        members.append(
            Member(
                key=key,
                key_start=key_start,
                value_start=value_start,
                value_end=value_end,
                comma=comma,
            )
        )
        if comma is not None:
            index = comma + 1
            continue
        index = skip_trivia(text, index)
        if index >= len(text) or text[index] != "}":
            raise UnsafeConfig("missing object comma")


def find_member(info: ObjectInfo, key: str) -> Member | None:
    return next((member for member in info.members if member.key == key), None)


def mask_jsonc(text: str) -> str:
    chars = list(text)
    index = 0
    while index < len(chars):
        if chars[index] == '"':
            index = scan_string(text, index)
            continue
        if text.startswith("//", index):
            end = text.find("\n", index + 2)
            end = len(text) if end < 0 else end
            for position in range(index, end):
                chars[position] = " "
            index = end
            continue
        if text.startswith("/*", index):
            end = text.find("*/", index + 2)
            if end < 0:
                raise UnsafeConfig("unterminated block comment")
            for position in range(index, end + 2):
                if chars[position] not in "\r\n":
                    chars[position] = " "
            index = end + 2
            continue
        index += 1
    masked = "".join(chars)
    chars = list(masked)
    index = 0
    while index < len(chars):
        if chars[index] == '"':
            index = scan_string(masked, index)
            continue
        if chars[index] == ",":
            lookahead = index + 1
            while lookahead < len(chars) and chars[lookahead].isspace():
                lookahead += 1
            if lookahead < len(chars) and chars[lookahead] in "}]":
                chars[index] = " "
        index += 1
    return "".join(chars)


def reject_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise UnsafeConfig(f"duplicate object key: {key}")
        result[key] = value
    return result


def parse_document(text: str, is_jsonc: bool) -> dict[str, Any]:
    try:
        data = json.loads(
            mask_jsonc(text) if is_jsonc else text,
            object_pairs_hook=reject_duplicate_members,
        )
    except (json.JSONDecodeError, UnsafeConfig) as error:
        raise UnsafeConfig("invalid JSON/JSONC") from error
    if not isinstance(data, dict):
        raise UnsafeConfig("configuration root is not an object")
    return data


def newline_for(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def line_indent(text: str, position: int) -> str:
    line_start = text.rfind("\n", 0, position) + 1
    prefix = text[line_start:position]
    return prefix if prefix.strip() == "" else ""


def member_indent(text: str, info: ObjectInfo) -> str:
    if info.members:
        indent = line_indent(text, info.members[0].key_start)
        if indent:
            return indent
    return line_indent(text, info.start) + "  "


def insert_member(text: str, object_start: int, key: str, value: str) -> str:
    info = object_info(text, object_start)
    if find_member(info, key) is not None:
        raise UnsafeConfig(f"duplicate edit target: {key}")
    newline = newline_for(text)
    multiline = "\n" in text[info.start : info.close]
    if multiline:
        if info.members and info.members[-1].comma is None:
            last = info.members[-1]
            text = text[: last.value_end] + "," + text[last.value_end :]
            info = object_info(text, object_start)
        close_line_start = text.rfind("\n", 0, info.close) + 1
        insert_at = close_line_start if text[close_line_start:info.close].strip() == "" else info.close
        addition = f'{member_indent(text, info)}{json.dumps(key)}: {value},{newline}'
        return text[:insert_at] + addition + text[insert_at:]
    if info.members:
        last = info.members[-1]
        separator = "," if last.comma is None else ""
        return text[: info.close] + f'{separator} {json.dumps(key)}: {value}' + text[info.close :]
    return text[: info.close] + f' {json.dumps(key)}: {value} ' + text[info.close :]


def replace_member_value(text: str, object_start: int, key: str, value: str) -> str:
    member = find_member(object_info(text, object_start), key)
    if member is None:
        raise UnsafeConfig(f"missing edit target: {key}")
    return text[: member.value_start] + value + text[member.value_end :]


def remove_member(text: str, object_start: int, key: str) -> str:
    info = object_info(text, object_start)
    member = find_member(info, key)
    if member is None:
        return text
    line_start = text.rfind("\n", 0, member.key_start) + 1
    own_line = text[line_start:member.key_start].strip() == ""
    if own_line:
        end = member.comma + 1 if member.comma is not None else member.value_end
        while end < len(text) and text[end] in " \t":
            end += 1
        if end < len(text) and text[end] == "\r":
            end += 1
        if end < len(text) and text[end] == "\n":
            end += 1
        if end > member.value_end:
            return text[:line_start] + text[end:]
    if member.comma is not None:
        end = member.comma + 1
        while end < len(text) and text[end] in " \t":
            end += 1
        return text[: member.key_start] + text[end:]
    member_index = info.members.index(member)
    if member_index > 0:
        previous = info.members[member_index - 1]
        if previous.comma is not None:
            return text[: previous.comma] + text[member.value_end :]
    return text[: member.key_start] + text[member.value_end :]


def object_has_comment(text: str, info: ObjectInfo) -> bool:
    index = info.start + 1
    while index < info.close:
        if text[index] == '"':
            index = scan_string(text, index)
            continue
        if text.startswith("//", index) or text.startswith("/*", index):
            return True
        index += 1
    return False


def nested_objects(text: str) -> tuple[ObjectInfo, Member | None, ObjectInfo | None, Member | None, ObjectInfo | None]:
    root_start = skip_trivia(text, 0)
    root = object_info(text, root_start)
    claude_member = find_member(root, "claude_code")
    if claude_member is None:
        return root, None, None, None, None
    claude = object_info(text, claude_member.value_start)
    plugins_member = find_member(claude, "plugins_override")
    if plugins_member is None:
        return root, claude_member, claude, None, None
    plugins = object_info(text, plugins_member.value_start)
    return root, claude_member, claude, plugins_member, plugins


def validate_compat_shape(data: dict[str, Any]) -> tuple[object | bool, bool, bool]:
    claude = data.get("claude_code", MISSING)
    created_claude = claude is MISSING
    if claude is not MISSING and not isinstance(claude, dict):
        raise UnsafeConfig("claude_code is not an object")
    plugins = MISSING if claude is MISSING else claude.get("plugins_override", MISSING)
    created_plugins = plugins is MISSING
    if plugins is not MISSING and not isinstance(plugins, dict):
        raise UnsafeConfig("plugins_override is not an object")
    previous = MISSING if plugins is MISSING else plugins.get("lore@lore", MISSING)
    if previous is not MISSING and not isinstance(previous, bool):
        raise UnsafeConfig("lore@lore override is not boolean")
    return previous, created_claude, created_plugins


def patch_jsonc(text: str, data: dict[str, Any]) -> tuple[str, object | bool, tuple[str, ...]]:
    previous, created_claude, created_plugins = validate_compat_shape(data)
    if previous is False:
        return text, previous, ()
    root, claude_member, claude, plugins_member, plugins = nested_objects(text)
    created: list[str] = []
    if claude_member is None:
        text = insert_member(
            text,
            root.start,
            "claude_code",
            '{"plugins_override": {"lore@lore": false}}',
        )
        created.extend(("claude_code", "plugins_override"))
    elif plugins_member is None:
        assert claude is not None
        text = insert_member(text, claude.start, "plugins_override", '{"lore@lore": false}')
        created.append("plugins_override")
    elif previous is MISSING:
        assert plugins is not None
        text = insert_member(text, plugins.start, "lore@lore", "false")
    else:
        assert plugins is not None
        text = replace_member_value(text, plugins.start, "lore@lore", "false")
    parse_document(text, True)
    if created_claude and "claude_code" not in created:
        raise UnsafeConfig("failed to record created claude_code object")
    if created_plugins and "plugins_override" not in created:
        raise UnsafeConfig("failed to record created plugins_override object")
    return text, previous, tuple(created)


def patch_json(text: str, data: dict[str, Any]) -> tuple[str, object | bool, tuple[str, ...]]:
    previous, created_claude, created_plugins = validate_compat_shape(data)
    if previous is False:
        return text, previous, ()
    claude = data.setdefault("claude_code", {})
    plugins = claude.setdefault("plugins_override", {})
    plugins["lore@lore"] = False
    created: list[str] = []
    if created_claude:
        created.append("claude_code")
    if created_plugins:
        created.append("plugins_override")
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n", previous, tuple(created)


def restore_jsonc(text: str, previous: object | bool, created: set[str]) -> str:
    data = parse_document(text, True)
    current, _, _ = validate_compat_shape(data)
    if current is not False:
        raise ValueError("user_changed")
    root, _, claude, _, plugins = nested_objects(text)
    assert claude is not None and plugins is not None
    if previous is True:
        text = replace_member_value(text, plugins.start, "lore@lore", "true")
        parse_document(text, True)
        return text
    text = remove_member(text, plugins.start, "lore@lore")
    data = parse_document(text, True)
    _, _, claude, _, plugins = nested_objects(text)
    assert claude is not None and plugins is not None
    plugins_data = data.get("claude_code", {}).get("plugins_override", {})
    if "plugins_override" in created and plugins_data == {} and not object_has_comment(text, plugins):
        text = remove_member(text, claude.start, "plugins_override")
        data = parse_document(text, True)
    if "claude_code" in created and data.get("claude_code") == {}:
        root = object_info(text, skip_trivia(text, 0))
        text = remove_member(text, root.start, "claude_code")
    parse_document(text, True)
    return text


def restore_json(text: str, previous: object | bool, created: set[str]) -> str:
    data = parse_document(text, False)
    current, _, _ = validate_compat_shape(data)
    if current is not False:
        raise ValueError("user_changed")
    claude = data["claude_code"]
    plugins = claude["plugins_override"]
    if previous is True:
        plugins["lore@lore"] = True
    else:
        plugins.pop("lore@lore", None)
        if "plugins_override" in created and not plugins:
            claude.pop("plugins_override", None)
        if "claude_code" in created and not claude:
            data.pop("claude_code", None)
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def allowed_paths(home: Path) -> tuple[Path, ...]:
    config_dir = home / ".config" / "opencode"
    return tuple(config_dir / name for name in CONFIG_NAMES)


def require_safe_regular_file(path: Path) -> str:
    try:
        file_stat = path.lstat()
    except OSError as error:
        raise UnsafeConfig("cannot stat configuration") from error
    if not stat.S_ISREG(file_stat.st_mode) or path.is_symlink():
        raise UnsafeConfig("configuration is not a regular file")
    if hasattr(os, "getuid") and file_stat.st_uid != os.getuid():
        raise UnsafeConfig("configuration is not owned by the current user")
    if file_stat.st_size > MAX_CONFIG_BYTES:
        raise UnsafeConfig("configuration is too large")
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise UnsafeConfig("cannot read UTF-8 configuration") from error


def atomic_write(path: Path, content: str, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    try:
        with temporary.open("w", encoding="utf-8", newline="") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode if mode is not None else 0o600)
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def load_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        return {"version": STATE_VERSION, "records": []}
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise UnsafeConfig("Lore compatibility state is invalid") from error
    if data.get("version") != STATE_VERSION or not isinstance(data.get("records"), list):
        raise UnsafeConfig("Lore compatibility state has an unsupported format")
    return data


def save_state(state_path: Path, state: dict[str, Any]) -> None:
    records = state.get("records", [])
    if not records:
        try:
            state_path.unlink()
        except FileNotFoundError:
            pass
        return
    atomic_write(state_path, json.dumps(state, indent=2, ensure_ascii=False) + "\n", 0o600)


def install(home: Path, lore_home: Path) -> int:
    allow_value = os.environ.get("LORE_OPENCODE_ALLOW_MCP", "").strip().lower()
    if allow_value in {"1", "true"}:
        if (lore_home / "opencode-compat.json").exists():
            uninstall(home, lore_home)
        print("LORE_OPENCODE_ALLOW_MCP=1: preserving legacy OpenCode compatibility imports")
        return 0
    config_path = next((path for path in allowed_paths(home) if path.exists()), None)
    if config_path is None:
        return 0
    state_path = lore_home / "opencode-compat.json"
    try:
        state = load_state(state_path)
        text = require_safe_regular_file(config_path)
        is_jsonc = config_path.suffix == ".jsonc"
        data = parse_document(text, is_jsonc)
        previous, _, _ = validate_compat_shape(data)
        existing_record = next(
            (record for record in state["records"] if record.get("path") == str(config_path)),
            None,
        )
        if previous is False:
            return 0
        updated, previous, created = patch_jsonc(text, data) if is_jsonc else patch_json(text, data)
        original_state = {
            "version": state["version"],
            "records": [dict(record) for record in state["records"]],
        }
        record: dict[str, Any] = {
            "path": str(config_path),
            "previous": STATE_ABSENT if previous is MISSING else previous,
        }
        if created:
            record["created"] = list(created)
        if existing_record is None:
            state["records"].append(record)
        else:
            state["records"][state["records"].index(existing_record)] = record
        save_state(state_path, state)
        try:
            atomic_write(config_path, updated, stat.S_IMODE(config_path.stat().st_mode))
        except Exception:
            save_state(state_path, original_state)
            raise
    except UnsafeConfig:
        print(f"WARNING: could not safely parse oh-my-openagent config; preserving it: {config_path}")
        return 0
    print(f"disabled Claude Lore plugin import in oh-my-openagent: {config_path}")
    return 0


def valid_record(record: Any, allowed: set[str]) -> tuple[Path, object | bool, set[str]]:
    if not isinstance(record, dict) or record.get("path") not in allowed:
        raise UnsafeConfig("invalid compatibility state path")
    previous = record.get("previous")
    if previous != STATE_ABSENT and not isinstance(previous, bool):
        raise UnsafeConfig("invalid compatibility state value")
    created_value = record.get("created", [])
    if not isinstance(created_value, list) or any(
        value not in {"claude_code", "plugins_override"} for value in created_value
    ):
        raise UnsafeConfig("invalid compatibility state creation flags")
    return Path(record["path"]), MISSING if previous == STATE_ABSENT else previous, set(created_value)


def uninstall(home: Path, lore_home: Path) -> int:
    state_path = lore_home / "opencode-compat.json"
    if not state_path.exists():
        return 0
    try:
        state = load_state(state_path)
    except UnsafeConfig:
        print(f"WARNING: could not safely parse Lore OpenCode compatibility state; preserving it: {state_path}")
        return 0
    allowed = {str(path) for path in allowed_paths(home)}
    remaining: list[dict[str, Any]] = []
    for record in state["records"]:
        try:
            config_path, previous, created = valid_record(record, allowed)
            if not config_path.exists():
                continue
            text = require_safe_regular_file(config_path)
            is_jsonc = config_path.suffix == ".jsonc"
            data = parse_document(text, is_jsonc)
            current, _, _ = validate_compat_shape(data)
            if current is not False:
                print(f"oh-my-openagent setting changed by the user; preserving it: {config_path}")
                continue
            updated = restore_jsonc(text, previous, created) if is_jsonc else restore_json(text, previous, created)
            atomic_write(config_path, updated, stat.S_IMODE(config_path.stat().st_mode))
            print(f"restored oh-my-openagent Claude Lore plugin import setting: {config_path}")
        except ValueError as error:
            if str(error) == "user_changed":
                print(f"oh-my-openagent setting changed by the user; preserving it: {record.get('path', '')}")
                continue
            remaining.append(record)
        except UnsafeConfig:
            remaining.append(record)
            print(
                "WARNING: could not safely parse oh-my-openagent config; preserving it: "
                f"{record.get('path', '')}"
            )
    state["records"] = remaining
    save_state(state_path, state)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("install", "uninstall"))
    parser.add_argument("--home", required=True)
    parser.add_argument("--lore-home", required=True)
    args = parser.parse_args()
    home = Path(args.home).expanduser().absolute()
    lore_home = Path(args.lore_home).expanduser().absolute()
    return install(home, lore_home) if args.mode == "install" else uninstall(home, lore_home)


if __name__ == "__main__":
    sys.exit(main())
