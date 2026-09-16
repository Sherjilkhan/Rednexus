import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Empty, Loading, Pill, fmtDateTime } from '../../components/ui.jsx';

export default function AdminAudit() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/admin/audit').then((d) => setRows(d.entries)).catch(() => setRows([])); }, []);
  const filtered = (rows || []).filter((e) => !q || (e.action + e.actor_name + (e.note || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="wrap section stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">Platform audit</span>
          <h1 style={{ margin: '8px 0 4px' }}>Every human decision on the platform</h1>
          <p className="small muted">Verifications, threshold confirmations, alert approvals and donor reviews — with names and timestamps.</p>
        </div>
        <input placeholder="Filter by action, person or note" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      </div>
      <div className="card">
        {rows === null ? <Loading rows={6} /> : filtered.length === 0 ? <Empty title="No matching entries" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Action</th><th>By</th><th>Role</th><th>Entity</th><th>Note</th><th>At</th></tr></thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td><Pill tone={e.action.includes('VERIF') ? 'blue' : e.action.includes('THRESHOLD') ? 'green' : 'grey'}>{e.action.replace(/_/g, ' ').toLowerCase()}</Pill></td>
                    <td className="small"><strong>{e.actor_name}</strong></td>
                    <td className="xs muted">{e.actor_role}</td>
                    <td className="xs muted">{e.entity_type} {String(e.entity_id).slice(-6)}</td>
                    <td className="small">{e.note || '—'}</td>
                    <td className="xs muted">{fmtDateTime(e.at)}</td>
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
