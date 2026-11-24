import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface FirebaseAppletConfig {
  apiKey?: string;
}

function loadFirebaseApiKey(): string {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as FirebaseAppletConfig;
      return parsed.apiKey ?? '';
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
  return '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VALID_STATUSES = new Set([
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

const STATUS_LABELS: Record<string, { label: string; summary: string }> = {
  pending: {
    label: 'Order Received',
    summary: 'Your order has been sent to the shop and is awaiting confirmation.',
  },
  confirmed: {
    label: 'Order Confirmed',
    summary: 'The shop has accepted your order and is getting it ready.',
  },
  preparing: {
    label: 'Preparing Now',
    summary: 'Your items are currently being prepared and packed.',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    summary: 'Your rider is on the way to your Nkomazi delivery address.',
  },
  delivered: {
    label: 'Delivered',
    summary: 'Your order has been delivered. Thank you for supporting local Nkomazi shops!',
  },
  cancelled: {
    label: 'Order Cancelled',
    summary: 'This order has been cancelled. Contact the shop if you have questions.',
  },
};

function isEmailTransportConfigured(): boolean {
  const hasResend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0);
  const hasSmtp = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
  return hasResend || hasSmtp;
}

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  const apiKey = loadFirebaseApiKey();
  if (!apiKey) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) return null;
  const data = (await response.json()) as {
    users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
  };
  const user = data.users?.[0];
  if (!user?.localId) return null;
  return {
    uid: user.localId,
    email: user.email ?? '',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      emailConfigured: isEmailTransportConfigured(),
    });
  });

  app.post('/api/notifications/order-status', async (req, res) => {
    try {
      const authHeader = req.headers.authorization ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Missing Authorization Bearer token.' });
        return;
      }

      const verifiedUser = await verifyFirebaseIdToken(token);
      if (!verifiedUser) {
        res.status(401).json({ error: 'Invalid or expired authentication token.' });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : '';
      const customerName = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 80) : 'Customer';
      const orderId = typeof body.orderId === 'string' ? body.orderId.trim().slice(0, 64) : '';
      const shopName = typeof body.shopName === 'string' ? body.shopName.trim().slice(0, 80) : '';
      const status = typeof body.status === 'string' ? body.status.trim() : '';
      const deliveryTown = typeof body.deliveryTown === 'string' ? body.deliveryTown.trim().slice(0, 40) : 'Nkomazi';
      const total = typeof body.total === 'number' && Number.isFinite(body.total) ? body.total : 0;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) || recipientEmail.length > 160) {
        res.status(400).json({ error: 'Valid recipient email is required.' });
        return;
      }
      if (!/^[a-zA-Z0-9_\-]+$/.test(orderId) || !shopName || !VALID_STATUSES.has(status)) {
        res.status(400).json({ error: 'Invalid order notification payload.' });
        return;
      }

      const statusInfo = STATUS_LABELS[status];
      const shortOrderCode = orderId.slice(-6).toUpperCase();
      const subject = `Nkomazi Eats · ${statusInfo.label} (#${shortOrderCode} · ${shopName})`;
      const message = `Hi ${customerName}, ${statusInfo.summary} Shop: ${shopName}. Delivery to: ${deliveryTown}. Total: R${total.toFixed(2)}.`;

      const safeHtml = `
        <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #FAF9F6; padding: 24px; color: #141413;">
          <div style="background: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 14px; padding: 24px;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #D94E1F;">Nkomazi Eats Order Update</p>
            <h1 style="margin: 0 0 12px 0; font-size: 22px; color: #141413;">${escapeHtml(statusInfo.label)}</h1>
            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #44403C;">
              Hi ${escapeHtml(customerName)}, ${escapeHtml(statusInfo.summary)}
            </p>
            <div style="border-top: 1px solid #E7E5E4; padding-top: 14px; font-size: 14px; color: #44403C;">
              <p style="margin: 4px 0;"><strong>Order:</strong> #${escapeHtml(shortOrderCode)}</p>
              <p style="margin: 4px 0;"><strong>Shop:</strong> ${escapeHtml(shopName)}</p>
              <p style="margin: 4px 0;"><strong>Town:</strong> ${escapeHtml(deliveryTown)}</p>
              <p style="margin: 4px 0;"><strong>Total:</strong> R${total.toFixed(2)}</p>
            </div>
          </div>
        </div>
      `;

      // Attempt Resend if configured
      if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0) {
        const fromAddress = process.env.SMTP_FROM || 'Nkomazi Eats <onboarding@resend.dev>';
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipientEmail],
            subject,
            text: message,
            html: safeHtml,
          }),
        });

        if (resendRes.ok) {
          res.json({
            ok: true,
            emailSent: true,
            deliveryChannel: 'resend',
            subject,
            message,
          });
          return;
        }
      }

      // Attempt SMTP via Nodemailer if configured
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT || 587) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: recipientEmail,
          subject,
          text: message,
          html: safeHtml,
        });

        res.json({
          ok: true,
          emailSent: true,
          deliveryChannel: 'smtp',
          subject,
          message,
        });
        return;
      }

      // Graceful in-app inbox delivery when external SMTP/Resend secrets are not yet configured
      res.json({
        ok: true,
        emailSent: false,
        deliveryChannel: 'in_app',
        subject,
        message,
      });
    } catch (error) {
      console.error('Order notification error:', error);
      res.status(500).json({ error: 'Failed to process order email notification.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nkomazi Eats server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
