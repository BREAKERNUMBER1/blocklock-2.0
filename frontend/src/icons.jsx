// Small inline SVG icon set — no external font/CDN dependency, so these
// render identically everywhere (unlike emoji, which need a system emoji
// font that isn't guaranteed to be installed, especially on Linux desktops).

export function LockIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7.5a4 4 0 1 1 8 0V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function UnlockIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7.5a4 4 0 0 1 7.6-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function WalletIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="14" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function LinkIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9.5 14.5l5-5M10.5 8l1-1a3.5 3.5 0 0 1 5 5l-1 1M13.5 16l-1 1a3.5 3.5 0 0 1-5-5l1-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
