import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['**/mediapipe/**', '**/models/**', '**/heic-to-*.js', '**/pdf.worker*', '**/ai.worker-*.js', '**/vision_bundle-*.js', '**/UTIF-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
      manifest: {
        name: 'Racik — Image Tools',
        short_name: 'Racik',
        description: 'Kompres, ubah format, potong, sensor, hapus latar, dan perbesar gambar langsung di perangkat. Tanpa upload.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        theme_color: '#161616',
        background_color: '#161616',
        categories: ['photo', 'utilities', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }] },
        },
        file_handlers: [
          {
            action: '/',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.svg', '.jxl', '.ico'],
            },
          },
        ],
        launch_handler: { client_mode: 'focus-existing' },
      } as never,
    }),
  ],
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: [
      '@jsquash/jpeg',
      '@jsquash/webp',
      '@jsquash/avif',
      '@jsquash/png',
      '@jsquash/oxipng',
      '@jsquash/jxl',
      '@huggingface/transformers',
      'onnxruntime-web',
    ],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
