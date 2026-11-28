import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cjkFontManifest } from '../annotator/cjkFontManager';
import { jpFontManifest } from '../annotator/jpGlyphOverride';
import {
  CTX_HIDDEN_TESTIDS,
  EXCALIDRAW_CTX_TESTIDS,
  EXCALIDRAW_FONT_PICKER_TESTIDS,
  EXCALIDRAW_TESTIDS,
  TESTID_TO_TOOL_TYPE,
} from '../excalidraw/domContract';
import { ICON_DEFS } from '../ui/iconDefs';

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SRC_ROOT = path.resolve(__dirname, '..');

function walkFiles(dir: string, exts: RegExp, excludeDirs = new Set<string>()): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) continue;
      out.push(...walkFiles(path.join(dir, entry.name), exts, excludeDirs));
    } else if (entry.isFile() && exts.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

describe('upstream contracts & architecture invariants', () => {
  it('keeps CTX_HIDDEN_TESTIDS in 1-to-1 sync with excalidraw-overrides.css', () => {
    const css = fs.readFileSync(path.join(SRC_ROOT, 'styles', 'excalidraw-overrides.css'), 'utf8');
    const cssHidden = new Set<string>();
    for (const match of css.matchAll(/\.context-menu\s*>\s*li\[data-testid="([^"]+)"\]/g)) {
      cssHidden.add(match[1]);
    }
    expect(cssHidden).toEqual(CTX_HIDDEN_TESTIDS);
  });

  it('enforces one-way DAG inside quickAnnotator/ across all feature modules dynamically', () => {
    const qaDir = path.join(SRC_ROOT, 'annotator', 'quickAnnotator');
    const foundationFiles = new Set(['constants.ts', 'dom.ts', 'runtime.ts', 'actions.ts', 'index.ts']);
    const featureFiles = fs
      .readdirSync(qaDir)
      .filter((f) => f.endsWith('.ts') && !foundationFiles.has(f));
    expect(featureFiles.length).toBeGreaterThanOrEqual(9);

    const forbiddenTargets = new Set([
      './index',
      ...featureFiles.map((f) => `./${f.replace(/\.ts$/, '')}`),
    ]);

    for (const file of featureFiles) {
      const code = fs.readFileSync(path.join(qaDir, file), 'utf8');
      for (const m of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const spec = m[1];
        expect(forbiddenTargets.has(spec), `${file} must not import ${spec}`).toBe(false);
      }
    }
  });

  it('contains zero compatibility re-export barrels across non-test src/', () => {
    const srcFiles = walkFiles(SRC_ROOT, /\.(ts|tsx)$/, new Set(['__tests__', 'generated']));
    for (const filePath of srcFiles) {
      const code = fs.readFileSync(filePath, 'utf8');
      expect(
        /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]/m.test(code),
        `${path.relative(SRC_ROOT, filePath)} must not re-export from another module`,
      ).toBe(false);
    }
  });

  it('verifies EXCALIDRAW_TESTIDS, CTX_HIDDEN_TESTIDS, and font/ctx testids exist in installed Excalidraw prod bundle', () => {
    const prodDir = path.join(ROOT_DIR, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod');
    const bundleFiles = walkFiles(prodDir, /\.js$/);
    expect(bundleFiles.length).toBeGreaterThan(0);
    const bundleText = bundleFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

    for (const id of Object.values(EXCALIDRAW_TESTIDS)) {
      if (id.startsWith('toolbar-')) {
        const toolName = id.slice('toolbar-'.length);
        const found = bundleText.includes(id) || bundleText.includes(`"${toolName}"`) || bundleText.includes(`'${toolName}'`);
        expect(found, `Missing upstream toolbar testId candidate: ${id}`).toBe(true);
      } else {
        expect(bundleText.includes(id), `Missing upstream testId: ${id}`).toBe(true);
      }
    }

    for (const id of CTX_HIDDEN_TESTIDS) {
      expect(bundleText.includes(id), `Missing upstream hidden context-menu testId: ${id}`).toBe(true);
    }
    for (const id of Object.values(EXCALIDRAW_CTX_TESTIDS)) {
      expect(bundleText.includes(id), `Missing upstream ctx testId: ${id}`).toBe(true);
    }
    for (const id of [
      EXCALIDRAW_FONT_PICKER_TESTIDS.handDrawn,
      EXCALIDRAW_FONT_PICKER_TESTIDS.normal,
      EXCALIDRAW_FONT_PICKER_TESTIDS.code,
    ]) {
      expect(bundleText.includes(id), `Missing upstream font picker testId: ${id}`).toBe(true);
    }
  });

  it('maintains strict index.html CSP without unsafe-eval, wasm-unsafe-eval, or inline scripts', () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    expect(/http-equiv=["']Content-Security-Policy["']/i.test(html)).toBe(true);
    expect(/<meta\b[^>]*name=["']color-scheme["'][^>]*content=["']light\s+dark["']/i.test(html)).toBe(true);
    expect(/unsafe-eval|wasm-unsafe-eval/i.test(html)).toBe(false);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
      const attrs = m[1] ?? '';
      const body = (m[2] ?? '').trim();
      expect(/\bsrc\s*=/.test(attrs) || body.length === 0, 'Inline <script> is forbidden').toBe(true);
    }

    const baseCss = fs.readFileSync(path.join(SRC_ROOT, 'styles', 'base.css'), 'utf8');
    expect(baseCss).toContain('color-scheme: light dark;');
    expect(baseCss).toContain(':root[data-exq-theme="light"]');
    expect(baseCss).toContain(':root[data-exq-theme="dark"]');
  });

  it('keeps generated manifests, domContract tool map, vite config, and ICON_DEFS consistent', () => {
    expect(cjkFontManifest.sets.ja.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.jaStandard.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.jaPop.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.jaCode.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.ko.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.zh.files.length).toBeGreaterThan(0);
    expect(jpFontManifest.chunks.length).toBeGreaterThan(0);

    const knownTestIds = new Set<string>(Object.values(EXCALIDRAW_TESTIDS));
    for (const testId of Object.keys(TESTID_TO_TOOL_TYPE)) {
      expect(knownTestIds.has(testId), `Unknown testId in TESTID_TO_TOOL_TYPE: ${testId}`).toBe(true);
    }

    const nonIconDefsCode = walkFiles(SRC_ROOT, /\.(ts|tsx)$/, new Set(['__tests__', 'generated']))
      .filter((f) => path.normalize(f) !== path.normalize(path.join(SRC_ROOT, 'ui', 'iconDefs.ts')))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    for (const iconKey of Object.keys(ICON_DEFS)) {
      expect(nonIconDefsCode.includes(iconKey), `Unused icon key in ICON_DEFS: ${iconKey}`).toBe(true);
    }

    const viteCfg = fs.readFileSync(path.join(ROOT_DIR, 'vite.config.ts'), 'utf8');
    expect(viteCfg).toContain("base: './'");
    expect(viteCfg).toContain('sakuttodraw-cjk-fonts');
    for (const dir of ['Xiaolai', 'SetoJP', 'BizUdpGothic', 'MochiyPop', 'SakuttoCode', 'ComicShannsMono500']) {
      expect(viteCfg.includes(dir), `vite.config.ts missing font runtime cache dir: ${dir}`).toBe(true);
    }
  });
});
