import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api.js';
import { Empty, Group, Loading, Stat, fmtDate } from '../../components/ui.jsx';

/** F8 — digital donor record: history, Hb trend, self-reported vs confirmed blood group. */
export default function DonorHistory() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/donor/profile').then(setData).catch(() => setData({ history: [], donor: null })); }, []);
  if (!data) return <div className="wrap section"><Loading rows={4} /></div>;

  const { donor, history } = data;
  const hb = [...history].reverse().filter((h) => h.hb_level).map((h) => ({ date: fmtDate(h.date), hb: h.hb_level }));
  const units = history.reduce((s, h) => s + (h.units || 1), 0);

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">My donations</span>
          <h1 style={{ margin: '8px 0 0' }}>Your donation record</h1>
        </div>
        <Group>{donor?.blood_group_verified || donor?.blood_group_self_reported}</Group>
      </div>

      <div className="grid grid-4">
        <Stat label="Donations" value={history.length} />
        <Stat label="Units given" value={units} />
        <Stat label="Group as you reported" value={donor?.blood_group_self_reported || '—'} />
        <Stat label="Group confirmed at bank" value={donor?.blood_group_verified || 'Not confirmed yet'} />
      </div>

      {hb.length > 1 && (
        <div className="card">
          <div className="card-head"><div><h4>Haemoglobin at each donation</h4><p className="small">Recorded by the blood bank, not by you.</p></div></div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={hb} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#E7DCD5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A6C68' }} />
                <YAxis domain={[10, 17]} tick={{ fontSize: 11, fill: '#7A6C68' }} />
                <Tooltip />
                <Line type="monotone" dataKey="hb" stroke="#B3202E" strokeWidth={2.4} dot={{ r: 3.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h4>Every donation</h4></div>
        {history.length === 0 ? (
          <Empty title="No donations recorded yet">Your first donation will be added by the blood bank on the day.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Units</th><th>Haemoglobin</th><th>Linked request</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtDate(h.date)}</td>
                    <td className="num">{h.units || 1}</td>
                    <td>{h.hb_level ? `${h.hb_level} g/dL` : '—'}</td>
                    <td className="xs muted">{h.request_id ? h.request_id.slice(-6) : 'Camp / walk-in'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
