import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker for full standalone & offline capabilities
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('PWA: Versi baru aplikasi tersedia');
  },
  onOfflineReady() {
    console.log('PWA: Aplikasi siap dijalankan secara mandiri / offline');
  },
});

// Google Maps Platform Quota Defense Listeners (Tier 1)
// Dispatches event when quota is exceeded or authentication failure occurs
(window as unknown as { gm_authFailure: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(<App />);
