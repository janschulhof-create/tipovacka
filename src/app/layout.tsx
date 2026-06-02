import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

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
    <html lang="cs">
      <body className="min-h-dvh">
        <div className="mx-auto max-w-md pb-20">{children}</div>

        {/* Spodní navigace – palec dosáhne na mobilu */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-around py-2 text-xs">
            <Link href="/" className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-200">
              <span className="text-lg">🏠</span>Domů
            </Link>
            <Link href="/tipovat" className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-200">
              <span className="text-lg">🎯</span>Tipovat
            </Link>
            <Link href="/sin-slavy" className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-200">
              <span className="text-lg">🏆</span>Síň slávy
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
