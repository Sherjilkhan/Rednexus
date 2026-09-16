/**
 * Rednexus WhatsApp Gateway
 * Patches wbm's broken send selector and outdated user agent.
 * Run: cd whatsapp-gateway && npm install && node server.js
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const PORT           = process.env.WA_GATEWAY_PORT   || 3002;
const GATEWAY_SECRET = process.env.WA_GATEWAY_SECRET || 'raktasetu-wa-secret';

// ── Reset + Patch wbm BEFORE requiring it ─────────────────────────────────────
const wbmApiPath = path.resolve(__dirname, 'node_modules/wbm/src/api.js');
if (!fs.existsSync(wbmApiPath)) {
  console.error('[Patch] node_modules/wbm not found — run: npm install');
  process.exit(1);
}

// Always start from the original source by reinstalling the known original
// We reconstruct the original api.js content so patches are idempotent
const originalApi = `const puppeteer = require("puppeteer");
const qrcode = require("qrcode-terminal");
const { from, merge } = require('rxjs');
const { take } = require('rxjs/operators');
const path = require('path');
var rimraf = require("rimraf");

let browser = null;
let page = null;
let counter = { fails: 0, success: 0 }
const tmpPath = path.resolve(__dirname, '../tmp');

const SELECTORS = {
    LOADING: "progress",
    INSIDE_CHAT: "document.getElementsByClassName('two')[0]",
    QRCODE_PAGE: "body > div > div > .landing-wrapper",
    QRCODE_DATA: "div[data-ref]",
    QRCODE_DATA_ATTR: "data-ref",
    SEND_BUTTON: 'div:nth-child(2) > button > span[data-icon="send"]'
};

async function start({ showBrowser = false, qrCodeData = false, session = true } = {}) {
    if (!session) {
        deleteSession(tmpPath);
    }

    const args = {
        headless: !showBrowser,
        executablePath: CHROME_PATH_PLACEHOLDER,
        userDataDir: tmpPath,
        args: ["--no-sandbox",
        ]
    }
    try {
        browser = await puppeteer.launch(args);
        page = await browser.newPage();
        page.on("dialog", async dialog => { await dialog.accept(); });
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        page.setDefaultTimeout(60000);

        await page.goto("https://web.whatsapp.com");
        if (session && await isAuthenticated()) {
            return;
        }
        else {
            if (qrCodeData) {
                console.log('Getting QRCode data...');
                return await getQRCodeData();
            } else {
                await generateQRCode();
            }
        }

    } catch (err) {
        deleteSession(tmpPath);
        throw err;
    }
}

function isAuthenticated() {
    console.log('Authenticating...');
    return merge(needsToScan(page), isInsideChat(page))
        .pipe(take(1))
        .toPromise();
}

function needsToScan() {
    return from(
        page
            .waitForSelector(SELECTORS.QRCODE_PAGE, {
                timeout: 0,
            }).then(() => false)
    );
}

function isInsideChat() {
    return from(
        page
            .waitForFunction(SELECTORS.INSIDE_CHAT,
                {
                    timeout: 0,
                }).then(() => true)
    );
}

function deleteSession() {
    rimraf.sync(tmpPath);
}

async function getQRCodeData() {
    await page.waitForSelector(SELECTORS.QRCODE_DATA, { timeout: 60000 });
    const qrcodeData = await page.evaluate((SELECTORS) => {
        let qrcodeDiv = document.querySelector(SELECTORS.QRCODE_DATA);
        return qrcodeDiv.getAttribute(SELECTORS.QRCODE_DATA_ATTR);
    }, SELECTORS);
    return await qrcodeData;
}

async function generateQRCode() {
    try {
        console.log("generating QRCode...");
        const qrcodeData = await getQRCodeData();
        qrcode.generate(qrcodeData, { small: true });
        console.log("QRCode generated! Scan it using Whatsapp App.");
    } catch (err) {
        throw await QRCodeExeption("QR Code can't be generated(maybe your connection is too slow).");
    }
    await waitQRCode();
}

async function waitQRCode() {
    try {
        await page.waitForSelector(SELECTORS.QRCODE_PAGE, { timeout: 30000, hidden: true });
    } catch (err) {
        throw await QRCodeExeption("Dont't be late to scan the QR Code.");
    }
}

async function QRCodeExeption(msg) {
    await browser.close();
    return "QRCodeException: " + msg;
}

async function sendTo(phoneOrContact, message) {
    let phone = phoneOrContact;
    if (typeof phoneOrContact === "object") {
        phone = phoneOrContact.phone;
        message = generateCustomMessage(phoneOrContact, message);
    }
    try {
        process.stdout.write("Sending Message...\\r");
        await page.goto(\`https://web.whatsapp.com/send?phone=\${phone}&text=\${encodeURIComponent(message)}\`);

        // Wait for loading spinner
        await page.waitForSelector(SELECTORS.LOADING, { hidden: true, timeout: 60000 });

        // Find the message input — try multiple selectors (WA Web UI changes frequently)
        const inputSelectors = [
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][data-tab="1"]',
            'footer div[contenteditable="true"]',
            'div[contenteditable="true"]',
        ];
        let found = false;
        for (const sel of inputSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 8000 });
                await page.click(sel);
                found = true;
                break;
            } catch {}
        }
        if (!found) {
            throw new Error('Input box not found — number may not be on WhatsApp');
        }

        await new Promise(r => setTimeout(r, 800));
        await page.keyboard.press("Enter");
        await new Promise(r => setTimeout(r, 1500));

        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(\`\${phone} Sent\\n\`);
        counter.success++;
    } catch (err) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(\`\${phone} Failed: \${err.message}\\n\`);
        counter.fails++;
        throw err;
    }
}

async function send(phoneOrContacts, message) {
    for (let phoneOrContact of phoneOrContacts) {
        await sendTo(phoneOrContact, message);
    }
}

function generateCustomMessage(contact, messagePrototype) {
    let message = messagePrototype;
    for (let property in contact) {
        message = message.replace(new RegExp(\`{{\${property}}}\`, "g"), contact[property]);
    }
    return message;
}

async function end() {
    await browser.close();
    console.log(\`Result: \${counter.success} sent, \${counter.fails} failed\`);
}

module.exports = {
    start,
    send,
    sendTo,
    end,
    waitQRCode
}`;

// Find real Chrome path
const chromePaths = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const chromePath = chromePaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });

if (!chromePath) {
  console.error('[Patch] Chrome not found. Set CHROME_PATH env var.');
  process.exit(1);
}
console.log(`[Patch] Chrome → ${chromePath}`);

// Write the clean patched file (always overwrite — idempotent)
const patchedApi = originalApi.replace('CHROME_PATH_PLACEHOLDER', JSON.stringify(chromePath));
fs.writeFileSync(wbmApiPath, patchedApi, 'utf8');
console.log('[Patch] wbm/src/api.js written cleanly ✅\n');

// ── Load wbm ──────────────────────────────────────────────────────────────────
const wbm = require('wbm');

const app = express();
app.use(express.json());

let waReady    = false;
let startingUp = false;
const pendingQueue = [];

function requireSecret(req, res, next) {
  if (req.headers['x-gateway-secret'] !== GATEWAY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

async function startWbm() {
  if (startingUp || waReady) return;
  startingUp = true;
  console.log('[Gateway] Starting WhatsApp Web — scan QR if prompted...\n');
  try {
    await wbm.start({ showBrowser: true, qrCodeData: false });
    waReady    = true;
    startingUp = false;
    console.log('\n[Gateway] ✅ WhatsApp connected!\n');
    while (pendingQueue.length > 0) {
      const { phone, message, resolve } = pendingQueue.shift();
      try {
        await wbm.sendTo(phone, message);
        console.log(`[Gateway] ✅ Sent (queued) → ${phone}`);
        resolve({ success: true });
      } catch (e) {
        console.error(`[Gateway] ❌ Failed (queued) → ${phone}: ${e.message}`);
        resolve({ success: false, error: e.message });
      }
    }
  } catch (err) {
    startingUp = false;
    console.error('[Gateway] Start failed:', err.message || err);
    console.log('[Gateway] Retrying in 15s...');
    setTimeout(startWbm, 15000);
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', whatsapp_ready: waReady });
});

app.post('/send', requireSecret, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  let cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
    cleanPhone = '91' + cleanPhone;
  }
  if (!cleanPhone || cleanPhone.length < 10) {
    return res.status(400).json({ error: `Invalid phone: ${phone}` });
  }

  if (!waReady) {
    const result = await new Promise(resolve => {
      pendingQueue.push({ phone: cleanPhone, message, resolve });
    });
    return res.json(result);
  }

  try {
    await wbm.sendTo(cleanPhone, message);
    console.log(`[Gateway] ✅ Sent → ${cleanPhone}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[Gateway] ❌ Failed → ${cleanPhone}: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Gateway] HTTP listening on port ${PORT}`);
  startWbm();
});

process.on('SIGINT', async () => {
  console.log('\n[Gateway] Shutting down...');
  try { await wbm.end(); } catch {}
  process.exit(0);
});
