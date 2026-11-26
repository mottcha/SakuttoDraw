import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectBrowserLang,
  getMessages,
  normalizeAppLang,
  SUPPORTED_LANGS,
} from '../i18n/messages';

const SRC_ROOT = path.resolve(__dirname, '..');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'generated') continue;
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('i18n (en, ja-JP, zh-CN, zh-TW, ko-KR)', () => {
  it('normalizes and detects browser languages into the 5 supported locales', () => {
    expect(normalizeAppLang('ja')).toBe('ja-JP');
    expect(normalizeAppLang('ja-JP')).toBe('ja-JP');
    expect(normalizeAppLang('ko-KR')).toBe('ko-KR');
    expect(normalizeAppLang('zh-CN')).toBe('zh-CN');
    expect(normalizeAppLang('zh-SG')).toBe('zh-CN');
    expect(normalizeAppLang('zh-TW')).toBe('zh-TW');
    expect(normalizeAppLang('zh-HK')).toBe('zh-TW');
    expect(normalizeAppLang('zh-Hant')).toBe('zh-TW');
    expect(normalizeAppLang('en-US')).toBe('en');
    expect(detectBrowserLang({ language: 'fr-FR', languages: ['fr-FR', 'zh-TW'] })).toBe('zh-TW');
    expect(detectBrowserLang({ language: 'de-DE', languages: ['de-DE'] })).toBe('en');
  });

  it('provides complete message catalogs for all 5 supported locales', () => {
    expect(SUPPORTED_LANGS.map((l) => l.code)).toEqual(['en', 'ja-JP', 'zh-CN', 'zh-TW', 'ko-KR']);
    const enKeys = Object.keys(getMessages('en'));
    for (const { code } of SUPPORTED_LANGS) {
      const m = getMessages(code);
      expect(Object.keys(m)).toEqual(enKeys);
      for (const [key, val] of Object.entries(m)) {
        if (typeof val === 'string') {
          expect(val.length, `${code}.${key} should be non-empty`).toBeGreaterThan(0);
        } else if (typeof val === 'function') {
          expect((val as (s: string) => string)('Test').length, `${code}.${key} fn`).toBeGreaterThan(0);
        }
      }
      expect(m.cjkLangName.ja.length).toBeGreaterThan(0);
      expect(m.cjkLangName.jaStandard.length).toBeGreaterThan(0);
      expect(m.cjkLangName.jaPop.length).toBeGreaterThan(0);
      expect(m.cjkLangName.jaCode.length).toBeGreaterThan(0);
      expect(m.cjkLangName.ko.length).toBeGreaterThan(0);
      expect(m.cjkLangName.zh.length).toBeGreaterThan(0);
      expect(m.exportPadding.length).toBeGreaterThan(0);
      expect(m.closeLabel.length).toBeGreaterThan(0);
      expect(m.stateOn.length).toBeGreaterThan(0);
      expect(m.stateOff.length).toBeGreaterThan(0);
      expect(m.fontPackSharedHint.length).toBeGreaterThan(0);
      expect(m.fontDeleting.length).toBeGreaterThan(0);
    }
  });

  it('has zero unused MessageCatalog keys across non-test src/ files', () => {
    const srcFiles = walkTsFiles(SRC_ROOT)
      .filter((f) => path.normalize(f) !== path.normalize(path.join(SRC_ROOT, 'i18n', 'messages.ts')))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');

    const enKeys = Object.keys(getMessages('en'));
    for (const key of enKeys) {
      expect(srcFiles.includes(key), `Unused i18n key in MessageCatalog: ${key}`).toBe(true);
    }
  });
});
