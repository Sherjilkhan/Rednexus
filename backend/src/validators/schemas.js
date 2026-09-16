import { z } from 'zod';
import { BLOOD_GROUPS } from '../config.js';

const bloodGroup = z.enum(BLOOD_GROUPS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(4) });

/** F1 — the app deliberately collects only the fields that change system behaviour. */
export const donorRegistrationSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    date_of_birth: isoDate,
    blood_group: bloodGroup,
    phone: z.string().regex(/^[0-9+\-\s]{8,15}$/, 'Enter a valid phone number'),
    area_pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    donated_before: z.boolean(),
    last_donation_date: isoDate.nullable().optional(),
    donation_type: z.enum(['VOLUNTARY', 'REPLACEMENT']),
    patient_name: z.string().nullable().optional(),
    advised_not_to_donate: z.boolean(),
    consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required to register' }) }),
    institution_id: z.string().nullable().optional(),
    camp_id: z.string().nullable().optional(),
  })
  .refine((d) => !d.donated_before || !!d.last_donation_date, {
    message: 'Tell us the date of your last donation',
    path: ['last_donation_date'],
  })
  .refine((d) => d.donation_type !== 'REPLACEMENT' || !!d.patient_name, {
    message: 'Patient name is required for a replacement donation',
    path: ['patient_name'],
  });

export const preferencesSchema = z.object({
  max_contacts_per_month: z.number().int().min(0).max(10),
  channel: z.enum(['IN_APP', 'SMS', 'IVR']).default('IN_APP'),
  availability_window: z.enum(['ANYTIME', 'MORNING', 'EVENING', 'WEEKEND']).default('ANYTIME'),
  preferred_institution_id: z.string().nullable().optional(),
  paused: z.boolean().default(false),
});

export const donorRespondSchema = z.object({
  response: z.enum(['ACCEPTED', 'DECLINED']),
  questionnaire: z.record(z.any()).optional().nullable(),
});

export const institutionSchema = z.object({
  name: z.string().min(3),
  category: z.enum(['IN_HOUSE', 'EXTERNAL']),
  linked_hospital_name: z.string().nullable().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/),
  licence_number: z.string().nullable().optional(),
  contact_email: z.string().email(),
  contact_phone: z.string().min(8),
  staff: z
    .object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6) })
    .optional(),
});

export const usageSchema = z.object({
  date: isoDate.optional(),
  entries: z
    .array(z.object({ blood_group: bloodGroup, units_issued: z.number().int().min(0).max(500) }))
    .min(1, 'Report at least one blood group'),
});

export const thresholdConfirmSchema = z.object({
  blood_group: bloodGroup,
  confirmed_threshold: z.number().int().min(0).max(10000),
  recurring_collection_target: z.number().int().min(0).max(10000).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const stockSchema = z.object({ blood_group: bloodGroup, units_available: z.number().int().min(0).max(10000) });

export const manualRequestSchema = z.object({
  blood_group: bloodGroup,
  units_needed: z.number().int().min(1).max(200),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
  reason: z.string().max(500).optional(),
});

export const transitionSchema = z.object({
  to: z.enum(['NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED', 'RAISED', 'DETECTED']),
});

export const campSchema = z.object({
  date: isoDate,
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  location: z.string().min(3),
  pincode: z.string().regex(/^\d{6}$/).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const donorReviewSchema = z.object({
  decision: z.enum(['CLEAR', 'DEFER', 'REJECT']),
  deferral_until_date: isoDate.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const donationSchema = z.object({
  donor_id: z.string(),
  request_id: z.string().nullable().optional(),
  units: z.number().int().min(1).max(4).default(1),
  hb_level: z.number().min(5).max(20).nullable().optional(),
  date: isoDate.optional(),
});

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = new Error('Validation failed');
      err.status = 400;
      err.details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(err);
    }
    req.valid = result.data;
    next();
  };
}
