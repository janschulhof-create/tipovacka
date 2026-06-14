/** Logo: kompasová růžice (orientační běh) se vsazeným fotbalovým míčem. */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Tipovačka">
      <circle cx="32" cy="32" r="30" fill="#0f1830" stroke="#ffffff14" strokeWidth="1"/><circle cx="32" cy="32" r="25" fill="none" stroke="#ffffff26" strokeWidth="1.6"/><path d="M32 7 L36.8 19 L27.2 19 Z" fill="#ff5a2c"/><path d="M32 57 L36.8 45 L27.2 45 Z" fill="#f1f5fb"/><clipPath id="tipBall"><circle cx="32" cy="31.5" r="11.8"/></clipPath><g clipPath="url(#tipBall)"><rect x="18.2" y="17.7" width="27.6" height="27.6" fill="#fbfbf8"/><path d="M32.00 27.02 L36.26 30.11 L34.64 35.13 L29.36 35.13 L27.74 30.11 Z" fill="#12171e"/><path d="M40.88 19.28 L42.42 24.03 L38.38 26.97 L34.34 24.03 L35.88 19.28 Z" fill="#12171e"/><path d="M46.36 36.17 L42.32 39.10 L38.28 36.17 L39.83 31.42 L44.82 31.42 Z" fill="#12171e"/><path d="M32.00 46.60 L27.96 43.67 L29.50 38.92 L34.50 38.92 L36.04 43.67 Z" fill="#12171e"/><path d="M17.64 36.17 L19.18 31.42 L24.17 31.42 L25.72 36.17 L21.68 39.10 Z" fill="#12171e"/><path d="M23.12 19.28 L28.12 19.28 L29.66 24.03 L25.62 26.97 L21.58 24.03 Z" fill="#12171e"/></g><circle cx="32" cy="31.5" r="11.8" fill="none" stroke="#0f1830" strokeWidth="1.1"/>
    </svg>
  );
}
