import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { BLOOD_GROUPS, Group, Loading, Pill, fmtDate } from '../../components/ui.jsx';

/** T1 — the daily usage form. Designed to be done in under a minute, keyboard-first. */
export default function BankUsage() {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [values, setValues] = useState(() => Object.fromEntries(BLOOD_GROUPS.map((g) => [g, ''])));
  const [records, setRecords] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api('/bank/usage?days=14').then((d) => setRecords(d.records));
  useEffect(() => { load().catch(() => setRecords([])); }, []);

  async function submit(e) {
    e.preventDefault();
    const entries = BLOOD_GROUPS.filter((g) => values[g] !== '').map((g) => ({ blood_group: g, units_issued: Number(values[g]) }));
    if (!entries.length) return toast('Enter at least one number — zero is a valid answer', 'err');
    setBusy(true);
    try {
      const d = await api('/bank/usage', { method: 'POST', body: { date, entries } });
      toast(d.drafts_created ? `Usage saved. ${d.drafts_created} draft alert created for your review.` : 'Usage saved for ' + fmtDate(date), 'ok');
      setValues(Object.fromEntries(BLOOD_GROUPS.map((g) => [g, ''])));
      await load();
    } catch (err) {
      toast(err.details?.map((x) => x.message).join(', ') || err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const reportedDays = records ? Math.min(14, new Set(records.map((r) => r.date)).size) : 0;

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">T1 · daily usage</span>
          <h1 style={{ margin: '8px 0 4px' }}>How many units did you issue?</h1>
          <p className="small muted">One number per blood group, once a day. This is the data the whole threshold engine runs on.</p>
        </div>
        <Pill tone={reportedDays >= 12 ? 'green' : reportedDays >= 6 ? 'amber' : 'red'}>{reportedDays}/14 days reported</Pill>
      </div>

      <form className="card" onSubmit={submit}>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="date">Date issued</label>
          <input id="date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-4">
          {BLOOD_GROUPS.map((g) => (
            <div key={g} className="panel row" style={{ justifyContent: 'space-between' }}>
              <Group>{g}</Group>
              <input
                className="inline-num" type="number" min={0} inputMode="numeric" placeholder="0"
                aria-label={`Units issued of ${g}`} value={values[g]}
                onChange={(e) => setValues((v) => ({ ...v, [g]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn-primary btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Save usage'}</button>
          <button type="button" className="btn-ghost" onClick={() => setValues(Object.fromEntries(BLOOD_GROUPS.map((g) => [g, '0'])))}>
            Nothing issued today
          </button>
        </div>
        <p className="xs muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Saving also re-checks stock against your confirmed thresholds. Any breach creates a draft alert for review — it
          never contacts a donor on its own.
        </p>
      </form>

      <div className="card">
        <div className="card-head"><h4>Last 14 days reported</h4></div>
        {records === null ? <Loading rows={4} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Group</th><th className="num">Units issued</th><th>Reported</th></tr></thead>
              <tbody>
                {records.slice(0, 40).map((r) => (
                  <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{r.blood_group}</td><td className="num">{r.units_issued}</td>
                    <td className="xs muted">{r.reported_at ? new Date(r.reported_at).toLocaleDateString('en-IN') : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
