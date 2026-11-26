import fs from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const LOCAL_ASSET_BASE_EXPR =
  '(typeof window!=="undefined"&&window.location?new URL("./",window.location.href).toString():"http://localhost/")';

function stripExcalidrawCdn(code: string): string {
  return code
    .replace(/`https:\/\/esm\.sh\/[\s\S]*?\/dist\/prod\/`/g, LOCAL_ASSET_BASE_EXPR)
    .replace(/`https:\/\/esm\.sh\/[\s\S]*?\/dist\/dev\/`/g, LOCAL_ASSET_BASE_EXPR);
}

// Keep only the 5 supported UI locale bundles (en, ja-JP, ko-KR, zh-CN, zh-TW) in SW precache
const SUPPORTED_LOCALE_PREFIXES = [
  'assets/en-',
  'assets/ja-JP-',
  'assets/ko-KR-',
  'assets/zh-CN-',
  'assets/zh-TW-',
];

export default defineConfig({
  base: './',
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: 'sakuttodraw-dev-local-fonts-only',
          setup(build) {
            build.onLoad({ filter: /@excalidraw[\\/]excalidraw[\\/]dist[\\/].*\.js$/ }, async (args) => {
              const contents = await fs.promises.readFile(args.path, 'utf8');
              if (!contents.includes('https://esm.sh/')) return null;
              return {
                contents: stripExcalidrawCdn(contents),
                loader: 'js',
              };
            });
          },
        },
      ],
    },
  },
  plugins: [
    {
      name: 'sakuttodraw-local-fonts-only',
      transform(code, id) {
        if (id.includes('@excalidraw/excalidraw') && code.includes('https://esm.sh/')) {
          return {
            code: stripExcalidrawCdn(code),
            map: null,
          };
        }
        return null;
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'THIRD-PARTY-NOTICES.txt'],
      manifest: {
        name: 'SakuttoDraw',
        short_name: 'SakuttoDraw',
        description: 'Quick screenshot annotation tool powered by Excalidraw',
        lang: 'en',
        theme_color: '#c2255c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Precache app shell, PNG/SVG icons, UI Assistant fonts, and lightweight Latin/Mono fonts, excluding CJK chunk packs
        globPatterns: ['**/*.{js,css,html,svg,png}', 'assets/*.woff2', 'fonts/!(Xiaolai|SetoJP|BizUdpGothic|MochiyPop|SakuttoCode)/**/*.woff2'],
        globIgnores: ['**/fonts/Xiaolai/**', '**/fonts/SetoJP/**', '**/fonts/BizUdpGothic/**', '**/fonts/MochiyPop/**', '**/fonts/SakuttoCode/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        manifestTransforms: [
          (entries) => {
            const manifest = entries.filter((entry) => {
              // Exclude unused CodeMirror editor and unused WASM font subsetter chunks (~2.1MB saved)
              if (
                entry.url.startsWith('assets/CodeMirrorEditor-') ||
                entry.url.startsWith('assets/subset-shared') ||
                entry.url.startsWith('assets/subset-worker')
              ) {
                return false;
              }
              // Exclude unsupported locale bundles while keeping en, ja-JP, ko-KR, zh-CN, zh-TW
              if (/^assets\/([a-z]{2,3}-[A-Z]{2,3}|kaa)-[A-Z0-9]{8}-/.test(entry.url)) {
                return SUPPORTED_LOCALE_PREFIXES.some((prefix) => entry.url.startsWith(prefix));
              }
              return true;
            });
            return { manifest };
          },
        ],
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/(Xiaolai|SetoJP|BizUdpGothic|MochiyPop|SakuttoCode)\/.*\.woff2$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sakuttodraw-cjk-fonts',
              expiration: {
                maxEntries: 700,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      'roughjs/bin/rough': 'roughjs/bin/rough.js',
      'roughjs/bin/canvas': 'roughjs/bin/canvas.js',
      'roughjs/bin/generator': 'roughjs/bin/generator.js',
      'roughjs/bin/math': 'roughjs/bin/math.js',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    server: {
      deps: {
        inline: ['@excalidraw/excalidraw'],
      },
    },
  },
});
