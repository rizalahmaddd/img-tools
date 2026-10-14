import { create } from 'zustand';
import { isIOS, isStandalone } from './device';

interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const useInstall = create<{ event: BIPEvent | null; installed: boolean }>(() => ({
  event: null,
  installed: typeof window !== 'undefined' && isStandalone(),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ event: e as BIPEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ event: null, installed: true }));
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'ios' | 'unavailable'> {
  const e = useInstall.getState().event;
  if (e) {
    await e.prompt();
    const r = await e.userChoice;
    useInstall.setState({ event: null });
    return r.outcome;
  }
  return isIOS() ? 'ios' : 'unavailable';
}

export const canInstall = () => !!useInstall.getState().event || (isIOS() && !isStandalone());
