/** Thin controller layer: HTTP in, service call, HTTP out. All logic lives in services/. */
import bcrypt from 'bcryptjs';
import * as auth from '../services/authService.js';
import * as donors from '../services/donorService.js';
import * as institutions from '../services/institutionService.js';
import * as thresholds from '../services/thresholdService.js';
import * as requests from '../services/requestService.js';
import * as camps from '../services/campService.js';
import * as admin from '../services/adminService.js';
import { listAudit } from '../services/audit.js';
import { getDbMode, COLLECTIONS, listDocs, getDoc, updateDoc } from '../db/index.js';
import { BLOOD_GROUPS, DEMO_OTP, OTP_HINT_ENABLED } from '../config.js';
import { badRequest, forbidden, notFound, unauthorized } from '../services/errors.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* --- meta --- */
export const health = wrap(async (_req, res) =>
  res.json({ status: 'ok', db_mode: getDbMode(), blood_groups: BLOOD_GROUPS, otp_hint: OTP_HINT_ENABLED ? DEMO_OTP : null }),
);

/* --- auth --- */
export const login = wrap(async (req, res) => res.json(await auth.login(req.valid.email, req.valid.password)));
export const me = wrap(async (req, res) => res.json({ user: req.user }));

/* --- donors --- */
export const registerDonor = wrap(async (req, res) => {
  const out = await donors.registerDonor(req.valid);
  res.status(201).json({ ...out, donor: donors.publicDonor(out.donor, null) });
});
export const verifyOtp = wrap(async (req, res) => {
  const donor = await donors.verifyOtp(req.params.donorId, req.body.code);
  res.json({ donor: donors.publicDonor(donor, req.user) });
});
export const myProfile = wrap(async (req, res) => {
  const donor = await getDoc(COLLECTIONS.donors, req.user.donor_id);
  if (!donor) throw notFound('Donor profile not found');
  const [history, notifications, attendance] = await Promise.all([
    donors.donationHistory(donor.id),
    requests.donorNotifications(donor.id),
    camps.donorAttendance(donor.id),
  ]);
  res.json({ donor: donors.publicDonor(donor, req.user), history, notifications, attendance });
});
export const updatePreferences = wrap(async (req, res) => {
  const donor = await donors.updatePreferences(req.user.donor_id, req.valid);
  res.json({ donor: donors.publicDonor(donor, req.user) });
});
export const respond = wrap(async (req, res) => {
  const log = await requests.respondToNotification(
    req.params.id,
    req.user.donor_id,
    req.valid.response,
    req.valid.questionnaire,
    req.user,
  );
  res.json({ notification: log });
});
export const myNotifications = wrap(async (req, res) => res.json({ notifications: await requests.donorNotifications(req.user.donor_id) }));

/* --- staff: donor pool (contact details only for verified staff) --- */
export const staffDonorList = wrap(async (req, res) => {
  const rows = await donors.listDonors({ bloodGroup: req.query.blood_group, status: req.query.status });
  res.json({ donors: rows.map((d) => donors.publicDonor(d, req.user)) });
});
export const reviewDonor = wrap(async (req, res) => {
  const donor = await donors.reviewDonor(req.params.id, req.valid, req.user);
  res.json({ donor: donors.publicDonor(donor, req.user) });
});
export const setDeferral = wrap(async (req, res) => {
  const donor = await donors.setDeferral(req.params.id, req.body.deferral_until_date, req.user);
  res.json({ donor: donors.publicDonor(donor, req.user) });
});
export const recordDonation = wrap(async (req, res) => {
  const rec = await donors.recordDonation({ ...req.valid, institution_id: req.user.institution_id }, req.user);
  res.status(201).json({ donation: rec });
});

/* --- institutions --- */
export const registerInstitution = wrap(async (req, res) => res.status(201).json(await institutions.registerInstitution(req.valid)));
export const listInstitutions = wrap(async (req, res) => res.json({ institutions: await institutions.listInstitutions(req.query.status) }));
export const publicInstitutions = wrap(async (_req, res) => {
  const rows = await institutions.listInstitutions('VERIFIED');
  res.json({
    institutions: rows.map((i) => ({ id: i.id, name: i.name, category: i.category, linked_hospital_name: i.linked_hospital_name, location: i.location })),
  });
});
export const verifyInstitution = wrap(async (req, res) => {
  if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(req.body.decision)) throw badRequest('decision must be VERIFIED, REJECTED or PENDING');
  res.json({ institution: await institutions.setVerification(req.params.id, req.body.decision, req.user, req.body.note) });
});
export const addStaff = wrap(async (req, res) => {
  const user = await institutions.createStaffUser(req.params.id, req.body);
  res.status(201).json({ staff: { id: user.id, name: user.name, email: user.email } });
});

/* --- usage / thresholds / stock --- */
export const reportUsage = wrap(async (req, res) => {
  const saved = await thresholds.reportUsage(req.user.institution_id, req.valid, req.user);
  const breaches = await requests.detectBreaches(req.user.institution_id);
  res.status(201).json({ records: saved, drafts_created: breaches.length });
});
export const usage = wrap(async (req, res) =>
  res.json({
    records: await thresholds.usageRecords(req.user.institution_id, Number(req.query.days || 30)),
    series: await thresholds.usageSeries(req.user.institution_id, Number(req.query.days || 30)),
  }),
);
export const thresholdOverview = wrap(async (req, res) => res.json({ rows: await thresholds.thresholdOverview(req.user.institution_id) }));
export const confirmThreshold = wrap(async (req, res) => {
  const saved = await thresholds.confirmThreshold(req.user.institution_id, req.valid, req.user);
  const drafts = await requests.detectBreaches(req.user.institution_id);
  res.json({ threshold: saved, drafts_created: drafts.length });
});
export const stock = wrap(async (req, res) => res.json({ rows: await thresholds.stockLevels(req.user.institution_id) }));
export const updateStock = wrap(async (req, res) => {
  await thresholds.setStock(req.user.institution_id, req.valid.blood_group, req.valid.units_available, req.user);
  const drafts = await requests.detectBreaches(req.user.institution_id);
  res.json({ rows: await thresholds.stockLevels(req.user.institution_id), drafts_created: drafts.length });
});

/* --- requests --- */
export const listRequests = wrap(async (req, res) => res.json({ requests: await requests.listRequests(req.user.institution_id) }));
export const requestDetail = wrap(async (req, res) => res.json({ request: await requests.requestDetail(req.params.id, req.user) }));
export const raiseManual = wrap(async (req, res) => res.status(201).json({ request: await requests.raiseManualRequest(req.user.institution_id, req.valid, req.user) }));
export const confirmRequest = wrap(async (req, res) =>
  res.json({ request: await requests.confirmRequest(req.params.id, req.user, req.body?.note) }),
);
export const dispatch = wrap(async (req, res) => res.json(await requests.dispatchNotifications(req.params.id, req.user, { widen: !!req.body?.widen })));
export const advance = wrap(async (req, res) => res.json({ request: await requests.advanceRequest(req.params.id, req.valid.to, req.user) }));
export const runDetection = wrap(async (req, res) => res.json({ drafts: await requests.detectBreaches(req.user.institution_id) }));
export const targetPreview = wrap(async (req, res) => {
  const request = await getDoc(COLLECTIONS.requests, req.params.id);
  if (!request) throw notFound('Request not found');
  if (request.institution_id !== req.user.institution_id) throw forbidden();
  const { pool, batch, excluded } = await requests.buildTargetPool(request, { stage: (request.escalation_stage || 0) + 1 });
  res.json({
    pool_size: pool.length,
    batch: batch.map((b) => ({ donor_id: b.donor.id, name: b.donor.name, score: b.score, area_pincode: b.donor.area_pincode })),
    excluded,
  });
});

/* --- camps --- */
export const createCamp = wrap(async (req, res) => res.status(201).json({ camp: await camps.createCamp(req.user.institution_id, req.valid, req.user) }));
export const listCamps = wrap(async (req, res) => res.json({ camps: await camps.listCamps({ upcomingOnly: req.query.upcoming === 'true' }) }));
export const myCamps = wrap(async (req, res) => res.json({ camps: await camps.listCamps({ institutionId: req.user.institution_id }) }));
export const attendCamp = wrap(async (req, res) =>
  res.json({ attendance: await camps.markAttendance(
    req.params.id,
    req.user.donor_id,
    req.body.attending !== false,
    req.body.questionnaire || null,
  )}),
);
export const donorCalendarEvents = wrap(async (req, res) => {
  const result = await camps.getDonorCalendarEvents({
    donorId: req.user?.donor_id || null,
    pincode: req.query.pincode || null,
    bloodGroup: req.query.blood_group || null,
    upcomingOnly: req.query.upcoming === 'true',
  });
  res.json(result);
});
export const campIcs = wrap(async (req, res) => {
  const camp = await getDoc(COLLECTIONS.camps, req.params.id);
  if (!camp) throw notFound('Camp not found');
  const ics = camps.generateIcsContent({ ...camp, type: 'CAMP' });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="camp-${camp.id}.ics"`);
  res.send(ics);
});

/* --- admin + audit --- */
export const stats = wrap(async (_req, res) => res.json({ stats: await admin.platformStats() }));
export const audit = wrap(async (req, res) =>
  res.json({ entries: await listAudit(req.user.role === 'PLATFORM_ADMIN' ? req.query.institution_id : req.user.institution_id) }),
);
export const pendingDonorReviews = wrap(async (req, res) => {
  const rows = await donors.listDonors({ status: 'PENDING_REVIEW' });
  res.json({ donors: rows.map((d) => donors.publicDonor(d, req.user)) });
});
export const allRequests = wrap(async (_req, res) => res.json({ requests: await requests.listRequests(null) }));
export const allDonorsRedacted = wrap(async (req, res) => {
  const rows = await listDocs(COLLECTIONS.donors);
  res.json({ donors: rows.map((d) => donors.publicDonor(d, req.user)) });
});

/* --- donor profile update --- */
export const updateDonorProfile = wrap(async (req, res) => {
  const { name, contact_phone, area_pincode, blood_group, gender, date_of_birth, donation_type, patient_name } = req.body;
  // donor_id from JWT; fall back to email lookup for older sessions
  let donorId = req.user.donor_id;
  if (!donorId) {
    const rows = await listDocs(COLLECTIONS.donors, [['email', '==', req.user.email]]);
    if (!rows.length) throw notFound('Donor record not found for this account');
    donorId = rows[0].id;
  }
  const donor = await getDoc(COLLECTIONS.donors, donorId);
  if (!donor) throw notFound('Donor not found');
  const patch = {};
  if (name          !== undefined) patch.name = name;
  if (contact_phone !== undefined) patch.contact_phone = contact_phone;
  if (area_pincode  !== undefined) patch.area_pincode = area_pincode;
  if (gender        !== undefined) patch.gender = gender;
  if (date_of_birth !== undefined) patch.date_of_birth = date_of_birth;
  if (donation_type !== undefined) patch.donation_type = donation_type;
  if (patient_name  !== undefined) patch.patient_name = patient_name;
  if (blood_group)                 { patch.blood_group_self_reported = blood_group; patch.blood_group_verified = null; }
  const updated = await updateDoc(COLLECTIONS.donors, donorId, patch);
  res.json({ donor: updated });
});

/* --- bank staff profile --- */
export const getBankProfile = wrap(async (req, res) => {
  const user = await getDoc(COLLECTIONS.users, req.user.id);
  if (!user) throw notFound('User not found');
  res.json({ name: user.name, email: user.email, phone: user.phone || '' });
});

export const updateBankProfile = wrap(async (req, res) => {
  const { name, phone } = req.body;
  const patch = {};
  if (name  !== undefined) patch.name  = name;
  if (phone !== undefined) patch.phone = phone;
  await updateDoc(COLLECTIONS.users, req.user.id, patch);
  res.json({ done: true });
});

/* --- change password (any authenticated user) --- */
export const changePassword = wrap(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) throw badRequest('Password must be at least 6 characters');
  const user = await getDoc(COLLECTIONS.users, req.user.id);
  if (!user) throw notFound('User not found');
  if (!bcrypt.compareSync(current_password, user.password_hash)) throw unauthorized('Current password is incorrect');
  await updateDoc(COLLECTIONS.users, req.user.id, { password_hash: bcrypt.hashSync(new_password, 10) });
  res.json({ done: true });
});

/* --- test sheets connection --- */
export const testSheets = wrap(async (req, res) => {
  const { testSheetConnection } = await import('../services/googleSheetsService.js');
  const result = await testSheetConnection();
  res.json(result);
});
/* --- universal questionnaire submit → DB + Google Sheets --- */
export const submitQuestionnaire = wrap(async (req, res) => {
  const { saveQuestionnaire } = await import('../services/questionnaireService.js');
  const { source, camp_id, notification_id, institution_name, questionnaire } = req.body;

  if (!questionnaire) throw badRequest('questionnaire data is required');

  // donor_id from token (with email fallback for older sessions)
  let donor_id = req.user.donor_id || null;
  if (!donor_id && req.user.email) {
    const rows = await listDocs(COLLECTIONS.donors, [['email', '==', req.user.email]]);
    if (rows.length) donor_id = rows[0].id;
  }

  const doc = await saveQuestionnaire({
    source: source || 'UNKNOWN',
    donor_id,
    notification_id: notification_id || null,
    camp_id: camp_id || null,
    institution_name: institution_name || null,
    questionnaire,
  });

  res.json({ saved: true, id: doc.id });
});
/* --- diagnostics: check Gmail + WhatsApp gateway config without exposing secrets --- */
export const diagnostics = wrap(async (_req, res) => {
  const mask = (v) => (v ? `${String(v).slice(0, 3)}***${String(v).slice(-3)} (${String(v).length} chars)` : 'NOT SET');

  const result = {
    gmail: {
      GMAIL_USER: process.env.GMAIL_USER || 'NOT SET',
      GMAIL_APP_PASSWORD: mask(process.env.GMAIL_APP_PASSWORD),
      smtp_check: null,
    },
    whatsapp_gateway: {
      WA_GATEWAY_URL: process.env.WA_GATEWAY_URL || 'NOT SET',
      WA_GATEWAY_SECRET: mask(process.env.WA_GATEWAY_SECRET),
      reachable: null,
      health_response: null,
    },
    node_env: process.env.NODE_ENV || 'NOT SET (defaults to non-production)',
  };

  // Live SMTP check — verifies Gmail credentials without sending an email
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
      await transporter.verify();
      result.gmail.smtp_check = 'OK — Gmail login succeeded';
    } catch (err) {
      result.gmail.smtp_check = `FAILED: ${err.message}`;
    }
  } else {
    result.gmail.smtp_check = 'SKIPPED — env vars missing';
  }

  // Live check — is the WhatsApp gateway reachable and connected?
  if (process.env.WA_GATEWAY_URL) {
    try {
      const axios = (await import('axios')).default;
      const health = await axios.get(`${process.env.WA_GATEWAY_URL}/health`, { timeout: 8000 });
      result.whatsapp_gateway.reachable = true;
      result.whatsapp_gateway.health_response = health.data;
    } catch (err) {
      result.whatsapp_gateway.reachable = false;
      result.whatsapp_gateway.health_response = err.message;
    }
  }

  res.json(result);
});
