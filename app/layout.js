import './globals.css';

export const metadata = {
  title: 'PRIVATE LIFE',
  description: 'Simulador social narrativo',
  manifest: '/manifest.webmanifest',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#08090d' };

export default function RootLayout({ children }) {
  return <html lang="es"><head><link rel="stylesheet" href="/enhancer.css"/></head><body>{children}<script src="/enhancer.js" defer></script></body></html>;
}
