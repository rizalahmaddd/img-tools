import { useEffect, useState } from 'react';
import { ImageIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Button, ColorInput, Field, Section, Segmented, Select, Slider, Switch, TextInput, cx } from '@/components/ui';
import { defaultOutput, type Anchor, type WatermarkOp } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { idb } from '@/store/persist';
import { pickFiles } from '@/lib/importer';
import { useObjectUrl } from '@/lib/hooks';
import { toolById } from './registry';
import { ActiveStage, applyToTargets, tokenOf, useLivePreview } from './common';

const DEFAULTS = {
  kind: 'text' as 'text' | 'image',
  text: '© {nama}',
  font: 'sans',
  bold: true,
  italic: false,
  color: '#ffffff',
  size: 5,
  opacity: 70,
  rotation: 0,
  position: 'br' as Anchor | 'tile',
  margin: 3,
  gap: 12,
  outline: 0,
  outlineColor: '#000000',
  shadow: true,
  box: false,
  boxColor: '#000000',
  logoSize: 18,
};
type S = typeof DEFAULTS;

const LOGO_KEY = 'asset:watermark-logo';

const POSITIONS: Anchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

function today() {
  return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function toOp(s: S, logo: Blob | null): WatermarkOp {
  return {
    type: 'watermark',
    kind: s.kind,
    text: s.text,
    font: s.font,
    bold: s.bold,
    italic: s.italic,
    color: s.color,
    size: s.kind === 'image' ? s.logoSize : s.size,
    opacity: s.opacity,
    rotation: s.rotation,
    position: s.position,
    margin: s.margin,
    gap: s.gap,
    outline: s.outline,
    outlineColor: s.outlineColor,
    shadow: s.shadow,
    box: s.box,
    boxColor: s.boxColor,
    image: logo,
  };
}

export default function Watermark() {
  const tool = toolById('watermark')!;
  const [s, set] = useToolSettings('watermark', DEFAULTS);
  const [logo, setLogo] = useState<Blob | null>(null);
  const logoUrl = useObjectUrl(logo);
  useEffect(() => {
    idb.get<Blob>(LOGO_KEY).then((b) => b && setLogo(b));
  }, []);

  const op = toOp(s, logo);
  const ready = s.kind === 'text' ? !!s.text.trim() : !!logo;
  const preview = useLivePreview(
    (v, item) => (ready ? { ops: [op], output: defaultOutput, srcMime: v.mime, vars: { nama: item.name, tanggal: today(), n: '1' } } : null),
    tokenOf({ s, logo: logo?.size }),
    { previewMax: 1600, debounce: 150 },
  );

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage preview={preview.result} busy={preview.busy} />}
      panel={
        <>
          <Section title="Jenis">
            <Segmented
              value={s.kind}
              onChange={(kind) => set({ kind })}
              options={[
                { value: 'text', label: 'Teks' },
                { value: 'image', label: 'Logo / gambar' },
              ]}
            />
            {s.kind === 'text' ? (
              <>
                <Field label="Teks" hint={<>Variabel: {'{nama}'} nama file, {'{tanggal}'} hari ini, {'{n}'} nomor urut. Enter untuk baris baru.</>}>
                  <TextInput multiline value={s.text} onChange={(text) => set({ text })} placeholder="© Nama kamu" label="Teks watermark" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Huruf">
                    <Select
                      value={s.font}
                      onChange={(font) => set({ font })}
                      options={[
                        { value: 'sans', label: 'Sans' },
                        { value: 'serif', label: 'Serif' },
                        { value: 'mono', label: 'Mono' },
                        { value: 'rounded', label: 'Rounded' },
                        { value: 'hand', label: 'Tulisan tangan' },
                        { value: 'impact', label: 'Impact' },
                      ]}
                    />
                  </Field>
                  <Field label="Gaya">
                    <div className="flex h-10 gap-1">
                      <button type="button" aria-pressed={s.bold} onClick={() => set({ bold: !s.bold })} className={cx('flex-1 rounded-md border text-sm font-bold', s.bold ? 'border-accent bg-accent-soft text-accent' : 'border-line')}>
                        B
                      </button>
                      <button type="button" aria-pressed={s.italic} onClick={() => set({ italic: !s.italic })} className={cx('flex-1 rounded-md border text-sm italic', s.italic ? 'border-accent bg-accent-soft text-accent' : 'border-line')}>
                        I
                      </button>
                    </div>
                  </Field>
                </div>
                <Field label="Warna teks">
                  <ColorInput value={s.color} onChange={(color) => set({ color })} />
                </Field>
                <Slider label="Ukuran" value={s.size} min={1} max={30} step={0.5} unit="%" onChange={(size) => set({ size })} defaultValue={5} hint="Relatif terhadap sisi terpendek, jadi konsisten di semua gambar." />
              </>
            ) : (
              <>
                {logo ? (
                  <div className="flex items-center gap-3">
                    <span className="checker flex size-16 items-center justify-center overflow-hidden rounded-md border border-line">{logoUrl && <img src={logoUrl} alt="Logo" className="max-h-full max-w-full" />}</span>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Button size="sm" icon={UploadSimpleIcon} onClick={async () => pickLogo(setLogo)}>
                        Ganti logo
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={TrashIcon}
                        onClick={() => {
                          setLogo(null);
                          idb.del(LOGO_KEY);
                        }}
                      >
                        Hapus
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button block icon={ImageIcon} onClick={async () => pickLogo(setLogo)}>
                    Pilih logo (PNG transparan disarankan)
                  </Button>
                )}
                <Slider label="Lebar logo" value={s.logoSize} min={2} max={90} unit="%" onChange={(logoSize) => set({ logoSize })} defaultValue={18} hint="Persentase dari lebar gambar." />
              </>
            )}
            <Slider label="Transparansi" value={s.opacity} min={5} max={100} unit="%" onChange={(opacity) => set({ opacity })} defaultValue={70} />
          </Section>

          <Section title="Posisi">
            <div className="flex items-start gap-4">
              <div className="grid shrink-0 grid-cols-3 gap-1 rounded-md bg-surface-2 p-1.5" role="radiogroup" aria-label="Posisi watermark">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={s.position === p}
                    aria-label={p}
                    onClick={() => set({ position: p })}
                    className={cx('flex size-9 items-center justify-center rounded-sm', s.position === p ? 'bg-accent' : 'bg-surface hover:bg-surface-3')}
                  >
                    <span className={cx('size-2 rounded-full', s.position === p ? 'bg-accent-fg' : 'bg-line-strong')} />
                  </button>
                ))}
              </div>
              <div className="flex-1 space-y-2">
                <button
                  type="button"
                  onClick={() => set({ position: s.position === 'tile' ? 'br' : 'tile', rotation: s.position === 'tile' ? s.rotation : s.rotation || -30 })}
                  className={cx('h-10 w-full rounded-md border text-sm font-medium', s.position === 'tile' ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2')}
                >
                  Ubin (ulang di seluruh gambar)
                </button>
                <p className="text-xs text-muted">Ubin paling sulit dihapus orang lain.</p>
              </div>
            </div>
            {s.position === 'tile' ? (
              <Slider label="Jarak antar ubin" value={s.gap} min={0} max={60} unit="%" onChange={(gap) => set({ gap })} defaultValue={12} />
            ) : (
              <Slider label="Jarak dari tepi" value={s.margin} min={0} max={25} step={0.5} unit="%" onChange={(margin) => set({ margin })} defaultValue={3} />
            )}
            <Slider label="Rotasi" value={s.rotation} min={-90} max={90} unit="°" onChange={(rotation) => set({ rotation })} defaultValue={0} />
          </Section>

          {s.kind === 'text' && (
            <Section title="Keterbacaan" collapsible defaultOpen={false}>
              <Switch checked={s.shadow} onChange={(shadow) => set({ shadow })} label="Bayangan" />
              <Slider label="Garis tepi" value={s.outline} min={0} max={100} onChange={(outline) => set({ outline })} defaultValue={0} />
              {s.outline > 0 && <ColorInput value={s.outlineColor} onChange={(outlineColor) => set({ outlineColor })} label="Warna garis tepi" />}
              <Switch checked={s.box} onChange={(box) => set({ box })} label="Latar kotak" />
              {s.box && <ColorInput value={s.boxColor} onChange={(boxColor) => set({ boxColor })} label="Warna kotak" />}
            </Section>
          )}
        </>
      }
      footer={
        <ApplyBar
          label="Pasang watermark"
          disabled={!ready}
          onApply={() =>
            applyToTargets({
              label: 'Memasang watermark',
              toolLabel: 'Watermark',
              build: (item, v, i) => ({ ops: [op], output: defaultOutput, srcMime: v.mime, vars: { nama: item.name, tanggal: today(), n: String(i + 1) } }),
            })
          }
        />
      }
    />
  );
}

async function pickLogo(setLogo: (b: Blob) => void) {
  const [f] = await pickFiles({ multiple: false, accept: 'image/*,.svg' });
  if (!f) return;
  let blob: Blob = f;
  if (f.type === 'image/svg+xml') {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = 1024 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512);
    const c = document.createElement('canvas');
    c.width = Math.round((img.naturalWidth || 512) * k);
    c.height = Math.round((img.naturalHeight || 512) * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  }
  setLogo(blob);
  idb.set(LOGO_KEY, blob).catch(() => undefined);
}
