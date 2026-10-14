import { useEffect, useState } from 'react';
import { CpuIcon, DownloadSimpleIcon, MonitorIcon, MoonIcon, SunIcon, TrashIcon } from '@phosphor-icons/react';
import { Page } from '@/components/AppShell';
import { Button, Field, Section, Segmented, Slider, Switch, TextInput } from '@/components/ui';
import { Confirm } from '@/components/Sheet';
import { useSettings, usePrefs } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { storageEstimate } from '@/store/persist';
import { toast } from '@/store/ui';
import { formatBytes } from '@/lib/format';
import { clearModelCache, webgpuAvailable } from '@/ai/client';
import { SEG_MODELS, UPSCALE_MODELS } from '@/ai/models';
import { promptInstall, useInstall } from '@/lib/install';
import { isIOS, isStandalone } from '@/lib/device';
import { applyTheme } from '@/lib/theme';

export default function Settings() {
  const prefs = usePrefs();
  const set = useSettings((s) => s.setPrefs);
  const resetAll = useSettings((s) => s.resetAll);
  const clear = useWorkspace((s) => s.clear);
  const [usage, setUsage] = useState({ usage: 0, quota: 0 });
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState<null | 'files' | 'settings' | 'models'>(null);
  const bip = useInstall((s) => s.event);
  const cores = navigator.hardwareConcurrency || 4;

  const refresh = () => storageEstimate().then(setUsage);
  useEffect(() => {
    refresh();
    webgpuAvailable().then(setGpu);
  }, []);

  return (
    <Page title="Pengaturan">
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <Section title="Tampilan">
          <Segmented
            value={prefs.theme}
            onChange={(theme) => {
              set({ theme });
              applyTheme(theme);
            }}
            options={[
              { value: 'system', label: 'Ikuti sistem', icon: MonitorIcon },
              { value: 'light', label: 'Terang', icon: SunIcon },
              { value: 'dark', label: 'Gelap', icon: MoonIcon },
            ]}
          />
        </Section>

        <Section title="Menyimpan file">
          <Field label="Pola nama file" hint={<>{'{name}'} nama asli, {'{n}'} nomor urut, {'{w}'}/{'{h}'} ukuran, {'{date}'} tanggal. Contoh: {'{name}-{w}px'}</>}>
            <TextInput value={prefs.namePattern} onChange={(namePattern) => set({ namePattern })} placeholder="{name}" label="Pola nama file" />
          </Field>
          <Switch checked={prefs.zip} onChange={(zip) => set({ zip })} label="Unduh banyak file sebagai ZIP" />
          <Switch checked={prefs.keepExif} onChange={(keepExif) => set({ keepExif })} label="Pertahankan EXIF saat menyimpan JPG" hint="Termasuk lokasi GPS kalau ada. Matikan untuk privasi." />
          <Switch checked={prefs.confirmDelete} onChange={(confirmDelete) => set({ confirmDelete })} label="Konfirmasi sebelum menghapus" />
        </Section>

        <Section title="Performa">
          <Slider
            label="Proses paralel"
            value={prefs.concurrency}
            min={0}
            max={Math.min(8, cores)}
            onChange={(concurrency) => set({ concurrency })}
            format={(v) => (v === 0 ? 'Otomatis' : `${v} sekaligus`)}
            hint="Lebih banyak = lebih cepat untuk batch, tapi lebih boros memori. Turunkan kalau browser sering crash."
          />
          <Slider label="Batas riwayat per gambar" value={prefs.historyLimit} min={2} max={40} onChange={(historyLimit) => set({ historyLimit })} format={(v) => `${v} versi`} />
          <Field label="Perangkat untuk AI" hint={gpu === null ? 'Memeriksa WebGPU…' : gpu ? 'WebGPU tersedia, AI berjalan di GPU.' : 'WebGPU tidak tersedia, AI berjalan di CPU (lebih lambat).'}>
            <Segmented
              value={prefs.aiDevice}
              onChange={(aiDevice) => set({ aiDevice })}
              options={[
                { value: 'auto', label: 'Otomatis', icon: CpuIcon },
                { value: 'webgpu', label: 'GPU' },
                { value: 'wasm', label: 'CPU' },
              ]}
            />
          </Field>
        </Section>

        <Section title="Penyimpanan">
          <p className="text-sm text-muted">
            Terpakai {formatBytes(usage.usage)}
            {usage.quota > 0 && <> dari {formatBytes(usage.quota)}</>}. Berkas & model AI disimpan di browser ini saja.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" icon={TrashIcon} onClick={() => setConfirm('files')}>
              Hapus semua berkas
            </Button>
            <Button size="sm" variant="danger" icon={TrashIcon} onClick={() => setConfirm('models')}>
              Hapus model AI
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm('settings')}>
              Reset pengaturan alat
            </Button>
          </div>
        </Section>

        {!isStandalone() && (
          <Section title="Pasang sebagai aplikasi">
            <p className="text-sm text-muted">Buka dari layar utama, layar penuh, bisa dipakai offline, dan muncul di menu Bagikan HP.</p>
            {bip ? (
              <Button variant="primary" icon={DownloadSimpleIcon} onClick={() => promptInstall()}>
                Pasang Racik
              </Button>
            ) : isIOS() ? (
              <p className="text-sm">Di Safari: ketuk Bagikan → Tambah ke Layar Utama.</p>
            ) : (
              <p className="text-sm">Gunakan menu browser → Instal aplikasi / Tambahkan ke layar utama.</p>
            )}
          </Section>
        )}

        <Section title="Tentang">
          <div className="space-y-2 text-[13px] text-muted">
            <p>Racik memproses gambar sepenuhnya di perangkat. Tidak ada server, akun, atau pelacak.</p>
            <p>Model AI: {[...SEG_MODELS, ...UPSCALE_MODELS].map((m) => m.license).join(' · ')} · MediaPipe Face Detector · Apache-2.0.</p>
            <p>Codec: MozJPEG, libwebp, libavif, libjxl, OxiPNG (via jSquash), pica, image-q, pdf.js, pdf-lib.</p>
          </div>
        </Section>
      </div>

      <Confirm
        open={confirm === 'files'}
        onClose={() => setConfirm(null)}
        title="Hapus semua berkas?"
        body="Semua gambar dan riwayat edit dihapus dari perangkat ini."
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          clear();
          setTimeout(refresh, 600);
          toast({ kind: 'success', title: 'Berkas dihapus' });
        }}
      />
      <Confirm
        open={confirm === 'models'}
        onClose={() => setConfirm(null)}
        title="Hapus model AI?"
        body="Model diunduh ulang saat alat AI dipakai lagi."
        confirmLabel="Hapus"
        danger
        onConfirm={async () => {
          await clearModelCache();
          refresh();
          toast({ kind: 'success', title: 'Model AI dihapus' });
        }}
      />
      <Confirm
        open={confirm === 'settings'}
        onClose={() => setConfirm(null)}
        title="Reset semua pengaturan?"
        body="Pengaturan tiap alat kembali ke bawaan."
        confirmLabel="Reset"
        onConfirm={() => {
          resetAll();
          applyTheme('system');
        }}
      />
    </Page>
  );
}
