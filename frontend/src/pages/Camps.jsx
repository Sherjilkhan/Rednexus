import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { Empty, Loading, Pill, fmtDate } from '../components/ui.jsx';
import BloodDonorQuestionnaireModal from './donor/BloodDonorQuestionnaireModal.jsx';

/** F10 — camp directory. "I'll attend" opens the questionnaire modal for donors. */
export default function Camps() {
  const { user } = useAuth();
  const toast = useToast();
  const [camps, setCamps] = useState(null);
  const [attending, setAttending] = useState({});
  const [donorProfile, setDonorProfile] = useState(null);

  // Questionnaire modal state
  const [activeCamp, setActiveCamp] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api('/public/camps?upcoming=true').then(d => setCamps(d.camps)).catch(() => setCamps([]));
    if (user?.role === 'DONOR') {
      api('/donor/profile').then(d => {
        setDonorProfile(d.donor);
        const map = {};
        for (const a of d.attendance) map[a.camp_id] = a.attending;
        setAttending(map);
      }).catch(() => {});
    }
  };

  useEffect(() => { load(); }, [user]);

  async function cancelAttendance(camp) {
    try {
      await api(`/donor/camps/${camp.id}/attend`, { method: 'POST', body: { attending: false } });
      setAttending(m => ({ ...m, [camp.id]: false }));
      toast("Removed from the attending list", 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function handleQuestionnaireSubmit(questionnaireData) {
    if (!activeCamp) return;
    setSubmitting(true);
    try {
      await api(`/donor/camps/${activeCamp.id}/attend`, {
        method: 'POST',
        body: { attending: true, questionnaire: questionnaireData },
      });
      setAttending(m => ({ ...m, [activeCamp.id]: true }));
      setActiveCamp(null);
      toast("You're registered for the camp ✓", 'ok');
      load();
    } catch (err) {
      toast(err.message, 'err');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="wrap section stack">
      <div>
        <span className="eyebrow">Camp directory</span>
        <h1 style={{ margin: '8px 0 4px' }}>Upcoming donation camps</h1>
        <p className="small muted">Walk in during the listed hours. Eat before you come and carry a photo ID.</p>
      </div>

      {camps === null ? (
        <Loading rows={3} />
      ) : camps.length === 0 ? (
        <Empty title="No camps listed yet">Blood banks post their camps here as they are scheduled.</Empty>
      ) : (
        <div className="grid grid-2">
          {camps.map(c => (
            <div className="card" key={c.id}>
              <div className="card-head">
                <div>
                  <h4>{c.location}</h4>
                  <p className="small muted">{c.institution_name}</p>
                </div>
                <Pill tone="red">{fmtDate(c.date)}</Pill>
              </div>
              <div className="small">{c.start_time} – {c.end_time}</div>
              {c.notes && <p className="small muted" style={{ marginTop: 8 }}>{c.notes}</p>}
              <div className="row-between" style={{ marginTop: 16 }}>
                <span className="xs muted">
                  {c.attendee_count} donor{c.attendee_count === 1 ? '' : 's'} say they are coming
                </span>
                {user?.role === 'DONOR' ? (
                  attending[c.id]
                    ? <button className="btn-ghost btn-sm" onClick={() => cancelAttendance(c)}>I can't make it</button>
                    : <button className="btn-primary btn-sm" onClick={() => setActiveCamp(c)}>I'll attend</button>
                ) : (
                  <a className="btn btn-ghost btn-sm" href={`#/camp-register?camp=${c.id}&institution=${c.blood_bank_institution_id}`}>
                    Register for this camp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Questionnaire modal — opens when donor clicks "I'll attend" */}
      {activeCamp && (
        <BloodDonorQuestionnaireModal
          notification={{
            institution_name: activeCamp.institution_name,
            blood_group: donorProfile?.blood_group_verified || donorProfile?.blood_group_self_reported || '',
          }}
          donorProfile={donorProfile}
          onClose={() => setActiveCamp(null)}
          onSubmit={handleQuestionnaireSubmit}
          submitting={submitting}
          submitLabel="Submit & Confirm Attendance"
          context="camp"
          campId={activeCamp.id}
        />
      )}
    </div>
  );
}