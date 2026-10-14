import { useEffect, useState } from 'react';
import { CopyIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { ToolShell } from '@/components/ToolShell';
import { Button, Chip, ColorInput, Field, Section, Segmented, Slider, TextInput, cx } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem, type Version } from '@/store/workspace';
import { errorMessage, toast } from '@/store/ui';
import { downloadBlob, makeZip, type OutFile } from '@/lib/save';
import { useObjectUrl } from '@/lib/hooks';
import { haptic } from '@/lib/device';
import { toolById } from './registry';

const DEFAULTS = {
  fit: 'contain' as 'contain' | 'cover',
  padding: 8,
  bg: 'transparent',
  radius: 0,
  name: 'Aplikasi Saya',
  themeColor: '#ffffff',
  web: true,
  pwa: true,
  ios: true,
  android: false,
};
type S = typeof DEFAULTS;

async function render(src: ImageBitmap, size: number, s: S, opts: { padding?: number; bg?: string; radius?: number } = {}) {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const bg = opts.bg ?? s.bg;
  const radius = ((opts.radius ?? s.radius) / 100) * size * 0.5;
  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, radius);
    ctx.clip();
  }
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const pad = ((opts.padding ?? s.padding) / 100) * size;
  const box = size - pad * 2;
  const k = s.fit === 'cover' ? Math.max(box / src.width, box / src.height) : Math.min(box / src.width, box / src.height);
  const w = src.width * k;
  const h = src.height * k;
  ctx.imageSmoothingQuality = 'high';
  if (s.fit === 'cover') {
    ctx.beginPath();
    ctx.rect(pad, pad, box, box);
    ctx.clip();
  }
  ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
  ctx.restore();
  return c;
}

async function buildIco(src: ImageBitmap, s: S) {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map(async (n) => {
      const b = await (await render(src, n, s)).convertToBlob({ type: 'image/png' });
      return new Uint8Array(await b.arrayBuffer());
    }),
  );
  const header = 6 + 16 * sizes.length;
  const out = new Uint8Array(header + pngs.reduce((a, p) => a + p.length, 0));
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, sizes.length, true);
  let off = header;
  sizes.forEach((n, i) => {
    const e = 6 + i * 16;
    out[e] = n;
    out[e + 1] = n;
    dv.setUint16(e + 4, 1, true);
    dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, pngs[i].length, true);
    dv.setUint32(e + 12, off, true);
    out.set(pngs[i], off);
    off += pngs[i].length;
  });
  return new Blob([out], { type: 'image/x-icon' });
}

const png = async (c: OffscreenCanvas) => c.convertToBlob({ type: 'image/png' });

async function buildSet(v: Version, s: S): Promise<OutFile[]> {
  const src = await createImageBitmap(v.blob);
  const files: OutFile[] = [];
  try {
    if (s.web) {
      files.push({ name: 'favicon.ico', blob: await buildIco(src, s) });
      files.push({ name: 'favicon-16x16.png', blob: await png(await render(src, 16, s)) });
      files.push({ name: 'favicon-32x32.png', blob: await png(await render(src, 32, s)) });
      files.push({ name: 'favicon-96x96.png', blob: await png(await render(src, 96, s)) });
    }
    if (s.ios || s.web) {
      const appleBg = s.bg === 'transparent' ? s.themeColor : s.bg;
      files.push({ name: 'apple-touch-icon.png', blob: await png(await render(src, 180, s, { bg: appleBg, radius: 0 })) });
    }
    if (s.pwa) {
      files.push({ name: 'icon-192.png', blob: await png(await render(src, 192, s)) });
      files.push({ name: 'icon-512.png', blob: await png(await render(src, 512, s)) });
      const maskBg = s.bg === 'transparent' ? s.themeColor : s.bg;
      // Maskable icons get cropped to a circle on Android, so the logo must sit inside the inner 80% safe zone.
      files.push({ name: 'icon-maskable-512.png', blob: await png(await render(src, 512, s, { bg: maskBg, padding: Math.max(s.padding, 12) + 8, radius: 0 })) });
      const manifest = {
        name: s.name,
        short_name: s.name.slice(0, 12),
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        theme_color: s.themeColor,
        background_color: s.themeColor,
        display: 'standalone',
      };
      files.push({ name: 'site.webmanifest', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/manifest+json' }) });
    }
    if (s.ios) {
      const bg = s.bg === 'transparent' ? s.themeColor : s.bg;
      for (const n of [1024, 180, 167, 152, 120, 87, 80, 60, 58, 40]) files.push({ name: `ios/AppIcon-${n}.png`, blob: await png(await render(src, n, s, { bg, radius: 0 })) });
    }
    if (s.android) {
      const dens: [string, number][] = [
        ['mdpi', 48],
        ['hdpi', 72],
        ['xhdpi', 96],
        ['xxhdpi', 144],
        ['xxxhdpi', 192],
      ];
      for (const [d, n] of dens) files.push({ name: `android/mipmap-${d}/ic_launcher.png`, blob: await png(await render(src, n, s)) });
      files.push({ name: 'android/playstore-icon-512.png', blob: await png(await render(src, 512, s, { bg: s.bg === 'transparent' ? s.themeColor : s.bg })) });
    }
  } finally {
    src.close();
  }
  return files;
}

const SNIPPET = (s: S) =>
  [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    s.pwa && '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${s.themeColor}">`,
  ]
    .filter(Boolean)
    .join('\n');

export default function Icons() {
  const tool = toolById('icons')!;
  const [s, set] = useToolSettings('icons', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const [prev, setPrev] = useState<{ big?: Blob; small?: Blob; mask?: Blob }>({});
  const [busy, setBusy] = useState(false);
  const big = useObjectUrl(prev.big);
  const small = useObjectUrl(prev.small);
  const mask = useObjectUrl(prev.mask);

  useEffect(() => {
    if (!v) return;
    let alive = true;
    (async () => {
      const src = await createImageBitmap(v.blob);
      const out = {
        big: await png(await render(src, 256, s)),
        small: await png(await render(src, 32, s)),
        mask: await png(await render(src, 256, s, { bg: s.bg === 'transparent' ? s.themeColor : s.bg, padding: Math.max(s.padding, 12) + 8, radius: 0 })),
      };
      src.close();
      if (alive) setPrev(out);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [v?.id, s.fit, s.padding, s.bg, s.radius, s.themeColor]);

  const download = async () => {
    if (!v || !item) return;
    setBusy(true);
    try {
      const files = await buildSet(v, s);
      files.push({ name: 'cara-pakai.html.txt', blob: new Blob([SNIPPET(s)], { type: 'text/plain' }) });
      downloadBlob(await makeZip(files), `${item.name}-ikon.zip`);
      haptic('success');
      toast({ kind: 'success', title: `${files.length} file ikon diunduh` });
    } catch (e) {
      toast({ kind: 'error', title: 'Gagal membuat ikon', body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell
      tool={tool}
      stage={
        <div className="flex h-full flex-wrap items-center justify-center gap-8 bg-stage p-6">
          <figure className="text-center">
            <div className="checker size-40 overflow-hidden rounded-md shadow sm:size-48">{big && <img src={big} alt="Ikon" className="size-full" />}</div>
            <figcaption className="mt-2 text-xs text-muted">Ikon aplikasi</figcaption>
          </figure>
          <figure className="text-center">
            <div className="relative size-40 overflow-hidden rounded-full shadow sm:size-48">{mask && <img src={mask} alt="Maskable" className="size-full" />}</div>
            <figcaption className="mt-2 text-xs text-muted">Android (dipotong lingkaran)</figcaption>
          </figure>
          <figure className="text-center">
            <div className="flex h-10 w-56 items-center gap-2 rounded-t-lg bg-surface px-3 shadow">
              {small && <img src={small} alt="Favicon" className="size-4" />}
              <span className="truncate text-xs">{s.name}</span>
            </div>
            <figcaption className="mt-2 text-xs text-muted">Tab browser</figcaption>
          </figure>
        </div>
      }
      panel={
        <>
          <Section title="Bentuk">
            <Segmented
              value={s.fit}
              onChange={(fit) => set({ fit })}
              options={[
                { value: 'contain', label: 'Utuh' },
                { value: 'cover', label: 'Penuhi kotak' },
              ]}
            />
            <Slider label="Jarak tepi" value={s.padding} min={0} max={30} unit="%" onChange={(padding) => set({ padding })} defaultValue={8} />
            <Slider label="Sudut bulat" value={s.radius} min={0} max={100} unit="%" onChange={(radius) => set({ radius })} defaultValue={0} />
            <Field label="Latar">
              <ColorInput value={s.bg} onChange={(bg) => set({ bg })} allowTransparent />
            </Field>
          </Section>
          <Section title="Paket">
            <div className="flex flex-wrap gap-2">
              <Chip active={s.web} onClick={() => set({ web: !s.web })}>
                Favicon web
              </Chip>
              <Chip active={s.pwa} onClick={() => set({ pwa: !s.pwa })}>
                PWA + manifest
              </Chip>
              <Chip active={s.ios} onClick={() => set({ ios: !s.ios })}>
                iOS
              </Chip>
              <Chip active={s.android} onClick={() => set({ android: !s.android })}>
                Android mipmap
              </Chip>
            </div>
            <Field label="Nama aplikasi">
              <TextInput value={s.name} onChange={(name) => set({ name })} label="Nama aplikasi" />
            </Field>
            <Field label="Warna tema" hint="Dipakai untuk latar ikon iOS & Android bila latar transparan.">
              <ColorInput value={s.themeColor} onChange={(themeColor) => set({ themeColor })} />
            </Field>
          </Section>
          <Section title="Kode HTML" collapsible defaultOpen={false}>
            <pre className={cx('overflow-auto rounded-md bg-surface-2 p-2.5 font-mono text-[11px]')}>{SNIPPET(s)}</pre>
            <Button size="sm" icon={CopyIcon} onClick={() => navigator.clipboard?.writeText(SNIPPET(s)).then(() => toast({ kind: 'success', title: 'Disalin' }))}>
              Salin
            </Button>
          </Section>
        </>
      }
      footer={
        <Button variant="primary" size="lg" block icon={DownloadSimpleIcon} loading={busy} disabled={!v || !(s.web || s.pwa || s.ios || s.android)} onClick={download}>
          Unduh paket ikon (ZIP)
        </Button>
      }
    />
  );
}
