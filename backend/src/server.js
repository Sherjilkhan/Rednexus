import { createApp } from './app.js';
import { initDb, getDbMode } from './db/index.js';
import { PORT, BREACH_JOB_INTERVAL_MS } from './config.js';
import { seedDemoData } from './seed.js';
import { runBreachJob } from './services/requestService.js';

const db = await initDb();
if (getDbMode() === 'memory' || process.env.SEED_ON_START === 'true') {
  await seedDemoData();
}
 
const app = createApp();
app.listen(PORT, '0.0.0.0', () => console.log(`[raktasetu] API listening on :${PORT} (db=${getDbMode()})`));

/* T5 — periodic breach/off-pace detection. Creates DRAFTS ONLY; a human still confirms each one. */
setInterval(() => {
  runBreachJob()
    .then((n) => n && console.log(`[threshold-job] created ${n} draft request(s) awaiting human confirmation`))
    .catch((e) => console.error('[threshold-job]', e.message));
}, BREACH_JOB_INTERVAL_MS).unref?.();

export default db;
 