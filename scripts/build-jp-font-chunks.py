#!/usr/bin/env python3
"""
Generate pre-split WOFF2 font chunks from a TTF/OTF source font for SakuttoDraw,
or extract a compact CSS unicode-range manifest from an existing WOFF2 font.

Usage:
  python3 scripts/build-jp-font-chunks.py --input /path/to/Font.ttf --prefix MPlusRounded --output-dir assets/fonts/MPlusRounded --include-latin
  python3 scripts/build-jp-font-chunks.py --extract-range /path/to/CascadiaMono-Regular.woff2 --file-ref fonts/CascadiaMono/CascadiaMono-Regular.woff2 --output-manifest assets/fonts/CascadiaMono/manifest.json
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

WHITESPACE_KEEP_CPS = {0x0020, 0x00A0, 0x3000}


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


def build_latin_and_symbols(available_cps: set[int]) -> list[int]:
    """Basic Latin, Latin-1, Latin-Ext, general punctuation, arrows, and math symbols."""
    ranges = [
        (0x0020, 0x007E),  # Basic Latin
        (0x00A0, 0x00FF),  # Latin-1 Supplement
        (0x0100, 0x024F),  # Latin Extended-A/B
        (0x02C6, 0x02DC),  # Spacing Modifier Letters
        (0x2000, 0x206F),  # General Punctuation
        (0x20A0, 0x20CF),  # Currency Symbols
        (0x2100, 0x214F),  # Letterlike Symbols
        (0x2190, 0x21FF),  # Arrows
        (0x2200, 0x22FF),  # Mathematical Operators
    ]
    cps: list[int] = []
    for start, end in ranges:
        for cp in range(start, end + 1):
            if cp in available_cps:
                cps.append(cp)
    return cps


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
    """Return codepoints mapped to non-empty glyphs (plus required whitespace codepoints)."""
    cmap = font.getBestCmap() or {}
    if "glyf" in font:
        glyf = font["glyf"]
        valid: set[int] = set()
        for cp, glyph_name in cmap.items():
            if cp in WHITESPACE_KEEP_CPS:
                valid.add(cp)
                continue
            glyph = glyf[glyph_name]
            if glyph.numberOfContours != 0:
                valid.add(cp)
        return valid
    return set(cmap.keys())


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


def extract_woff2_range(
    woff2_path: pathlib.Path,
    file_ref: str,
    output_manifest: pathlib.Path | None,
) -> int:
    resolved = woff2_path.resolve()
    if not resolved.is_file():
        print(f"ERROR: WOFF2 font not found: {resolved}", file=sys.stderr)
        return 1
    font = TTFont(str(resolved))
    valid_cps = inspect_valid_codepoints(font)
    font.close()

    payload = {
        "file": file_ref or resolved.name,
        "unicodeRange": serialize_unicode_range(valid_cps),
        "bytes": resolved.stat().st_size,
        "glyphCount": len(valid_cps),
    }
    if output_manifest is not None:
        output_manifest.parent.mkdir(parents=True, exist_ok=True)
        output_manifest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps(payload, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build pre-split WOFF2 font chunks")
    parser.add_argument("--input", help="Path to source TTF/OTF font")
    parser.add_argument(
        "--prefix",
        default="SetoJP",
        help="Output filename and public/fonts/<prefix> directory prefix",
    )
    parser.add_argument(
        "--source-label",
        default="",
        help="Human-readable source & license description for manifest.json",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Destination directory for WOFF2 chunks and manifest.json",
    )
    parser.add_argument(
        "--include-latin",
        action="store_true",
        help="Include a 00-latin chunk for full-replacement fonts (e.g. M PLUS Rounded 1c)",
    )
    parser.add_argument(
        "--strict-jis-count",
        action="store_true",
        help="Require exact JIS X 0208 L1=2965 and L2=3390 counts",
    )
    parser.add_argument("--kanji-per-chunk", type=int, default=140, help="Kanji count per WOFF2 chunk")
    parser.add_argument("--extract-range", help="Inspect an existing WOFF2 and output its unicodeRange manifest")
    parser.add_argument("--file-ref", default="", help="Relative file path for --extract-range manifest")
    parser.add_argument("--output-manifest", default="", help="Output JSON path for --extract-range")
    args = parser.parse_args()

    if args.extract_range:
        return extract_woff2_range(
            pathlib.Path(args.extract_range),
            args.file_ref,
            pathlib.Path(args.output_manifest).resolve() if args.output_manifest else None,
        )

    if not args.input:
        print("ERROR: --input is required unless --extract-range is used", file=sys.stderr)
        return 1

    prefix = args.prefix.strip() or "SetoJP"
    src_path = pathlib.Path(args.input).resolve()
    out_dir = (
        pathlib.Path(args.output_dir).resolve()
        if args.output_dir
        else (pathlib.Path(__file__).resolve().parent.parent / "assets" / "fonts" / prefix).resolve()
    )
    if not src_path.is_file():
        print(f"ERROR: Source font not found: {src_path}", file=sys.stderr)
        return 1

    probe = TTFont(str(src_path))
    upm = probe["head"].unitsPerEm
    asc = probe["hhea"].ascender
    desc = probe["hhea"].descender
    valid_cps = inspect_valid_codepoints(probe)
    probe.close()

    for cp, ch in REQUIRED_VERIFY_CODEPOINTS.items():
        if cp not in valid_cps:
            print(f"ERROR: Required glyph {ch} (U+{cp:04X}) missing or empty in source font", file=sys.stderr)
            return 1

    latin_cps = build_latin_and_symbols(valid_cps) if args.include_latin else []
    latin_set = set(latin_cps)

    core_cps = [cp for cp in build_core_kana_and_symbols(valid_cps) if cp not in latin_set]
    core_set = set(core_cps)

    level1_raw, level2_raw = build_jis_x_0208_kanji_tiers()
    level1_cps = [cp for cp in level1_raw if cp in valid_cps and cp not in latin_set and cp not in core_set]
    level1_set = set(level1_cps)
    level2_cps = [
        cp
        for cp in level2_raw
        if cp in valid_cps and cp not in latin_set and cp not in core_set and cp not in level1_set
    ]

    if args.strict_jis_count and (len(level1_cps) != 2965 or len(level2_cps) != 3390):
        print(
            f"ERROR: Unexpected JIS X 0208 kanji count (L1={len(level1_cps)}, L2={len(level2_cps)})",
            file=sys.stderr,
        )
        return 1

    if len(level1_cps) < 2500:
        print(f"ERROR: Too few JIS Level-1 kanji in source font (L1={len(level1_cps)})", file=sys.stderr)
        return 1

    # Build strictly disjoint chunk groups
    chunk_groups: list[tuple[str, list[int]]] = []
    if latin_cps:
        chunk_groups.append(("latin", latin_cps))
    chunk_groups.append(("kana", core_cps))
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
        filename = f"{prefix}-{idx:02d}-{tag}-{digest}.woff2"
        (out_dir / filename).write_bytes(woff2_bytes)
        unicode_range = serialize_unicode_range(grp)
        size = len(woff2_bytes)
        total_bytes += size
        manifest_chunks.append(
            {
                "file": f"fonts/{prefix}/{filename}",
                "unicodeRange": unicode_range,
                "bytes": size,
                "glyphCount": len(grp),
            }
        )

    manifest = {
        "source": args.source_label or f"{prefix} (SIL OFL 1.1)",
        "metrics": {"unitsPerEm": upm, "ascender": asc, "descender": desc},
        "totalBytes": total_bytes,
        "totalGlyphs": len(all_assigned),
        "chunks": manifest_chunks,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(
        f"[build-jp-font-chunks] Generated {len(manifest_chunks)} {prefix} chunks "
        f"({len(all_assigned)} chars, L1={len(level1_cps)}, L2={len(level2_cps)}, {total_bytes / (1024 * 1024):.2f} MB) in {out_dir}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
