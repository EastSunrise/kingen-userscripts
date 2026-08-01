#!/usr/bin/env python3
"""Register potplayer:// and bridge browser video items to PotPlayer."""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import winreg


PROTOCOL = "potplayer"
REGISTRY_PATH = rf"Software\Classes\{PROTOCOL}"
ALLOWED_MEDIA_SCHEMES = {"file", "http", "https", "rtmp", "rtsp"}
TEMP_PLAYLIST_DIR = Path(tempfile.gettempdir()) / "kingen-potplayer"
LOG_PATH = TEMP_PLAYLIST_DIR / "protocol.log"
INSTALL_DIR = Path(os.environ["LOCALAPPDATA"]) / "Kingen" / "PotPlayer"
INSTALLED_BRIDGE_PATH = INSTALL_DIR / "potplayer_protocol.py"
_log_stream = None


def log_event(message: str) -> None:
    TEMP_PLAYLIST_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().isoformat(timespec="seconds")
    with LOG_PATH.open("a", encoding="utf-8") as log_file:
        log_file.write(f"[{timestamp}] {message}\n")


def locate_potplayer(explicit_path: str | None) -> Path:
    if explicit_path:
        candidate = Path(explicit_path).expanduser().resolve()
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"PotPlayer executable does not exist: {candidate}")

    candidates = (
        Path(r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
        Path(r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe"),
        Path(r"C:\Program Files\PotPlayer\PotPlayerMini64.exe"),
        Path(r"C:\Program Files\PotPlayer\PotPlayerMini.exe"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    joined = "\n".join(str(candidate) for candidate in candidates)
    raise FileNotFoundError(f"PotPlayer executable was not found. Checked:\n{joined}")


def install_bridge_script() -> Path:
    source_path = Path(__file__).resolve()
    if source_path == INSTALLED_BRIDGE_PATH:
        return source_path

    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, INSTALLED_BRIDGE_PATH)
    return INSTALLED_BRIDGE_PATH


def command_prefix(potplayer_path: Path, bridge_path: Path) -> list[str]:
    if getattr(sys, "frozen", False):
        return [str(Path(sys.executable).resolve()), "playlist", "--potplayer", str(potplayer_path)]
    python_path = Path(sys.executable).resolve()
    pythonw_path = python_path.with_name("pythonw.exe")
    interpreter = pythonw_path if pythonw_path.is_file() else python_path
    return [
        str(interpreter),
        str(bridge_path),
        "playlist",
        "--potplayer",
        str(potplayer_path),
    ]


def build_registry_command(potplayer_path: Path, bridge_path: Path) -> str:
    # Keep %1 quoted so URLs containing &, spaces, or query strings remain one argument.
    return f'{subprocess.list2cmdline(command_prefix(potplayer_path, bridge_path))} "%1"'


def register_protocol(potplayer_path: Path) -> None:
    bridge_path = install_bridge_script()
    command = build_registry_command(potplayer_path, bridge_path)
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, REGISTRY_PATH) as protocol_key:
        winreg.SetValueEx(protocol_key, None, 0, winreg.REG_SZ, "URL:PotPlayer Protocol")
        winreg.SetValueEx(protocol_key, "URL Protocol", 0, winreg.REG_SZ, "")

    command_path = rf"{REGISTRY_PATH}\shell\open\command"
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, command_path) as command_key:
        winreg.SetValueEx(command_key, None, 0, winreg.REG_SZ, command)

    print(f"Installed protocol bridge: {bridge_path}")
    print(f"Registered {PROTOCOL}:// for {potplayer_path}")
    print(f"Command: {command}")
    log_event(
        f"Installed protocol bridge: {bridge_path}; registered {PROTOCOL}:// for "
        f"{potplayer_path}; command={command}"
    )


def delete_registry_tree(root, path: str) -> None:
    try:
        with winreg.OpenKey(root, path, 0, winreg.KEY_READ | winreg.KEY_WRITE) as key:
            while True:
                try:
                    child = winreg.EnumKey(key, 0)
                except OSError:
                    break
                delete_registry_tree(root, rf"{path}\{child}")
        winreg.DeleteKey(root, path)
    except FileNotFoundError:
        return


def unregister_protocol() -> None:
    delete_registry_tree(winreg.HKEY_CURRENT_USER, REGISTRY_PATH)
    print(f"Unregistered {PROTOCOL}://")
    log_event(f"Unregistered {PROTOCOL}://")


def validate_target(value: str, name: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in ALLOWED_MEDIA_SCHEMES:
        allowed = ", ".join(sorted(ALLOWED_MEDIA_SCHEMES))
        raise ValueError(f"{name} must use one of: {allowed}; got {parsed.scheme or 'no scheme'}")
    return value


def decode_base64url(value: str) -> bytes:
    if not value:
        raise ValueError("The encoded payload is empty")
    padding = "=" * (-len(value) % 4)
    try:
        return base64.b64decode(value + padding, altchars=b"-_", validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise ValueError("The encoded payload is not valid base64url") from error


def encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def normalize_item(raw_item: object) -> dict[str, object]:
    if not isinstance(raw_item, dict):
        raise ValueError("Each playlist item must be an object")
    removed_item_field = "sub" + "titles"
    if removed_item_field in raw_item:
        raise ValueError("A removed playlist item field is not supported")
    raw_video = raw_item.get("video")
    if not isinstance(raw_video, str) or not raw_video.strip():
        raise ValueError("Each playlist item must contain a video URL")

    title = str(raw_item.get("title") or "Web video").replace("\r", " ").replace("\n", " ").strip()
    item: dict[str, object] = {
        "video": validate_target(raw_video.strip(), "video"),
        "title": title or "Web video",
    }
    return item


def parse_playlist_request(raw_url: str) -> tuple[str, list[dict[str, object]], int]:
    raw_url = raw_url.strip()
    if len(raw_url) >= 2 and raw_url[0] == raw_url[-1] == '"':
        raw_url = raw_url[1:-1]

    parsed = urlsplit(raw_url)
    if parsed.scheme.lower() != PROTOCOL or parsed.netloc.lower() != "playlist":
        raise ValueError(f"Expected {PROTOCOL}://playlist?... URL, got: {raw_url}")

    values = parse_qs(parsed.query, keep_blank_values=False).get("items", [])
    if not values or not values[0]:
        raise ValueError("The playlist URL does not contain an items parameter")

    try:
        payload = json.loads(decode_base64url(values[0]).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("The playlist payload is not valid UTF-8 JSON") from error

    if not isinstance(payload, dict):
        raise ValueError("The playlist payload must be an object")

    playlist_title = str(payload.get("playlistTitle") or "PotPlayer").strip() or "PotPlayer"
    raw_start = payload.get("startIndex", 0)
    try:
        requested_start = int(raw_start)
    except (TypeError, ValueError):
        requested_start = 0
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("The playlist payload must contain an items array")

    items: list[dict[str, object]] = []
    errors: list[str] = []
    start_index = 0
    for index, raw_item in enumerate(raw_items):
        try:
            normalized = normalize_item(raw_item)
            if index == requested_start:
                start_index = len(items)
            items.append(normalized)
        except ValueError as error:
            errors.append(f"item {index + 1}: {error}")

    if not items:
        detail = "; ".join(errors) if errors else "no items"
        raise ValueError(f"The playlist contains no valid videos ({detail})")
    if errors:
        print(f"Skipped invalid playlist items: {'; '.join(errors)}", file=sys.stderr)
    return playlist_title, items, start_index


def build_dpl_text(items: list[dict[str, object]], start_index: int = 0) -> str:
    if not items:
        raise ValueError("Cannot create a PotPlayer playlist without videos")
    start_index = max(0, min(int(start_index), len(items) - 1))
    lines = [
        "DAUMPLAYLIST",
        f"playname={items[start_index]['video']}",
        f"topindex={start_index}",
        "saveplaypos=0",
    ]
    for index, item in enumerate(items, start=1):
        lines.append(f"{index}*file*{item['video']}")
        lines.append(f"{index}*title*{item['title']}")
    return "\n".join(lines) + "\n"


def sanitize_filename(value: str) -> str:
    invalid_characters = set('<>:"/\\|?*')
    sanitized = "".join("_" if character in invalid_characters or ord(character) < 32 else character for character in value)
    sanitized = sanitized.strip(" .")
    return sanitized[:120] or "PotPlayer"


def write_temp_playlist(
    items: list[dict[str, object]],
    start_index: int = 0,
    playlist_title: str = "PotPlayer",
) -> Path:
    TEMP_PLAYLIST_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{sanitize_filename(playlist_title)}-{uuid.uuid4().hex}.dpl"
    playlist_path = TEMP_PLAYLIST_DIR / filename
    playlist_path.write_text(build_dpl_text(items, start_index), encoding="utf-8-sig", newline="\n")
    return playlist_path


def open_playlist_url(raw_url: str, potplayer_path: Path) -> None:
    raw_url = raw_url.strip().strip('"')
    parsed = urlsplit(raw_url)
    if parsed.scheme.lower() != PROTOCOL or parsed.netloc.lower() != "playlist":
        raise ValueError(f"Only {PROTOCOL}://playlist URLs are supported")

    playlist_title, items, start_index = parse_playlist_request(raw_url)
    playlist_path = write_temp_playlist(items, start_index, playlist_title)
    args = [str(potplayer_path), "/current", str(playlist_path)]

    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(
        args,
        cwd=str(potplayer_path.parent),
        close_fds=True,
        creationflags=creation_flags,
    )
    print(
        f"Opened {len(items)} item(s) in one PotPlayer instance "
        f"from index {start_index}: {playlist_path}"
    )
    log_event(
        f"Opened playlist; items={len(items)}; start_index={start_index}; "
        f"title={playlist_title}; playlist={playlist_path}"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)

    register_parser = subparsers.add_parser("register", help="register the potplayer:// protocol")
    register_parser.add_argument("--potplayer", help="path to PotPlayerMini64.exe")

    subparsers.add_parser("unregister", help="remove the potplayer:// protocol")

    playlist_parser = subparsers.add_parser("playlist", help="open a potplayer://playlist URL")
    playlist_parser.add_argument("--potplayer", help="path to PotPlayerMini64.exe")
    playlist_parser.add_argument("protocol_url", help="encoded potplayer:// URL")

    return parser


def configure_output() -> None:
    """Give pythonw a persistent output stream so failures do not disappear."""
    global _log_stream
    if sys.stdout is not None and sys.stderr is not None:
        return
    TEMP_PLAYLIST_DIR.mkdir(parents=True, exist_ok=True)
    _log_stream = LOG_PATH.open("a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = _log_stream
    if sys.stderr is None:
        sys.stderr = _log_stream


def main() -> int:
    configure_output()
    args = build_parser().parse_args()
    try:
        if args.action == "register":
            register_protocol(locate_potplayer(args.potplayer))
        elif args.action == "unregister":
            unregister_protocol()
        elif args.action == "playlist":
            open_playlist_url(args.protocol_url, locate_potplayer(args.potplayer))
        else:
            raise ValueError(f"Unknown action: {args.action}")
    except (FileNotFoundError, OSError, ValueError) as error:
        print(f"PotPlayer protocol error: {error}", file=sys.stderr)
        log_event(f"ERROR: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
