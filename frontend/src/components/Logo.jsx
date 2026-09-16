/**
 * Raktasetu wordmark: a blood drop resting on a bridge span.
 * "Rakta" (blood) + "setu" (bridge) — the mark is the product idea in one shape.
 */
export default function Logo({ size = 46, withWord = true }) {
  return (
    <span className="brand">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Raktasetu logo" role="img">
        <path
          d="M16 2.6c5.1 6.6 8.1 10.8 8.1 14.5a8.1 8.1 0 0 1-16.2 0C7.9 13.4 10.9 9.2 16 2.6z"
          fill="currentColor"
        />
        <path d="M4 24.4h24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8.5 24.4c1.9-3.4 5.6-3.4 7.5 0 1.9-3.4 5.6-3.4 7.5 0" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      </svg>
      {withWord && <span>RedNexus</span>}
    </span>
  );
}
