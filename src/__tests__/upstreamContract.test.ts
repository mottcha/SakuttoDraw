import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cjkFontManifest } from '../annotator/cjkFontManager';
import { jpFontManifest } from '../annotator/jpGlyphOverride';
import {
  CTX_HIDDEN_TESTIDS,
  EXCALIDRAW_TESTIDS,
  TESTID_TO_TOOL_TYPE,
} from '../excalidraw/domContract';

const SRC_ROOT = path.resolve(__dirname, '..');

describe('upstream contracts & architecture invariants', () => {
  it('keeps CTX_HIDDEN_TESTIDS in 1-to-1 sync with excalidraw-overrides.css', () => {
    const css = fs.readFileSync(path.join(SRC_ROOT, 'styles', 'excalidraw-overrides.css'), 'utf8');
    const cssHidden = new Set<string>();
    for (const match of css.matchAll(/\.context-menu\s*>\s*li\[data-testid="([^"]+)"\]/g)) {
      cssHidden.add(match[1]);
    }
    expect(cssHidden).toEqual(CTX_HIDDEN_TESTIDS);
  });

  it('enforces one-way DAG inside quickAnnotator/ (feature modules never import index or siblings)', () => {
    const qaDir = path.join(SRC_ROOT, 'annotator', 'quickAnnotator');
    const featureFiles = [
      'toolbar.ts',
      'mainMenu.ts',
      'extraToolsMenu.ts',
      'contextMenu.ts',
      'topRightBar.ts',
      'fillSwap.ts',
      'redactDrag.ts',
      'guards.ts',
    ];
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

  it('contains zero compatibility re-export barrels across refactored facade modules', () => {
    const nonBarrelFiles = [
      path.join(SRC_ROOT, 'annotator', 'quickAnnotator', 'index.ts'),
      path.join(SRC_ROOT, 'annotator', 'apiActions.ts'),
      path.join(SRC_ROOT, 'services', 'storageBridge.ts'),
      path.join(SRC_ROOT, 'annotator', 'jpGlyphOverride.ts'),
    ];
    for (const filePath of nonBarrelFiles) {
      const code = fs.readFileSync(filePath, 'utf8');
      expect(
        /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]/m.test(code),
        `${path.basename(filePath)} must not re-export from another module`,
      ).toBe(false);
    }
  });

  it('keeps generated CJK/JP manifests valid and domContract tool mapping consistent', () => {
    expect(cjkFontManifest.sets.ja.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.ko.files.length).toBeGreaterThan(0);
    expect(cjkFontManifest.sets.zh.files.length).toBeGreaterThan(0);
    expect(jpFontManifest.chunks.length).toBeGreaterThan(0);

    const knownTestIds = new Set<string>(Object.values(EXCALIDRAW_TESTIDS));
    for (const testId of Object.keys(TESTID_TO_TOOL_TYPE)) {
      expect(knownTestIds.has(testId), `Unknown testId in TESTID_TO_TOOL_TYPE: ${testId}`).toBe(true);
    }
  });
});
