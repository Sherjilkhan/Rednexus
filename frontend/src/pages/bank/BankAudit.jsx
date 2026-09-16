import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Empty, Loading, Pill, fmtDateTime } from '../../components/ui.jsx';

const tone = (a) => (a.includes('THRESHOLD') ? 'blue' : a.includes('RAISED') || a.includes('DETECTED') ? 'red' : a.includes('DONOR') ? 'amber' : 'grey');

export default function BankAudit() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('/bank/audit').then((d) => setRows(d.entries)).catch(() => setRows([])); }, []);

  return (
    <div className="wrap section stack">
      <div>
        <span className="eyebrow">Audit trail</span>
        <h1 style={{ margin: '8px 0 4px' }}>Who confirmed what, and when</h1>
        <p className="small muted">
          This is the evidence that the human-in-the-loop guarantee is real. Threshold confirmations and every
          DETECTED → RAISED approval are recorded here. No donor names or phone numbers are logged.
        </p>
      </div>
      <div className="card">
        {rows === null ? <Loading rows={5} /> : rows.length === 0 ? <Empty title="Nothing recorded yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Action</th><th>By</th><th>Entity</th><th>Detail</th><th>Note</th><th>At</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td><Pill tone={tone(e.action)}>{e.action.replace(/_/g, ' ').toLowerCase()}</Pill></td>
                    <td className="small"><strong>{e.actor_name}</strong><div className="xs muted">{e.actor_role}</div></td>
                    <td className="xs muted">{e.entity_type} {String(e.entity_id).slice(-6)}</td>
                    <td className="xs mono muted cell-json">{e.after ? JSON.stringify(e.after) : '—'}</td>
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
