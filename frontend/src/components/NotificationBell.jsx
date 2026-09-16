import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function urgencyMeta(urgency, response) {
  if (response === 'ACCEPTED') return { color: '#16a34a', label: 'Accepted' };
  if (response === 'DECLINED') return { color: '#6b7280', label: 'Declined' };
  if (urgency === 'HIGH')      return { color: '#dc2626', label: 'Urgent' };
  if (urgency === 'LOW')       return { color: '#2563eb', label: 'Scheduled' };
  return { color: '#b91c1c', label: 'Needed' };
}

// ── NotifItem ─────────────────────────────────────────────────────────────────

function NotifItem({ notif, onNavigate }) {
  const navigate = useNavigate();
  const meta = urgencyMeta(notif.urgency, notif.response);
  const isUnread = notif.response === 'PENDING';

  return (
    <button
      onClick={() => { onNavigate(); navigate(`/donor/requests`); }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
        padding: '11px 14px', background: isUnread ? '#fff5f5' : 'transparent',
        border: 'none', borderBottom: '1px solid var(--border, #f3f4f6)',
        cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = isUnread ? '#fee2e2' : 'var(--surface-1, #f9fafb)'}
      onMouseLeave={e => e.currentTarget.style.background = isUnread ? '#fff5f5' : 'transparent'}
    >
      {/* icon */}
      <span style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        background: isUnread ? '#fee2e2' : 'var(--surface-1, #f3f4f6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginTop: 1,
      }}>🩸</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* badges row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#b91c1c',
            background: '#fee2e2', borderRadius: 4, padding: '1px 5px',
          }}>{notif.blood_group}</span>
          <span style={{
            fontSize: 10, fontWeight: 500, color: meta.color,
            background: `${meta.color}18`, borderRadius: 4, padding: '1px 5px',
          }}>{meta.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted, #9ca3af)', whiteSpace: 'nowrap' }}>
            {timeAgo(notif.sent_at)}
          </span>
        </div>

        {/* message */}
        <p style={{
          margin: 0, fontSize: 12,
          color: isUnread ? 'var(--text, #111827)' : 'var(--muted, #4b5563)',
          lineHeight: 1.4, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>{notif.message}</p>

        {/* institution */}
        {notif.institution_name && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--muted, #6b7280)' }}>
            {notif.institution_name}
          </p>
        )}
      </div>

      {/* unread dot */}
      {isUnread && (
        <span style={{
          flexShrink: 0, width: 7, height: 7, borderRadius: '50%',
          background: '#dc2626', marginTop: 5,
        }} />
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 8 }}>
      <span style={{ fontSize: 28 }}>🩸</span>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text, #374151)' }}>No new requests</p>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #9ca3af)', textAlign: 'center' }}>
        You'll be notified when a blood bank needs your help.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * NotificationBell — drop into the donor AppBar.
 * Uses the project's api() helper (auth token injected automatically).
 * Props: pollMs (default 30000)
 */
export default function NotificationBell({ pollMs = 30000 }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [open, setOpen]                   = useState(false);
  const [error, setError]                 = useState(null);
  const popupRef = useRef(null);
  const bellRef  = useRef(null);
  const navigate = useNavigate();

  const unread = notifications.filter(n => n.response === 'PENDING');

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api('/donor/notifications');
      setNotifications(Array.isArray(data) ? data : data.notifications || []);
      setError(null);
    } catch {
      setError('Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, pollMs);
    return () => clearInterval(id);
  }, [fetchNotifications, pollMs]);

  useEffect(() => { if (open) fetchNotifications(); }, [open, fetchNotifications]);

  // ── close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        bellRef.current  && !bellRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>

      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => setOpen(v => !v)}
        aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
        aria-expanded={open}
        className="btn-ghost btn-sm"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          justifyContent: 'center', width: 36, height: 36, padding: 0,
          background: open ? '#fee2e2' : undefined,
          color: open ? '#b91c1c' : undefined,
          borderRadius: 8,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Badge */}
        {unread.length > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            minWidth: 15, height: 15, borderRadius: 8,
            background: '#dc2626', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
            border: '1.5px solid white',
          }}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 320, maxHeight: 460,
            background: 'var(--surface, white)',
            borderRadius: 12,
            border: '1px solid var(--border, #e5e7eb)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            zIndex: 1000,
            animation: 'notifDrop 0.15s ease-out',
          }}
        >
          <style>{`@keyframes notifDrop { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }`}</style>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px 10px', borderBottom: '1px solid var(--border, #f3f4f6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
              {unread.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#b91c1c',
                  background: '#fee2e2', borderRadius: 10, padding: '1px 6px',
                }}>{unread.length} new</span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="btn-ghost btn-sm"
              style={{ width: 24, height: 24, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && notifications.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--muted, #9ca3af)' }}>Loading…</div>
              : error
              ? <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#dc2626' }}>{error}</div>
              : notifications.length === 0
              ? <EmptyState />
              : notifications.map(n => (
                  <NotifItem key={n.id} notif={n} onNavigate={() => setOpen(false)} />
                ))
            }
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border, #f3f4f6)', padding: '9px 14px' }}>
              <button
                className="btn-ghost btn-sm btn-block"
                onClick={() => { setOpen(false); navigate('/donor/requests'); }}
              >
                View all requests
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
