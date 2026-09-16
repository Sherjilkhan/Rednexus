import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Loading } from '../../components/ui.jsx';

const BLOOD_GROUPS = ['A+','A−','B+','B−','AB+','AB−','O+','O−'];

export default function DonorProfile() {
  const { user } = useAuth();
  const toast = useToast();
  const [donor, setDonor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    api('/donor/profile').then(d => {
      const dn = d.donor || d;
      setDonor(dn);
      setForm({
        name:        dn.name || '',
        contact_phone: dn.contact_phone || '',
        area_pincode:  dn.area_pincode || '',
        blood_group:   dn.blood_group_self_reported || '',
        gender:        dn.gender || '',
        date_of_birth: dn.date_of_birth || '',
        occupation:    dn.occupation || '',
        address:       dn.address || '',
      });
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/donor/profile', { method: 'PUT', body: form });
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

  if (!form) return <div className="wrap section"><Loading rows={5} /></div>;

  return (
    <div className="wrap wrap-narrow section stack">
      <div>
        <span className="eyebrow">Account</span>
        <h1 style={{ margin: '8px 0 4px' }}>My profile</h1>
        <p className="small muted">Update your personal details. Blood group changes are marked self-reported until verified by staff.</p>
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
            <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="field">
            <label>Blood group</label>
            <select value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
              <option value="">— select —</option>
              {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Gender</label>
            <select value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">— select —</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Date of birth</label>
            <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
          </div>
          <div className="field">
            <label>Area PIN code</label>
            <input value={form.area_pincode} onChange={e => set('area_pincode', e.target.value)} maxLength={6} />
          </div>
          <div className="field">
            <label>Occupation</label>
            <input value={form.occupation} onChange={e => set('occupation', e.target.value)} />
          </div>
          <div className="field">
            <label>Email <span className="muted">(read-only)</span></label>
            <input value={user.email || ''} disabled style={{ opacity: 0.6 }} />
          </div>
        </div>

        <div className="field">
          <label>Address</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, city, state" />
        </div>

        {donor?.blood_group_verified && (
          <div className="note" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', borderRadius: 8, padding: '10px 14px' }}>
            <span className="small">Your blood group has been <strong>verified</strong> by staff as <strong>{donor.blood_group_verified}</strong>. Changing it here marks it self-reported again.</span>
          </div>
        )}

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
          <div style={{}} /> {/* spacer */}
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
