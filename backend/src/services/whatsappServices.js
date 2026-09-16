import axios from 'axios';

const GATEWAY_URL    = process.env.WA_GATEWAY_URL    || 'http://localhost:3002';
const GATEWAY_SECRET = process.env.WA_GATEWAY_SECRET || 'raktasetu-wa-secret';
const FRONTEND_URL   = process.env.FRONTEND_URL       || 'http://localhost:5173';

/**
 * Sends a WhatsApp message to a donor via the local wbm gateway.
 * Non-blocking — caller should .catch() this.
 */
export async function sendDonorWhatsApp(toPhone, { donorName, bloodGroup, institutionName, urgency, notificationId }) {
  // Sanitize phone — digits only
  const cleanPhone = String(toPhone).replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    console.warn(`[WhatsApp] Invalid phone: ${toPhone} — skipping.`);
    return { success: false, error: 'invalid phone' };
  }

  const donorLink = `${FRONTEND_URL}/#/donor/requests`;

  const urgencyLine =
    urgency === 'HIGH' ? '⚠️ URGENT REQUEST' :
    urgency === 'LOW'  ? '📅 Scheduled collection drive' :
                         '🩸 Blood request';

  const message =
    `${urgencyLine}\n\n` +
    `Hello ${donorName},\n` +
    `*${institutionName}* needs *${bloodGroup}* blood.\n\n` +
    `Please open the app to Accept or Decline:\n${donorLink}\n\n` +
    `_Raktasetu — consumption-calibrated blood supply_`;

  try {
    const res = await axios.post(
      `${GATEWAY_URL}/send`,
      { phone: cleanPhone, message },
      {
        headers: { 'x-gateway-secret': GATEWAY_SECRET },
        timeout: 10000,
      }
    );
    console.log(`[WhatsApp] Sent to ${cleanPhone}`);
    return { success: true };
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    console.error(`[WhatsApp] Failed for ${cleanPhone}: ${detail}`);
    return { success: false, error: detail };
  }
}
