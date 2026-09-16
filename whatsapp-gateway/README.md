# Raktasetu WhatsApp Gateway

Standalone wbm-based gateway. Run this **alongside** the main backend.

## Setup

```bash
cd whatsapp-gateway
npm install
node server.js
```

On first start, a **QR code appears in the terminal** — scan it with WhatsApp on your phone (same way you open WhatsApp Web). The session is saved locally so you only scan once.

## Env vars (optional — defaults work for local dev)

Add to `whatsapp-gateway/.env` if you want to customise:

```env
WA_GATEWAY_PORT=3002
WA_GATEWAY_SECRET=raktasetu-wa-secret
```

The `WA_GATEWAY_SECRET` must match the one in `backend/.env`.

## Running both services

Open two terminals:

```bash
# Terminal 1 — main backend
cd backend && npm start

# Terminal 2 — WhatsApp gateway
cd whatsapp-gateway && npm install && node server.js
```

The gateway boots, shows the QR, you scan, and from that point every dispatch in your app sends a real WhatsApp message to the donor's number.

## Health check

```bash
curl http://localhost:3002/health
# {"status":"ok","whatsapp_ready":true}
```
