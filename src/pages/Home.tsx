import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRightIcon, CameraIcon, ClipboardTextIcon, DownloadSimpleIcon, ImagesIcon, ShieldCheckIcon, WifiSlashIcon } from '@phosphor-icons/react';
import { useWorkspace } from '@/store/workspace';
import { importFiles, pickFiles } from '@/lib/importer';
import { isTouch } from '@/lib/device';
import { promptInstall, useInstall } from '@/lib/install';
import { isIOS, isStandalone } from '@/lib/device';
import { Thumb } from '@/components/Filmstrip';
import { SearchBox, ToolGrid } from '@/components/ToolPicker';
import { Button } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { pasteFromClipboard } from '@/components/GlobalInput';
import { Sheet } from '@/components/Sheet';
import { useDesktop } from '@/lib/hooks';

function ImportZone() {
  return (
    <section className="rounded-lg border border-dashed border-line-strong bg-surface p-5 md:p-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <h2 className="text-[22px] font-semibold leading-tight tracking-tight md:text-2xl">Olah gambar tanpa upload</h2>
          <p className="mt-1.5 text-sm text-muted">
            Masukkan satu atau ratusan gambar, lalu pilih alatnya. Hasil dari satu alat langsung bisa dilanjutkan ke alat lain.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:w-64">
          <Button variant="primary" size="lg" block icon={ImagesIcon} onClick={async () => importFiles(await pickFiles())}>
            Pilih gambar
          </Button>
          <div className="flex gap-2">
            {isTouch() && (
              <Button block icon={CameraIcon} onClick={async () => importFiles(await pickFiles({ capture: true, multiple: false }))}>
                Kamera
              </Button>
            )}
            <Button block icon={ClipboardTextIcon} onClick={pasteFromClipboard}>
              Tempel
            </Button>
          </div>
        </div>
      </div>
      <p className="mt-4 hidden text-xs text-muted md:block">Seret file, folder, atau PDF ke mana saja di jendela ini. JPG, PNG, WebP, AVIF, HEIC, GIF, TIFF, SVG, BMP, ICO.</p>
    </section>
  );
}

function Recent() {
  const items = useWorkspace((s) => s.items);
  if (!items.length) return null;
  const shown = items.slice(-8).reverse();
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Berkas aktif <span className="font-normal text-muted">· {items.length}</span>
        </h2>
        <Link to="/berkas" className="flex items-center gap-1 text-[13px] font-medium text-accent">
          Kelola <ArrowRightIcon size={14} />
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {shown.map((i) => (
          <Link key={i.id} to="/berkas" className="min-w-0" onClick={() => useWorkspace.getState().setActive(i.id)}>
            <Thumb item={i} className="aspect-square w-full rounded-md" />
            <span className="mt-1 block truncate text-[11px] text-muted">{i.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const desktop = useDesktop();
  const bip = useInstall((s) => s.event);
  const installed = useInstall((s) => s.installed);
  const [iosHelp, setIosHelp] = useState(false);
  const showInstall = !installed && !isStandalone() && (bip || isIOS());

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="pt-safe mx-auto max-w-5xl px-4 pb-12">
        <header className={`flex items-center justify-between ${desktop && !showInstall ? 'h-6' : 'h-14'}`}>
          {!desktop ? <Logo /> : <span />}
          {showInstall && (
            <Button
              size="sm"
              icon={DownloadSimpleIcon}
              onClick={async () => {
                const r = await promptInstall();
                if (r === 'ios') setIosHelp(true);
              }}
            >
              Pasang app
            </Button>
          )}
        </header>
        <ImportZone />
        <Recent />
        <section className="mt-8">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Semua alat</h2>
            <div className="sm:w-80">
              <SearchBox value={q} onChange={setQ} />
            </div>
          </div>
          <div className="-mx-2">
            <ToolGrid query={q} />
          </div>
        </section>
        <footer className="mt-10 grid gap-3 border-t border-line pt-5 text-[13px] text-muted sm:grid-cols-2">
          <p className="flex gap-2">
            <ShieldCheckIcon size={18} className="shrink-0 text-ok" />
            Gambar tidak pernah meninggalkan perangkat. Semua proses berjalan di browser.
          </p>
          <p className="flex gap-2">
            <WifiSlashIcon size={18} className="shrink-0" />
            Bisa dipakai offline setelah dibuka sekali. Model AI diunduh saat pertama dipakai.
          </p>
        </footer>
      </div>
      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title="Pasang di iPhone / iPad">
        <ol className="list-decimal space-y-2 px-4 pb-6 pl-9 text-sm">
          <li>Buka halaman ini di Safari.</li>
          <li>Ketuk tombol Bagikan (kotak dengan panah ke atas).</li>
          <li>Pilih “Tambah ke Layar Utama”, lalu ketuk Tambah.</li>
        </ol>
      </Sheet>
    </div>
  );
}
