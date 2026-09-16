import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth.jsx';
import Logo from '../components/Logo.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../api.js';

const DEMOS = [
  ['Blood bank staff', 'staff@citybank.in', 'staff123'],
  ['Donor', 'donor@example.com', 'donor123'],
  ['Platform admin', 'admin@raktasetu.in', 'admin123'],
];

// Step: 'login' | 'forgot_email' | 'forgot_otp' | 'forgot_newpass'
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpHint, setOtpHint] = useState(null);

  async function submit(e, creds) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const user = await login(creds?.[0] ?? email, creds?.[1] ?? password);
      toast(`Signed in as ${user.name}`, 'ok');
      navigate(homeFor(user));
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function sendResetOtp(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api('/auth/forgot-password', { method: 'POST', body: { email: resetEmail } });
      if (d.otp_hint) setOtpHint(d.otp_hint);
      toast('Verification code sent to your email', 'ok');
      setStep('forgot_otp');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function verifyResetOtp(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/auth/verify-reset-otp', { method: 'POST', body: { email: resetEmail, code: resetOtp } });
      setStep('forgot_newpass');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setBusy(true); setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { email: resetEmail, code: resetOtp, new_password: newPassword } });
      toast('Password reset! Please sign in.', 'ok');
      setStep('login');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  // ── Forgot password steps ──────────────────────────────────────────────────
  if (step === 'forgot_email') return (
    <div className="auth-shell">
      <div className="auth-card card stack">
        <div className="center stack-sm"><Logo size={30} /><h3>Reset your password</h3></div>
        <form className="stack" onSubmit={sendResetOtp}>
          <div className="field">
            <label>Email address on your account</label>
            <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus />
          </div>
          {error && <div className="note note-red">{error}</div>}
          <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send verification code'}</button>
        </form>
        <button className="btn-ghost btn-sm btn-block" onClick={() => { setStep('login'); setError(null); }}>← Back to sign in</button>
      </div>
    </div>
  );

  if (step === 'forgot_otp') return (
    <div className="auth-shell">
      <div className="auth-card card stack">
        <div className="center stack-sm"><Logo size={30} /><h3>Enter verification code</h3></div>
        <p className="small muted center">We sent a 6-digit code to <strong>{resetEmail}</strong></p>
        <form className="stack" onSubmit={verifyResetOtp}>
          <div className="field">
            <label>Verification code</label>
            <input value={resetOtp} onChange={e => setResetOtp(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} required autoFocus />
            {otpHint && <div className="hint">Dev hint: {otpHint}</div>}
          </div>
          {error && <div className="note note-red">{error}</div>}
          <button className="btn-primary btn-block" disabled={busy || resetOtp.length < 6}>{busy ? 'Verifying…' : 'Verify code'}</button>
        </form>
        <button className="btn-ghost btn-sm btn-block" onClick={() => { setStep('forgot_email'); setError(null); }}>← Resend code</button>
      </div>
    </div>
  );

  if (step === 'forgot_newpass') return (
    <div className="auth-shell">
      <div className="auth-card card stack">
        <div className="center stack-sm"><Logo size={30} /><h3>Set new password</h3></div>
        <form className="stack" onSubmit={submitNewPassword}>
          <div className="field">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} required autoFocus />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={6} required />
          </div>
          {error && <div className="note note-red">{error}</div>}
          <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      </div>
    </div>
  );

  // ── Main login ─────────────────────────────────────────────────────────────
  return (
    <div className="auth-shell">
      <div className="auth-card stack">
        <div className="center stack-sm">
          <Logo size={30} />
          <p className="small muted" style={{ margin: 0 }}>Sign in to your Raktasetu account</p>
        </div>
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <button type="button" className="btn-ghost btn-sm" style={{ padding: '2px 0', fontSize: 12 }} onClick={() => { setResetEmail(email); setStep('forgot_email'); setError(null); }}>
                Forgot password?
              </button>
            </div>
          </div>
          {error && <div className="note note-red" style={{ marginBottom: 16 }}>{error}</div>}
          <button className="btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted center" style={{ margin: '14px 0 0' }}>New donor? <Link to="/register">Register here</Link></p>
        </form>
        <div className="card card-tight">
          <div className="label" style={{ marginBottom: 8 }}>Demo accounts — one click</div>
          <div className="stack-sm">
            {DEMOS.map(([label, e, p]) => (
              <button key={e} className="btn-ghost btn-sm btn-block" onClick={(ev) => submit(ev, [e, p])} disabled={busy}>{label} · {e}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
