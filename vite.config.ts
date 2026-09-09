import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const host = process.env.TAURI_DEV_HOST;
const studioBase = process.env.QAMUZ_STUDIO_BASE || '/';

export default defineConfig({
  base: studioBase,
  plugins: [svelte()],

  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
    }
  },

  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || true,
    cors: true,
    headers: {
      'Content-Security-Policy':
        "frame-ancestors 'self' http://localhost:5173 http://127.0.0.1:5173 http://localhost:5174 http://127.0.0.1:5174 http://localhost:4173 http://127.0.0.1:4173 https://qamuz.ai https://*.qamuz.ai https://qamuz.studio https://*.qamuz.studio"
    },
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**']
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      },
      '/genaudius-api': {
        target: 'http://127.0.0.1:42003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/genaudius-api/, '') || '/'
      }
    }
  },

  // AudioWorklet processors are loaded at runtime by URL, so they must stay as
  // separate chunks with stable names instead of being inlined into the bundle.
  worker: { format: 'es' },

  optimizeDeps: {
    include: ['lamejs']
  },

  build: {
    target: 'esnext',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
});
