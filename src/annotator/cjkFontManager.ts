import rawManifest from '../generated/cjkFontManifest.json';
import type { CjkFontManifest, CjkLang } from '../types/annotator';
import { silently } from '../utils/common';

export const CJK_FONT_CACHE_NAME = 'sakuttodraw-cjk-fonts';
export const LS_CJK_INSTALLED_KEY = 'exq-cjk-installed-sets';
export const CJK_LANG_ORDER: readonly CjkLang[] = ['ja', 'jaStandard', 'jaPop', 'jaCode', 'ko', 'zh'] as const;

const VALID_CJK_LANGS = new Set<string>(CJK_LANG_ORDER);

export const cjkFontManifest: CjkFontManifest = rawManifest as CjkFontManifest;

export function formatBytesToMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

export function resolveFontAssetUrl(relPath: string, baseUrl?: string): string {
  const cleanRel = relPath.replace(/^\.?\/+/, '');
  const rawBase =
    baseUrl ??
    (typeof window !== 'undefined' && typeof window.EXCALIDRAW_ASSET_PATH === 'string'
      ? window.EXCALIDRAW_ASSET_PATH
      : './');
  const origin =
    typeof window !== 'undefined' && window.location ? window.location.href : 'http://localhost/';
  const baseResolved = new URL(rawBase, origin).toString().replace(/\/+$/, '') + '/';
  return new URL(cleanRel, baseResolved).toString();
}

export function getRecordedInstalledSets(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): Set<CjkLang> {
  if (!storage) return new Set();
  const raw = silently(() => storage.getItem(LS_CJK_INSTALLED_KEY));
  if (!raw) return new Set();
  const parsed = silently(() => JSON.parse(raw));
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.filter((x): x is CjkLang => typeof x === 'string' && VALID_CJK_LANGS.has(x)));
}

export function saveRecordedInstalledSets(
  installed: Iterable<CjkLang>,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage) return;
  silently(() =>
    storage.setItem(LS_CJK_INSTALLED_KEY, JSON.stringify(Array.from(new Set(installed)))),
  );
}

export async function isLanguageSetCached(
  lang: CjkLang,
  {
    cacheStorage = typeof caches !== 'undefined' ? caches : null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    baseUrl,
  }: {
    cacheStorage?: CacheStorage | null;
    storage?: Storage | null;
    baseUrl?: string;
  } = {},
): Promise<boolean> {
  const setMeta = cjkFontManifest.sets[lang];
  if (!setMeta || setMeta.files.length === 0) return false;
  const recorded = getRecordedInstalledSets(storage);
  if (!recorded.has(lang)) return false;
  if (!cacheStorage || typeof cacheStorage.open !== 'function') return false;

  try {
    const cache = await cacheStorage.open(CJK_FONT_CACHE_NAME);
    if (typeof cache.keys === 'function') {
      const keys = await cache.keys();
      const cachedUrlSet = new Set(keys.map((req) => req.url));
      const allPresent = setMeta.files.every((relPath) =>
        cachedUrlSet.has(resolveFontAssetUrl(relPath, baseUrl)),
      );
      if (!allPresent) {
        recorded.delete(lang);
        saveRecordedInstalledSets(recorded, storage);
        return false;
      }
      return true;
    }

    // Fallback for minimal Cache mocks without keys()
    const hits = await Promise.all(
      setMeta.files.map((relPath) => cache.match(resolveFontAssetUrl(relPath, baseUrl))),
    );
    if (hits.some((h) => !h)) {
      recorded.delete(lang);
      saveRecordedInstalledSets(recorded, storage);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function downloadLanguageFontSet(
  lang: CjkLang,
  {
    onProgress,
    concurrency = 4,
    fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
    cacheStorage = typeof caches !== 'undefined' ? caches : null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    baseUrl,
  }: {
    onProgress?: (completed: number, total: number) => void;
    concurrency?: number;
    fetchFn?: typeof fetch | null;
    cacheStorage?: CacheStorage | null;
    storage?: Storage | null;
    baseUrl?: string;
  } = {},
): Promise<{ ok: boolean; cachedCount: number; total: number }> {
  const setMeta = cjkFontManifest.sets[lang];
  if (!setMeta || !fetchFn || !cacheStorage) {
    return { ok: false, cachedCount: 0, total: setMeta?.files.length ?? 0 };
  }

  const files = setMeta.files;
  const total = files.length;
  let completed = 0;
  let cursor = 0;

  try {
    const cache = await cacheStorage.open(CJK_FONT_CACHE_NAME);
    onProgress?.(0, total);

    const workerCount = Math.max(1, Math.min(concurrency, total));
    const workers = Array.from({ length: workerCount }, async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= total) break;
        const url = resolveFontAssetUrl(files[idx], baseUrl);
        const existing = await cache.match(url);
        if (!existing) {
          const resp = await fetchFn(url, { credentials: 'same-origin' });
          if (!resp.ok) {
            throw new Error(`Failed to fetch font chunk: ${url} (${resp.status})`);
          }
          await cache.put(url, resp.clone());
        }
        completed += 1;
        onProgress?.(completed, total);
      }
    });

    await Promise.all(workers);

    const recorded = getRecordedInstalledSets(storage);
    recorded.add(lang);
    saveRecordedInstalledSets(recorded, storage);

    return { ok: true, cachedCount: completed, total };
  } catch {
    return { ok: false, cachedCount: completed, total };
  }
}

export function computeExclusiveFilesForDeletion(
  targetLang: CjkLang,
  installedLangs: Iterable<CjkLang>,
): string[] {
  const targetFiles = cjkFontManifest.sets[targetLang]?.files ?? [];
  const protectedFiles = new Set<string>();

  for (const lang of installedLangs) {
    if (lang === targetLang) continue;
    for (const file of cjkFontManifest.sets[lang]?.files ?? []) {
      protectedFiles.add(file);
    }
  }

  return targetFiles.filter((file) => !protectedFiles.has(file));
}

export async function deleteLanguageFontSet(
  lang: CjkLang,
  {
    cacheStorage = typeof caches !== 'undefined' ? caches : null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    baseUrl,
  }: {
    cacheStorage?: CacheStorage | null;
    storage?: Storage | null;
    baseUrl?: string;
  } = {},
): Promise<{ ok: boolean; deletedCount: number }> {
  const recorded = getRecordedInstalledSets(storage);
  const filesToDelete = computeExclusiveFilesForDeletion(lang, recorded);

  recorded.delete(lang);
  saveRecordedInstalledSets(recorded, storage);

  if (!cacheStorage || typeof cacheStorage.open !== 'function') {
    return { ok: true, deletedCount: 0 };
  }

  try {
    const cache = await cacheStorage.open(CJK_FONT_CACHE_NAME);
    let deletedCount = 0;
    await Promise.all(
      filesToDelete.map(async (relPath) => {
        const url = resolveFontAssetUrl(relPath, baseUrl);
        const removed = await cache.delete(url);
        if (removed) deletedCount += 1;
      }),
    );
    return { ok: true, deletedCount };
  } catch {
    return { ok: false, deletedCount: 0 };
  }
}
