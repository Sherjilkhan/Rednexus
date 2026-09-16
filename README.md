# RedNexus

**Consumption-calibrated blood supply.** Blood banks collect in bursts at camps; hospitals consume every single day. RedNexus closes that gap: it turns a blood bank's own daily usage data into a *proposed* minimum stock threshold and a recurring collection target, and it keeps a **named human in the loop** before any threshold is applied or any donor is contacted.

- `frontend/` — React 18 + Vite + React Router + Recharts single-page app (donor, blood bank staff, platform admin)
- `frontend/` — React 18 + Vite + React Router + Recharts single-page app (donor, blood bank staff, platform admin)
- `backend/` — Express 4 REST API supporting **PostgreSQL** (with auto-schema migrations and JSONB indexing), Firebase Firestore, and an in-memory fallback for zero-configuration quickstart.

---

## Demo credentials

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Platform admin | `admin@RedNexus.in` | `admin123` | Verifies blood banks, sees platform stats + audit log |
| Blood bank staff (verified) | `staff@citybank.in` | `staff123` | Anita Deshmukh — City Hospital Blood Bank (in-house, Pune 411001, licence MH-BB-2019-0431) |
| Blood bank staff (unverified) | `staff@sunrise.in` | `staff123` | Ravi Patil — Sunrise Voluntary Blood Centre, still `PENDING`; every staff action is blocked until an admin verifies it |
| Donor | `donor@example.com` | `donor123` | Priya Sharma, B− |

14 more seeded donors use the same password `donor123` (emails are listed in `backend/src/seed.js`). The login screen has one-click buttons for each role.

**Simulated phone OTP for donor registration: `123456`** (the hint is shown in non-production builds only).

---

## Quick start

```bash
# 1. Backend (runs in-memory by default, or with PostgreSQL if DATABASE_URL is provided)
cd backend
npm install
npm start            # http://localhost:3001, seeds demo data on boot
npm test             # unit tests: PostgreSQL query builder, eligibility, threshold maths, state machine, targeting

# 2. Frontend
cd ../frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to :3001
npm run build         # production bundle in frontend/dist
```

Health check: `curl localhost:3001/api/health` → `{"status":"ok","db_mode":"memory",...}` or `{"status":"ok","db_mode":"postgres",...}`

### How the frontend finds the API

`frontend/index.html` sets `window.__API_BASE__ = '__PORT_3001__'`. In the hosted preview that placeholder is rewritten to a proxy path pointing at the backend; anywhere else it is left as-is and `src/api.js` falls back to `http://localhost:3001` (the API enables CORS, so `npm run dev` works out of the box). To point the built app at your own API, edit that one line to your API origin, e.g. `window.__API_BASE__ = 'https://api.example.com'`.

---

## Environment variables (backend)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | — | **PostgreSQL connection URL** (e.g. `postgresql://user:pass@localhost:5432/RedNexus` or Supabase / Neon / Render / RDS) |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | — | Alternative individual PostgreSQL connection parameters |
| `PGSSL` | `false` | Enable SSL for PostgreSQL connection (auto-detected if `sslmode=require` in URL) |
| `DB_MODE` | — | Explicit database mode: `postgres`, `firestore`, or `memory` (auto-detected by default) |
| `JWT_SECRET` | `RedNexus-dev-secret-change-me` | **Change in production.** Signs auth tokens |
| `JWT_EXPIRY` | `12h` | Token lifetime |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | Raw service-account JSON **or** path to the JSON file for Firestore mode |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Standard ADC path to service-account file for Firestore mode |
| `SEED_ON_START` | — | Set `SEED_ON_START=true` to automatically seed demo data on fresh database startup |
| `ROLLING_WINDOW_DAYS` | `14` | Rolling window for average daily consumption |
| `THRESHOLD_BUFFER_DAYS` | `5` | Days of cover the proposed threshold represents |
| `COLLECTION_TARGET_PERIOD_DAYS` | `7` | Period the recurring collection target covers |
| `BREACH_JOB_INTERVAL_MS` | `60000` | How often the breach detector sweeps stock vs confirmed thresholds |
| `NODE_ENV` | — | `production` hides the demo OTP hint |

---

### Using PostgreSQL (Recommended)

1. Create a PostgreSQL database (e.g. `createdb RedNexus` or create a project on Supabase / Neon / RDS / Docker).
2. Set your `DATABASE_URL` in `backend/.env` or environment:
   ```bash
   DATABASE_URL=postgresql://postgres:password@localhost:5432/RedNexus
   ```
3. Start the backend:
   ```bash
   cd backend
   npm start
   ```
   On startup, RedNexus will:
   - Connect to PostgreSQL.
   - Automatically execute table and index creation migrations from [`src/db/schema.sql`](file:///f:/RedNexus/RedNexus/backend/src/db/schema.sql).
   - Seed default demo accounts and institutions if the database is empty (or when `SEED_ON_START=true`).
4. Health check `GET /api/health` will report:
   ```json
   {
     "status": "ok",
     "db_mode": "postgres"
   }
   ```

#### Running PostgreSQL via Docker (Quick Local Setup)
```bash
docker run --name RedNexus-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=RedNexus -p 5432:5432 -d postgres:16
```

---

### Using Firebase Firestore

1. Create a Firebase project and enable **Firestore** (Native mode).
2. Project settings → Service accounts → **Generate new private key**.
3. Provide the key to the backend:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/RedNexus-sa.json
   # or
   export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /secure/path/RedNexus-sa.json)"
   ```
4. Start the backend. `GET /api/health` will report `"db_mode":"firestore"`.
5. Optionally seed a fresh project once with `SEED_ON_START=true npm start` (then unset it — in Firestore mode seeding is skipped by default).
6. Collections created: `users`, `donors`, `institutions`, `usage_records`, `blood_group_thresholds`, `stock_levels`, `requests`, `donation_records`, `notification_logs`, `camps`, `camp_attendance`, `audit_log`.
7. Keep Firestore security rules closed to clients — the browser never talks to Firestore directly; all access is through this authenticated API. Useful composite indexes: `usage_records(institution_id, date)`, `requests(institution_id, state)`, `notification_logs(donor_id, sent_at)`, `audit_log(institution_id, at)`.

---

## Implemented features

### Donors (F1, F3, F6)
- Registration with self-reported blood group, gender, DOB, area PIN, chosen blood bank, and an optional camp QR deep link (`#/register?camp=<id>&institution=<id>`).
- Simulated phone OTP verification (`123456`).
- **"Has a doctor ever advised you not to donate?" → status `PENDING_REVIEW`.** The donor is held out of every call list until a named staff member clears them in person. The app never asks for or interprets a medical reason.
- Computed eligibility: 90 days (male) / 120 days (female) since last donation, with a staff **deferral override** that always wins. Eligibility statuses: `ELIGIBLE`, `WAITING`, `DEFERRED`, `PENDING_REVIEW`. Donor record statuses: `PROVISIONAL`, `PENDING_REVIEW`, `ACTIVE`.
- In-app notifications with **Accept / Decline**, donation history with units and Hb trend, camp directory with "I'm attending".
- Preferences: monthly contact cap, pause notifications, availability window, preferred blood bank.

### Blood banks (F2, T1–T5, F4, F5)
- **Institution verification gate (F2).** An institution registers, an admin verifies it. Until then every staff route returns 403 and the UI shows a single plain explanation instead of failing page by page. Verification also requires at least one named staff account.
- **Daily usage reporting (T1)** — units issued per blood group, one entry per day, upsert-safe.
- **Threshold engine (T2–T4)** — rolling average over `ROLLING_WINDOW_DAYS` produces, per blood group, a *proposed* minimum threshold (`avg × THRESHOLD_BUFFER_DAYS`) and a recurring collection target per `COLLECTION_TARGET_PERIOD_DAYS`, plus a data-confidence signal (how many days were actually reported).
- **Mandatory human confirmation (T4).** Nothing is applied until a staff member confirms; they can accept the proposal or type their own number, with an optional note. The confirmation records `confirmed_by`, `confirmed_by_name` and `confirmed_at`.
- **Stock tracking + breach detection (T5).** A background sweep (and an on-demand endpoint) compares stock against *confirmed* thresholds and creates requests in state `DETECTED` — a draft, never an alert.
- **Second human gate: `DETECTED → RAISED`.** Staff see the shortfall maths and a targeting preview (who would be contacted, who is excluded and why) before approving. Approval is audited.
- **Manual urgent requests** for unplanned trauma cases, created directly in `RAISED`.
- **Staged escalation dispatch (F4/F5)** — ranked batches (3× then 6× then all eligible units needed), respecting eligibility, deferrals, pending review, monthly caps, pauses and preferred institution.
- **Donor pool** with contact details, defer, log donation, and the pending-review queue.
- **Camps** with attendee counts and a QR registration target.
- **Audit trail** page: who confirmed what, and when.

### Request state machine
`DETECTED → RAISED → NOTIFIED → ACCEPTED → CONFIRMED → ARRIVED → DONATED → CLOSED`. `NOTIFIED → NOTIFIED` is legal and means the next escalation stage; most open states may also go straight to `CLOSED` (request no longer needed). Illegal transitions are rejected with a 409 and never recorded. Every request keeps a `state_history` of actor name, role and timestamp, and `allowed_transitions` is returned to the UI so only legal buttons render.

### Platform admin
- Blood bank verification panel (approve / reject, add staff), platform stats (donors, banks, requests, fulfilment rate, notifications per donation, camps), donor pool by blood group, usage trend, and the full audit log.
- **Admins never see donor names or phone numbers** — only counts and audit records.

### Hard rules honoured
- No threshold and no alert is ever auto-confirmed. The system only ever *proposes*.
- Every confirmation records who and when, in the request/threshold record and in `audit_log`.
- Donor contact details are returned **only** to staff of the verified institution the donor registered with. Admin endpoints redact them.
- No payment, no pricing, no compensation anywhere in the product.

---

## Tests

`cd backend && npm test` — 15 tests (Node's built-in runner):

- `eligibility.test.js` — interval by gender, deferral override, pending review, advised-not-to-donate
- `threshold.test.js` — rolling average, buffer maths, collection target, data confidence, inclusive window
- `stateMachine.test.js` — every legal transition, and rejection of illegal ones
- `targeting.test.js` — ranking and exclusion reasons (cap reached, paused, not eligible, deferred, pending review)

---

## Known limitations

- **Notifications are in-app only and simulated.** No SMS/push gateway; the OTP is the fixed demo code `123456`.
- **Demo data lives in memory.** Without Firebase credentials the API uses a Firestore-compatible in-memory shim, so restarting the backend resets data and invalidates issued JWTs.
- **Blood group is self-reported** until a staff member records a verified group at donation time; the app makes no medical judgement.
- Passwords are hashed with `bcryptjs` and sessions use JWTs held in `sessionStorage` (in-memory when storage is blocked) — adequate for a demo, but a production deployment needs refresh tokens, rate limiting, HTTPS-only cookies and an audited secret store.
- No inventory expiry/component separation (whole blood only), no cross-bank transfer, no camp scheduling optimiser.
- Breach detection sweeps on an interval inside the API process; a production deployment should move it to a scheduled job.

---

## Spec mapping

| Spec | Where |
| --- | --- |
| F1 donor registration + OTP + pending review | `backend/src/services/donorService.js`, `frontend/src/pages/RegisterDonor.jsx` |
| F2 institution verification | `services/institutionService.js`, `pages/admin/AdminInstitutions.jsx`, guard in `frontend/src/App.jsx` |
| F3 donor preferences + caps | `services/donorService.js`, `pages/donor/DonorPreferences.jsx` |
| F4/F5 notifications + staged escalation | `services/requestService.js`, `pages/bank/BankRequestDetail.jsx`, `pages/donor/DonorRequests.jsx` |
| F6 donation history | `services/donorService.js`, `pages/donor/DonorHistory.jsx` |
| T1 daily usage | `pages/bank/BankUsage.jsx`, `POST /api/bank/usage` |
| T2–T4 threshold engine + human confirmation | `services/thresholdService.js`, `pages/bank/BankThresholds.jsx` |
| T5 stock + breach detection | `services/requestService.js` (`detectBreaches`), `pages/bank/BankOverview.jsx` |
| Audit | `services/audit.js`, `pages/bank/BankAudit.jsx`, `pages/admin/AdminAudit.jsx` |
#   R e d n e x u s 
 
 
