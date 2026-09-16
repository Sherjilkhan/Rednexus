/** Thin controller layer: HTTP in, service call, HTTP out. All logic lives in services/. */
import * as auth from '../services/authService.js';
import * as donors from '../services/donorService.js';
import * as institutions from '../services/institutionService.js';
import * as thresholds from '../services/thresholdService.js';
import * as requests from '../services/requestService.js';
import * as camps from '../services/campService.js';
import * as admin from '../services/adminService.js';
import { listAudit } from '../services/audit.js';
import { getDbMode, COLLECTIONS, listDocs, getDoc } from '../db/index.js';
import { BLOOD_GROUPS, DEMO_OTP, OTP_HINT_ENABLED } from '../config.js';
import { badRequest, forbidden, notFound } from '../services/errors.js';

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
/* --- password reset --- */
export const forgotPassword = wrap(async (req, res) => {
  await auth.requestPasswordReset(req.body.email);
  res.json({ sent: true }); // always 200 to prevent email enumeration
});

export const verifyResetOtp = wrap(async (req, res) => {
  const { verifyOtp } = await import('../services/emailService.js');
  await verifyOtp(req.body.email, req.body.code, 'RESET_PASSWORD');
  res.json({ valid: true });
});

export const resetPassword = wrap(async (req, res) => {
  await auth.resetPassword(req.body.email, req.body.code, req.body.new_password);
  res.json({ reset: true });
});

/* --- resend verification OTP --- */
export const resendOtp = wrap(async (req, res) => {
  const { sendVerificationOtp } = await import('../services/emailService.js');
  const donor = await getDoc(COLLECTIONS.donors, req.params.donorId);
  if (!donor) throw notFound('Donor not found');
  const result = await sendVerificationOtp(donor.email, donor.name);
  res.json({ sent: true, otp_hint: result.code && process.env.NODE_ENV !== 'production' ? result.code : null });
});
/* --- accepted donor management --- */
export const listAcceptedDonors = wrap(async (req, res) => {
  res.json({ donors: await requests.listAcceptedDonors(req.params.id, req.user) });
});

export const setDonorShortlist = wrap(async (req, res) => {
  await requests.setDonorShortlist(req.params.id, req.params.nid, req.body.action, req.user);
  res.json({ done: true });
});

export const assignAppointment = wrap(async (req, res) => {
  const result = await requests.assignAppointment(req.params.id, req.params.nid, req.body, req.user);
  res.json(result);
});

export const notifyAppointment = wrap(async (req, res) => {
  const result = await requests.notifyAppointment(req.params.id, req.params.nid, req.user);
  res.json(result);
});

export const markDonorArrived = wrap(async (req, res) => {
  const result = await requests.markDonorArrived(req.params.id, req.params.nid, req.user);
  res.json(result);
});

export const recordIndividualDonation = wrap(async (req, res) => {
  const result = await requests.recordIndividualDonation(req.params.id, req.params.nid, req.body, req.user);
  res.json(result);
});
