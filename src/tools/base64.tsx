import { useEffect, useState } from 'react';
import { CopyIcon, PlusIcon } from '@phosphor-icons/react';
import { ToolShell } from '@/components/ToolShell';
import { Button, Notice, Section, Segmented } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem, useWorkspace } from '@/store/workspace';
import { toast } from '@/store/ui';
import { importFiles, pickFiles } from '@/lib/importer';
import { formatBytes } from '@/lib/format';
import { useObjectUrl } from '@/lib/hooks';
import { extFromMime, sniffMime } from '@/engine/formats';
import { Thumb } from '@/components/Filmstrip';
import { toolById } from './registry';

const DEFAULTS = { mode: 'encode' as 'encode' | 'decode', style: 'dataurl' as 'dataurl' | 'raw' | 'css' | 'html' | 'md' };

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

function decode(text: string): Blob | null {
  const t = text.trim().replace(/^url\(["']?|["']?\)$/g, '');
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(t);
  const b64 = (m ? m[3] : t).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length < 8) return null;
  try {
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m?.[1] ?? '' });
  } catch {
    return null;
  }
}

export default function Base64() {
  const tool = toolById('base64')!;
  const [s, set] = useToolSettings('base64', DEFAULTS);
  const item = useActiveItem();
  const hasItems = useWorkspace((x) => x.items.length > 0);
  const v = item ? current(item) : null;
  const [encoded, setEncoded] = useState('');
  const [input, setInput] = useState('');
  const [decoded, setDecoded] = useState<{ blob: Blob; mime: string } | null>(null);
  const decodedUrl = useObjectUrl(decoded?.blob);

  useEffect(() => {
    if (!v || s.mode !== 'encode') return;
    blobToDataUrl(v.blob).then(setEncoded);
  }, [v?.id, s.mode]);

  useEffect(() => {
    if (s.mode !== 'decode') return;
    const b = decode(input);
    if (!b) return setDecoded(null);
    sniffMime(b).then((mime) => setDecoded(mime.startsWith('image/') ? { blob: new Blob([b], { type: mime }), mime } : null));
  }, [input, s.mode]);

  const out = (() => {
    if (!encoded) return '';
    const raw = encoded.split(',')[1] ?? '';
    switch (s.style) {
      case 'raw':
        return raw;
      case 'css':
        return `background-image: url("${encoded}");`;
      case 'html':
        return `<img src="${encoded}" alt="${item?.name ?? ''}" width="${v?.width}" height="${v?.height}">`;
      case 'md':
        return `![${item?.name ?? ''}](${encoded})`;
      default:
        return encoded;
    }
  })();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out);
      toast({ kind: 'success', title: 'Disalin ke clipboard', body: formatBytes(out.length) });
    } catch {
      toast({ kind: 'error', title: 'Tidak bisa menyalin, teks terlalu besar atau izin ditolak' });
    }
  };

  return (
    <ToolShell
      tool={tool}
      needsImage={false}
      filmstrip={s.mode === 'encode'}
      stage={
        <div className="scroll-thin h-full overflow-y-auto bg-stage p-4">
          <div className="mx-auto max-w-2xl space-y-3">
            <Segmented
              value={s.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'encode', label: 'Gambar → Base64' },
                { value: 'decode', label: 'Base64 → Gambar' },
              ]}
            />
            {s.mode === 'encode' ? (
              v && item ? (
                <>
                  <div className="flex items-center gap-3 rounded-md bg-surface p-3">
                    <Thumb item={item} className="size-12 shrink-0 rounded-sm" />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-muted">
                        {formatBytes(v.size)} → {formatBytes(out.length)} teks
                      </p>
                    </div>
                  </div>
                  <textarea readOnly value={out.length > 400_000 ? `${out.slice(0, 400_000)}\n…(terpotong di tampilan, salin untuk teks lengkap)` : out} className="h-[40dvh] w-full resize-none rounded-md border border-line bg-surface p-3 font-mono text-[11px]" aria-label="Hasil Base64" />
                  {v.size > 100 * 1024 && <Notice kind="warn">Base64 ±33% lebih besar dari file aslinya. Untuk gambar di atas 100 KB biasanya lebih baik pakai file biasa.</Notice>}
                </>
              ) : (
                <div className="rounded-md bg-surface p-6 text-center">
                  <p className="text-sm text-muted">Belum ada gambar.</p>
                  <Button className="mt-3" variant="primary" icon={PlusIcon} onClick={async () => importFiles(await pickFiles())}>
                    Pilih gambar
                  </Button>
                </div>
              )
            ) : (
              <>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tempel data:image/png;base64,… atau teks Base64 saja" className="h-48 w-full resize-y rounded-md border border-line bg-surface p-3 font-mono text-[11px] outline-none focus:border-accent" aria-label="Input Base64" />
                {input.trim() && !decoded && <Notice kind="error">Teks ini bukan Base64 gambar yang valid.</Notice>}
                {decoded && decodedUrl && (
                  <div className="checker flex justify-center rounded-md p-4">
                    <img src={decodedUrl} alt="Hasil decode" className="max-h-72 max-w-full" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      }
      panel={
        s.mode === 'encode' ? (
          <Section title="Bentuk keluaran">
            <Segmented
                            value={s.style}
              onChange={(style) => set({ style })}
              options={[
                { value: 'dataurl', label: 'Data URL' },
                { value: 'raw', label: 'Base64 saja' },
                { value: 'css', label: 'CSS' },
                { value: 'html', label: 'HTML' },
                { value: 'md', label: 'Markdown' },
              ]}
            />
            <p className="text-xs text-muted">Kecilkan dulu dengan Kompres agar teksnya lebih pendek.</p>
          </Section>
        ) : (
          <Section title="Hasil">
            <p className="text-sm text-muted">{decoded ? `${decoded.mime.replace('image/', '').toUpperCase()} · ${formatBytes(decoded.blob.size)}` : 'Tempel teks di sebelah.'}</p>
          </Section>
        )
      }
      footer={
        s.mode === 'encode' ? (
          <Button variant="primary" size="lg" block icon={CopyIcon} disabled={!out || !hasItems} onClick={copy}>
            Salin
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            icon={PlusIcon}
            disabled={!decoded}
            onClick={() => decoded && importFiles([new File([decoded.blob], `base64.${extFromMime(decoded.mime)}`, { type: decoded.mime })])}
          >
            Tambahkan ke Berkas
          </Button>
        )
      }
    />
  );
}
