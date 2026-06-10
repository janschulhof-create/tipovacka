/** Logo: kompasová růžice (orientační běh) se vsazeným míčem (fotbal). */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Tipovačka">
      <circle cx="24" cy="24" r="22" fill="#0f241a" stroke="#173324" strokeWidth="2" />
      {/* kompasová střelka sever (oranžová kontrolka) / jih (bílá) */}
      <path d="M24 6 L29 24 L24 21 L19 24 Z" fill="#ff5a2c" />
      <path d="M24 42 L19 24 L24 27 L29 24 Z" fill="#e7f3ec" opacity="0.85" />
      {/* středový míč */}
      <circle cx="24" cy="24" r="6" fill="#22c55e" />
      <circle cx="24" cy="24" r="6" fill="none" stroke="#06120d" strokeWidth="1" />
      <path d="M24 19 l1.8 1.3 -0.7 2.1 -2.2 0 -0.7 -2.1 Z" fill="#06120d" />
    </svg>
  );
}
