/**
 * Raktasetu WhatsApp Gateway
 * Uses Puppeteer directly (no wbm) — works on Render, Railway, any Linux server.
 * Puppeteer downloads its own Chromium on npm install.
 *
 * QR Scan flow:
 *   1. Start server → GET /qr to get QR as base64 image
 *   2. Display it, scan with WhatsApp
 *   3. GET /health shows { whatsapp_ready: true } once connected
 */

const express    = require('express');
const puppeteer  = require('puppeteer');
const path       = require('path');
const fs         = require('fs');

const PORT           = process.env.WA_GATEWAY_PORT   || 3002;
const GATEWAY_SECRET = process.env.WA_GATEWAY_SECRET || 'raktasetu-wa-secret';
const SESSION_DIR    = path.join(__dirname, 'wa_session');

const app = express();
app.use(express.json());

let browser    = null;
let page       = null;
let waReady    = false;
let qrBase64   = null;        // latest QR as base64 PNG
let startingUp = false;
const queue    = [];           // messages queued before WA is ready

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (req.headers['x-gateway-secret'] !== GATEWAY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Launch Puppeteer ──────────────────────────────────────────────────────────
async function launchBrowser() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
    userDataDir: SESSION_DIR,   // saves session — no re-scan after restart
  };

  // Use system Chromium if available (Docker/Railway/Render)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    console.log('[Gateway] Using system Chromium:', process.env.PUPPETEER_EXECUTABLE_PATH);
  }

  browser = await puppeteer.launch(launchOptions);

  page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
}

// ── Check if already logged in ────────────────────────────────────────────────
async function isLoggedIn() {
  try {
    await page.waitForFunction(
      "document.getElementsByClassName('two')[0] !== undefined",
      { timeout: 8000 }
    );
    return true;
  } catch {
    return false;
  }
}

// ── Capture QR code ───────────────────────────────────────────────────────────
async function waitForQR() {
  console.log('[Gateway] Waiting for QR code...');
  try {
    await page.waitForSelector('div[data-ref]', { timeout: 30000 });
    const qrEl = await page.$('div[data-ref] canvas');
    if (qrEl) {
      qrBase64 = await page.evaluate(el => el.toDataURL('image/png'), qrEl);
    } else {
      // Fallback: screenshot of the QR area
      const box = await page.$('div[data-ref]');
      if (box) {
        const clip = await box.boundingBox();
        const shot = await page.screenshot({ clip, encoding: 'base64' });
        qrBase64 = `data:image/png;base64,${shot}`;
      }
    }
    console.log('[Gateway] QR ready — visit GET /qr to scan');
  } catch (e) {
    console.error('[Gateway] Could not capture QR:', e.message);
  }
}

// ── Main startup ──────────────────────────────────────────────────────────────
async function startWA() {
  if (startingUp || waReady) return;
  startingUp = true;
  console.log('[Gateway] Starting WhatsApp Web...');

  try {
    await launchBrowser();

    if (await isLoggedIn()) {
      console.log('[Gateway] ✅ Session restored — already logged in');
      waReady    = true;
      startingUp = false;
      flushQueue();
      return;
    }

    // Need to scan QR
    await waitForQR();

    // Poll until logged in (user scanned QR)
    const check = setInterval(async () => {
      try {
        if (await isLoggedIn()) {
          clearInterval(check);
          waReady    = true;
          startingUp = false;
          qrBase64   = null;
          console.log('[Gateway] ✅ WhatsApp connected!');
          flushQueue();
        }
      } catch {}
    }, 3000);

  } catch (err) {
    startingUp = false;
    console.error('[Gateway] Startup error:', err.message);
    console.log('[Gateway] Retrying in 15s...');
    setTimeout(startWA, 15000);
  }
}

// ── Send a message ────────────────────────────────────────────────────────────
async function sendMessage(phone, message) {
  const clean = String(phone).replace(/\D/g, '');
  const number = clean.length === 10 && /^[6-9]/.test(clean) ? '91' + clean : clean;

  const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for loading spinner to disappear
  try {
    await page.waitForSelector('div[aria-label="Loading screen"]', { hidden: true, timeout: 20000 });
  } catch {}

  // Find message input
  const selectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-tab="1"]',
    'footer div[contenteditable="true"]',
    'div[contenteditable="true"]',
  ];

  let found = false;
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.click(sel);
      found = true;
      break;
    } catch {}
  }

  if (!found) throw new Error(`Number ${number} may not be on WhatsApp`);

  await new Promise(r => setTimeout(r, 800));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1500));
  console.log(`[Gateway] ✅ Sent → ${number}`);
}

// ── Flush queued messages ─────────────────────────────────────────────────────
async function flushQueue() {
  while (queue.length > 0) {
    const { phone, message, resolve } = queue.shift();
    try {
      await sendMessage(phone, message);
      resolve({ success: true });
    } catch (e) {
      console.error(`[Gateway] Queue flush failed for ${phone}:`, e.message);
      resolve({ success: false, error: e.message });
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health — no auth needed
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', whatsapp_ready: waReady, qr_available: !!qrBase64 });
});

// QR code as HTML page — open in browser, scan with WhatsApp
app.get('/qr', (_req, res) => {
  if (waReady) return res.send('<h2>✅ Already connected</h2>');
  if (!qrBase64) return res.send('<h2>QR not ready yet</h2><p>Wait 15 seconds then <a href="/qr">click here</a></p>');
  res.send(`
    <!DOCTYPE html><html><head><title>Scan QR</title></head><body style="text-align:center;font-family:sans-serif;padding:40px">
    <h2>🩸 Raktasetu WhatsApp</h2>
    <p>Scan this QR with WhatsApp → Linked Devices → Link a Device</p>
    <img src="${qrBase64}" style="width:300px;height:300px;border:2px solid #dc2626;border-radius:12px" />
    <p style="color:#666;font-size:13px">QR expires in ~60 seconds. Only refresh manually if it expires.</p>
    <br/><button onclick="location.reload()" style="padding:10px 24px;background:#dc2626;color:white;border:none;border-radius:8px;font-size:15px;cursor:pointer">Refresh QR manually</button>
    </body></html>
  `);
});

// Send a message
app.post('/send', auth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  if (!waReady) {
    // Queue it — resolves once WA connects and message sends
    const result = await new Promise(resolve => queue.push({ phone, message, resolve }));
    return res.json(result);
  }

  try {
    await sendMessage(phone, message);
    res.json({ success: true });
  } catch (err) {
    console.error(`[Gateway] ❌ Failed → ${phone}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Gateway] HTTP server on port ${PORT}`);
  startWA();
});

process.on('SIGINT', async () => {
  console.log('\n[Gateway] Shutting down...');
  if (browser) await browser.close();
  process.exit(0);
});