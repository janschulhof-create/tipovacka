import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';
import { SideRail, BottomNav } from '@/components/Nav';
import { BrandMark } from '@/components/Brand';
import { AuthStatus } from '@/components/AuthStatus';
import { getSessionPlayer } from '@/lib/auth';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

// Jen řezy, které se opravdu používají → místo velkých variabilních souborů
// (jeden měl 85 kB) se stáhnou malé statické. Šetří ~100 kB při startu.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
// Nadpisový font nepreloadujeme – text se díky display:swap vykreslí hned
// náhradním fontem a Oswald se doplní, jakmile dorazí.
const oswald = Oswald({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'Tipovačka',
  description: 'Soukromá fotbalová tipovačka',
  applicationName: 'Tipovačka',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Tipovačka' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
  // maximumScale záměrně NEnastavujeme – blokovalo by přiblížení dvěma prsty.
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const player = await getSessionPlayer();
  return (
    <html lang="cs" className={`${inter.variable} ${oswald.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <ServiceWorkerRegister />
        <SideRail />

        {/* přihlašovací stav – desktop (vpravo nahoře) */}
        <div className="fixed right-4 top-4 z-40 hidden lg:flex">
          <AuthStatus player={player} />
        </div>

        {/* horní brand lišta jen na mobilu */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-terrain-700 bg-terrain-900/80 px-4 py-3 backdrop-blur lg:hidden">
          <Link prefetch={false} href="/" className="flex items-center gap-2">
            <BrandMark className="h-7 w-7" />
            <span className="font-display text-base font-semibold tracking-wide text-white">
              Tipovačka
            </span>
          </Link>
          <AuthStatus player={player} className="ml-auto" />
        </header>

        <div className="relative z-10 lg:pl-60">
          <div className="mx-auto max-w-5xl px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-16">
            {children}
          </div>
        </div>

        <BottomNav />
      </body>
    </html>
  );
}
