import './globals.css';
import PhoneNavigator from './PhoneNavigator';
import PhoneNotifications from './PhoneNotifications';

export const metadata = {
  title: 'PRIVATE LIFE',
  description: 'Simulador social narrativo',
  manifest: '/manifest.webmanifest',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#08090d' };

export default function RootLayout({ children }) {
  return <html lang="es"><head><link rel="stylesheet" href="/enhancer.css"/><link rel="stylesheet" href="/notifications.css"/><link rel="stylesheet" href="/notes-app.css"/></head><body><PhoneNavigator/><PhoneNotifications/>{children}<script src="/enhancer.js" defer></script><script src="/notes-app.js" defer></script></body></html>;
}
