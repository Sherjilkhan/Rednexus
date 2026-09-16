import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api.js';
import { Empty, Loading, Pill, Stat, fmtDate, fmtDateTime, stateTone } from '../../components/ui.jsx';

export default function AdminHome() {
  const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/admin/stats').then((d) => setStats(d.stats)).catch((e) => setError(e.message));
    api('/admin/requests').then((d) => setRequests(d.requests)).catch(() => {});
  }, []);

  if (error) return <div className="wrap section"><div className="note note-red">{error}</div></div>;
  if (!stats) return <div className="wrap section"><Loading rows={6} /></div>;

  const { donors, institutions, requests: reqStats, notifications, donations, camps } = stats;
  const byState = (reqStats.by_state || []).filter((s) => s.count > 0);
 
  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">Platform admin</span>
          <h1 style={{ margin: '8px 0 0' }}>RedNexus at a glance</h1>
          <p className="small muted" style={{ marginTop: 6 }}>
            Admins see counts and audit records — never a donor's phone number or address.
          </p>
        </div>
        {institutions.pending > 0 && (
          <Link className="btn btn-primary btn-sm" to="/admin/institutions">
            {institutions.pending} blood bank{institutions.pending === 1 ? '' : 's'} awaiting verification
          </Link>
        )}
      </div>

      <div className="grid grid-4">
        <Stat label="Registered donors" value={donors.total} foot={`${donors.active} active · ${donors.eligible_now} eligible today`} />
        <Stat label="Blood banks" value={institutions.total} foot={`${institutions.verified} verified · ${institutions.pending} pending`} />
        <Stat label="Requests" value={reqStats.total} foot={`${reqStats.awaiting_confirmation} awaiting a human · ${reqStats.open} open`} />
        <Stat label="Donations logged" value={donations.total} foot={`${donations.units} units`} />
      </div>

      <div className="grid grid-4">
        <Stat label="Notifications sent" value={notifications.sent} foot="in-app only in this build" />
        <Stat label="Donors who said yes" value={notifications.accepted} foot={`${notifications.response_rate}% replied`} />
        <Stat label="Messages per donation" value={notifications.notifications_per_donation} foot="lower is kinder to donors" />
        <Stat label="Camps listed" value={camps.total} foot={`${camps.upcoming} upcoming`} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><div><h4>Donor pool by blood group</h4><p className="small">Eligible today vs registered — where the pool is thin.</p></div></div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={stats.donors_by_group} margin={{ top: 8, right: 10, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="#E7DCD5" vertical={false} />
                <XAxis dataKey="blood_group" tick={{ fontSize: 11, fill: '#7A6C68' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6C68' }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="donors" name="registered" fill="#D6C7BE" radius={[4, 4, 0, 0]} />
                <Bar dataKey="eligible" name="eligible today" fill="#B3202E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h4>Units issued across the platform</h4><p className="small">Daily reported consumption</p></div></div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <AreaChart data={stats.usage_trend} margin={{ top: 8, right: 10, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="#E7DCD5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7A6C68' }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#7A6C68' }} />
                <Tooltip labelFormatter={fmtDate} />
                <Area type="monotone" dataKey="units" name="units issued" stroke="#B3202E" strokeWidth={2} fill="#F6E3E2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><div><h4>Requests by state</h4><p className="small">Fulfilment rate {reqStats.fulfillment_rate}%</p></div></div>
          {byState.length === 0 ? <Empty title="No requests yet" /> : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={byState} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 30 }}>
                  <CartesianGrid stroke="#E7DCD5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#7A6C68' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="state" tick={{ fontSize: 10, fill: '#7A6C68' }} width={82} />
                  <Tooltip />
                  <Bar dataKey="count" name="requests" radius={[0, 4, 4, 0]}>
                    {byState.map((s) => (
                      <Cell key={s.state} fill={s.state === 'DETECTED' ? '#C8892B' : s.state === 'CLOSED' ? '#9C8C86' : '#1C5A8A'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div><h4>Where requests come from</h4><p className="small">Threshold breaches should dominate a healthy deployment.</p></div></div>
          <div className="stack-sm">
            {(reqStats.by_origin || []).map((o) => (
              <div className="panel row-between" key={o.origin}>
                <span className="small">{o.origin.replace('_', ' ').toLowerCase()}</span>
                <strong className="mono">{o.count}</strong>
              </div>
            ))}
            <div className="note note-blue small">
              Every DETECTED request needed a named person to approve it before any donor was contacted — see the audit trail.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div><h4>Latest requests</h4></div></div>
        {requests.length === 0 ? <Empty title="No requests yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Group</th><th className="num">Units</th><th>Origin</th><th>State</th><th>Confirmed by</th><th>Created</th></tr></thead>
              <tbody>
                {requests.slice(0, 12).map((r) => (
                  <tr key={r.id}>
                    <td>{r.blood_group}</td><td className="num">{r.units_needed}</td>
                    <td className="small muted">{r.origin.replace('_', ' ').toLowerCase()}</td>
                    <td><Pill tone={stateTone(r.state)}>{r.state}</Pill></td>
                    <td className="small">{r.confirmed_by_name || <span className="muted">not yet</span>}</td>
                    <td className="xs muted">{fmtDateTime(r.created_at)}</td>
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
