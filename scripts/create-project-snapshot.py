#!/usr/bin/env python3
"""Create and validate a complete local ME5412 project snapshot.

The archive is intentionally independent of Git and the large model backup.
It is safe to rerun: the output directory and archive are excluded while
walking the workspace, and no source files are changed or removed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / ".project-backup-release"
ARCHIVE = OUT_DIR / "ME5412-project-snapshot.zip"
MANIFEST = OUT_DIR / "ME5412-project-snapshot.manifest.json"

# Names that are credentials or commonly contain credentials.  The scan also
# records likely secret lines in ordinary text without copying those files.
SECRET_NAME = re.compile(
    r"(^|\.)(env|env\..*)$|(^|[-_.])(token|tokens|secret|secrets|credential|credentials|auth|oauth|passwd|password|private[-_.]?key)([-_.]|$)",
    re.I,
)
TEXT_EXT = {
    ".bat", ".cmd", ".conf", ".config", ".csv", ".env", ".ini", ".js",
    ".json", ".log", ".md", ".mjs", ".ps1", ".py", ".sh", ".sql", ".txt",
    ".toml", ".ts", ".tsx", ".yaml", ".yml", ".xml",
}
SECRET_LINE = re.compile(
    r"(?i)(api[_-]?key|access[_-]?key|secret[_-]?key|auth(?:orization)?|bearer|password|passwd|private[_-]?key|client[_-]?secret|refresh[_-]?token|token)\s*[:=]\s*(['\"]?)[A-Za-z0-9_./+:-]{12,}\2"
)
FALSE_POSITIVE = re.compile(r"(?i)\b(tokenizer|tokenizers|tokenization|token\s+budget|token\s+count)\b")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def excluded(path: Path) -> str | None:
    r = rel(path)
    parts = Path(r).parts
    if parts and parts[0] == ".git":
        return ".git metadata"
    if parts and parts[0] in {".model-backup-release", ".project-backup-release"}:
        return parts[0]
    if SECRET_NAME.search(path.name):
        return "credential-like filename"
    return None


def walk_files() -> tuple[list[Path], list[dict[str, str]]]:
    files: list[Path] = []
    omissions: list[dict[str, str]] = []
    for base, dirs, names in os.walk(ROOT, topdown=True, followlinks=False):
        base_path = Path(base)
        kept_dirs = []
        for name in dirs:
            p = base_path / name
            reason = excluded(p)
            if reason:
                omissions.append({"path": rel(p), "reason": reason})
                continue
            if p.is_symlink():
                target = p.resolve()
                if ROOT not in target.parents and target != ROOT:
                    raise RuntimeError(f"symlink outside workspace refused: {rel(p)} -> {target}")
            kept_dirs.append(name)
        dirs[:] = kept_dirs
        for name in names:
            p = base_path / name
            reason = excluded(p)
            if reason:
                omissions.append({"path": rel(p), "reason": reason})
                continue
            if p.is_symlink():
                target = p.resolve()
                if ROOT not in target.parents and target != ROOT:
                    raise RuntimeError(f"symlink outside workspace refused: {rel(p)} -> {target}")
                # Preserve in-workspace symlinks as a small link record rather
                # than following them into a duplicate or recursive tree.
                omissions.append({"path": rel(p), "reason": "in-workspace symlink not archived as file"})
                continue
            if p.is_file():
                files.append(p)
    return sorted(files, key=lambda p: rel(p).casefold()), sorted(omissions, key=lambda x: x["path"].casefold())


def scan_credentials(files: list[Path], omissions: list[dict[str, str]]) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    for item in omissions:
        if item["reason"] == "credential-like filename":
            findings.append({"path": item["path"], "kind": "excluded filename"})
    for p in files:
        if p.suffix.lower() not in TEXT_EXT or p.stat().st_size > 8 * 1024 * 1024:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if FALSE_POSITIVE.search(line) and not SECRET_LINE.search(line):
                continue
            if SECRET_LINE.search(line):
                findings.append({"path": rel(p), "line": number, "kind": "likely secret syntax"})
    # Deduplicate path/line/kind while keeping no secret values.
    unique = {(f["path"], f.get("line"), f["kind"]): f for f in findings}
    return sorted(unique.values(), key=lambda f: (str(f["path"]).casefold(), int(f.get("line", 0))))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def create(files: list[Path]) -> tuple[int, int]:
    OUT_DIR.mkdir(exist_ok=True)
    tmp = ARCHIVE.with_suffix(".zip.tmp")
    if tmp.exists():
        tmp.unlink()
    total = 0
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zf:
        for p in files:
            arc = rel(p)
            info = zipfile.ZipInfo.from_file(p, arcname=arc)
            info.compress_type = zipfile.ZIP_DEFLATED
            with p.open("rb") as fh, zf.open(info, "w", force_zip64=True) as out:
                for chunk in iter(lambda: fh.read(8 * 1024 * 1024), b""):
                    out.write(chunk)
                    total += len(chunk)
    os.replace(tmp, ARCHIVE)
    return len(files), total


def validate(expected: list[Path]) -> dict[str, object]:
    expected_names = [rel(p) for p in expected]
    with zipfile.ZipFile(ARCHIVE, "r") as zf:
        names = zf.namelist()
        if names != expected_names:
            missing = sorted(set(expected_names) - set(names))
            extra = sorted(set(names) - set(expected_names))
            raise RuntimeError(f"archive entry mismatch; missing={missing[:5]} extra={extra[:5]}")
        bad = zf.testzip()
        if bad is not None:
            raise RuntimeError(f"CRC validation failed: {bad}")
        archive_bytes = ARCHIVE.stat().st_size
        uncompressed_bytes = sum(i.file_size for i in zf.infolist())
    return {
        "archive_sha256": sha256(ARCHIVE),
        "archive_bytes": archive_bytes,
        "uncompressed_bytes": uncompressed_bytes,
        "file_count": len(expected_names),
        "zip_entries_verified": len(expected_names),
        "crc_test": "passed",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args()
    if args.root.resolve() != ROOT:
        raise SystemExit("custom roots are not supported; run from the ME5412 workspace")
    files, omissions = walk_files()
    findings = scan_credentials(files, omissions)
    file_count, source_bytes = create(files)
    validation = validate(files)
    manifest = {
        "format": "ME5412 project snapshot release asset",
        "workspace_root": str(ROOT),
        "archive": str(ARCHIVE),
        "source_file_count": file_count,
        "source_bytes": source_bytes,
        "exclusions": omissions,
        "credential_scan": {
            "policy": "likely credential paths/line numbers only; values never recorded",
            "findings": findings,
        },
        "validation": validation,
        "restore_guide": [
            "Extract the ZIP into the intended ME5412 workspace root, preserving relative paths.",
            "The archive intentionally excludes .git, .model-backup-release, .project-backup-release, and credential-like files.",
            "Do not extract over a live workspace without reviewing the exclusions and conflicts first.",
            "Model weights are restored separately from .model-backup-release using the model restoration guide.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"archive": str(ARCHIVE), "manifest": str(MANIFEST), **validation, "omissions": len(omissions), "credential_findings": len(findings)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"snapshot failed: {exc}", file=sys.stderr)
        raise
