#!/usr/bin/env python3
"""
Generate pre-split Japanese WOFF2 font chunks from KosefontP-JP.ttf (SIL OFL 1.1,
derived from SetoFont v6.20 by Nozomi Seto / LXGW) for SakuttoDraw.

Usage:
  python3 scripts/build-jp-font-chunks.py --input /path/to/KosefontP-JP.ttf

Outputs:
  assets/fonts/SetoJP/SetoJP-<idx>-<hash8>.woff2
  assets/fonts/SetoJP/manifest.json
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import pathlib
import sys
from typing import Iterable

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

REQUIRED_VERIFY_CODEPOINTS = {
    0x7F6E: "置",
    0x76F4: "直",
    0x771F: "真",
    0x6D77: "海",
    0x9AA8: "骨",
    0x6B21: "次",
    0x5316: "化",
    0x4EE4: "令",
    0x3001: "、",
    0x3002: "。",
    0x3042: "あ",
    0x30A2: "ア",
}


def build_jis_x_0208_kanji_tiers() -> tuple[list[int], list[int]]:
    """Return (level1_kanji, level2_kanji) codepoints from JIS X 0208 (EUC-JP)."""
    level1: list[int] = []
    level2: list[int] = []
    seen: set[int] = set()
    # JIS X 0208: ku 16..47 = Level 1 Kanji (2,965), ku 48..84 = Level 2 Kanji (3,390)
    for ku in range(16, 85):
        for ten in range(1, 95):
            try:
                ch = bytes([ku + 0xA0, ten + 0xA0]).decode("euc-jp")
            except UnicodeDecodeError:
                continue
            if len(ch) != 1:
                continue
            cp = ord(ch)
            if cp in seen:
                continue
            seen.add(cp)
            if ku <= 47:
                level1.append(cp)
            else:
                level2.append(cp)
    return level1, level2


def build_core_kana_and_symbols(available_cps: set[int]) -> list[int]:
    """Kana, Japanese punctuation, and fullwidth/halfwidth Japanese symbols."""
    ranges = [
        (0x3000, 0x303F),  # CJK Symbols and Punctuation (includes U+3000, 、, 。, 「」, 々)
        (0x3040, 0x309F),  # Hiragana
        (0x30A0, 0x30FF),  # Katakana
        (0xFF01, 0xFF60),  # Fullwidth ASCII variants / Japanese fullwidth punctuation
        (0xFF61, 0xFF9F),  # Halfwidth Katakana & punctuation
        (0xFFE0, 0xFFE6),  # Fullwidth currency / symbols
    ]
    cps: list[int] = []
    for start, end in ranges:
        for cp in range(start, end + 1):
            if cp in available_cps:
                cps.append(cp)
    return cps


def serialize_unicode_range(codepoints: Iterable[int]) -> str:
    """Serialize sorted codepoints into compact CSS unicode-range syntax."""
    sorted_cps = sorted(set(codepoints))
    if not sorted_cps:
        return ""
    tokens: list[str] = []
    run_start = sorted_cps[0]
    run_end = sorted_cps[0]
    for cp in sorted_cps[1:]:
        if cp == run_end + 1:
            run_end = cp
        else:
            if run_start == run_end:
                tokens.append(f"U+{run_start:x}")
            else:
                tokens.append(f"U+{run_start:x}-{run_end:x}")
            run_start = cp
            run_end = cp
    if run_start == run_end:
        tokens.append(f"U+{run_start:x}")
    else:
        tokens.append(f"U+{run_start:x}-{run_end:x}")
    return ",".join(tokens)


def chunk_list(items: list[int], size: int) -> list[list[int]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def inspect_valid_codepoints(font: TTFont) -> set[int]:
    """Return codepoints mapped to non-empty glyphs (plus whitespace U+3000)."""
    cmap = font.getBestCmap() or {}
    glyf = font["glyf"]
    valid: set[int] = set()
    for cp, glyph_name in cmap.items():
        if cp == 0x3000:
            valid.add(cp)
            continue
        glyph = glyf[glyph_name]
        if glyph.numberOfContours != 0:
            valid.add(cp)
    return valid


def subset_to_woff2_bytes(src_path: pathlib.Path, codepoints: list[int]) -> bytes:
    font = TTFont(str(src_path), recalcBBoxes=False, recalcTimestamp=False)
    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "ccmp", "locl", "mark", "mkmk"]
    # Keep copyright, family, version, and SIL OFL 1.1 license strings in every chunk
    options.name_IDs = [0, 1, 2, 4, 5, 6, 13, 14]
    options.name_legacy = False
    options.notdef_outline = True
    options.recalc_bounds = False
    options.recalc_timestamp = False
    options.drop_tables += ["DSIG"]

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)

    buf = io.BytesIO()
    font.save(buf)
    font.close()
    return buf.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build pre-split SetoJP WOFF2 font chunks")
    parser.add_argument("--input", required=True, help="Path to KosefontP-JP.ttf")
    parser.add_argument(
        "--output-dir",
        default=str(pathlib.Path(__file__).resolve().parent.parent / "assets" / "fonts" / "SetoJP"),
        help="Destination directory for WOFF2 chunks and manifest.json",
    )
    parser.add_argument("--kanji-per-chunk", type=int, default=140, help="Kanji count per WOFF2 chunk")
    args = parser.parse_args()

    src_path = pathlib.Path(args.input).resolve()
    out_dir = pathlib.Path(args.output_dir).resolve()
    if not src_path.is_file():
        print(f"ERROR: Source font not found: {src_path}", file=sys.stderr)
        return 1

    # Verify source font metrics & required Japanese glyphs before slicing
    probe = TTFont(str(src_path))
    upm = probe["head"].unitsPerEm
    asc = probe["hhea"].ascender
    desc = probe["hhea"].descender
    if upm != 1000:
        print(f"ERROR: Expected unitsPerEm=1000 to match Excalidraw Xiaolai metadata, got {upm}", file=sys.stderr)
        return 1

    valid_cps = inspect_valid_codepoints(probe)
    probe.close()

    for cp, ch in REQUIRED_VERIFY_CODEPOINTS.items():
        if cp not in valid_cps:
            print(f"ERROR: Required glyph {ch} (U+{cp:04X}) missing or empty in source font", file=sys.stderr)
            return 1

    core_cps = build_core_kana_and_symbols(valid_cps)
    level1_raw, level2_raw = build_jis_x_0208_kanji_tiers()

    core_set = set(core_cps)
    level1_cps = [cp for cp in level1_raw if cp in valid_cps and cp not in core_set]
    level1_set = set(level1_cps)
    level2_cps = [cp for cp in level2_raw if cp in valid_cps and cp not in core_set and cp not in level1_set]

    if len(level1_cps) != 2965 or len(level2_cps) != 3390:
        print(
            f"ERROR: Unexpected JIS X 0208 kanji count (L1={len(level1_cps)}, L2={len(level2_cps)})",
            file=sys.stderr,
        )
        return 1

    # Build strictly disjoint chunk groups
    chunk_groups: list[tuple[str, list[int]]] = [("kana", core_cps)]
    for i, grp in enumerate(chunk_list(level1_cps, args.kanji_per_chunk)):
        chunk_groups.append((f"jis1-{i:02d}", grp))
    for i, grp in enumerate(chunk_list(level2_cps, args.kanji_per_chunk)):
        chunk_groups.append((f"jis2-{i:02d}", grp))

    # Assert strict disjointness
    all_assigned: set[int] = set()
    for tag, grp in chunk_groups:
        overlap = all_assigned.intersection(grp)
        if overlap:
            print(f"ERROR: Overlap detected in chunk {tag}: {overlap}", file=sys.stderr)
            return 1
        all_assigned.update(grp)

    for cp, ch in REQUIRED_VERIFY_CODEPOINTS.items():
        if cp not in all_assigned:
            print(f"ERROR: Required glyph {ch} (U+{cp:04X}) not assigned to any chunk", file=sys.stderr)
            return 1

    # Clean output directory
    out_dir.mkdir(parents=True, exist_ok=True)
    for old_file in out_dir.glob("*.woff2"):
        old_file.unlink()

    manifest_chunks = []
    total_bytes = 0

    for idx, (tag, grp) in enumerate(chunk_groups):
        woff2_bytes = subset_to_woff2_bytes(src_path, grp)
        digest = hashlib.sha256(woff2_bytes).hexdigest()[:8]
        filename = f"SetoJP-{idx:02d}-{tag}-{digest}.woff2"
        (out_dir / filename).write_bytes(woff2_bytes)
        unicode_range = serialize_unicode_range(grp)
        size = len(woff2_bytes)
        total_bytes += size
        manifest_chunks.append(
            {
                "file": f"fonts/SetoJP/{filename}",
                "unicodeRange": unicode_range,
                "bytes": size,
                "glyphCount": len(grp),
            }
        )

    manifest = {
        "source": "KosefontP-JP (derived from SetoFont v6.20, SIL OFL 1.1)",
        "metrics": {"unitsPerEm": upm, "ascender": asc, "descender": desc},
        "totalBytes": total_bytes,
        "totalGlyphs": len(all_assigned),
        "chunks": manifest_chunks,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(
        f"[build-jp-font-chunks] Generated {len(manifest_chunks)} chunks "
        f"({len(all_assigned)} chars, {total_bytes / (1024 * 1024):.2f} MB) in {out_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
