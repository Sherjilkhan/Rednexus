import { useEffect } from 'react';

export const Stat = ({ label, value, foot }) => (
  <div className="stat">
    <div className="label">{label}</div>
    <div className="value mono">{value}</div>
    {foot && <div className="foot">{foot}</div>}
  </div>
);

export const Pill = ({ tone = 'grey', children }) => <span className={`pill pill-${tone}`}>{children}</span>;

export const Group = ({ children }) => <span className="group-chip">{children}</span>;

export const Empty = ({ title, children }) => (
  <div className="empty">
    <h4>{title}</h4>
    {children && <div className="small">{children}</div>}
  </div>
);

export const Loading = ({ rows = 3 }) => (
  <div className="stack-sm" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skeleton" style={{ width: `${100 - i * 12}%` }} />
    ))}
  </div>
);

export const STATES = ['DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED'];

export function StateRail({ state, origin }) {
  const visible = origin === 'MANUAL' ? STATES.slice(1) : STATES;
  const idx = visible.indexOf(state);
  return (
    <div className="rail">
      {visible.map((s, i) => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className={`rail-step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}`}>{s}</span>
          {i < visible.length - 1 && <span className="rail-arrow">›</span>}
        </span>
      ))}
    </div>
  );
}

export const originTone = (o) => (o === 'THRESHOLD_BREACH' ? 'red' : o === 'SCHEDULED' ? 'blue' : 'amber');
export const stateTone = (s) =>
  s === 'DETECTED' ? 'amber' : s === 'CLOSED' ? 'grey' : ['DONATED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED'].includes(s) ? 'green' : 'red';

export function Modal({ title, children, onClose, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h3>{title}</h3>
          <button className="btn-quiet btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
        {footer && <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

// Backend messages embed machine dates (YYYY-MM-DD). Show them the way a donor reads dates.
export const humaniseDates = (text) =>
  typeof text === 'string' ? text.replace(/\d{4}-\d{2}-\d{2}/g, (m) => fmtDate(m)) : text;
