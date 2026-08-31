// Emoji glyph coverage for 🪙 is inconsistent across browsers/fonts, and
// currency is the one always-visible stat on this screen, so it gets a
// guaranteed-to-render inline SVG instead of relying on an emoji font.
export function CoinIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <circle cx="13" cy="13" r="11" fill="var(--gold)" />
      <circle cx="13" cy="13" r="8" fill="none" stroke="var(--gold-soft)" strokeWidth="1.5" />
      <text x="13" y="17.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--gold-soft)">
        ₩
      </text>
    </svg>
  );
}
