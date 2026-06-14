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
    // Voorkomt afwijzing bij self-signed/wildcard-certificaten (JouwWeb e.a.)
    tls: { rejectUnauthorized: false },
  });

  return _transporter;
}

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }

  // FROM berekend bij verzending — SMTP_USER als fallback zodat afzender
  // altijd overeenkomt met de geauthenticeerde mailbox (vereist door veel hosters)
  const fromAddress = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@mhgym.nl';
  const fromName    = process.env.FROM_NAME  || 'MHGym';
  const from        = `"${fromName}" <${fromAddress}>`;

  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log(`[Email] Verzonden naar ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] Fout bij verzenden naar ${to}: ${err.message}`);
    console.error(`[Email] SMTP code=${err.code} responseCode=${err.responseCode} response=${err.response}`);
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
 * Lidmaatschapsbevestiging na succesvolle Mollie betaling — met volledige contractinfo
 */
async function sendMembershipConfirmation({ to, firstName, membershipName, priceMonthly, startDate, contractEnd, minimumMonths }) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';

  // Vroegste opzegdatum = contractEnd + 1 maand opzegtermijn
  const cancelFromDate = contractEnd ? new Date(contractEnd) : null;
  const cancelFrom = cancelFromDate
    ? cancelFromDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '–';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Welkom bij MHGym! Je lidmaatschap is actief. 🎉</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je eerste betaling is ontvangen en je incassomachtiging is vastgelegd. Hieronder vind je je contractgegevens.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <p style="color:#F5C200;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Contractoverzicht</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Lidmaatschap</td>
                <td style="color:#fff;font-weight:600;text-align:right">${membershipName}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Maandbedrag</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">€${Number(priceMonthly).toFixed(2)}/mnd</td></tr>
            <tr><td style="color:#888;padding:6px 0">Startdatum</td>
                <td style="color:#fff;text-align:right">${fmt(startDate)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Minimale looptijd</td>
                <td style="color:#fff;text-align:right">${minimumMonths} maand${minimumMonths > 1 ? 'en' : ''}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Opzegbaar vanaf</td>
                <td style="color:#fff;text-align:right">${cancelFrom}</td></tr>
          </table>
        </div>

        <div style="background:#0f1a00;border:1px solid #2a4a00;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#86efac;margin:0;font-size:13px;line-height:1.6">
            <strong>Hoe werkt het?</strong><br>
            Elke maand wordt automatisch €${Number(priceMonthly).toFixed(2)} via SEPA incasso afgeschreven.
            Je kunt opzeggen via de app zodra je minimale contractperiode voorbij is.
            Er geldt altijd een opzegtermijn van 1 maand.
          </p>
        </div>

        <div style="margin:24px 0;text-align:center">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/schedule"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Bekijk het lesrooster
          </a>
        </div>
        <p style="color:#666;font-size:13px">Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a><br>Tot in de gym! 💪</p>
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

/**
 * PT sessie bevestigingsmail (na admin confirm)
 */
async function sendPtConfirmationEmail({ to, firstName, dateTime }) {
  const fmt = (d) => new Date(d).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = (d) => new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">PT Sessie Bevestigd! 💪</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je personal training sessie is bevestigd.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Datum</td>
                <td style="color:#fff;font-weight:600;text-align:right">${fmt(dateTime)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Tijd</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">${fmtTime(dateTime)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Duur</td>
                <td style="color:#fff;text-align:right">60 minuten</td></tr>
            <tr><td style="color:#888;padding:6px 0">Trainer</td>
                <td style="color:#fff;text-align:right">Mohammed</td></tr>
          </table>
        </div>

        <div style="background:#0f1a00;border:1px solid #2a4a00;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#86efac;margin:0;font-size:13px;line-height:1.6">
            <strong>Annuleren?</strong> Dat kan tot 24 uur van tevoren via de app. Bij annulering binnen 24 uur vervalt de les.
          </p>
        </div>

        <div style="margin:24px 0;text-align:center">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/personal-training"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Bekijk mijn PT boekingen
          </a>
        </div>
        <p style="color:#666;font-size:13px">Tot dan! 🥊<br>Vragen? <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: 'MHGym — PT sessie bevestigd!', html });
}

/**
 * PT pakket bevestigingsmail (na betaling)
 */
async function sendPtPackageConfirmationEmail({ to, firstName, packageLabel, lessons, expiresAt }) {
  const fmt = (d) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">PT Pakket Gekocht! 🥊</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je PT-pakket is betaald en actief.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Pakket</td>
                <td style="color:#fff;font-weight:600;text-align:right">${packageLabel}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Lessen</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">${lessons} lessen</td></tr>
            <tr><td style="color:#888;padding:6px 0">Geldig tot</td>
                <td style="color:#fff;text-align:right">${fmt(expiresAt)}</td></tr>
          </table>
        </div>

        <p style="color:#ccc;font-size:13px;line-height:1.6">
          Boek je eerste sessie via de app zodra een slot beschikbaar is.
          Je lessen verlopen 12 maanden na aankoop.
        </p>

        <div style="margin:24px 0;text-align:center">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/personal-training"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Boek een sessie
          </a>
        </div>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — PT pakket ${packageLabel} actief`, html });
}

/**
 * PT saldo bijna op (3 of minder lessen)
 */
async function sendPtLowBalanceEmail({ to, firstName, remaining }) {
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Bijna door je lessen heen ⚠️</h2>
        <p style="color:#ccc;line-height:1.6">
          Hoi ${firstName}, je hebt nog <strong style="color:#F5C200">${remaining} les${remaining > 1 ? 'sen' : ''}</strong> over.
        </p>
        <p style="color:#ccc;line-height:1.6">Koop een nieuw pakket zodat je kunt blijven trainen!</p>
        <div style="margin:24px 0;text-align:center">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/personal-training"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Nieuw pakket kopen
          </a>
        </div>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — Nog ${remaining} PT les${remaining > 1 ? 'sen' : ''} over`, html });
}

/**
 * Wachtwoord-reset e-mail
 */
async function sendPasswordResetEmail({ to, firstName, resetUrl }) {
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Wachtwoord opnieuw instellen</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName},</p>
        <p style="color:#ccc;line-height:1.6">
          We hebben een verzoek ontvangen om het wachtwoord van je MHGym account te resetten.
          Klik op de knop hieronder om een nieuw wachtwoord in te stellen.
        </p>
        <div style="margin:28px 0;text-align:center">
          <a href="${resetUrl}"
             style="background:#F5C200;color:#000;padding:14px 32px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block;font-size:15px">
            Stel nieuw wachtwoord in
          </a>
        </div>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#888;margin:0;font-size:12px;line-height:1.6">
            Deze link is <strong style="color:#ccc">1 uur</strong> geldig. Heb jij dit niet aangevraagd?
            Dan hoef je niets te doen — je wachtwoord blijft ongewijzigd.
          </p>
        </div>
        <p style="color:#666;font-size:13px">
          Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a>
        </p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: 'MHGym — Wachtwoord resetten', html });
}

/**
 * Welkomstmail voor door admin aangemaakte leden (incl. tijdelijk wachtwoord)
 * memberNote: optionele context-specifieke tekst (bijv. SEPA-info voor incasso-leden)
 */
async function sendAdminWelcomeEmail({ to, firstName, tempPassword, loginUrl, memberNote }) {
  const url = loginUrl || `${process.env.FRONTEND_URL || 'https://app.mhgym.nl'}/login`;
  const noteHtml = memberNote
    ? `<p style="color:#666;font-size:13px">${memberNote}<br><br>Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></p>`
    : `<p style="color:#666;font-size:13px">Via de app kun je het lesrooster bekijken, lessen reserveren en je boekingen beheren.<br><br>Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></p>`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Welkom bij MHGym, ${firstName}! 🥊</h2>
        <p style="color:#ccc;line-height:1.6">
          Je account is aangemaakt door de administratie en staat klaar.
          Log hieronder in met je tijdelijke wachtwoord.
        </p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <p style="color:#F5C200;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Inloggegevens</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">E-mailadres</td>
                <td style="color:#fff;font-weight:600;text-align:right">${to}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Tijdelijk wachtwoord</td>
                <td style="color:#F5C200;font-weight:700;text-align:right;font-family:monospace;font-size:1.1em">${tempPassword}</td></tr>
          </table>
        </div>

        <div style="background:#1a0f00;border:1px solid #4a2a00;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#fbbf24;margin:0;font-size:13px;line-height:1.6">
            <strong>⚠️ Wijzig je wachtwoord</strong> zodra je bent ingelogd. Ga naar Profiel → Wachtwoord wijzigen.
          </p>
        </div>

        <div style="margin:24px 0;text-align:center">
          <a href="${url}"
             style="background:#F5C200;color:#000;padding:14px 32px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block;font-size:15px">
            Inloggen op MHGym
          </a>
        </div>

        ${noteHtml}
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `Welkom bij MHGym, ${firstName}! — je account is klaar`, html });
}

/**
 * Bevestigingsmail bij registratie als cash kwartaalbetaler
 */
async function sendCashRegistrationEmail({ to, firstName, amount, nextDue }) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
  const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mhgym.nl'}/login`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Cash lidmaatschap geregistreerd 💪</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je cash betaling is geregistreerd. Hieronder een overzicht.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <p style="color:#F5C200;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Betalingsoverzicht</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Bedrag per kwartaal</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">€${Number(amount).toFixed(2)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Volgende betaaldatum</td>
                <td style="color:#fff;font-weight:600;text-align:right">${fmt(nextDue)}</td></tr>
          </table>
        </div>

        <p style="color:#ccc;font-size:13px;line-height:1.6">
          Je betaalt elk kwartaal contant aan de balie. Je ontvangt een herinnering wanneer de volgende betaling nadert.
        </p>

        <div style="margin:24px 0;text-align:center">
          <a href="${loginUrl}"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Inloggen op MHGym
          </a>
        </div>

        <p style="color:#666;font-size:13px">Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a><br>Tot in de gym! 🥊</p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — cash lidmaatschap geregistreerd`, html });
}

/**
 * Bevestigingsmail bij activatie van een fonds lidmaatschap
 */
async function sendFondsActivationEmail({ to, firstName, fondsLabel, startDate, endDate }) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
  const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mhgym.nl'}/login`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Fonds lidmaatschap actief! 🎉</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je fonds is geactiveerd. Hieronder vind je de details.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <p style="color:#F5C200;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Fondsgegevens</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Fonds</td>
                <td style="color:#fff;font-weight:600;text-align:right">${fondsLabel}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Startdatum</td>
                <td style="color:#fff;text-align:right">${fmt(startDate)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Geldig tot</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">${fmt(endDate)}</td></tr>
          </table>
        </div>

        <div style="background:#0f1a00;border:1px solid #2a4a00;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#86efac;margin:0;font-size:13px;line-height:1.6">
            <strong>Vergeet niet</strong> om op tijd een nieuw fonds aan te vragen zodra deze afloopt.
            Je ontvangt automatisch een herinnering ruim van tevoren.
          </p>
        </div>

        <div style="margin:24px 0;text-align:center">
          <a href="${loginUrl}"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Inloggen op MHGym
          </a>
        </div>

        <p style="color:#666;font-size:13px">Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a><br>Tot in de gym! 🥊</p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — ${fondsLabel} is geactiveerd t/m ${fmt(endDate)}`, html });
}

/**
 * Bevestigingsmail bij toevoeging van cash PT sessies
 */
async function sendPtSessionsAddedEmail({ to, firstName, sessionsPaid, amount, expiresAt }) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
  const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mhgym.nl'}/personal-training`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">PT sessies toegevoegd! 💪</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName}, je Personal Training sessies zijn geregistreerd.</p>

        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <p style="color:#F5C200;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Overzicht</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Sessies gekocht</td>
                <td style="color:#F5C200;font-weight:700;text-align:right">${sessionsPaid} sessie${sessionsPaid !== 1 ? 's' : ''}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Bedrag betaald</td>
                <td style="color:#fff;font-weight:600;text-align:right">€${Number(amount).toFixed(2)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Geldig tot</td>
                <td style="color:#fff;text-align:right">${fmt(expiresAt)}</td></tr>
          </table>
        </div>

        <p style="color:#ccc;font-size:13px;line-height:1.6">
          Boek een sessie via de app zodra er een PT slot beschikbaar is. Je lessen vervallen 12 maanden na aankoop.
        </p>

        <div style="margin:24px 0;text-align:center">
          <a href="${loginUrl}"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Boek een PT sessie
          </a>
        </div>

        <p style="color:#666;font-size:13px">Vragen? Mail ons op <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a><br>Tot snel! 🥊</p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — ${sessionsPaid} PT sessie${sessionsPaid !== 1 ? 's' : ''} toegevoegd`, html });
}

/**
 * Melding bij mislukte automatische betaling (voor het lid)
 */
async function sendPaymentFailedMemberEmail({ to, firstName, amount, membershipName }) {
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#ef4444;margin:0 0 12px">⚠️ Betaling mislukt</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName},</p>
        <p style="color:#ccc;line-height:1.6">
          Je automatische incasso van <strong style="color:#F5C200">€${Number(amount).toFixed(2)}</strong>
          voor je <strong>${membershipName || 'MHGym lidmaatschap'}</strong> is helaas mislukt.
        </p>

        <div style="background:#1a0000;border:1px solid #4a0000;border-radius:8px;padding:16px;margin:20px 0">
          <p style="color:#fca5a5;margin:0;font-size:13px;line-height:1.6">
            Je lidmaatschap is tijdelijk gepauzeerd. Zorg dat je rekening voldoende saldo heeft
            of neem contact met ons op zodat we een oplossing kunnen vinden.
          </p>
        </div>

        <p style="color:#ccc;font-size:14px;line-height:1.6">
          Wat kun je doen?
        </p>
        <ul style="color:#ccc;font-size:13px;line-height:1.8;padding-left:20px">
          <li>Controleer het saldo op je rekening</li>
          <li>Neem contact op via <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></li>
          <li>Ga naar de gym voor een persoonlijk gesprek</li>
        </ul>

        <p style="color:#666;font-size:13px;margin-top:24px">
          Tot snel! Team MHGym 💪
        </p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — betaling mislukt, je lidmaatschap is gepauzeerd`, html });
}

/**
 * Melding bij mislukte betaling (voor de admin)
 */
async function sendPaymentFailedAdminEmail({ memberName, memberEmail, amount, membershipName, userId }) {
  const adminEmail = process.env.ADMIN_EMAIL || 'info@mhgym.nl';
  const appUrl = process.env.FRONTEND_URL || 'https://app.mhgym.nl';
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#ef4444;margin:0 0 12px">⚠️ Mollie betaling mislukt</h2>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Lid</td>
                <td style="color:#fff;font-weight:600;text-align:right">${memberName}</td></tr>
            <tr><td style="color:#888;padding:6px 0">E-mail</td>
                <td style="color:#ccc;text-align:right">${memberEmail}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Bedrag</td>
                <td style="color:#ef4444;font-weight:700;text-align:right">€${Number(amount).toFixed(2)}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Lidmaatschap</td>
                <td style="color:#fff;text-align:right">${membershipName || '—'}</td></tr>
          </table>
        </div>
        <p style="color:#ccc;font-size:13px;line-height:1.6">
          Het lidmaatschap is automatisch gepauzeerd. Bekijk het lid in het admin panel.
        </p>
        <div style="margin:24px 0;text-align:center">
          <a href="${appUrl}/admin"
             style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Naar admin panel
          </a>
        </div>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to: adminEmail, subject: `[MHGym Admin] Betaling mislukt: ${memberName} — €${Number(amount).toFixed(2)}`, html });
}

/**
 * Melding bij chargeback (voor het lid)
 */
async function sendChargebackMemberEmail({ to, firstName, amount }) {
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#ef4444;margin:0 0 12px">🔴 Terugboeking geregistreerd</h2>
        <p style="color:#ccc;line-height:1.6">Hoi ${firstName},</p>
        <p style="color:#ccc;line-height:1.6">
          Er is een terugboeking (chargeback) van <strong style="color:#F5C200">€${Number(amount).toFixed(2)}</strong>
          geregistreerd op jouw MHGym abonnement. Je lidmaatschap is hierom gepauzeerd.
        </p>
        <p style="color:#ccc;font-size:14px;line-height:1.6">
          Neem zo snel mogelijk contact met ons op om dit te bespreken:
          <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a>
        </p>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to, subject: `MHGym — terugboeking ontvangen, lidmaatschap gepauzeerd`, html });
}

/**
 * Melding bij chargeback (voor de admin)
 */
async function sendChargebackAdminEmail({ memberName, memberEmail, amount }) {
  const adminEmail = process.env.ADMIN_EMAIL || 'info@mhgym.nl';
  const appUrl = process.env.FRONTEND_URL || 'https://app.mhgym.nl';
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;overflow:hidden">
      ${headerHtml()}
      <div style="padding:32px">
        <h2 style="color:#ef4444;margin:0 0 12px">🔴 Chargeback ontvangen</h2>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Lid</td>
                <td style="color:#fff;font-weight:600;text-align:right">${memberName}</td></tr>
            <tr><td style="color:#888;padding:6px 0">E-mail</td>
                <td style="color:#ccc;text-align:right">${memberEmail}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Terugboeking</td>
                <td style="color:#ef4444;font-weight:700;text-align:right">€${Number(amount).toFixed(2)}</td></tr>
          </table>
        </div>
        <p style="color:#ccc;font-size:13px">Lidmaatschap is gepauzeerd. Actie vereist!</p>
        <div style="margin:24px 0;text-align:center">
          <a href="${appUrl}/admin"
             style="background:#ef4444;color:#fff;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">
            Naar admin panel
          </a>
        </div>
      </div>
      ${footerHtml()}
    </div>`;

  await sendMail({ to: adminEmail, subject: `[MHGym Admin] ⚠️ CHARGEBACK: ${memberName} — €${Number(amount).toFixed(2)}`, html });
}

// Generic sendEmail wrapper for admin controller
async function sendEmail({ to, subject, html }) {
  return sendMail({ to, subject, html });
}

module.exports = {
  sendWelcomeEmail, sendMembershipConfirmation, sendOrderConfirmation,
  sendPtConfirmationEmail, sendPtPackageConfirmationEmail, sendPtLowBalanceEmail,
  sendPasswordResetEmail, sendEmail,
  sendAdminWelcomeEmail,
  sendCashRegistrationEmail, sendFondsActivationEmail, sendPtSessionsAddedEmail,
  sendPaymentFailedMemberEmail, sendPaymentFailedAdminEmail,
  sendChargebackMemberEmail, sendChargebackAdminEmail,
};
