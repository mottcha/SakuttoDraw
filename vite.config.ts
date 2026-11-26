import fs from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const LOCAL_ASSET_BASE_EXPR =
  '(typeof window!=="undefined"&&window.location?new URL("./",window.location.href).toString():"http://localhost/")';

const CJK_RUNTIME_FONT_DIRS = [
  'Xiaolai',
  'SetoJP',
  'BizUdpGothic',
  'MochiyPop',
  'SakuttoCode',
  'ComicShannsMono500',
] as const;
const CJK_RUNTIME_DIR_PATTERN = CJK_RUNTIME_FONT_DIRS.join('|');
const CJK_FONT_CACHE_NAME = 'sakuttodraw-cjk-fonts';
const CJK_FONT_URL_RE = new RegExp(`/fonts/(${CJK_RUNTIME_DIR_PATTERN})/.*\\.woff2$`, 'i');

function stripExcalidrawCdn(code: string): string {
  const cleaned = code
    .replace(/`https:\/\/esm\.sh\/[\s\S]*?\/dist\/prod\/`/g, LOCAL_ASSET_BASE_EXPR)
    .replace(/`https:\/\/esm\.sh\/[\s\S]*?\/dist\/dev\/`/g, LOCAL_ASSET_BASE_EXPR);
  if (/esm\.sh\//i.test(cleaned)) {
    throw new Error('[sakuttodraw] Failed to strip all esm.sh CDN references from @excalidraw/excalidraw bundle');
  }
  return cleaned;
}

// Keep only the supported non-English UI locale bundles (en is built-in) in SW precache
const SUPPORTED_LOCALE_PREFIXES = [
  'assets/ja-JP-',
  'assets/ko-KR-',
  'assets/zh-CN-',
  'assets/zh-TW-',
];

const UNUSED_PRECACHE_CHUNK_PREFIXES = [
  'assets/CodeMirrorEditor-',
  'assets/subset-shared',
  'assets/subset-worker',
  'assets/minimap-',
  'assets/flowchart-',
  'assets/sequence-',
  'assets/class-',
  'assets/er-',
  'assets/state-',
  'assets/gantt-',
  'assets/quadrant-',
  'assets/timeline-',
  'assets/transformToExcalidrawSkeleton-',
  'assets/helpers-',
];

function computeUnusedMermaidChunks(): Set<string> {
  const unused = new Set<string>();
  const assetsDir = 'dist/assets';
  if (!fs.existsSync(assetsDir)) return unused;

  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  const codeMap = new Map(jsFiles.map((f) => [f, fs.readFileSync(`${assetsDir}/${f}`, 'utf8')]));
  const mermaidEntry = jsFiles.find(
    (f) => f.startsWith('index-') && !codeMap.get(f)?.includes('SakuttoDraw') && codeMap.get(f)?.includes('flowchart'),
  );
  if (!mermaidEntry) return unused;

  // Find chunks reachable ONLY via Mermaid / CodeMirror / subset / minimap (not from app entry or Excalidraw core)
  const appEntry = jsFiles.find((f) => f.startsWith('index-') && f !== mermaidEntry);
  const coreEntry = jsFiles.find((f) => f.startsWith('percentages-'));
  const coreReachable = new Set<string>();
  const q = [appEntry, coreEntry].filter((x): x is string => Boolean(x));
  const ignoredFromCore = (f: string) =>
    f === mermaidEntry ||
    f.startsWith('CodeMirrorEditor-') ||
    f.startsWith('subset-shared') ||
    f.startsWith('subset-worker') ||
    f.startsWith('minimap-') ||
    /^([a-z]{2,3}-[A-Z]{2,3}|kaa)-[A-Z0-9]{8}-/.test(f);

  while (q.length > 0) {
    const cur = q.shift()!;
    if (coreReachable.has(cur)) continue;
    coreReachable.add(cur);
    const code = codeMap.get(cur) || '';
    for (const m of code.matchAll(/\.\/([A-Za-z0-9._-]+\.js)/g)) {
      const dep = m[1];
      if (!codeMap.has(dep) || ignoredFromCore(dep) || coreReachable.has(dep)) continue;
      q.push(dep);
    }
  }

  for (const f of jsFiles) {
    if (
      !coreReachable.has(f) &&
      !/^([a-z]{2,3}-[A-Z]{2,3}|kaa)-[A-Z0-9]{8}-/.test(f)
    ) {
      unused.add(`assets/${f}`);
    }
  }
  return unused;
}

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
      includeAssets: ['THIRD-PARTY-NOTICES.txt'],
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
        globPatterns: ['**/*.{js,css,html,svg,png}', 'assets/*.woff2', `fonts/!(${CJK_RUNTIME_DIR_PATTERN})/**/*.woff2`],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        manifestTransforms: [
          (entries) => {
            const unusedMermaidOrOptional = computeUnusedMermaidChunks();
            const manifest = entries.filter((entry) => {
              // Exclude unused CodeMirror, WASM font subsetter, minimap, and unreachable Mermaid chunks
              if (
                unusedMermaidOrOptional.has(entry.url) ||
                UNUSED_PRECACHE_CHUNK_PREFIXES.some((prefix) => entry.url.startsWith(prefix))
              ) {
                return false;
              }
              // Exclude unsupported locale bundles while keeping ja-JP, ko-KR, zh-CN, zh-TW (en is built-in)
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
            urlPattern: CJK_FONT_URL_RE,
            handler: 'CacheFirst',
            options: {
              cacheName: CJK_FONT_CACHE_NAME,
              expiration: {
                maxEntries: 700,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [200],
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
