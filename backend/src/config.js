import dotenv from 'dotenv';

dotenv.config();

export const PORT = Number(process.env.PORT || 3001);
export const JWT_SECRET = process.env.JWT_SECRET || 'raktasetu-dev-secret-change-me';
export const JWT_EXPIRY = process.env.JWT_EXPIRY || '12h';

export const DATABASE_URL = process.env.DATABASE_URL || null;
export const PGHOST = process.env.PGHOST || 'localhost';
export const PGPORT = Number(process.env.PGPORT || 5432);
export const PGUSER = process.env.PGUSER || 'postgres';
export const PGPASSWORD = process.env.PGPASSWORD || '';
export const PGDATABASE = process.env.PGDATABASE || 'raktasetu';
export const PGSSL = process.env.PGSSL === 'true' || process.env.DATABASE_URL?.includes('sslmode=require');
export const DB_MODE = process.env.DB_MODE || null; // 'postgres' | 'firestore' | 'memory' | null (auto-detect)

export const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export const ROLES = {
  DONOR: 'DONOR',
  BLOOD_BANK_STAFF: 'BLOOD_BANK_STAFF',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
};

export const DONOR_STATUS = ['PROVISIONAL', 'PENDING_REVIEW', 'ACTIVE'];

/** F2 — standard eligibility intervals (days). */
export const ELIGIBILITY_INTERVAL_DAYS = { MALE: 90, FEMALE: 120, OTHER: 90 };

/** T2/T4 — rolling-average window over daily usage records. */
export const ROLLING_WINDOW_DAYS = Number(process.env.ROLLING_WINDOW_DAYS || 14);
/** Threshold = average daily consumption * this many days of buffer. */
export const THRESHOLD_BUFFER_DAYS = Number(process.env.THRESHOLD_BUFFER_DAYS || 5);
/** T4 — recurring collection target is expressed per this many days. */
export const COLLECTION_TARGET_PERIOD_DAYS = Number(process.env.COLLECTION_TARGET_PERIOD_DAYS || 7);

/** F4/F5 — staged escalation batch sizes (multiplied by units needed). */
export const NOTIFY_STAGE_MULTIPLIER = [3, 6, 1000];
/** F3 — default monthly notification cap per donor. */
export const DEFAULT_MONTHLY_CAP = 2;

/** Simulated OTP for the demo (F1). Real deployments swap in an SMS gateway. */
export const DEMO_OTP = '123456';

/** How often the breach-detection job runs (ms). */
export const BREACH_JOB_INTERVAL_MS = Number(process.env.BREACH_JOB_INTERVAL_MS || 60_000);

export const OTP_HINT_ENABLED = process.env.NODE_ENV !== 'production';
