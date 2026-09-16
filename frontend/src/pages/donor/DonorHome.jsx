import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty, Group, Loading, Pill, Stat, fmtDate, humaniseDates } from '../../components/ui.jsx';

export default function DonorHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/donor/profile').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="wrap section"><div className="note note-red">{error}</div></div>;
  if (!data) return <div className="wrap section"><Loading rows={5} /></div>;

  const { donor, history, notifications } = data;
  const el = donor.eligibility;
  const pending = notifications.filter((n) => n.response === 'PENDING');

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">Donor</span>
          <h1 style={{ margin: '8px 0 0' }}>Hello, {donor.name.split(' ')[0]}</h1>
        </div>
        <div className="row">
          <Group>{donor.blood_group_verified || donor.blood_group_self_reported}</Group>
          <Pill tone={donor.status === 'ACTIVE' ? 'green' : donor.status === 'PENDING_REVIEW' ? 'amber' : 'blue'}>
            {donor.status.replace('_', ' ')}
          </Pill>
        </div>
      </div>

      <div className={`card ${el.eligible ? '' : ''}`}>
        <div className="card-head">
          <div>
            <div className="label">Can I donate right now?</div>
            <h2 style={{ marginTop: 6, color: el.eligible ? 'var(--green-600)' : 'var(--red-700)' }}>
              {el.eligible ? 'Yes — you can donate today' : 'Not just yet'}
            </h2>
            <p className="small" style={{ marginTop: 6 }}>{humaniseDates(el.reason)}</p>
          </div>
          <Pill tone={el.eligible ? 'green' : 'amber'}>{el.eligibility_status}</Pill>
        </div>
        <div className="grid grid-4">
          <Stat label="Last donation" value={donor.last_donation_date ? fmtDate(donor.last_donation_date) : 'None yet'} />
          <Stat label="Gap for you" value={`${el.interval_days} days`} foot={donor.gender === 'FEMALE' ? '120 days for women' : '90 days for men'} />
          <Stat
            label="You can donate from"
            value={
              el.eligibility_status === 'PENDING_REVIEW'
                ? 'After review'
                : el.eligible
                  ? 'Today'
                  : el.next_eligible_date
                    ? fmtDate(el.next_eligible_date)
                    : 'Today'
            }
          />
          <Stat label="Donations recorded" value={history.length} />
        </div>
        {el.deferral_override && (
          <div className="note note-amber" style={{ marginTop: 16 }}>
            A blood bank staff member has asked you to wait until {fmtDate(donor.deferral_until_date)}. This takes
            precedence over the usual gap.
          </div>
        )}
        {donor.status === 'PENDING_REVIEW' && (
          <div className="note note-amber" style={{ marginTop: 16 }}>
            You told us a doctor once advised you not to donate. Staff at your blood bank will speak with you before you
            are added to the call list. The app makes no medical judgement itself.
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <div><h4>Requests waiting for your answer</h4><p className="small">Only your blood bank can send these.</p></div>
            {pending.length > 0 && <Pill tone="red">{pending.length} new</Pill>}
          </div>
          {pending.length === 0 ? (
            <Empty title="Nothing needs you right now">We only get in touch when your blood group is actually short.</Empty>
          ) : (
            <div className="stack-sm">
              {pending.slice(0, 3).map((n) => (
                <div className="panel" key={n.id}>
                  <div className="row-between">
                    <strong className="small">{n.institution_name}</strong>
                    <Group>{n.blood_group}</Group>
                  </div>
                  <p className="small" style={{ margin: '6px 0 0' }}>{n.message}</p>
                </div>
              ))}
              <Link className="btn btn-primary btn-sm" to="/donor/requests">Open requests</Link>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><div><h4>Your contact settings</h4><p className="small">You are always in control.</p></div></div>
          <div className="stack-sm small">
            <div className="row-between"><span className="muted">Contacts allowed per month</span><strong>{donor.preferences.max_contacts_per_month}</strong></div>
            <div className="row-between"><span className="muted">Notifications</span><strong>{donor.preferences.paused ? 'Paused' : 'On'}</strong></div>
            <div className="row-between"><span className="muted">When you prefer</span><strong>{donor.preferences.availability_window.toLowerCase()}</strong></div>
            <div className="row-between"><span className="muted">Blood group on record</span><strong>{donor.blood_group_verified ? `${donor.blood_group_verified} (confirmed at the bank)` : `${donor.blood_group_self_reported} (as you told us)`}</strong></div>
          </div>
          <Link className="btn btn-ghost btn-sm" to="/donor/preferences" style={{ marginTop: 16 }}>Change settings</Link>
        </div>
      </div>
    </div>
  );
}
