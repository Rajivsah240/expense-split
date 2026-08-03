/** The app logo: a disc split three ways, matching the installed icon. */
export function AppMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Expense Split">
        <defs>
          <linearGradient id="appMarkBrand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6e5cf7" />
            <stop offset="1" stopColor="#4736d9" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx={size >= 48 ? 14.4 : 15.5} fill="url(#appMarkBrand)" />
        <g fill="#fff" stroke="url(#appMarkBrand)" strokeWidth="3.7">
          <path d="M32 32 L32 10.6 A21.4 21.4 0 0 1 50.5 42.7 Z" />
          <path d="M32 32 L50.5 42.7 A21.4 21.4 0 0 1 13.5 42.7 Z" opacity=".86" />
          <path d="M32 32 L13.5 42.7 A21.4 21.4 0 0 1 32 10.6 Z" opacity=".72" />
        </g>
      </svg>
    </span>
  );
}
