-- ==========================================================
-- Raktasetu - PostgreSQL Database Schema
-- ==========================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_data ON users USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_users_email ON users ((data->>'email'));
CREATE INDEX IF NOT EXISTS idx_users_role ON users ((data->>'role'));
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users ((data->>'institution_id'));
CREATE INDEX IF NOT EXISTS idx_users_donor_id ON users ((data->>'donor_id'));

-- Table: donors
CREATE TABLE IF NOT EXISTS donors (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_donors_data ON donors USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors ((data->>'email'));
CREATE INDEX IF NOT EXISTS idx_donors_status ON donors ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_donors_blood_group ON donors ((data->>'blood_group_self_reported'));
CREATE INDEX IF NOT EXISTS idx_donors_pincode ON donors ((data->>'area_pincode'));

-- Table: institutions
CREATE TABLE IF NOT EXISTS institutions (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_institutions_data ON institutions USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions ((data->>'verification_status'));
CREATE INDEX IF NOT EXISTS idx_institutions_category ON institutions ((data->>'category'));

-- Table: usage_records
CREATE TABLE IF NOT EXISTS usage_records (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_usage_records_data ON usage_records USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_usage_records_institution_id ON usage_records ((data->>'institution_id'));
CREATE INDEX IF NOT EXISTS idx_usage_records_blood_group ON usage_records ((data->>'blood_group'));
CREATE INDEX IF NOT EXISTS idx_usage_records_date ON usage_records ((data->>'date'));

-- Table: blood_group_thresholds
CREATE TABLE IF NOT EXISTS blood_group_thresholds (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_thresholds_data ON blood_group_thresholds USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_thresholds_inst_bg ON blood_group_thresholds ((data->>'institution_id'), (data->>'blood_group'));

-- Table: stock_levels
CREATE TABLE IF NOT EXISTS stock_levels (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_data ON stock_levels USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_stock_inst_bg ON stock_levels ((data->>'institution_id'), (data->>'blood_group'));

-- Table: requests
CREATE TABLE IF NOT EXISTS requests (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_requests_data ON requests USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_requests_institution_id ON requests ((data->>'institution_id'));
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_requests_blood_group ON requests ((data->>'blood_group'));

-- Table: donation_records
CREATE TABLE IF NOT EXISTS donation_records (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_donations_data ON donation_records USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_donations_donor_id ON donation_records ((data->>'donor_id'));
CREATE INDEX IF NOT EXISTS idx_donations_institution_id ON donation_records ((data->>'institution_id'));

-- Table: notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_data ON notification_logs USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_notifications_donor_id ON notification_logs ((data->>'donor_id'));
CREATE INDEX IF NOT EXISTS idx_notifications_request_id ON notification_logs ((data->>'request_id'));

-- Table: camps
CREATE TABLE IF NOT EXISTS camps (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_camps_data ON camps USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_camps_institution_id ON camps ((data->>'institution_id'));
CREATE INDEX IF NOT EXISTS idx_camps_status ON camps ((data->>'status'));

-- Table: camp_attendance
CREATE TABLE IF NOT EXISTS camp_attendance (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_camp_attendance_data ON camp_attendance USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_camp_attendance_camp_id ON camp_attendance ((data->>'camp_id'));
CREATE INDEX IF NOT EXISTS idx_camp_attendance_donor_id ON camp_attendance ((data->>'donor_id'));

-- Table: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_data ON audit_log USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log ((data->>'actor_id'));
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log ((data->>'entity_id'));

-- Table: otps (email verification & password reset)
CREATE TABLE IF NOT EXISTS otps (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_otps_data ON otps USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_otps_email ON otps ((data->>'email'));

-- Table: questionnaire_submissions (emergency + camp forms)
CREATE TABLE IF NOT EXISTS questionnaire_submissions (
    id VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_questionnaire_data ON questionnaire_submissions USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_questionnaire_donor_id ON questionnaire_submissions ((data->>'donor_id'));
CREATE INDEX IF NOT EXISTS idx_questionnaire_source ON questionnaire_submissions ((data->>'source'));
