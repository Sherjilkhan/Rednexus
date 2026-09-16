import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Empty, Group, Loading, Modal, Pill, StateRail, fmtDateTime, originTone, stateTone } from '../../components/ui.jsx';

const NEXT_LABEL = {
  NOTIFIED: 'Notify donors',
  ACCEPTED: 'Mark enough donors accepted',
  CONFIRMED: 'Confirm donors with the bank',
  ARRIVED: 'Donor arrived',
  DONATED: 'Donation completed',
  CLOSED: 'Close request',
};

export default function BankRequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();

  const [req,            setReq]            = useState(null);
  const [preview,        setPreview]        = useState(null);
  const [acceptedDonors, setAcceptedDonors] = useState([]);
  const [confirming,     setConfirming]     = useState(false);
  const [note,           setNote]           = useState('');
  const [busy,           setBusy]           = useState(false);

  // Per-donor inline appointment state: { [notificationId]: { date, time } }
  const [appointments, setAppointments] = useState({});
  // Donation modal
  const [donationModal, setDonationModal] = useState(null); // { nid, name, units, hb }

  const load = async () => {
    const d = await api(`/bank/requests/${id}`);
    setReq(d.request);
    if (['DETECTED', 'RAISED', 'NOTIFIED'].includes(d.request.state)) {
      try { setPreview(await api(`/bank/requests/${id}/target-preview`)); } catch { /* ok */ }
    }
    if (!['DETECTED', 'CLOSED'].includes(d.request.state)) {
      try {
        const ad = await api(`/bank/requests/${id}/accepted-donors`);
        const donors = ad.donors || [];
        setAcceptedDonors(donors);
        // Seed appointment inputs with any existing values
        const appts = {};
        donors.forEach(d => {
          appts[d.notification_id] = {
            date: d.appointment_date || '',
            time: d.appointment_time || '',
          };
        });
        setAppointments(appts);
      } catch { /* ok */ }
    }
  };

  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, [id]);

  if (!req) return <div className="wrap section"><Loading rows={6} /></div>;

  /* ── action handlers ─────────────────────────────────── */

  async function confirmGate() {
    setBusy(true);
    try {
      await api(`/bank/requests/${id}/confirm`, { method: 'POST', body: { note: note || null } });
      setConfirming(false); await load();
      toast('Confirmed — donors not contacted until you dispatch.', 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function dispatch(widen = false) {
    setBusy(true);
    try {
      const d = await api(`/bank/requests/${id}/dispatch`, { method: 'POST', body: { widen } });
      await load(); toast(`${d.notified} donor(s) notified at stage ${d.stage}`, 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function advance(to) {
    setBusy(true);
    try {
      await api(`/bank/requests/${id}/transition`, { method: 'POST', body: { to } });
      await load(); toast(`Request moved to ${to}`, 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function sendAppointment(nid) {
    const appt = appointments[nid] || {};
    if (!appt.date) { toast('Set a date first', 'err'); return; }
    setBusy(true);
    try {
      await api(`/bank/requests/${id}/donors/${nid}/appointment`, {
        method: 'POST',
        body: { appointment_date: appt.date, appointment_time: appt.time || '' },
      });
      await api(`/bank/requests/${id}/donors/${nid}/notify-appointment`, { method: 'POST' });
      await load();
      toast('Appointment saved and donor notified ✓', 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function saveDonation() {
    if (!donationModal) return;
    setBusy(true);
    try {
      const r = await api(`/bank/requests/${id}/donors/${donationModal.nid}/donate`, {
        method: 'POST',
        body: { units: donationModal.units, hb_level: donationModal.hb || null },
      });
      setDonationModal(null); await load();
      toast(
        `${r.units_donated} unit(s) recorded. Stock now ${r.new_stock}.` +
        (r.auto_closed ? ' Request auto-closed — stock above threshold!' : ''),
        'ok'
      );
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  const transitions = (req.allowed_transitions || []).filter(t => t !== 'RAISED');
  const showAccepted = !['DETECTED', 'CLOSED'].includes(req.state);

  /* ── render ──────────────────────────────────────────── */

  return (
    <div className="wrap section stack">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="row-between">
        <div>
          <Link className="small" to="/bank/requests">← All requests</Link>
          <h1 style={{ margin: '8px 0 6px' }}>
            {req.units_needed} unit{req.units_needed === 1 ? '' : 's'} of {req.blood_group}
          </h1>
          <div className="row">
            <Pill tone={originTone(req.origin)}>{req.origin.replace('_', ' ').toLowerCase()}</Pill>
            <Pill tone={stateTone(req.state)}>{req.state}</Pill>
            {req.urgency === 'HIGH' && <Pill tone="red">urgent</Pill>}
          </div>
        </div>
        <Group>{req.blood_group}</Group>
      </div>

      {/* ── State rail ──────────────────────────────────── */}
      <div className="card"><StateRail state={req.state} origin={req.origin} /></div>

      {/* ── Human gate ──────────────────────────────────── */}
      {req.state === 'DETECTED' && (
        <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
          <div className="card-head">
            <div>
              <span className="eyebrow">Human confirmation gate</span>
              <h3 style={{ margin: '6px 0' }}>This draft has not been sent to anyone</h3>
              <p className="small" style={{ marginBottom: 0 }}>{req.reason}</p>
            </div>
          </div>
          <div className="row">
            <button className="btn-confirm btn-lg" onClick={() => setConfirming(true)} disabled={busy}>
              Confirm this alert as {user.name}
            </button>
            <button className="btn-ghost" onClick={() => advance('CLOSED')} disabled={busy}>
              Dismiss — not needed
            </button>
          </div>
          <p className="xs muted" style={{ margin: '14px 0 0' }}>
            Confirming records your name and time. Moves from <code>DETECTED</code> → <code>RAISED</code>. Cannot be automated.
          </p>
        </div>
      )}

      {/* ── What happens next + targeting ───────────────── */}
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><div><h4>What happens next</h4><p className="small">Every step is an explicit action.</p></div></div>
          <div className="row">
            {req.state === 'RAISED'   && <button className="btn-primary" onClick={() => dispatch(false)} disabled={busy}>Notify the ranked batch of donors</button>}
            {req.state === 'NOTIFIED' && <button className="btn-ghost"   onClick={() => dispatch(true)}  disabled={busy}>Widen the pool (escalate a stage)</button>}
            {transitions.filter(t => t !== 'NOTIFIED').map(t => (
              <button key={t} className="btn-ghost" onClick={() => advance(t)} disabled={busy}>{NEXT_LABEL[t] || t}</button>
            ))}
            {transitions.length === 0 && req.state !== 'DETECTED' && <span className="small muted">This request is closed.</span>}
          </div>
          <hr className="hair" />
          <div className="small stack-sm">
            <div className="row-between"><span className="muted">Escalation stage</span><strong>{req.escalation_stage || 0}</strong></div>
            <div className="row-between"><span className="muted">Confirmed by</span><strong>{req.confirmed_by_name || 'not yet'}</strong></div>
            <div className="row-between"><span className="muted">Confirmed at</span><strong>{req.confirmed_at ? fmtDateTime(req.confirmed_at) : '—'}</strong></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div><h4>Who would be contacted</h4><p className="small">Blood group → eligibility → preferences → cap → rank.</p></div></div>
          {!preview ? <Empty title="Targeting preview unavailable at this state" /> : (
            <>
              <div className="small" style={{ marginBottom: 10 }}>
                <strong>{preview.pool_size}</strong> eligible; next batch <strong>{preview.batch.length}</strong>.
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Donor</th><th>Area</th><th className="num">Score</th></tr></thead>
                  <tbody>
                    {preview.batch.map(b => (
                      <tr key={b.donor_id}><td>{b.name}</td><td className="small muted">{b.area_pincode}</td><td className="num">{b.score}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.excluded.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary className="small muted">{preview.excluded.length} excluded — why</summary>
                  <ul className="small muted">
                    {preview.excluded.slice(0, 12).map((e, i) => <li key={i}>{e.stage_filter}: {e.reason}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── All donors contacted ────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <div>
            <h4>Donors contacted ({req.notifications.length})</h4>
            <p className="small">Contact numbers visible to verified staff only.</p>
          </div>
        </div>
        {req.notifications.length === 0 ? <Empty title="Nobody contacted yet" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Donor</th><th>Phone</th><th className="num">Stage</th><th>Sent</th><th>Response</th><th className="num">Replied in</th></tr>
              </thead>
              <tbody>
                {req.notifications.map(n => (
                  <tr key={n.id}>
                    <td>{n.donor_name}</td>
                    <td className="small">{n.donor_phone || <span className="muted">hidden</span>}</td>
                    <td className="num">{n.stage}</td>
                    <td className="xs muted">{fmtDateTime(n.sent_at)}</td>
                    <td>
                      <Pill tone={n.response === 'ACCEPTED' ? 'green' : n.response === 'DECLINED' ? 'grey' : 'amber'}>
                        {n.response.replace(/_/g, ' ').toLowerCase()}
                      </Pill>
                    </td>
                    <td className="num">{n.response_time_minutes != null ? `${n.response_time_minutes}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════
          ACCEPTED DONORS — separate card, always visible
          once request moves past NOTIFIED
          ════════════════════════════════════════════════════ */}
      {showAccepted && (
        <div className="card" style={{ borderColor: '#bbf7d0', borderWidth: 1.5 }}>
          <div className="card-head" style={{ borderBottom: '1px solid #bbf7d0', paddingBottom: 14, marginBottom: 16 }}>
            <div>
              <span className="eyebrow" style={{ color: '#16a34a' }}>Donor management</span>
              <h3 style={{ margin: '4px 0 4px' }}>
                Accepted donors
                <span style={{ marginLeft: 10, fontSize: 15, fontWeight: 400, color: '#6b7280' }}>
                  ({acceptedDonors.length} accepted · {acceptedDonors.filter(d => d.donated).length} donated)
                </span>
              </h3>
              <p className="small muted" style={{ margin: 0 }}>
                Set a date and time for each donor, confirm to notify them. When they arrive and donate, press <strong>Donated</strong> to update stock and their donor record.
              </p>
            </div>
          </div>

          {acceptedDonors.length === 0 ? (
            <Empty title="No donors have accepted yet">
              Donors who tap Accept on their notification will appear here.
            </Empty>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {acceptedDonors.map(donor => {
                const appt = appointments[donor.notification_id] || { date: '', time: '' };
                const hasAppt = !!donor.appointment_date;
                return (
                  <div
                    key={donor.notification_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '14px 16px',
                      borderRadius: 10,
                      border: `1px solid ${donor.donated ? '#bbf7d0' : donor.appointment_notified ? '#bfdbfe' : '#e5e7eb'}`,
                      background: donor.donated ? '#f0fdf4' : donor.appointment_notified ? '#eff6ff' : '#fafafa',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Donor info */}
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{donor.donor_name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {donor.donor_phone || 'No phone'} &nbsp;·&nbsp;
                        <span style={{ fontWeight: 600, color: '#b91c1c' }}>{donor.blood_group}</span>
                      </div>
                    </div>

                    {/* Status pill */}
                    <div style={{ minWidth: 110 }}>
                      {donor.donated
                        ? <Pill tone="green">✓ Donated {donor.units_donated}u</Pill>
                        : donor.arrived
                        ? <Pill tone="green">Arrived</Pill>
                        : donor.appointment_notified
                        ? <Pill tone="blue">Appt. sent</Pill>
                        : hasAppt
                        ? <Pill tone="amber">Appt. set</Pill>
                        : <Pill tone="amber">Needs appointment</Pill>}
                    </div>

                    {/* Date + time inputs — always editable until donated */}
                    {!donor.donated && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          type="date"
                          value={appt.date}
                          onChange={e => setAppointments(prev => ({
                            ...prev,
                            [donor.notification_id]: { ...prev[donor.notification_id], date: e.target.value },
                          }))}
                          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
                        />
                        <input
                          type="time"
                          value={appt.time}
                          onChange={e => setAppointments(prev => ({
                            ...prev,
                            [donor.notification_id]: { ...prev[donor.notification_id], time: e.target.value },
                          }))}
                          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
                        />
                        <button
                          className="btn-sm btn-primary"
                          disabled={busy || !appt.date}
                          onClick={() => sendAppointment(donor.notification_id)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {donor.appointment_notified ? 'Resend notification' : 'Confirm & notify donor'}
                        </button>
                      </div>
                    )}

                    {/* Donated button — appears after appointment sent */}
                    {!donor.donated && donor.appointment_notified && (
                      <button
                        className="btn-sm btn-confirm"
                        disabled={busy}
                        onClick={() => setDonationModal({ nid: donor.notification_id, name: donor.donor_name, units: 1, hb: '' })}
                        style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }}
                      >
                        ✓ Donated
                      </button>
                    )}

                    {/* Done state */}
                    {donor.donated && (
                      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✓ Donation recorded</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>
                          {donor.units_donated} unit{donor.units_donated !== 1 ? 's' : ''}
                          {donor.hb_level ? ` · Hb ${donor.hb_level}` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── State history ───────────────────────────────── */}
      <div className="card">
        <div className="card-head"><h4>State history</h4></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>From</th><th>To</th><th>By</th><th>At</th></tr></thead>
            <tbody>
              {(req.state_history || []).map((h, i) => (
                <tr key={i}>
                  <td>{h.from || '—'}</td>
                  <td><strong>{h.to}</strong></td>
                  <td>{h.by_name}</td>
                  <td className="xs muted">{fmtDateTime(h.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Donation modal ──────────────────────────────── */}
      {donationModal && (
        <Modal title={`Record donation — ${donationModal.name}`} onClose={() => setDonationModal(null)}>
          <div className="stack">
            <div className="field">
              <label>Units donated</label>
              <input
                type="number" min="1" max="5"
                value={donationModal.units}
                onChange={e => setDonationModal(m => ({ ...m, units: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>Hb level <span className="muted">(optional)</span></label>
              <input
                type="number" step="0.1" placeholder="e.g. 13.5"
                value={donationModal.hb}
                onChange={e => setDonationModal(m => ({ ...m, hb: e.target.value }))}
              />
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px' }}>
              <span className="small">This updates stock levels and the donor's record. If stock exceeds the confirmed threshold, the request will auto-close.</span>
            </div>
            <div className="row">
              <button className="btn-confirm btn-lg" disabled={busy} onClick={saveDonation}>Confirm donation</button>
              <button className="btn-ghost" onClick={() => setDonationModal(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirm gate modal ──────────────────────────── */}
      {confirming && (
        <Modal
          title="Confirm this alert"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn-confirm" onClick={confirmGate} disabled={busy}>
                {busy ? 'Confirming…' : 'Yes, confirm'}
              </button>
            </>
          }
        >
          <div className="stack-sm">
            <div className="panel small">
              <strong>{req.units_needed} unit(s) of {req.blood_group}</strong><br />{req.reason}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Note for the audit trail (optional)</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. checked the fridge, count is right"
              />
            </div>
            <div className="note note-amber small">
              Your name ({user.name}) and the current time will be stored with this confirmation.
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}