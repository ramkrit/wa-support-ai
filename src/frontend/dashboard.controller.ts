import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller()
export class DashboardController {
  @Get()
  getDashboard(@Res({ passthrough: false }) res: Response) {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>WA Support AI — Dashboard</title>
    <style>
      :root {
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        color-scheme: dark;
        --accent: #14b8a6;
        --accent-glow: rgba(20, 184, 166, 0.25);
        --surface: rgba(10, 20, 18, 0.9);
        --border: rgba(255, 255, 255, 0.06);
        --text-primary: #ecfdf5;
        --text-muted: #86a89c;
        --green: #34d399;
        --amber: #fbbf24;
        --red: #f87171;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        min-height: 100vh;
        background: #0a0f0d;
        background-image:
          radial-gradient(ellipse at 30% 0%, rgba(20, 184, 166, 0.12) 0%, transparent 50%),
          radial-gradient(ellipse at 70% 100%, rgba(52, 211, 153, 0.06) 0%, transparent 40%);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 24px;
        color: var(--text-primary);
      }

      header {
        text-align: center;
        margin-bottom: 36px;
      }

      header h1 {
        font-size: 1.8rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        background: linear-gradient(135deg, #ecfdf5, #14b8a6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      header p {
        color: var(--text-muted);
        margin-top: 6px;
        font-size: 0.9rem;
      }

      main {
        width: min(720px, 100%);
        display: grid;
        gap: 20px;
      }

      .card {
        border-radius: 20px;
        padding: 28px;
        background: var(--surface);
        border: 1px solid var(--border);
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .status-grid {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 12px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 6px 14px;
        border-radius: 20px;
        background: rgba(248, 113, 113, 0.15);
        color: var(--red);
        transition: all 0.3s ease;
      }

      .status-badge::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      body[data-status="connected"] .status-badge {
        background: rgba(52, 211, 153, 0.15);
        color: var(--green);
      }

      body[data-status="awaiting_scan"] .status-badge {
        background: rgba(251, 191, 36, 0.15);
        color: var(--amber);
      }

      .status-label {
        font-size: 1.4rem;
        font-weight: 700;
      }

      .status-meta {
        color: var(--text-muted);
        font-size: 0.82rem;
        margin-top: 4px;
      }

      .qr-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .qr-section.hidden { display: none; }

      .qr-frame {
        width: min(280px, 65vw);
        padding: 16px;
        border-radius: 16px;
        background: #ffffff;
        box-shadow: 0 0 24px var(--accent-glow);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      canvas {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 8px;
        max-width: 250px;
      }

      .qr-hint {
        color: var(--text-muted);
        font-size: 0.82rem;
        text-align: center;
        max-width: 320px;
      }

      .info-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
        color: var(--text-muted);
        margin-top: 12px;
      }

      .info-row svg {
        width: 14px;
        height: 14px;
        opacity: 0.6;
      }

      footer {
        margin-top: 40px;
        color: var(--text-muted);
        font-size: 0.75rem;
      }

      .nav-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }

      .nav-link {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        border-radius: 12px;
        background: rgba(20, 184, 166, 0.06);
        border: 1px solid var(--border);
        color: var(--text-primary);
        text-decoration: none;
        font-size: 0.85rem;
        transition: all 0.2s;
      }

      .nav-link:hover {
        background: rgba(20, 184, 166, 0.15);
        border-color: rgba(20, 184, 166, 0.3);
      }

      .nav-link .icon {
        font-size: 1.2rem;
      }

      .nav-link .label {
        font-weight: 500;
      }

      .nav-link .desc {
        font-size: 0.72rem;
        color: var(--text-muted);
        margin-top: 2px;
      }
    </style>
  </head>
  <body data-status="disconnected">
    <header>
      <h1>WA Support AI</h1>
      <p>RAG-powered WhatsApp assistant — live connection status</p>
    </header>

    <main>
      <section class="card">
        <div class="status-grid">
          <div>
            <div class="status-label" id="status-label">Disconnected</div>
            <p class="status-meta" id="status-meta">Waiting for connection…</p>
          </div>
          <div class="status-badge" id="status-badge">offline</div>
        </div>
        <div class="info-row" id="connection-info">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          <span id="connection-text">Connecting to event stream…</span>
        </div>
      </section>

      <section class="card qr-section hidden" id="qr-card">
        <div class="qr-frame">
          <canvas id="qr-canvas" width="250" height="250"></canvas>
        </div>
        <p class="qr-hint">
          Open WhatsApp on your phone → Linked Devices → Scan this code
        </p>
      </section>

      <section class="card">
        <div class="nav-grid">
          <a href="/chat" class="nav-link">
            <span class="icon">💬</span>
            <div>
              <div class="label">Chat Interface</div>
              <div class="desc">Talk to the AI directly via browser</div>
            </div>
          </a>
          <a href="/embedding/visualize-3d" class="nav-link">
            <span class="icon">🧊</span>
            <div>
              <div class="label">Vector Space 3D</div>
              <div class="desc">Visualize embeddings in 3D</div>
            </div>
          </a>
          <a href="/embedding/visualize" class="nav-link">
            <span class="icon">📊</span>
            <div>
              <div class="label">Vector Space 2D</div>
              <div class="desc">2D scatter plot of chunks</div>
            </div>
          </a>
        </div>
      </section>
    </main>

    <footer>wa-support-ai · local instance</footer>

    <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
    <script>
      const statusLabel = document.getElementById('status-label');
      const statusMeta = document.getElementById('status-meta');
      const statusBadge = document.getElementById('status-badge');
      const connectionText = document.getElementById('connection-text');
      const qrCard = document.getElementById('qr-card');
      const qrCanvas = document.getElementById('qr-canvas');
      let latestQr = null;

      const statusMap = {
        connected: { label: 'Connected', badge: 'online', subtitle: 'WhatsApp session is active' },
        awaiting_scan: { label: 'Awaiting Scan', badge: 'scan qr', subtitle: 'Scan the QR code to authenticate' },
        disconnected: { label: 'Disconnected', badge: 'offline', subtitle: 'No active session' },
      };

      function updateStatus(payload) {
        const info = statusMap[payload.status] || statusMap.disconnected;
        document.body.dataset.status = payload.status;
        statusLabel.textContent = info.label;
        statusBadge.textContent = info.badge;
        statusMeta.textContent = info.subtitle + ' · ' + new Date(payload.lastChanged).toLocaleTimeString();

        if (payload.status === 'connected' || !latestQr) {
          qrCard.classList.add('hidden');
        } else if (latestQr) {
          qrCard.classList.remove('hidden');
        }
      }

      async function renderQr(qr) {
        latestQr = qr;
        if (!qr) {
          qrCard.classList.add('hidden');
          return;
        }
        if (document.body.dataset.status !== 'connected') {
          qrCard.classList.remove('hidden');
        }
        try {
          await window.QRCode.toCanvas(qrCanvas, qr, {
            width: 250,
            margin: 2,
            color: { dark: '#134e4a', light: '#ffffff' },
          });
        } catch (e) {
          console.error('QR render failed', e);
        }
      }

      const stream = new EventSource('/wa-channel/events');
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'status') updateStatus(payload.data);
          else if (payload.type === 'qr') renderQr(payload.data.qr);
        } catch (e) {}
      };
      stream.onopen = () => { connectionText.textContent = 'Live stream connected'; };
      stream.onerror = () => { connectionText.textContent = 'Stream disconnected — retrying…'; };
    </script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
