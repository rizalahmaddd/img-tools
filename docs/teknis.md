# Dokumentasi Teknis

Dokumentasi arsitektur, engine pemrosesan, AI di perangkat, dan panduan pengembangan **Racik — Image Tools**.

---

## 1. Arsitektur Client-Side

Seluruh pemrosesan gambar berjalan di browser. Tidak ada backend; server hanya menyajikan file statis (Cloudflare Workers static assets).

```
                 ┌──────────────────────────────────────────┐
                 │        UI (React 19 + Zustand)           │
                 │  pages/ · components/ · tools/           │
                 └────┬──────────────────┬──────────────┬───┘
                      │                  │              │
        ┌─────────────▼──────┐  ┌────────▼────────┐  ┌──▼───────────────────┐
        │  Workspace Store   │  │  Engine Workers │  │      AI Worker       │
        │ (IndexedDB, versi) │  │  (pool, Comlink)│  │ transformers.js +    │
        └────────────────────┘  │ decode→ops→enc  │  │ onnxruntime-web      │
                                │ jSquash (WASM)  │  │ (WebGPU / WASM)      │
                                └─────────────────┘  └──────────────────────┘
                                         │
                        ┌────────────────▼────────────────┐
                        │  Service Worker (Workbox / PWA) │
                        │  precache app + cache model AI  │
                        └─────────────────────────────────┘
```

---

## 2. Peta Modul & Struktur Kode

| Modul | Lokasi | Fungsi |
|---|---|---|
| **Entry & Shell** | `src/main.tsx`, `src/App.tsx`, `src/components/AppShell.tsx` | Routing, layout sidebar/tab bar, input global (drag & drop, paste, share target). |
| **Halaman** | `src/pages/` | Beranda, Berkas, daftar alat, dan Pengaturan. |
| **Registry alat** | `src/tools/registry.ts` | Metadata 21 alat (grup, ikon, kata kunci pencarian) dengan lazy import per alat. |
| **Alat** | `src/tools/*.tsx` | UI dan logika tiap alat; `compose.ts` dan `common.tsx` berisi bagian yang dipakai bersama. |
| **Workspace** | `src/store/workspace.ts`, `src/store/persist.ts` | Item gambar beserta riwayat versinya, disimpan di IndexedDB. |
| **Pengaturan** | `src/store/settings.ts` | Setelan per alat dan preferensi aplikasi di localStorage. |
| **Engine** | `src/engine/` | Pipeline decode → ops → encode di worker pool. |
| **AI** | `src/ai/` | Worker AI (hapus latar, upscale) dan deteksi wajah MediaPipe. |
| **Utilitas** | `src/lib/` | Impor file, batch, simpan/ZIP/share, metadata EXIF, PDF, deteksi kemampuan perangkat, tema. |
| **Service Worker** | `src/sw.ts` | Precache aset aplikasi, cache model AI, dan penanganan share target. |

---

## 3. Workspace & Riwayat Versi

- Setiap gambar yang masuk menjadi satu **item** dengan daftar **versi**. Alat membaca versi aktif lalu menambahkan versi baru, sehingga hasil satu alat langsung jadi input alat berikutnya.
- Undo/redo dan panel riwayat bekerja di atas daftar versi tersebut.
- Item, versi, dan thumbnail disimpan di IndexedDB (`idb-keyval`), jadi tetap ada setelah halaman ditutup.
- Setelan tiap alat disimpan di localStorage dan saat dimuat digabungkan dengan nilai default terbaru, sehingga penambahan opsi baru tidak merusak setelan lama.

---

## 4. Engine Pemrosesan

Pipeline di `src/engine/pipeline.ts`:

1. **Decode** (`decode.ts`): `createImageBitmap` untuk format umum; HEIC lewat `heic-to`, TIFF lewat `utif2`, JXL/AVIF lewat jSquash bila browser tidak mendukung.
2. **Ops** (`ops.ts`, `adjust.ts`): resize (pica), crop, rotate, filter warna, watermark, bingkai, dan operasi lain di atas `OffscreenCanvas`.
3. **Encode** (`encode.ts`): MozJPEG, libwebp, libavif, libjxl, dan OxiPNG dari jSquash. PNG lossy memakai kuantisasi `image-q`. Mode target KB mencari kualitas terbaik yang masih di bawah batas ukuran.

Pekerjaan dibagi ke **worker pool** (`client.ts`, Comlink) supaya UI tetap responsif saat memproses banyak gambar.

### Batas perangkat
- iOS Safari menghasilkan kanvas kosong di atas ~16,7 MP, sehingga input lebih besar diperkecil saat impor dan pengguna diberi pemberitahuan.
- Di perangkat lain batas area kanvas menyesuaikan `navigator.deviceMemory`.
- Ukuran output AI direncanakan agar muat di anggaran memori perangkat.

---

## 5. AI di Perangkat

| Fitur | Model | Runtime |
|---|---|---|
| Hapus latar (Cepat) | MODNet | transformers.js |
| Hapus latar (Akurat) | BiRefNet lite | transformers.js |
| Perbesar HD (Cepat) | Real-ESRGAN General x4v3 (ikut dalam bundel, bisa offline) | onnxruntime-web |
| Perbesar HD (Detail) | Real-ESRGAN x4plus fp16 | onnxruntime-web |
| Deteksi wajah (Sensor) | BlazeFace short range | MediaPipe Tasks Vision |

- Hapus latar dan upscale berjalan di **worker AI** tersendiri (`src/ai/ai.worker.ts`), memakai WebGPU bila tersedia dan jatuh ke WASM bila tidak.
- Upscale memproses gambar per **tile** berukuran tetap agar memori stabil.
- Model diunduh saat pertama dipakai lalu disimpan di Cache API; model bisa dihapus dari halaman Pengaturan.
- Deteksi wajah berjalan di main thread dengan wasm MediaPipe yang disalin ke `public/mediapipe` oleh `scripts/copy-assets.mjs`.

---

## 6. PWA & Offline

- Service worker dibuat dengan `vite-plugin-pwa` mode `injectManifest` (`src/sw.ts`).
- Shell aplikasi di-precache; chunk besar (worker AI, PDF.js worker, decoder HEIC/TIFF, MediaPipe, model) di-cache saat pertama dipakai.
- Saat ada versi baru, service worker langsung aktif dan aplikasi menampilkan ajakan untuk memuat ulang.
- Manifest mendaftarkan **share target** (bagikan gambar/PDF dari aplikasi lain) dan **file handlers** (buka gambar dengan Racik di desktop).

---

## 7. Model AI & Lisensi

| Model | Kegunaan | Lisensi | Sumber |
|---|---|---|---|
| MODNet | Hapus latar potret (cepat) | Apache-2.0 | `Xenova/modnet` |
| BiRefNet lite | Hapus latar semua objek (akurat) | MIT | `onnx-community/BiRefNet_lite-ONNX` |
| Real-ESRGAN General x4v3 | Upscale cepat (ikut dalam bundel) | BSD-3-Clause | `public/models` |
| Real-ESRGAN x4plus (fp16) | Upscale detail tinggi | BSD-3-Clause | `imgdesignart/realesrgan-x4-onnx` |
| BlazeFace short range | Deteksi wajah | Apache-2.0 | MediaPipe |

---

## 8. Build & Deploy

### Kebutuhan lingkungan
- Node.js 22 atau lebih baru
- NPM

### Perintah

```bash
npm install
npm run dev        # dev server http://localhost:5173
npm run typecheck  # cek tipe TypeScript
npm run build      # type-check, build, lalu postbuild
npm run preview    # pratinjau hasil build
npm run deploy     # build + deploy ke Cloudflare Workers
```

- `scripts/copy-assets.mjs` menyalin wasm MediaPipe ke `public/mediapipe` sebelum dev/build.
- `scripts/postbuild.mjs` membuang wasm ONNX Runtime bawaan (dimuat dari jsDelivr saat runtime) dan memastikan tidak ada aset di atas 25 MiB, batas Cloudflare.

### Cloudflare Workers

```bash
npx wrangler login
npm run deploy
```

- `wrangler.jsonc` mengikat custom domain `image.solusikoding.com`.
- `public/_headers` memasang COOP/COEP (dibutuhkan untuk WASM multithread), cache aset, dan header keamanan.
