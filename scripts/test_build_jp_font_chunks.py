import importlib.util
import pathlib
import tempfile
import unittest

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.psCharStrings import T2CharString
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._g_l_y_f import Glyph

SCRIPT_PATH = pathlib.Path(__file__).resolve().parent / "build-jp-font-chunks.py"
SPEC = importlib.util.spec_from_file_location("build_jp_font_chunks", SCRIPT_PATH)
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def _create_dummy_cff_woff2(path: pathlib.Path) -> None:
    fb = FontBuilder(1000, isTTF=False)
    fb.setupGlyphOrder([".notdef", "A"])
    fb.setupCharacterMap({0x41: "A"})
    pen_nd = T2CharStringPen(500, None)
    cs_nd = pen_nd.getCharString()
    pen_a = T2CharStringPen(550, None)
    cs_a = pen_a.getCharString()
    assert isinstance(cs_nd, T2CharString)
    assert isinstance(cs_a, T2CharString)
    fb.setupCFF("TestCFF", {}, {".notdef": cs_nd, "A": cs_a}, {})
    fb.setupHorizontalMetrics({".notdef": (500, 0), "A": (550, 20)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "TestCFF", "styleName": "Regular"})
    fb.setupOS2()
    fb.setupPost()
    font = fb.font
    font.flavor = "woff2"
    font.save(str(path))
    font.close()


def _triangle_glyph() -> Glyph:
    pen = TTGlyphPen(None)
    pen.moveTo((0, 0))
    pen.lineTo((100, 0))
    pen.lineTo((50, 100))
    pen.closePath()
    return pen.glyph()


class BuildJpFontChunksTests(unittest.TestCase):
    def test_serialize_unicode_range_merges_contiguous_runs(self) -> None:
        self.assertEqual(mod.serialize_unicode_range([0x41, 0x42, 0x43, 0x45]), "U+41-43,U+45")
        self.assertEqual(mod.serialize_unicode_range([]), "")

    def test_scale_mono_x_dir_rejects_cff_font_without_glyf_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            src_dir = root / "src"
            out_dir = root / "out"
            src_dir.mkdir()
            _create_dummy_cff_woff2(src_dir / "test.woff2")
            rc = mod.scale_mono_x_dir(
                src_dir=src_dir,
                out_dir=out_dir,
                prefix="TestCFF500",
                orig_adv=550,
                target_adv=500,
                rename_family="Test CFF",
                source_label="Test Font",
            )
            self.assertEqual(rc, 1)

    def test_extract_woff2_range_writes_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            fb = FontBuilder(1000, isTTF=True)
            fb.setupGlyphOrder([".notdef", "A", "B"])
            fb.setupCharacterMap({0x41: "A", 0x42: "B"})
            fb.setupGlyf({".notdef": Glyph(), "A": _triangle_glyph(), "B": _triangle_glyph()})
            fb.setupHorizontalMetrics({".notdef": (500, 0), "A": (500, 0), "B": (500, 0)})
            fb.setupHorizontalHeader(ascent=800, descent=-200)
            fb.setupNameTable({"familyName": "TestTTF", "styleName": "Regular"})
            fb.setupOS2()
            fb.setupPost()
            fb.setupMaxp()
            font_path = root / "sample.woff2"
            out_json = root / "manifest.json"
            fb.font.flavor = "woff2"
            fb.font.save(str(font_path))
            fb.font.close()

            rc = mod.extract_woff2_range(font_path, "fonts/Test/sample.woff2", out_json)
            self.assertEqual(rc, 0)
            payload = out_json.read_text(encoding="utf-8")
            self.assertIn("U+41-42", payload)
            self.assertIn("fonts/Test/sample.woff2", payload)


if __name__ == "__main__":
    unittest.main()
