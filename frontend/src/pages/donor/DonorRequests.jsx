import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { Empty, Group, Loading, Pill, fmtDateTime } from '../../components/ui.jsx';
import BloodDonorQuestionnaireModal from './BloodDonorQuestionnaireModal.jsx';

export default function DonorRequests() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [donorProfile, setDonorProfile] = useState(null);
  const [busy, setBusy] = useState(null);

  // State to track which notification is currently being accepted via the modal
  const [activeNotification, setActiveNotification] = useState(null);

  const load = () => {
    // Load notifications
    api('/donor/notifications')
      .then((d) => setRows(d.notifications))
      .catch(() => setRows([]));

    // Fetch donor profile for autofilling personal info
    api('/donor/profile')
      .then((data) => setDonorProfile(data.profile || data))
      .catch(() => setDonorProfile(null));
  };

  useEffect(() => {
    load();
  }, []);

  // Handle immediate rejection
  async function handleDecline(id) {
    setBusy(id);
    try {
      await api(`/donor/notifications/${id}/respond`, {
        method: 'POST',
        body: { response: 'DECLINED' },
      });
      toast('Noted, thanks for telling us', 'ok');
      await load();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(null);
    }
  }

  // Handle questionnaire submission from the modal
  async function handleQuestionnaireSubmit(questionnaireData) {
    if (!activeNotification) return;
    const notifId = activeNotification.id;

    setBusy(notifId);
    try {
      // Sends response status AND questionnaire payload to the backend
      await api(`/donor/notifications/${notifId}/respond`, {
        method: 'POST',
        body: {
          response: 'ACCEPTED',
          questionnaire: questionnaireData,
        },
      });

      toast('Thank you — your questionnaire was submitted and blood bank has been notified', 'ok');
      setActiveNotification(null); // Close modal
      await load();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wrap section stack">
      <div>
        <span className="eyebrow">Requests for me</span>
        <h1 style={{ margin: '8px 0 4px' }}>When your blood group is needed</h1>
        <p className="small muted">
          Every message here was approved by a named member of staff at the blood bank. Nobody outside the blood bank can
          see your phone number.
        </p>
      </div>

      {rows === null ? (
        <Loading rows={3} />
      ) : rows.length === 0 ? (
        <Empty title="No requests yet">You will see a message here when your group runs short at your blood bank.</Empty>
      ) : (
        <div className="stack">
          {rows.map((n) => (
            <div className="card" key={n.id}>
              <div className="card-head">
                <div className="row">
                  <Group>{n.blood_group}</Group>
                  <div>
                    <strong>{n.institution_name}</strong>
                    <div className="xs muted">
                      Sent {fmtDateTime(n.sent_at)} · {n.units_needed} unit(s) needed{n.urgency === 'HIGH' ? ' · urgent' : ''}
                    </div>
                  </div>
                </div>
                <Pill tone={n.response === 'ACCEPTED' ? 'green' : n.response === 'DECLINED' ? 'grey' : n.response === 'PENDING' ? 'red' : 'grey'}>
                  {n.response === 'PENDING' ? 'Needs your answer' : n.response.replace('_', ' ').toLowerCase()}
                </Pill>
              </div>

              <p style={{ marginBottom: 12 }}>{n.message}</p>
              {n.closing_message && <div className="note note-green" style={{ marginBottom: 12 }}>{n.closing_message}</div>}

              {n.response === 'PENDING' ? (
                <div className="row">
                  {/* Clicking this opens the questionnaire modal */}
                  <button
                    className="btn-confirm"
                    disabled={busy === n.id}
                    onClick={() => setActiveNotification(n)}
                  >
                    Yes, I can come
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busy === n.id}
                    onClick={() => handleDecline(n.id)}
                  >
                    Not this time
                  </button>
                </div>
              ) : (
                <div className="xs muted">
                  {n.response_at ? `You answered ${fmtDateTime(n.response_at)}` : 'This request has since been closed.'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pop-up Questionnaire Modal */}
      {activeNotification && (
        <BloodDonorQuestionnaireModal
          notification={activeNotification}
          donorProfile={donorProfile}
          submitting={busy === activeNotification.id}
          onClose={() => setActiveNotification(null)}
          onSubmit={handleQuestionnaireSubmit}
        />
      )}
    </div>
  );
}