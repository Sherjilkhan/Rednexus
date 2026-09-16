import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { BLOOD_GROUPS, Empty, Group, Loading, Modal, Pill, fmtDateTime, originTone, stateTone } from '../../components/ui.jsx';

export default function BankRequests() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ blood_group: 'O+', units_needed: 2, urgency: 'NORMAL', reason: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/bank/requests').then((d) => setRows(d.requests));
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, []);

  async function detect() {
    setBusy(true);
    try {
      const d = await api('/bank/detect-breaches', { method: 'POST' });
      await load();
      toast(d.drafts.length ? `${d.drafts.length} new draft alert(s) created for review` : 'No new breaches found', 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function raise() {
    setBusy(true);
    try {
      await api('/bank/requests', { method: 'POST', body: { ...form, units_needed: Number(form.units_needed) } });
      setManual(false);
      await load();
      toast('Request raised at state RAISED — you raised it, so no separate confirmation is needed', 'ok');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  if (!rows) return <div className="wrap section"><Loading rows={6} /></div>;
  const drafts = rows.filter((r) => r.state === 'DETECTED');
  const active = rows.filter((r) => r.state !== 'DETECTED' && r.state !== 'CLOSED');
  const closed = rows.filter((r) => r.state === 'CLOSED');

  const Table = ({ items }) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Group</th><th className="num">Units</th><th>Origin</th><th>State</th><th>Why</th><th className="num">Notified</th><th className="num">Accepted</th><th>Created</th><th /></tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td><Group>{r.blood_group}</Group></td>
              <td className="num">{r.units_needed}</td>
              <td><Pill tone={originTone(r.origin)}>{r.origin.replace('_', ' ').toLowerCase()}</Pill></td>
              <td><Pill tone={stateTone(r.state)}>{r.state}</Pill></td>
              <td className="small muted" style={{ maxWidth: 280 }}>{r.reason}</td>
              <td className="num">{r.notified_count}</td>
              <td className="num">{r.accepted_count}</td>
              <td className="xs muted">{fmtDateTime(r.created_at)}</td>
              <td><Link className="btn btn-ghost btn-sm" to={`/bank/requests/${r.id}`}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">T5 · confirmation gate · F4</span>
          <h1 style={{ margin: '8px 0 4px' }}>Alerts and requests</h1>
          <p className="small muted">Drafts are created by the system. Only you can turn one into a request donors can see.</p>
        </div>
        <div className="row">
          <button className="btn-ghost btn-sm" onClick={detect} disabled={busy}>Re-check thresholds now</button>
          <button className="btn-primary btn-sm" onClick={() => setManual(true)}>Raise a request manually</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h4>Awaiting your confirmation ({drafts.length})</h4>
            <p className="small">State <code>DETECTED</code> — the system drafted these. No donor has been contacted.</p>
          </div>
        </div>
        {drafts.length === 0 ? <Empty title="Nothing waiting">Stock is above every confirmed threshold right now.</Empty> : <Table items={drafts} />}
      </div>

      <div className="card">
        <div className="card-head"><div><h4>In progress ({active.length})</h4><p className="small">Confirmed requests moving through the state machine.</p></div></div>
        {active.length === 0 ? <Empty title="No live requests">Confirm a draft to start contacting donors.</Empty> : <Table items={active} />}
      </div>

      {closed.length > 0 && (
        <div className="card">
          <div className="card-head"><div><h4>Closed ({closed.length})</h4></div></div>
          <Table items={closed} />
        </div>
      )}

      {manual && (
        <Modal
          title="Raise a request manually"
          onClose={() => setManual(false)}
          footer={<><button className="btn-ghost" onClick={() => setManual(false)}>Cancel</button><button className="btn-primary" onClick={raise} disabled={busy}>Raise request</button></>}
        >
          <div className="stack-sm">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Blood group</label>
                <select value={form.blood_group} onChange={(e) => setForm((f) => ({ ...f, blood_group: e.target.value }))}>
                  {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Units needed</label>
                <input type="number" min={1} value={form.units_needed} onChange={(e) => setForm((f) => ({ ...f, units_needed: e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Urgency</label>
              <select value={form.urgency} onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}>
                <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High — needed today</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Reason</label>
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. unplanned trauma case" />
            </div>
            <div className="note note-blue small">
              A manual request starts at <code>RAISED</code> because a human — you — raised it. Donors are still only
              contacted when you press dispatch.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
