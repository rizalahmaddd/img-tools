import { useEffect, useState } from 'react';
import { ArrowSquareOutIcon, MapPinIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Notice, Section, Switch } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { getScopedTargets } from '@/store/scope';
import { runBatch } from '@/lib/batch';
import { readMeta, stripLossless, type MetaSummary } from '@/lib/metadata';
import { process } from '@/engine/client';
import { defaultOutput } from '@/engine/types';
import { formatBytes } from '@/lib/format';
import { mimeLabel } from '@/engine/formats';
import { toolById } from './registry';
import { ActiveStage } from './common';

const DEFAULTS = { keepIcc: true, showRaw: false };

function Row({ k, v }: { k: string; v?: string | number | null }) {
  if (v == null || v === '') return null;
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}

function fmtRaw(v: unknown): string {
  if (v instanceof Date) return v.toLocaleString('id-ID');
  if (v instanceof Uint8Array || ArrayBuffer.isView(v)) return `[${(v as Uint8Array).length} byte]`;
  if (Array.isArray(v)) return v.length > 12 ? `[${v.length} nilai]` : v.join(', ');
  if (typeof v === 'object' && v) return JSON.stringify(v).slice(0, 120);
  return String(v);
}

export default function Metadata() {
  const tool = toolById('metadata')!;
  const [s, set] = useToolSettings('metadata', DEFAULTS);
  const item = useActiveItem();
  const [meta, setMeta] = useState<MetaSummary | null | undefined>(undefined);
  const [currentMeta, setCurrentMeta] = useState<boolean | null>(null);
  const v = item ? current(item) : null;

  useEffect(() => {
    if (!item) return;
    setMeta(undefined);
    readMeta(item.source).then(setMeta);
  }, [item?.id, item?.source]);

  useEffect(() => {
    if (!v) return;
    readMeta(v.blob).then((m) => setCurrentMeta(!!m && Object.keys(m.raw).some((k) => !['ImageWidth', 'ImageHeight', 'BitDepth', 'ColorType', 'Compression', 'Filter', 'Interlace', 'JFIFVersion', 'ResolutionUnit', 'XResolution', 'YResolution', 'ThumbnailWidth', 'ThumbnailHeight'].includes(k))));
  }, [v?.id]);

  const strip = () =>
    runBatch({
      label: 'Menghapus metadata',
      toolLabel: 'Hapus metadata',
      items: getScopedTargets(),
      work: async (_i, ver, signal) => {
        const lossless = await stripLossless(ver.blob, s.keepIcc);
        if (lossless) return { blob: lossless, width: ver.width, height: ver.height, mime: lossless.type };
        return process(ver.blob, { ops: [], output: { ...defaultOutput, format: 'original', quality: 95 }, srcMime: ver.mime }, signal);
      },
    });

  const gps = meta?.gps;

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage />}
      panel={
        <>
          <Section title="File">
            {item && v && (
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <Row k="Nama" v={item.name} />
                <Row k="Format asli" v={`${mimeLabel(item.sourceMime)} · ${formatBytes(item.source.size)}`} />
                <Row k="Sekarang" v={`${mimeLabel(v.mime)} · ${formatBytes(v.size)}`} />
                <Row k="Dimensi" v={`${v.width} × ${v.height} px (${((v.width * v.height) / 1e6).toFixed(1)} MP)`} />
                <Row k="Transparan" v={v.hasAlpha ? 'Ya' : 'Tidak'} />
              </dl>
            )}
          </Section>
          <Section title="Data kamera (file asli)">
            {meta === undefined ? (
              <p className="text-sm text-muted">Membaca…</p>
            ) : meta === null ? (
              <p className="text-sm text-muted">File asli tidak punya metadata EXIF.</p>
            ) : (
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <Row k="Kamera" v={meta.camera} />
                <Row k="Lensa" v={meta.lens} />
                <Row k="Diambil" v={meta.taken} />
                <Row k="Pengaturan" v={[meta.aperture, meta.exposure, meta.iso && `ISO ${meta.iso}`, meta.focal].filter(Boolean).join(' · ')} />
                <Row k="Software" v={meta.software} />
                <Row k="Pembuat" v={meta.author} />
                <Row k="Hak cipta" v={meta.copyright} />
                <Row k="Profil warna" v={meta.colorSpace} />
              </dl>
            )}
            {gps && (
              <div className="rounded-md bg-warn/12 p-3 text-[13px] text-warn">
                <p className="flex items-center gap-1.5 font-semibold">
                  <MapPinIcon size={16} weight="fill" /> Ada lokasi GPS
                </p>
                <p className="mt-1 tabular-nums">
                  {gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}
                </p>
                <a href={`https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lon}#map=16/${gps.lat}/${gps.lon}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium underline">
                  Lihat di peta <ArrowSquareOutIcon size={13} />
                </a>
                <p className="mt-1.5 text-xs opacity-90">Siapa pun yang menerima file asli bisa tahu lokasi foto ini diambil.</p>
              </div>
            )}
            {meta && (
              <>
                <Switch checked={s.showRaw} onChange={(showRaw) => set({ showRaw })} label="Tampilkan semua tag" />
                {s.showRaw && (
                  <dl className="grid max-h-80 grid-cols-[140px_1fr] gap-x-3 gap-y-1 overflow-y-auto rounded-md bg-surface-2 p-2 font-mono text-[11px]">
                    {Object.entries(meta.raw).map(([k, val]) => (
                      <Row key={k} k={k} v={fmtRaw(val)} />
                    ))}
                  </dl>
                )}
              </>
            )}
          </Section>
          <Section title="Privasi">
            {currentMeta === false ? (
              <p className="flex items-center gap-1.5 text-sm text-ok">
                <ShieldCheckIcon size={18} weight="fill" /> Versi sekarang sudah bersih dari metadata.
              </p>
            ) : (
              <Notice>JPG, PNG, dan WebP dibersihkan tanpa mengubah piksel. Format lain disimpan ulang.</Notice>
            )}
            <Switch checked={s.keepIcc} onChange={(keepIcc) => set({ keepIcc })} label="Pertahankan profil warna" hint="Supaya warna tetap akurat. Tidak berisi data pribadi." />
            <p className="text-xs text-muted">Catatan: setiap alat lain di Racik juga otomatis membuang metadata saat menyimpan, kecuali kamu aktifkan “Pertahankan EXIF”.</p>
          </Section>
        </>
      }
      footer={<ApplyBar label="Hapus metadata" onApply={strip} />}
    />
  );
}
