import { Router } from 'express';
import * as c from '../controllers/index.js';
import { requireAuth, requireRole, requireVerifiedInstitution } from '../middleware/auth.js';
import {
  validate, loginSchema, donorRegistrationSchema, preferencesSchema, donorRespondSchema, institutionSchema, usageSchema,
  thresholdConfirmSchema, stockSchema, manualRequestSchema, transitionSchema, campSchema, donorReviewSchema, donationSchema,
} from '../validators/schemas.js';

const r = Router();

/* Public */
r.get('/health', c.health);
r.post('/auth/login', validate(loginSchema), c.login);
r.post('/donors/register', validate(donorRegistrationSchema), c.registerDonor);
r.post('/donors/:donorId/verify-otp', c.verifyOtp);
r.post('/institutions/register', validate(institutionSchema), c.registerInstitution);
r.get('/public/institutions', c.publicInstitutions);
r.get('/public/camps', c.listCamps);
r.get('/public/camps/:id/ics', c.campIcs);
r.post('/auth/forgot-password', c.forgotPassword);
r.post('/auth/verify-reset-otp', c.verifyResetOtp);
r.post('/auth/reset-password', c.resetPassword);
r.post('/donors/:donorId/resend-otp', c.resendOtp);

/* Authenticated */
r.get('/auth/me', requireAuth, c.me);

/* Donor surface */
const donor = [requireAuth, requireRole('DONOR')];
r.get('/donor/profile', ...donor, c.myProfile);
r.put('/donor/preferences', ...donor, validate(preferencesSchema), c.updatePreferences);
r.get('/donor/notifications', ...donor, c.myNotifications);
r.post('/donor/notifications/:id/respond', ...donor, validate(donorRespondSchema), c.respond);
r.post('/donor/camps/:id/attend', ...donor, c.attendCamp); // body: { attending, questionnaire? }
r.get('/donor/calendar-events', ...donor, c.donorCalendarEvents);

/* Blood bank staff surface — every route requires a VERIFIED institution */
const staff = [requireAuth, requireRole('BLOOD_BANK_STAFF'), requireVerifiedInstitution];
r.get('/bank/donors', ...staff, c.staffDonorList);
r.get('/bank/donors/pending-review', ...staff, c.pendingDonorReviews);
r.post('/bank/donors/:id/review', ...staff, validate(donorReviewSchema), c.reviewDonor);
r.post('/bank/donors/:id/deferral', ...staff, c.setDeferral);
r.post('/bank/donations', ...staff, validate(donationSchema), c.recordDonation);
r.post('/bank/usage', ...staff, validate(usageSchema), c.reportUsage);
r.get('/bank/usage', ...staff, c.usage);
r.get('/bank/thresholds', ...staff, c.thresholdOverview);
r.post('/bank/thresholds/confirm', ...staff, validate(thresholdConfirmSchema), c.confirmThreshold);
r.get('/bank/stock', ...staff, c.stock);
r.put('/bank/stock', ...staff, validate(stockSchema), c.updateStock);
r.get('/bank/requests', ...staff, c.listRequests);
r.get('/bank/requests/:id', ...staff, c.requestDetail);
r.post('/bank/requests', ...staff, validate(manualRequestSchema), c.raiseManual);
r.post('/bank/requests/:id/confirm', ...staff, c.confirmRequest);
r.post('/bank/requests/:id/dispatch', ...staff, c.dispatch);
r.get('/bank/requests/:id/target-preview', ...staff, c.targetPreview);
r.post('/bank/requests/:id/transition', ...staff, validate(transitionSchema), c.advance);
r.get('/bank/requests/:id/accepted-donors', ...staff, c.listAcceptedDonors);
r.post('/bank/requests/:id/donors/:nid/appointment', ...staff, c.assignAppointment);
r.post('/bank/requests/:id/donors/:nid/notify-appointment', ...staff, c.notifyAppointment);
r.post('/bank/requests/:id/donors/:nid/arrived', ...staff, c.markDonorArrived);
r.post('/bank/requests/:id/donors/:nid/donate', ...staff, c.recordIndividualDonation);
r.post('/bank/detect-breaches', ...staff, c.runDetection);
r.get('/bank/camps', ...staff, c.myCamps);
r.post('/bank/camps', ...staff, validate(campSchema), c.createCamp);
r.get('/bank/audit', ...staff, c.audit);

/* Platform admin surface */
const admin = [requireAuth, requireRole('PLATFORM_ADMIN')];
r.get('/admin/institutions', ...admin, c.listInstitutions);
r.post('/admin/institutions/:id/verification', ...admin, c.verifyInstitution);
r.post('/admin/institutions/:id/staff', ...admin, c.addStaff);
r.get('/admin/stats', ...admin, c.stats);
r.get('/admin/requests', ...admin, c.allRequests);
r.get('/admin/donors', ...admin, c.allDonorsRedacted);
r.get('/admin/audit', ...admin, c.audit);

export default r;
