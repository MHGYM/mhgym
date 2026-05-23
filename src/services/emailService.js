/**
 * E-mailservice — nodemailer wrapper
 *
 * Stuurt HTML-mails voor:
 *  - Lidmaatschapsbevestiging na betaling
 *  - Bestelbevestiging (winkel)
 *  - Welkomstmail na registratie
 */

const nodemailer = require('nodemailer');

// Maak transporter aan (wordt lazy geïnitialiseerd)
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  // Als er geen SMTP config is, gebruik Ethereal (nep-mailbox, goed voor dev)
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your@gmail.com') {
    console.warn('[Email] Geen SMTP config → e-mails worden gelogd maar niet verzonden');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

const FROM = `"${process.env.FROM_NAME || 'MHGym'}" <${process.env.FROM_EMAIL || 'noreply@mhgym.nl'}>`;

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[Email] Verzonden naar ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] Fout bij verzenden naar ${to}:`, err.message);
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

function headerHtml() {
  return `
    <div style="background:#000;padding:24px 32px;text-align:center">
      <span style="font-size:26px;font-weight:900;color:#F5C200;letter-spacing:2px">MH</span>
      <span style="font-size:26px;font-weight:900;color:#fff;letter-spacing:2px">GYM</span>
    </div>`;
}

function footerHtml() {
  return `
    <div style="background:#111;padding:16px 32px;text-align:center;font-size:12px;color:#666;margin-top:32px">
      MHGym · Jouw boksgym · <a href="https://mhgym.nl" style="color:#F5C200;text-decoration:none">mhgym.nl</a>
    </div>`;
}

/**
 * Welkomstmail na registratie
 */
async function sendWelcomeEmail({ to, firstName }) {
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Welkom bij MHGym, ${firstName}! 🥊</h2>
        <p style="color:#ccc;line-height:1.6">
          Je account is aangemaakt. Je kunt nu inloggen en het lesrooster bekijken.
        </p>
        <p style="color:#ccc;line-height:1.6">
          Kies een lidmaatschap om lessen te kunnen reserveren en direct te beginnen.
        </p>
        <div style="margin:24px 0;text-align:center">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/memberships"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Kies lidmaatschap
          </a>
        </div>
        <p style="color:#666;font-size:13px">Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `Welkom bij MHGym, ${firstName}!`, html });
}

/**
 * Lidmaatschapsbevestiging na succesvolle Mollie betaling
 */
async function sendMembershipConfirmation({ to, firstName, membershipName, priceMonthly, startDate, endDate }) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Betaling geslaagd! 🎉</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je lidmaatschap is actief.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Lidmaatschap</td>
                <td style="color:#fff;font-weight:600;text-align:right">${membershipName}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Bedrag</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">€${Number(priceMonthly).toFixed(2)}/mnd</td></tr>
            <tr><td style="color:#888;padding:6px 0">Startdatum</td>
                <td style="color:#fff;text-align:right">${fmt(startDate)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Geldig t/m</td>
                <td style="color:#fff;text-align:right">${fmt(endDate)}</td></tr>
          </table>
        </div>

        <div style="margin:24px 0;text-align:center">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/schedule"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Bekijk lesrooster
          </a>
        </div>
        <p style="color:#666;font-size:13px">Tot in de gym! 💪</p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — lidmaatschap bevestigd: ${membershipName}`, html });
}

/**
 * Bestelbevestiging (winkel)
 */
async function sendOrderConfirmation({ to, firstName, orderId, items, totalAmount }) {
  const itemRows = items.map((item) =>
    `<tr>
      <td style="padding:6px 0;color:#ccc">${item.name}</td>
      <td style="padding:6px 0;color:#ccc;text-align:center">${item.quantity}×</td>
      <td style="padding:6px 0;color:#fff;text-align:right">€${(item.unit_price * item.quantity).toFixed(2)}</td>
    </tr>`
  ).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Bestelling ontvangen! 📦</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je bestelling #${orderId} is bevestigd.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            ${itemRows}
            <tr style="border-top:1px solid #333">
              <td colspan="2" style="padding:10px 0;color:#F5C200;font-weight:700">Totaal</td>
              <td style="padding:10px 0;color:#F5C200;font-weight:700;text-align:right">€${Number(totalAmount).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <p style="color:#666;font-size:13px">
          Afhalen bij de balie tijdens openingstijden.<br>
          Vragen? <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a>
        </p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — bestelling #${orderId} bevestigd`, html });
}

module.exports = { sendWelcomeEmail, sendMembershipConfirmation, sendOrderConfirmation };
