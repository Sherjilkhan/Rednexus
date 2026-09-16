import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { Loading } from '../components/ui.jsx';
import BloodDonorQuestionnaireModal from './donor/BloodDonorQuestionnaireModal.jsx';

/**
 * /camp-register?camp=<id>&institution=<id>
 * Reached via QR code or shareable link from a camp.
 * Flow:
 *   1. Load camp details
 *   2. If not logged in → show Login / Register options (preserving ?camp param)
 *   3. If logged in as DONOR → show questionnaire modal → submit attendance
 *   4. Done screen
 */
export default function CampRegister() {
  const [params] = useSearchParams();
  const campId = params.get('camp');
  const institutionId = params.get('institution');
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [camp, setCamp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [donorProfile, setDonorProfile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Login form state (inline, without leaving the page)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const { login } = useAuth();

  useEffect(() => {
    if (!campId) { setLoading(false); return; }
    api(`/public/camps`).then(d => {
      const found = (d.camps || []).find(c => c.id === campId);
      setCamp(found || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [campId]);

  useEffect(() => {
    if (user?.role === 'DONOR') {
      api('/donor/profile').then(d => setDonorProfile(d.donor)).catch(() => {});
    }
  }, [user]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginBusy(true); setLoginError(null);
    try {
      await login(loginForm.email, loginForm.password);
      // user state updates → useEffect above loads donor profile
    } catch (err) {
      setLoginError(err.message);
    } finally { setLoginBusy(false); }
  }

  async function handleQuestionnaireSubmit(questionnaireData) {
    setSubmitting(true);
    try {
      await api(`/donor/camps/${campId}/attend`, {
        method: 'POST',
        body: { attending: true, questionnaire: questionnaireData },
      });
      setShowQuestionnaire(false);
      setDone(true);
      toast('Registered for camp ✓', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="wrap section"><Loading rows={4} /></div>;

  if (!campId || !camp) {
    return (
      <div className="wrap section">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🩸</div>
          <h2>Camp not found</h2>
          <p className="small muted">This QR link may have expired or the camp no longer exists.</p>
          <Link to="/camps" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-block' }}>Browse all camps</Link>
        </div>
      </div>
    );
  }

  // ── Done screen ────────────────────────────────────────────
  if (done) return (
    <div className="wrap section">
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: '#16a34a' }}>You're registered!</h2>
        <p className="small">Your pre-donation form has been saved.</p>
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '16px 20px', margin: '20px 0', textAlign: 'left' }}>
          <div className="small muted" style={{ marginBottom: 4 }}>Camp details</div>
          <div style={{ fontWeight: 600 }}>{camp.location}</div>
          <div className="small">{camp.date} · {camp.start_time}–{camp.end_time}</div>
          <div className="small muted">{camp.institution_name}</div>
        </div>
        <p className="small muted">Please eat well before coming and carry a photo ID.</p>
        <Link to="/donor" className="btn btn-primary" style={{ marginTop: 8, display: 'inline-block' }}>Go to my dashboard</Link>
      </div>
    </div>
  );

  // ── Camp info header (always shown) ──────────────────────
  const CampCard = () => (
    <div style={{ background: '#fff5f5', border: '1px solid #fee2e2', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
      <div className="xs muted" style={{ marginBottom: 6, color: '#b91c1c', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Blood Donation Camp</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{camp.location}</div>
      <div className="small" style={{ marginTop: 4 }}>{camp.date} · {camp.start_time} – {camp.end_time}</div>
      <div className="small muted">{camp.institution_name}</div>
      {camp.notes && <div className="small" style={{ marginTop: 8, color: '#374151' }}>{camp.notes}</div>}
    </div>
  );

  // ── Not logged in ──────────────────────────────────────────
  if (!user) {
    const redirectBack = `/camp-register?camp=${campId}&institution=${institutionId || ''}`;
    return (
      <div className="wrap section" style={{ maxWidth: 480, margin: '0 auto' }}>
        <CampCard />
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Sign in to register for this camp</h3>
          <p className="small muted">You need a Raktasetu account to register. Sign in below or create a new account.</p>

          <form onSubmit={handleLogin} className="stack">
            <div className="field">
              <label>Email</label>
              <input type="email" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            {loginError && <div className="note note-red">{loginError}</div>}
            <button className="btn-primary btn-block" type="submit" disabled={loginBusy}>
              {loginBusy ? 'Signing in…' : 'Sign in & continue'}
            </button>
          </form>

          <div style={{ textAlign: 'center', borderTop: '1px solid var(--border,#e5e7eb)', paddingTop: 16 }}>
            <span className="small muted">No account? </span>
            <Link to={`/register?camp=${campId}&institution=${institutionId || ''}`} className="small">
              Register as a donor →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Logged in but not a donor ──────────────────────────────
  if (user.role !== 'DONOR') {
    return (
      <div className="wrap section" style={{ maxWidth: 480, margin: '0 auto' }}>
        <CampCard />
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p>You are logged in as <strong>{user.name}</strong> ({user.role.replace(/_/g, ' ').toLowerCase()}).</p>
          <p className="small muted">Only donor accounts can register for camps.</p>
          <Link to="/camps" className="btn btn-ghost" style={{ marginTop: 12, display: 'inline-block' }}>View camps</Link>
        </div>
      </div>
    );
  }

  // ── Logged in as donor ─────────────────────────────────────
  return (
    <div className="wrap section" style={{ maxWidth: 560, margin: '0 auto' }}>
      <CampCard />
      <div className="card stack" style={{ textAlign: 'center', padding: '32px 24px' }}>
        <div style={{ fontSize: 40 }}>🩸</div>
        <h2 style={{ margin: '12px 0 8px' }}>Ready to register, {user.name}?</h2>
        <p className="small muted">Fill in a short pre-donation form and we'll save your slot.</p>
        <button
          className="btn-primary btn-lg"
          style={{ marginTop: 8 }}
          onClick={() => setShowQuestionnaire(true)}
        >
          Fill pre-donation form & register
        </button>
      </div>

      {showQuestionnaire && (
        <BloodDonorQuestionnaireModal
          notification={{
            institution_name: camp.institution_name,
            blood_group: donorProfile?.blood_group_verified || donorProfile?.blood_group_self_reported || '',
          }}
          donorProfile={donorProfile}
          onClose={() => setShowQuestionnaire(false)}
          onSubmit={handleQuestionnaireSubmit}
          submitting={submitting}
          submitLabel="Submit & Register for Camp"
          context="camp"
        />
      )}
    </div>
  );
}
