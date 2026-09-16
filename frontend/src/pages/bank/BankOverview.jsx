import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Empty, Group, Loading, Pill, Stat, fmtDate } from '../../components/ui.jsx';

export default function BankOverview() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [series, setSeries] = useState([]);
  const [requests, setRequests] = useState([]);
  const [edit, setEdit] = useState({});
  const [busy, setBusy] = useState(null);

  const load = async () => {
    const [t, u, r] = await Promise.all([api('/bank/thresholds'), api('/bank/usage?days=30'), api('/bank/requests')]);
    setRows(t.rows);
    setSeries(u.series);
    setRequests(r.requests);
  };
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, []);

  if (!user?.institution_verified) {
    return (
      <div className="wrap section">
        <div className="note note-amber">
          <strong>{user?.institution_name}</strong> is still <strong>{user?.institution_status}</strong>. A platform admin
          must verify your blood bank before you can report usage, confirm thresholds, or contact donors. Verification is
          never bypassed, including in this demo.
        </div>
      </div>
    );
  }
  if (!rows) return <div className="wrap section"><Loading rows={6} /></div>;

  const breached = rows.filter((r) => r.breached);
  const drafts = requests.filter((r) => r.state === 'DETECTED');
  const totalStock = rows.reduce((s, r) => s + r.current_stock, 0);

  async function saveStock(bg) {
    const value = Number(edit[bg]);
    if (Number.isNaN(value)) return;
    setBusy(bg);
    try {
      const d = await api('/bank/stock', { method: 'PUT', body: { blood_group: bg, units_available: value } });
      setEdit((e) => ({ ...e, [bg]: undefined }));
      await load();
      toast(d.drafts_created ? `Stock saved — ${d.drafts_created} draft alert created for review` : 'Stock saved', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">{user.institution_category === 'IN_HOUSE' ? 'In-house blood bank' : 'External blood bank'}</span>
          <h1 style={{ margin: '8px 0 0' }}>{user.institution_name}</h1>
        </div>
        <div className="row">
          <Link to="/bank/usage" className="btn btn-primary btn-sm">Report today's usage</Link>
          <Link to="/bank/requests" className="btn btn-ghost btn-sm">Alerts awaiting confirmation ({drafts.length})</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Units in stock" value={totalStock} foot="across all groups" />
        <Stat label="Groups below threshold" value={breached.length} foot={breached.map((b) => b.blood_group).join(', ') || 'none'} />
        <Stat label="Drafts awaiting a human" value={drafts.length} foot="nothing sent until you confirm" />
        <Stat label="Thresholds confirmed" value={`${rows.filter((r) => r.active).length}/8`} foot="groups with an active minimum" />
      </div>

      {drafts.length > 0 && (
        <div className="note note-amber row-between">
          <span>
            <strong>{drafts.length} draft alert{drafts.length === 1 ? '' : 's'} waiting.</strong> The system detected these
            from confirmed thresholds. No donor has been contacted.
          </span>
          <Link className="btn btn-primary btn-sm" to="/bank/requests">Review them</Link>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div><h4>Stock against confirmed thresholds</h4><p className="small">Edit a number and press save — breach detection runs immediately on every stock change.</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th><th className="num">Stock</th><th className="num">Confirmed threshold</th>
                <th className="num">Avg daily use</th><th className="num">Weekly target</th><th>Status</th><th>Update stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.blood_group}>
                  <td><Group>{r.blood_group}</Group></td>
                  <td className="num">{r.current_stock}</td>
                  <td className="num">{r.confirmed_threshold ?? <span className="muted">not set</span>}</td>
                  <td className="num">{r.avg_daily_consumption}</td>
                  <td className="num">{r.confirmed_target ?? <span className="muted">—</span>}</td>
                  <td>
                    {r.confirmed_threshold == null ? <Pill tone="grey">no threshold</Pill>
                      : r.breached ? <Pill tone="red">at or below threshold</Pill> : <Pill tone="green">healthy</Pill>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <input
                        className="inline-num" type="number" min={0} aria-label={`Stock for ${r.blood_group}`}
                        value={edit[r.blood_group] ?? r.current_stock}
                        onChange={(e) => setEdit((s) => ({ ...s, [r.blood_group]: e.target.value }))}
                      />
                      <button className="btn-ghost btn-sm" disabled={busy === r.blood_group} onClick={() => saveStock(r.blood_group)}>Save</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><div><h4>Units issued per day</h4><p className="small">Last 30 days, all groups</p></div></div>
          {series.length === 0 ? <Empty title="No usage reported yet">Report today's usage to start the threshold engine.</Empty> : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#E7DCD5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7A6C68' }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#7A6C68' }} />
                  <Tooltip labelFormatter={fmtDate} />
                  <Line type="monotone" dataKey="total" name="units issued" stroke="#B3202E" strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="O+" stroke="#1C5A8A" strokeWidth={1.4} dot={false} />
                  <Line type="monotone" dataKey="A+" stroke="#1E7A55" strokeWidth={1.4} dot={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div><h4>Stock vs threshold by group</h4><p className="small">Where collection needs to keep pace</p></div></div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="#E7DCD5" vertical={false} />
                <XAxis dataKey="blood_group" tick={{ fontSize: 11, fill: '#7A6C68' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6C68' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="current_stock" name="stock" fill="#B3202E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="confirmed_threshold" name="threshold" fill="#D6C7BE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
