import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  CJK_FONT_CACHE_NAME,
  downloadLanguageFontSet,
  getAllLanguageSetCacheStatuses,
} from '../annotator/cjkFontManager';
import { attachExcalidrawAPI, runtime } from '../annotator/quickAnnotator/runtime';
import {
  refreshCjkCacheStatuses,
  resetCjkFontStoreForTests,
  toggleLanguageFontCache,
} from '../components/cjkFontStore';
import { PreferencesVisualPanel } from '../components/PreferencesPanel';
import { SakuttoRedactPanel } from '../components/SakuttoRedactPanel';
import { resetDomAndRuntime } from './testHelpers';

describe('components & CJK font store interactions', () => {
  beforeEach(() => {
    resetDomAndRuntime();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCjkFontStoreForTests();
  });

  it('rejects HTML fallback responses in downloadLanguageFontSet and prunes stale cache URLs', async () => {
    const htmlResp = new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const fetchMock = vi.fn(async () => htmlResp);
    const cachePut = vi.fn();
    const fakeCaches = {
      open: vi.fn(async () => ({
        put: cachePut,
        match: async () => undefined,
        delete: async () => true,
        keys: async () => [],
      })),
    } as unknown as CacheStorage;

    await expect(
      downloadLanguageFontSet('ja', {
        fetchFn: fetchMock as unknown as typeof fetch,
        cacheStorage: fakeCaches,
      }),
    ).resolves.toMatchObject({ ok: false, cachedCount: 0 });
    expect(cachePut).not.toHaveBeenCalled();

    const deletedUrls: string[] = [];
    const pruneCaches = {
      open: vi.fn(async (name: string) => {
        expect(name).toBe(CJK_FONT_CACHE_NAME);
        return {
          keys: async () => [
            new Request('https://example.test/fonts/SetoJP/obsolete-chunk.woff2'),
          ],
          delete: async (req: RequestInfo | URL) => {
            deletedUrls.push(typeof req === 'string' ? req : req instanceof URL ? req.href : req.url);
            return true;
          },
        };
      }),
    } as unknown as CacheStorage;

    const statuses = await getAllLanguageSetCacheStatuses({
      cacheStorage: pruneCaches,
      baseUrl: 'https://example.test/',
      pruneStale: true,
    });
    expect(statuses.ja).toBe(false);
    expect(deletedUrls).toEqual(['https://example.test/fonts/SetoJP/obsolete-chunk.woff2']);
  });

  it('ignores overlapping toggleLanguageFontCache calls while downloading', async () => {
    const slowFetch = vi.fn(
      () =>
        new Promise<Response>(() => {
          // keep pending
        }),
    );
    const origFetch = globalThis.fetch;
    const origCaches = globalThis.caches;
    Object.defineProperty(globalThis, 'fetch', { value: slowFetch, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'caches', {
      value: {
        open: async () => ({
          match: async () => undefined,
          put: async () => {},
          delete: async () => true,
          keys: async () => [],
        }),
      },
      configurable: true,
      writable: true,
    });
    try {
      refreshCjkCacheStatuses(() => false);
      const firstPromise = toggleLanguageFontCache('ko', 'en');
      await toggleLanguageFontCache('ko', 'en');
      expect(slowFetch.mock.calls.length).toBeLessThanOrEqual(4);
      void firstPromise;
    } finally {
      Object.defineProperty(globalThis, 'fetch', { value: origFetch, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'caches', { value: origCaches, configurable: true, writable: true });
    }
  });

  it('renders PreferencesVisualPanel with keyboard radiogroup arrows and Mac shortcuts', async () => {
    const platSpy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const updateScene = vi.fn();
    attachExcalidrawAPI({
      getAppState: () => ({ zenModeEnabled: false, viewModeEnabled: false }),
      updateScene,
    } as unknown as ExcalidrawImperativeAPI);

    const onModeChange = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(PreferencesVisualPanel, {
          lang: 'en',
          prefState: {
            boxSelectionMode: 'overlap',
            inputDevice: 'trackpad',
            stylesPanelMode: 'auto',
            zenModeEnabled: false,
            viewModeEnabled: false,
          },
          onStylesPanelModeChange: onModeChange,
        }),
      );
    });

    expect(host.textContent).toContain('⌥Z');
    expect(host.textContent).toContain('⌥R');
    const autoBtn = host.querySelector<HTMLButtonElement>('[data-exq-pref-styles-panel="auto"]')!;
    autoBtn.focus();
    await act(async () => {
      autoBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onModeChange).toHaveBeenCalledWith('compact');
    expect(document.activeElement).toBe(
      host.querySelector('[data-exq-pref-styles-panel="compact"]'),
    );

    const containBtn = host.querySelector<HTMLButtonElement>('[data-exq-pref-box="contain"]')!;
    containBtn.click();
    expect(runtime.prefs.boxSelectionMode).toBe('contain');
    expect(updateScene).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    platSpy.mockRestore();
  });

  it('opens SakuttoRedactPanel flyout, focuses first swatch, and restores trigger focus on close', async () => {
    document.body.innerHTML = `
      <div class="excalidraw">
        <div class="App-menu_top__left"></div>
      </div>
    `;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(SakuttoRedactPanel, {
          lang: 'en',
          active: true,
          uiLayout: 'compact',
          color: '#111111',
          onColorChange: vi.fn(),
        }),
      );
    });

    const trigger = document.querySelector<HTMLButtonElement>('[data-exq-redact-trigger="1"]')!;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.click();
    });
    const firstSwatch = document.querySelector<HTMLButtonElement>('.exq-redact-flyout [data-exq-redact-color]');
    expect(firstSwatch).toBeTruthy();
    expect(document.activeElement).toBe(firstSwatch);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.exq-redact-flyout')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      root.unmount();
    });
  });
});
