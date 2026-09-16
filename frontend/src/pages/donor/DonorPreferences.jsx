import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { Loading } from '../../components/ui.jsx';

/** F3 — donor preference profile: contact cap, pause, window, preferred centre. */
export default function DonorPreferences() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/donor/profile').then((d) => setPrefs(d.donor.preferences)).catch(() => {});
    api('/public/institutions').then((d) => setInstitutions(d.institutions)).catch(() => {});
  }, []);

  if (!prefs) return <div className="wrap section"><Loading rows={4} /></div>;
  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await api('/donor/preferences', {
        method: 'PUT',
        body: {
          max_contacts_per_month: Number(prefs.max_contacts_per_month),
          channel: prefs.channel || 'IN_APP',
          availability_window: prefs.availability_window || 'ANYTIME',
          preferred_institution_id: prefs.preferred_institution_id || null,
          paused: !!prefs.paused,
        },
      });
      toast('Your settings are saved', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap wrap-narrow section stack">
      <div>
        <span className="eyebrow">Preferences</span>
        <h1 style={{ margin: '8px 0 4px' }}>How often we may contact you</h1>
        <p className="small muted">These limits are enforced before any message is sent, not after.</p>
      </div>
      <div className="card stack">
        <div className="field">
          <label>Most messages per month</label>
          <input className="inline-num" type="number" min={0} max={10} value={prefs.max_contacts_per_month}
            onChange={(e) => set('max_contacts_per_month', e.target.value)} />
          <div className="hint">Set 0 to stop all requests without pausing your account.</div>
        </div>
        <div className="field">
          <label>Best time to reach you</label>
          <select value={prefs.availability_window} onChange={(e) => set('availability_window', e.target.value)}>
            <option value="ANYTIME">Any time</option><option value="MORNING">Mornings</option>
            <option value="EVENING">Evenings</option><option value="WEEKEND">Weekends</option>
          </select>
        </div>
        <div className="field">
          <label>Blood bank you prefer to visit</label>
          <select value={prefs.preferred_institution_id || ''} onChange={(e) => set('preferred_institution_id', e.target.value || null)}>
            <option value="">No preference</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <div className="hint">Donors who prefer the requesting bank are ranked higher.</div>
        </div>
        <div className="field">
          <label>How we reach you</label>
          <select value={prefs.channel} onChange={(e) => set('channel', e.target.value)}>
            <option value="IN_APP">In this app</option><option value="SMS">SMS (planned)</option><option value="IVR">Voice call (planned)</option>
          </select>
          <div className="hint">Channels are tried one after another — never all at once.</div>
        </div>
        <div className="panel">
          <label className="check">
            <input type="checkbox" checked={!!prefs.paused} onChange={(e) => set('paused', e.target.checked)} />
            <span><strong>Pause all requests</strong><div className="muted xs">You stay registered, but no blood bank will contact you until you turn this off.</div></span>
          </label>
        </div>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
}
