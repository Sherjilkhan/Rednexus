import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function RegisterInstitution() {
  const [form, setForm] = useState({
    name: '', category: 'EXTERNAL', linked_hospital_name: '', city: '', state: 'Maharashtra', pincode: '',
    licence_number: '', contact_email: '', contact_phone: '',
    staff: { name: '', email: '', password: '' },
  });
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setStaff = (k) => (e) => setForm((f) => ({ ...f, staff: { ...f.staff, [k]: e.target.value } }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/institutions/register', {
        method: 'POST',
        body: { ...form, linked_hospital_name: form.category === 'IN_HOUSE' ? form.linked_hospital_name : null },
      });
      setDone(d);
    } catch (err) {
      setError(err.details?.map((x) => `${x.path}: ${x.message}`).join(', ') || err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="auth-card card stack">
          <h3>Application received</h3>
          <div className="note note-amber">
            <strong>{done.institution.name}</strong> is registered with status <strong>PENDING</strong>. A platform admin
            must verify it before your team can report usage, confirm thresholds, or contact any donor.
          </div>
          <p className="small muted">
            Your staff login <strong>{done.staff?.email}</strong> already exists — signing in will show a pending-approval
            notice until verification completes. Verification also checks that at least one staff account exists.
          </p>
          <Link className="btn btn-primary" to="/login">Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap wrap-narrow section">
      <span className="eyebrow">Blood bank registration</span>
      <h1 style={{ margin: '8px 0 4px' }}>Apply to join Raktasetu</h1>
      <p className="small muted">One institution type — blood bank — either embedded in a hospital or standalone.</p>
      <form className="card stack" onSubmit={submit} style={{ marginTop: 20 }}>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <div className="field"><label>Blood bank name</label><input value={form.name} onChange={set('name')} required /></div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={set('category')}>
              <option value="IN_HOUSE">In-house (inside a hospital)</option>
              <option value="EXTERNAL">External (standalone)</option>
            </select>
          </div>
          {form.category === 'IN_HOUSE' && (
            <div className="field"><label>Hospital it sits inside</label><input value={form.linked_hospital_name} onChange={set('linked_hospital_name')} /></div>
          )}
          <div className="field"><label>Licence number</label><input value={form.licence_number} onChange={set('licence_number')} /></div>
          <div className="field"><label>City</label><input value={form.city} onChange={set('city')} required /></div>
          <div className="field"><label>State</label><input value={form.state} onChange={set('state')} required /></div>
          <div className="field"><label>PIN code</label><input value={form.pincode} onChange={set('pincode')} placeholder="411001" required /></div>
          <div className="field"><label>Contact email</label><input type="email" value={form.contact_email} onChange={set('contact_email')} required /></div>
          <div className="field"><label>Contact phone</label><input value={form.contact_phone} onChange={set('contact_phone')} required /></div>
        </div>
        <div className="panel stack-sm">
          <div className="label">First staff account (required for verification)</div>
          <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
            <div className="field" style={{ margin: 0 }}><label>Name</label><input value={form.staff.name} onChange={setStaff('name')} required /></div>
            <div className="field" style={{ margin: 0 }}><label>Email</label><input type="email" value={form.staff.email} onChange={setStaff('email')} required /></div>
            <div className="field" style={{ margin: 0 }}><label>Password</label><input type="password" value={form.staff.password} onChange={setStaff('password')} minLength={6} required /></div>
          </div>
        </div>
        {error && <div className="note note-red">{error}</div>}
        <button className="btn-primary btn-lg" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
      </form>
    </div>
  );
}
