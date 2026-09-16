import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Empty, Loading, Modal, Pill, fmtDateTime } from '../../components/ui.jsx';

/** F2 — institution verification. Nothing about a bank works until this screen says VERIFIED. */
export default function AdminInstitutions() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [act, setAct] = useState(null);
  const [staff, setStaff] = useState(null);
  const [form, setForm] = useState({ decision: 'VERIFIED', note: '' });
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/admin/institutions').then((d) => setRows(d.institutions));
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, []);

  async function decide() {
    setBusy(true);
    try {
      await api(`/admin/institutions/${act.id}/verification`, { method: 'POST', body: { decision: form.decision, note: form.note || null } });
      setAct(null);
      await load();
      toast(`${act.name} set to ${form.decision}`, 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function addStaff() {
    setBusy(true);
    try {
      await api(`/admin/institutions/${staff.id}/staff`, { method: 'POST', body: staffForm });
      setStaff(null);
      setStaffForm({ name: '', email: '', password: '', phone: '' });
      await load();
      toast('Staff account created', 'ok');
    } catch (err) { toast(err.details?.map((x) => x.message).join(', ') || err.message, 'err'); } finally { setBusy(false); }
  }

  if (!rows) return <div className="wrap section"><Loading rows={5} /></div>;

  return (
    <div className="wrap section stack">
      <div>
        <span className="eyebrow">F2 · verification</span>
        <h1 style={{ margin: '8px 0 4px' }}>Blood bank verification</h1>
        <p className="small muted">
          A bank can only be verified once it has at least one named staff account. Until verified, its staff cannot report
          usage, confirm thresholds, or contact a single donor.
        </p>
      </div>

      {rows.filter((r) => r.verification_status === 'PENDING').length === 0 && (
        <div className="note note-green">No blood banks are waiting for a decision.</div>
      )}

      <div className="card">
        {rows.length === 0 ? <Empty title="No blood banks registered" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Blood bank</th><th>Type</th><th>Licence</th><th>City / PIN</th><th className="num">Staff</th><th>Status</th><th>Decided by</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><div className="xs muted">{r.contact_email} · {r.contact_phone}</div></td>
                    <td className="small">{r.category === 'IN_HOUSE' ? 'Hospital in-house' : 'External / voluntary'}</td>
                    <td className="small mono">{r.licence_number}</td>
                    <td className="small">{r.location?.city} {r.location?.pincode}</td>
                    <td className="num">{r.staff_count}</td>
                    <td>
                      <Pill tone={r.verification_status === 'VERIFIED' ? 'green' : r.verification_status === 'REJECTED' ? 'red' : 'amber'}>
                        {r.verification_status}
                      </Pill>
                    </td>
                    <td className="xs muted">{r.verified_by_name ? `${r.verified_by_name} · ${fmtDateTime(r.verified_at)}` : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn-ghost btn-sm" onClick={() => { setStaffForm({ name: '', email: '', password: '', phone: '' }); setStaff(r); }}>Add staff</button>
                        <button className={r.verification_status === 'PENDING' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                          onClick={() => { setForm({ decision: r.verification_status === 'VERIFIED' ? 'PENDING' : 'VERIFIED', note: '' }); setAct(r); }}>
                          Decide
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {act && (
        <Modal title={`Verification decision — ${act.name}`} onClose={() => setAct(null)}
          footer={<><button className="btn-ghost" onClick={() => setAct(null)}>Cancel</button><button className="btn-confirm" onClick={decide} disabled={busy}>Record decision as {user.name}</button></>}>
          <div className="stack-sm">
            <div className="panel small">
              Licence <strong className="mono">{act.licence_number}</strong> · {act.staff_count} staff account(s) ·{' '}
              {act.category === 'IN_HOUSE' ? 'hospital in-house bank' : 'external / voluntary bank'}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Decision</label>
              <select value={form.decision} onChange={(e) => setForm((f) => ({ ...f, decision: e.target.value }))}>
                <option value="VERIFIED">Verified — allow operations</option>
                <option value="PENDING">Back to pending</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Note (audit trail)</label>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. licence checked against state register" />
            </div>
            {act.staff_count === 0 && form.decision === 'VERIFIED' && (
              <div className="note note-red small">This bank has no staff account yet — add one first, or verification will be refused.</div>
            )}
          </div>
        </Modal>
      )}

      {staff && (
        <Modal title={`Add a staff account — ${staff.name}`} onClose={() => setStaff(null)}
          footer={<><button className="btn-ghost" onClick={() => setStaff(null)}>Cancel</button><button className="btn-primary" onClick={addStaff} disabled={busy}>Create account</button></>}>
          <div className="stack-sm">
            <div className="field" style={{ margin: 0 }}><label>Full name</label><input value={staffForm.name} onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label>Email (login)</label><input type="email" value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label>Phone</label><input value={staffForm.phone} onChange={(e) => setStaffForm((f) => ({ ...f, phone: e.target.value }))} placeholder="9876543210" /></div>
            <div className="field" style={{ margin: 0 }}><label>Temporary password</label><input value={staffForm.password} onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))} /></div>
            <div className="note note-blue small">Every confirmation this person makes will carry their name in the audit trail.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
