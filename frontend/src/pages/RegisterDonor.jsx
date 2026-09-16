import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { BLOOD_GROUPS } from '../components/ui.jsx';

/**
 * F1 — camp QR registration form. Deliberately short: only the fields that change how the
 * system behaves. Full medical screening stays an in-person process at the blood bank.
 */
export default function RegisterDonor() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const [institutions, setInstitutions] = useState([]);
  const [form, setForm] = useState({
    name: '', email: '', password: '', gender: 'MALE', date_of_birth: '', blood_group: 'O+',
    phone: '', area_pincode: '', donated_before: false, last_donation_date: '',
    donation_type: 'VOLUNTARY', patient_name: '', advised_not_to_donate: false, consent: false,
    institution_id: params.get('institution') || '',
  });
  const [result, setResult] = useState(null);
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/public/institutions').then((d) => setInstitutions(d.institutions)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const payload = {
        ...form,
        institution_id: form.institution_id || null,
        camp_id: params.get('camp') || null,
        last_donation_date: form.donated_before ? form.last_donation_date : null,
        patient_name: form.donation_type === 'REPLACEMENT' ? form.patient_name : null,
        consent: true,
      };
      const d = await api('/donors/register', { method: 'POST', body: payload });
      setResult(d);
    } catch (err) {
      setErrors(err.details?.length ? err.details.map((x) => `${x.path}: ${x.message}`) : [err.message]);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      await api(`/donors/${result.donor.id}/verify-otp`, { method: 'POST', body: { code: otp } });
      await login(form.email, form.password);
      toast('Phone verified — welcome to Raktasetu', 'ok');
      navigate('/donor');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="auth-shell">
        <div className="auth-card card stack">
          <h3>Almost done, {result.donor.name.split(' ')[0]}</h3>
          <div className={`note ${result.donor.status === 'PENDING_REVIEW' ? 'note-amber' : 'note-green'}`}>
            {result.status_message}
          </div>
          {result.donor.status === 'PENDING_REVIEW' && (
            <p className="small muted">
              Your record is held as <strong>PENDING_REVIEW</strong>. We will not add you to the donor call list until a
              blood bank staff member has spoken with you. Nothing about your medical history is interpreted by the app.
            </p>
          )}
          <div className="field">
            <label htmlFor="otp">Enter the 6-digit code sent to <strong>{form.email}</strong></label>
            <input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} autoFocus />
            {result.otp_hint && <div className="hint">Dev hint: {result.otp_hint}</div>}
          </div>
          <button className="btn-primary" disabled={busy || otp.length < 6} onClick={verify}>Verify and continue</button>
          <button type="button" className="btn-ghost btn-sm btn-block" disabled={busy} onClick={async () => {
            try {
              const r = await api(`/donors/${result.donor.id}/resend-otp`, { method: 'POST' });
              if (r.otp_hint) setResult(prev => ({ ...prev, otp_hint: r.otp_hint }));
              toast('New code sent to your email', 'ok');
            } catch(e) { toast(e.message, 'err'); }
          }}>Resend code</button>
          <Link className="small center" to="/login">I'll verify later — take me to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap wrap-narrow section">
      <span className="eyebrow">Donor registration</span>
      <h1 style={{ margin: '8px 0 4px' }}>Join the donor list</h1>
      <p className="small muted">
        {params.get('camp') ? 'You scanned a camp QR code — your registration will be linked to that camp. ' : ''}
        We ask only what the system needs. Medical screening happens in person at the blood bank on the day you donate.
      </p>
      <form className="card stack" onSubmit={submit} style={{ marginTop: 20 }}>
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <div className="field"><label htmlFor="name">Full name</label><input id="name" value={form.name} onChange={set('name')} required /></div>
          <div className="field"><label htmlFor="dob">Date of birth</label><input id="dob" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} required /></div>
          <div className="field">
            <label htmlFor="gender">Gender</label>
            <select id="gender" value={form.gender} onChange={set('gender')}>
              <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
            </select>
            <div className="hint">Used only to work out the gap between donations (90 days / 120 days).</div>
          </div>
          <div className="field">
            <label htmlFor="bg">Blood group (as you know it)</label>
            <select id="bg" value={form.blood_group} onChange={set('blood_group')}>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="phone">Phone number</label><input id="phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" required /></div>
          <div className="field"><label htmlFor="pin">Area PIN code</label><input id="pin" value={form.area_pincode} onChange={set('area_pincode')} placeholder="411001" required /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={form.email} onChange={set('email')} required /></div>
          <div className="field"><label htmlFor="pw">Choose a password</label><input id="pw" type="password" value={form.password} onChange={set('password')} required minLength={6} /></div>
        </div>

        <div className="field">
          <label htmlFor="inst">Your blood bank</label>
          <select id="inst" value={form.institution_id} onChange={set('institution_id')}>
            <option value="">Not sure / none</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.location?.city}</option>)}
          </select>
        </div>

        <div className="panel stack-sm">
          <label className="check"><input type="checkbox" checked={form.donated_before} onChange={set('donated_before')} /><span>I have donated blood before</span></label>
          {form.donated_before && (
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="last">Date of last donation</label>
              <input id="last" type="date" value={form.last_donation_date} onChange={set('last_donation_date')} required />
            </div>
          )}
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="dtype">Donation type</label>
            <select id="dtype" value={form.donation_type} onChange={set('donation_type')}>
              <option value="VOLUNTARY">Voluntary</option>
              <option value="REPLACEMENT">Replacement (for a specific patient)</option>
            </select>
          </div>
          {form.donation_type === 'REPLACEMENT' && (
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="pname">Patient name</label>
              <input id="pname" value={form.patient_name} onChange={set('patient_name')} required />
            </div>
          )}
        </div>

        <div className="panel">
          <label className="check">
            <input type="checkbox" checked={form.advised_not_to_donate} onChange={set('advised_not_to_donate')} />
            <span>
              <strong>Has a doctor ever advised you not to donate blood?</strong>
              <div className="muted xs">
                If yes, we will not add you to the call list yet — a blood bank staff member will talk to you first. We
                never ask you to explain the reason here.
              </div>
            </span>
          </label>
        </div>

        <div className="panel">
          <label className="check">
            <input type="checkbox" checked={form.consent} onChange={set('consent')} required />
            <span>
              I agree that this blood bank may contact me about blood donation. I can change how often I am contacted, or
              stop it entirely, at any time. (DPDP Act 2023 consent)
            </span>
          </label>
        </div>

        {errors.length > 0 && (
          <div className="note note-red">
            {errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        )}
        <button className="btn-primary btn-lg" type="submit" disabled={busy || !form.consent}>
          {busy ? 'Submitting…' : 'Register'}
        </button>
      </form>
    </div>
  );
}
