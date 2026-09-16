import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { BLOOD_GROUPS, Empty, Group, Loading, Modal, Pill, fmtDate } from '../../components/ui.jsx';

export default function BankDonors() {
  const toast = useToast();
  const [donors, setDonors] = useState(null);
  const [filter, setFilter] = useState({ blood_group: '', status: '' });
  const [review, setReview] = useState(null);
  const [defer, setDefer] = useState(null);
  const [form, setForm] = useState({ decision: 'CLEAR', deferral_until_date: '', note: '' });
  const [busy, setBusy] = useState(false);

  const load = () => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    return api(`/bank/donors${qs ? `?${qs}` : ''}`).then((d) => setDonors(d.donors));
  };
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, [filter.blood_group, filter.status]);

  async function submitReview() {
    setBusy(true);
    try {
      await api(`/bank/donors/${review.id}/review`, {
        method: 'POST',
        body: {
          decision: form.decision,
          deferral_until_date: form.decision === 'DEFER' ? form.deferral_until_date : null,
          note: form.note || null,
        },
      });
      setReview(null);
      await load();
      toast('Donor record updated and logged', 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function submitDeferral() {
    setBusy(true);
    try {
      await api(`/bank/donors/${defer.id}/deferral`, { method: 'POST', body: { deferral_until_date: form.deferral_until_date || null } });
      setDefer(null);
      await load();
      toast('Deferral saved — it overrides the standard gap', 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function recordDonation(donor) {
    setBusy(true);
    try {
      await api('/bank/donations', { method: 'POST', body: { donor_id: donor.id, units: 1 } });
      await load();
      toast(`Donation recorded for ${donor.name} — eligibility clock reset`, 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  if (!donors) return <div className="wrap section"><Loading rows={6} /></div>;
  const pending = donors.filter((d) => d.status === 'PENDING_REVIEW');

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">Donor pool</span>
          <h1 style={{ margin: '8px 0 4px' }}>Donors registered with your bank</h1>
          <p className="small muted">You can see contact details because you are verified staff. Patients and families never can.</p>
        </div>
        <div className="row">
          <select aria-label="Filter blood group" value={filter.blood_group} onChange={(e) => setFilter((f) => ({ ...f, blood_group: e.target.value }))}>
            <option value="">All groups</option>{BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
          <select aria-label="Filter status" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option>
            <option value="PROVISIONAL">Provisional</option><option value="PENDING_REVIEW">Pending review</option>
          </select>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="note note-amber">
          <strong>{pending.length} donor(s) need a human review.</strong> They told us a doctor once advised them not to
          donate. They stay out of the call list until you clear them.
        </div>
      )}

      <div className="card">
        {donors.length === 0 ? <Empty title="No donors match this filter" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Donor</th><th>Group</th><th>Phone</th><th>Area</th><th>Last donation</th><th>Eligibility</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong><div className="xs muted">{d.gender.toLowerCase()}</div></td>
                    <td><Group>{d.blood_group_verified || d.blood_group_self_reported}</Group>
                      {!d.blood_group_verified && <div className="xs muted">self-reported</div>}</td>
                    <td className="small">{d.contact_phone || <span className="muted">hidden</span>}</td>
                    <td className="small">{d.area_pincode}</td>
                    <td className="small">{d.last_donation_date ? fmtDate(d.last_donation_date) : '—'}</td>
                    <td>
                      <Pill tone={d.eligibility.eligible ? 'green' : d.eligibility.eligibility_status === 'DEFERRED' ? 'amber' : 'grey'}>
                        {d.eligibility.eligibility_status}
                      </Pill>
                      <div className="xs muted">
                        {!d.eligibility.eligible && d.eligibility.next_eligible_date
                          ? `from ${fmtDate(d.eligibility.next_eligible_date)}`
                          : ''}
                      </div>
                    </td>
                    <td><Pill tone={d.status === 'ACTIVE' ? 'green' : d.status === 'PENDING_REVIEW' ? 'amber' : 'blue'}>{d.status.replace('_', ' ')}</Pill></td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {d.status === 'PENDING_REVIEW' && (
                          <button className="btn-primary btn-sm" onClick={() => { setForm({ decision: 'CLEAR', deferral_until_date: '', note: '' }); setReview(d); }}>Review</button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => { setForm((f) => ({ ...f, deferral_until_date: d.deferral_until_date || '' })); setDefer(d); }}>Defer</button>
                        <button className="btn-ghost btn-sm" disabled={busy} onClick={() => recordDonation(d)}>Log donation</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {review && (
        <Modal title={`Review ${review.name}`} onClose={() => setReview(null)}
          footer={<><button className="btn-ghost" onClick={() => setReview(null)}>Cancel</button><button className="btn-confirm" onClick={submitReview} disabled={busy}>Save decision</button></>}>
          <div className="stack-sm">
            <div className="note note-blue small">
              This donor answered “yes” to having been advised not to donate. The app does not interpret the reason — you
              decide, in person, after speaking to them.
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Decision</label>
              <select value={form.decision} onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value }))}>
                <option value="CLEAR">Cleared — add to the call list</option>
                <option value="DEFER">Cleared but deferred until a date</option>
                <option value="REJECT">Keep on hold for now</option>
              </select>
            </div>
            {form.decision === 'DEFER' && (
              <div className="field" style={{ margin: 0 }}>
                <label>Deferred until</label>
                <input type="date" value={form.deferral_until_date} onChange={(e) => setForm((f) => ({ ...f, deferral_until_date: e.target.value }))} />
              </div>
            )}
            <div className="field" style={{ margin: 0 }}>
              <label>Note (audit trail)</label>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {defer && (
        <Modal title={`Set a deferral for ${defer.name}`} onClose={() => setDefer(null)}
          footer={<><button className="btn-ghost" onClick={() => setDefer(null)}>Cancel</button><button className="btn-primary" onClick={submitDeferral} disabled={busy}>Save deferral</button></>}>
          <div className="stack-sm">
            <div className="field" style={{ margin: 0 }}>
              <label>Do not contact for donation until</label>
              <input type="date" value={form.deferral_until_date} onChange={(e) => setForm((f) => ({ ...f, deferral_until_date: e.target.value }))} />
              <div className="hint">Leave empty to remove an existing deferral. A future date always beats the standard 90/120-day gap.</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
