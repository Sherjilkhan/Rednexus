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
    // Try multiple selectors - WhatsApp Web changes class names frequently
    const checks = [
      `document.querySelector('[data-testid="chat-list"]') !== null`,
      `document.querySelector('div[aria-label="Chat list"]') !== null`,
      "document.querySelector('#pane-side') !== null",
      `document.querySelector('[data-tab="3"]') !== null`,
      "document.getElementsByClassName('two')[0] !== undefined",
    ];
    for (const check of checks) {
      try {
        await page.waitForFunction(check, { timeout: 3000 });
        return true;
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
}

// ── Capture QR code — polls continuously so the stored QR stays fresh ────────
async function waitForQR() {
  console.log('[Gateway] Waiting for QR code...');
  try {
    await page.waitForSelector('div[data-ref]', { timeout: 30000 });
    console.log('[Gateway] QR ready — visit GET /qr to scan');
  } catch (e) {
    console.error('[Gateway] Could not find QR element:', e.message);
    return;
  }

  // Keep capturing the latest QR silently — WhatsApp rotates it every ~20s.
  // The /qr endpoint serves whatever is in qrBase64 at request time.
  // User DOES NOT need to refresh — they just scan the current image.
  const captureQR = async () => {
    if (waReady) return; // stop once logged in
    try {
      const qrEl = await page.$('div[data-ref] canvas');
      if (qrEl) {
        qrBase64 = await page.evaluate(el => el.toDataURL('image/png'), qrEl);
      } else {
        const box = await page.$('div[data-ref]');
        if (box) {
          const clip = await box.boundingBox();
          const shot = await page.screenshot({ clip, encoding: 'base64' });
          qrBase64 = `data:image/png;base64,${shot}`;
        }
      }
    } catch { /* ignore — QR may be transitioning */ }
    if (!waReady) setTimeout(captureQR, 3000); // re-capture silently every 3s
  };

  await captureQR(); // first capture
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
    console.log('[Gateway] QR displayed — waiting for scan...');
    const check = setInterval(async () => {
      try {
        const loggedIn = await isLoggedIn();
        console.log('[Gateway] Login check:', loggedIn);
        if (loggedIn) {
          clearInterval(check);
          waReady    = true;
          startingUp = false;
          qrBase64   = null;
          console.log('[Gateway] ✅ WhatsApp connected!');
          flushQueue();
        }
      } catch (e) {
        console.error('[Gateway] Login check error:', e.message);
      }
    }, 2000);

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

// QR as raw PNG image — no HTML, no JavaScript, no refresh
// Open /qr-page in browser to see it nicely wrapped
app.get('/qr', (_req, res) => {
  if (waReady) return res.send('<h2>✅ Already connected</h2>');
  if (!qrBase64) return res.send('<h2>QR not ready yet</h2><p>Wait 15 seconds then <a href="/qr">click here</a></p>');
  // Serve QR as a plain image — no HTML refresh, no JavaScript at all
  // The image src points to /qr-image which serves the raw PNG
  const imgData = qrBase64.replace('data:image/png;base64,', '');
  const buf = Buffer.from(imgData, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

// QR as HTML page (for browser viewing)
app.get('/qr-page', (_req, res) => {
  if (waReady) {
    return res.send('<html><body style="text-align:center;font-family:sans-serif;padding:40px"><h2 style="color:green">✅ WhatsApp Connected!</h2><p>The gateway is ready to send messages.</p></body></html>');
  }
  if (!qrBase64) {
    return res.send('<html><head><meta http-equiv="refresh" content="5"></head><body style="text-align:center;font-family:sans-serif;padding:40px"><h2>⏳ Starting up...</h2><p>QR not ready yet. Page will refresh automatically.</p></body></html>');
  }
  res.send(`<html><head><title>Scan QR - Raktasetu</title></head>
  <body style="text-align:center;font-family:sans-serif;padding:40px;background:#fff5f5">
  <h2 style="color:#b91c1c">🩸 Raktasetu WhatsApp Gateway</h2>
  <p style="font-size:16px">Open WhatsApp on your phone</p>
  <p style="font-size:16px">Tap <b>Linked Devices → Link a Device</b> → Scan the QR below</p>
  <div style="display:inline-block;padding:16px;background:white;border:3px solid #dc2626;border-radius:16px;margin:16px 0">
    <img src="/qr" style="width:280px;height:280px;display:block" />
  </div>
  <p style="color:#888;font-size:13px">The QR image updates automatically in the background.<br>Do NOT refresh this page — just scan what you see.</p>
  <p style="margin-top:20px"><a href="/health" style="color:#dc2626">Check connection status</a></p>
  </body></html>`);
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