import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/Toast.jsx';
import { Group, Loading, Modal, Pill, fmtDateTime } from '../../components/ui.jsx';

/**
 * T2/T3/T4 — the highest-stakes screen in the product alongside alert approval.
 * A proposal is only ever a suggestion; a named staff member must confirm it,
 * and may edit the numbers first. There is no bulk-approve and no auto-confirm.
 */
export default function BankThresholds() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ threshold: 0, target: 0, note: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/bank/thresholds').then((d) => setRows(d.rows));
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, []);

  function startConfirm(row) {
    setForm({
      threshold: row.confirmed_threshold ?? row.proposed_threshold,
      target: row.confirmed_target ?? row.recurring_collection_target,
      note: '',
    });
    setOpen(row);
  }

  async function confirm() {
    setBusy(true);
    try {
      const d = await api('/bank/thresholds/confirm', {
        method: 'POST',
        body: {
          blood_group: open.blood_group,
          confirmed_threshold: Number(form.threshold),
          recurring_collection_target: Number(form.target),
          note: form.note || null,
        },
      });
      setOpen(null);
      await load();
      toast(
        d.drafts_created
          ? `${open.blood_group} threshold confirmed. Stock is already below it — ${d.drafts_created} draft alert is waiting for your approval.`
          : `${open.blood_group} threshold confirmed and active`,
        'ok',
      );
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <div className="wrap section"><Loading rows={6} /></div>;

  return (
    <div className="wrap section stack">
      <div>
        <span className="eyebrow">T2 · T3 · T4 — threshold engine</span>
        <h1 style={{ margin: '8px 0 4px' }}>Proposed thresholds need your confirmation</h1>
        <p className="small muted">
          Each proposal is a 14-day rolling average of your own reported usage. Edit anything that looks wrong, then
          confirm. A proposal has no effect until you do — and your name and the time are recorded against it.
        </p>
      </div>

      <div className="grid grid-2">
        {rows.map((r) => (
          <div className="card" key={r.blood_group}>
            <div className="card-head">
              <div className="row">
                <Group>{r.blood_group}</Group>
                <div>
                  <div className="small"><strong>{r.avg_daily_consumption}</strong> units/day average</div>
                  <div className="xs muted">{r.total_units_issued} units over {r.days_reported}/{r.window_days} reported days</div>
                </div>
              </div>
              {r.active
                ? <Pill tone="green">active</Pill>
                : <Pill tone="amber">awaiting confirmation</Pill>}
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div className="panel">
                <div className="label">Proposed minimum stock</div>
                <div className="mono" style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>{r.proposed_threshold}</div>
                <div className="xs muted">5 days of cover</div>
              </div>
              <div className="panel">
                <div className="label">Proposed weekly collection</div>
                <div className="mono" style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>{r.recurring_collection_target}</div>
                <div className="xs muted">units every {r.target_period_days} days</div>
              </div>
            </div>

            <div className="row-between" style={{ marginTop: 14 }}>
              <div className="xs muted">
                Data confidence <Pill tone={r.data_confidence === 'HIGH' ? 'green' : r.data_confidence === 'MEDIUM' ? 'amber' : 'red'}>{r.data_confidence}</Pill>
                {' '}· stock now {r.current_stock}
              </div>
              <button className={r.active ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'} onClick={() => startConfirm(r)}>
                {r.active ? 'Review / change' : 'Review and confirm'}
              </button>
            </div>

            {r.active && (
              <div className="note note-green" style={{ marginTop: 12 }}>
                Confirmed at <strong>{r.confirmed_threshold}</strong> units (weekly target {r.confirmed_target}) by{' '}
                <strong>{r.confirmed_by_name}</strong> on {fmtDateTime(r.confirmed_at)}.
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <Modal
          title={`Confirm the ${open.blood_group} threshold`}
          onClose={() => setOpen(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
              <button className="btn-confirm" onClick={confirm} disabled={busy}>
                {busy ? 'Confirming…' : `Confirm as ${user.name}`}
              </button>
            </>
          }
        >
          <div className="stack-sm">
            <div className="panel small">
              System proposal from your usage data: minimum <strong>{open.proposed_threshold}</strong> units, collect{' '}
              <strong>{open.recurring_collection_target}</strong> units every {open.target_period_days} days
              ({open.avg_daily_consumption} units/day average over {open.days_reported} reported days).
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="th">Minimum stock (units)</label>
                <input id="th" type="number" min={0} value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="tg">Collection target per {open.target_period_days} days</label>
                <input id="tg" type="number" min={0} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="note">Note (optional, kept in the audit trail)</label>
              <input id="note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. raised for the surgical week" />
            </div>
            <div className="note note-amber small">
              Confirming records your name and the time. Once active, stock at or below this number will create a draft
              alert — which still needs a separate approval before any donor hears from you.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
