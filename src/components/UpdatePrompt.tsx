import { useEffect } from 'react';
import { toast } from '@/store/ui';

export function UpdatePrompt() {
  useEffect(() => {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    let shown = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || shown) return;
      shown = true;
      toast({
        title: 'Versi baru sudah terpasang',
        body: 'Muat ulang untuk memakainya. Berkas tidak hilang.',
        duration: 0,
        actions: [{ label: 'Muat ulang', run: () => location.reload() }],
      });
    });
    import('virtual:pwa-register').then(({ registerSW }) => {
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          if (shown) return;
          shown = true;
          toast({
            title: 'Versi baru siap',
            body: 'Muat ulang untuk memperbarui. Berkas tidak hilang.',
            duration: 0,
            actions: [{ label: 'Perbarui', run: () => update(true) }],
          });
        },
        onOfflineReady() {
          toast({ kind: 'success', title: 'Siap dipakai offline' });
        },
      });
    });
  }, []);
  return null;
}
