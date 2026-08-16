import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri expects a fixed dev server. These settings keep the plain web
// dev server (`npm run dev`) working while also satisfying `tauri dev`.
// See https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST

// tauri.conf.json's version is the single source of truth for the bundled
// app version; expose it to the frontend at build time (see App.d.ts).
const tauriConf = JSON.parse(readFileSync('./src-tauri/tauri.conf.json', 'utf-8'))

export default defineConfig({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },

  // Prevent Vite from obscuring Rust errors during `tauri dev`.
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 5174 }
      : undefined,
    watch: {
      // Don't watch the Rust side — cargo handles that.
      ignored: ['**/src-tauri/**'],
    },
  },

  // Expose TAURI_ env vars to the frontend.
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses a modern WebView2; target accordingly when building for it.
    target: process.env.TAURI_ENV_PLATFORM ? 'chrome105' : 'esnext',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
