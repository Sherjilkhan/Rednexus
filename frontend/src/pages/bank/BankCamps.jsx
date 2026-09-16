import { useEffect, useRef, useState } from 'react';
import { api, API_BASE } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { Empty, Loading, Pill, fmtDate } from '../../components/ui.jsx';

/**
 * BankCamps — staff view.
 * Each camp gets a QR code (generated via qrserver.com CDN) that can be
 * copied as an image or downloaded. Scanning it opens /camp-register?camp=…
 */

function campLink(camp) {
  const base = window.location.origin;
  return `${base}/#/camp-register?camp=${camp.id}&institution=${camp.blood_bank_institution_id}`;
}

function QRPanel({ camp, onClose }) {
  const link = campLink(camp);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(link)}`;
  const toast = useToast();
  const imgRef = useRef(null);

  async function copyImage() {
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('QR image copied to clipboard ✓', 'ok');
    } catch {
      toast('Could not copy — try Download instead', 'err');
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(link);
    toast('Link copied ✓', 'ok');
  }

  function download() {
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `camp-qr-${camp.id.slice(0, 8)}.png`;
    a.click();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{camp.location}</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{fmtDate(camp.date)} · {camp.start_time}–{camp.end_time}</div>
        </div>

        {/* QR Image */}
        <div style={{
          background: '#fff', border: '2px solid #fee2e2', borderRadius: 12,
          padding: 12, display: 'inline-block', marginBottom: 16,
        }}>
          <img
            ref={imgRef}
            src={qrUrl}
            alt="Camp QR Code"
            width={200}
            height={200}
            style={{ display: 'block' }}
          />
        </div>

        {/* Shareable link */}
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 11, color: '#374151', wordBreak: 'break-all',
          marginBottom: 16, textAlign: 'left',
        }}>
          {link}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary btn-sm" onClick={copyImage}>📋 Copy QR image</button>
          <button className="btn-ghost btn-sm" onClick={download}>⬇ Download QR</button>
          <button className="btn-ghost btn-sm" onClick={copyLink}>🔗 Copy link</button>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
          Donors who scan this QR are taken directly to the camp registration form.
        </div>

        <button
          onClick={onClose}
          style={{ marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function BankCamps() {
  const toast = useToast();
  const [camps, setCamps] = useState(null);
  const [form, setForm] = useState({
    date: '', start_time: '09:30', end_time: '16:00',
    location: '', pincode: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [qrCamp, setQrCamp] = useState(null); // camp to show QR for

  const load = () => api('/bank/camps').then(d => setCamps(d.camps));
  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/bank/camps', {
        method: 'POST',
        body: { ...form, pincode: form.pincode || null, notes: form.notes || null },
      });
      setForm({ date: '', start_time: '09:30', end_time: '16:00', location: '', pincode: '', notes: '' });
      await load();
      toast('Camp posted — donors can see it now', 'ok');
    } catch (err) {
      toast(err.details?.map(x => x.message).join(', ') || err.message, 'err');
    } finally { setBusy(false); }
  }

  return (
    <div className="wrap section stack">
      <div>
        <span className="eyebrow">F10 · camp directory</span>
        <h1 style={{ margin: '8px 0 4px' }}>Your camps</h1>
        <p className="small muted">Every camp gets a QR code — share or download it so donors can register directly.</p>
      </div>

      {/* ── Post new camp ──────────────────────────── */}
      <form className="card" onSubmit={submit}>
        <h4 style={{ margin: '0 0 16px' }}>Post a new camp</h4>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Location</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} required placeholder="Hall name, area, city" />
          </div>
          <div className="field">
            <label>Starts</label>
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div className="field">
            <label>Ends</label>
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>
          <div className="field">
            <label>PIN code</label>
            <input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} placeholder="411001" />
          </div>
          <div className="field">
            <label>Note for donors</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Plain language, no jargon" />
          </div>
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post camp'}</button>
      </form>

      {/* ── Camp list ──────────────────────────────── */}
      <div className="card">
        <div className="card-head"><h4>Posted camps</h4></div>
        {camps === null ? <Loading rows={3} /> : camps.length === 0 ? <Empty title="No camps posted yet" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Location</th>
                  <th>Hours</th>
                  <th className="num">Attending</th>
                  <th>QR / Link</th>
                </tr>
              </thead>
              <tbody>
                {camps.map(c => (
                  <tr key={c.id}>
                    <td>
                      {fmtDate(c.date)}
                      {c.date < new Date().toISOString().slice(0, 10) && (
                        <Pill tone="grey" style={{ marginLeft: 6 }}>past</Pill>
                      )}
                    </td>
                    <td>{c.location}</td>
                    <td className="small">{c.start_time}–{c.end_time}</td>
                    <td className="num">{c.attendee_count}</td>
                    <td>
                      <button
                        className="btn-sm btn-primary"
                        onClick={() => setQrCamp(c)}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                         Show QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── QR popup ───────────────────────────────── */}
      {qrCamp && <QRPanel camp={qrCamp} onClose={() => setQrCamp(null)} />}
    </div>
  );
}