import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Inter, Oswald } from 'next/font/google';
import './globals.css';
import { SideRail, BottomNav } from '@/components/Nav';
import { BrandMark } from '@/components/Brand';

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
const oswald = Oswald({ subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: 'Tipovačka',
  description: 'Soukromá fotbalová tipovačka',
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${inter.variable} ${oswald.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <SideRail />

        {/* horní brand lišta jen na mobilu */}
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-terrain-700 bg-terrain-900/80 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-7 w-7" />
            <span className="font-display text-base font-semibold tracking-wide text-white">
              Tipovačka
            </span>
          </Link>
        </header>

        <div className="relative z-10 lg:pl-60">
          <div className="mx-auto max-w-5xl px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-8">
            {children}
          </div>
        </div>

        <BottomNav />
      </body>
    </html>
  );
}
