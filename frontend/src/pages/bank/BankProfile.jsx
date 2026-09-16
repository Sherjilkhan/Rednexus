import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Loading } from '../../components/ui.jsx';

export default function BankProfile() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    api('/bank/profile').then(d => {
      setForm({
        name:  d.name  || '',
        email: d.email || '',
        phone: d.phone || '',
      });
    }).catch(() => {
      // Fallback to user data from auth token
      setForm({ name: user.name || '', email: user.email || '', phone: user.phone || '' });
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/bank/profile', { method: 'PUT', body: { name: form.name, phone: form.phone } });
      toast('Profile updated ✓', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { setBusy(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast('Passwords do not match', 'err'); return; }
    if (pwForm.next.length < 6) { toast('Password must be at least 6 characters', 'err'); return; }
    setPwBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { current_password: pwForm.current, new_password: pwForm.next } });
      setPwForm({ current: '', next: '', confirm: '' });
      toast('Password changed ✓', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { setPwBusy(false); }
  }

  if (!form) return <div className="wrap section"><Loading rows={4} /></div>;

  return (
    <div className="wrap wrap-narrow section stack">
      <div>
        <span className="eyebrow">Account</span>
        <h1 style={{ margin: '8px 0 4px' }}>My profile</h1>
        <p className="small muted">Update your staff account details.</p>
      </div>

      {/* ── Staff details ─────────────────────────────────── */}
      <div className="card stack">
        <h4 style={{ margin: 0 }}>Institution</h4>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div className="xs muted" style={{ marginBottom: 4 }}>Blood bank</div>
            <div style={{ fontWeight: 600 }}>{user.institution_name || '—'}</div>
          </div>
          <div>
            <div className="xs muted" style={{ marginBottom: 4 }}>Role</div>
            <div style={{ fontWeight: 600 }}>Blood bank staff</div>
          </div>
          <div>
            <div className="xs muted" style={{ marginBottom: 4 }}>Verification</div>
            <div style={{ fontWeight: 600, color: user.institution_verified ? '#16a34a' : '#b91c1c' }}>
              {user.institution_verified ? '✓ Verified' : 'Pending verification'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Personal details ─────────────────────────────── */}
      <form className="card stack" onSubmit={save}>
        <h4 style={{ margin: 0 }}>Personal details</h4>
        <div className="grid grid-2" style={{ gap: 16 }}>
          <div className="field">
            <label>Full name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Mobile number</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="field">
            <label>Email <span className="muted">(read-only)</span></label>
            <input value={form.email} disabled style={{ opacity: 0.6 }} />
          </div>
        </div>
        <div className="row">
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>

      {/* ── Change password ───────────────────────────────── */}
      <form className="card stack" onSubmit={changePassword}>
        <h4 style={{ margin: 0 }}>Change password</h4>
        <div className="grid grid-2" style={{ gap: 16 }}>
          <div className="field">
            <label>Current password</label>
            <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} required />
          </div>
          <div style={{}} />
          <div className="field">
            <label>New password</label>
            <input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} minLength={6} required />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} minLength={6} required />
          </div>
        </div>
        <div className="row">
          <button className="btn-ghost" type="submit" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update password'}</button>
        </div>
      </form>
    </div>
  );
}
