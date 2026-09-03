/**
 * test-fonds-income.js — Regressietests voor de fonds-inkomstenberekening
 * (GET /api/cash/income → getIncomeBreakdown).
 *
 * Draait tegen een geïsoleerde, tijdelijke SQLite-file (nooit de echte
 * mhgym.db) zodat dit veilig herhaald kan worden zonder productie/dev-data
 * te raken. Geen extra npm-dependency nodig — gebruikt Node's ingebouwde
 * node:test + node:assert.
 *
 * Runnen:  node scripts/test-fonds-income.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmpDbPath = path.join(os.tmpdir(), `mhgym-test-fonds-${Date.now()}.db`);
process.env.DB_PATH = tmpDbPath;

const ensureSchema = require('./ensure-schema');
const db = require('../src/config/database');
const { getIncomeBreakdown } = require('../src/controllers/cashController');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function callIncome(month) {
  const res = mockRes();
  await getIncomeBreakdown({ query: { month } }, res);
  if (res.statusCode !== 200) throw new Error(`Onverwachte status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  return res.body;
}

let nextUserId = 1;
async function makeUser(email) {
  const id = nextUserId++;
  await db.execute({
    sql: `INSERT INTO users (id, email, password, first_name, last_name, role) VALUES (?, ?, 'x', 'Test', 'User', 'member')`,
    args: [id, email],
  });
  return id;
}

async function makeFondsMember({ userId, fondsType, amount, createdAt, status = 'active' }) {
  await db.execute({
    sql: `INSERT INTO fonds_members (user_id, fonds_type, fonds_name, start_date, end_date, amount_covered, status, created_at)
          VALUES (?, ?, ?, '2026-01-01', '2026-12-31', ?, ?, ?)`,
    args: [userId, fondsType, fondsType, amount, status, createdAt],
  });
}

async function makeMembership({ userId, priceMonthly, fondsMemberId = null, status = 'active', paymentType = 'mollie' }) {
  const memRes = await db.execute({
    sql: `INSERT INTO memberships (name, category, price_monthly, duration_months, minimum_months, features, notice_period_months)
          VALUES ('Jeugd Jaar', 'groepslessen', ?, 12, 12, '[]', 1)`,
    args: [priceMonthly],
  });
  await db.execute({
    sql: `INSERT INTO user_memberships (user_id, membership_id, status, start_date, payment_type, fonds_member_id)
          VALUES (?, ?, ?, '2026-01-01', ?, ?)`,
    args: [userId, memRes.lastInsertRowid, status, paymentType, fondsMemberId],
  });
}

async function main() {
  await ensureSchema();

  await test('A. Eén fondsbetaling van €1.120 voor 24 leden → inkomsten €1.120', async () => {
    // 24 individuele fonds_members-rijen (één per lid), samen €1.120 — geen
    // enkele rij vertegenwoordigt de volle €1.120 zelf, wat bevestigt dat de
    // som van de daadwerkelijk ingevoerde bedragen leidend is.
    for (let i = 0; i < 24; i++) {
      const uid = await makeUser(`scenarioA-${i}@test.invalid`);
      await makeFondsMember({ userId: uid, fondsType: 'jeugdsportfonds', amount: 1120 / 24, createdAt: '2026-03-15 10:00:00' });
    }
    const body = await callIncome('2026-03');
    assert.equal(Math.round(body.breakdown.fonds_jeugd.total * 100) / 100, 1120, 'fonds_jeugd.total moet €1.120 zijn');
    assert.equal(body.breakdown.fonds_jeugd.count, 24, 'count moet 24 betalingen zijn');
  });

  await test('B. Jeugd jaarabonnement gekoppeld aan fondsdeelnemer → geen extra fondsinkomst', async () => {
    // Los lid met een gewoon "Jeugd Jaar"-lidmaatschap (€45/mnd) gekoppeld aan
    // een fondsbetaling van €50. De lidmaatschapsprijs (45, of 45×12=540) mag
    // nergens in het fondstotaal verschijnen — alleen de €50 telt.
    const uid = await makeUser('scenarioB@test.invalid');
    await makeFondsMember({ userId: uid, fondsType: 'jeugdsportfonds', amount: 50, createdAt: '2026-04-05 09:00:00' });
    const fondsRow = await db.execute({ sql: `SELECT id FROM fonds_members WHERE user_id = ?`, args: [uid] });
    await makeMembership({ userId: uid, priceMonthly: 45, fondsMemberId: fondsRow.rows[0].id, paymentType: 'fonds' });

    const body = await callIncome('2026-04');
    assert.equal(body.breakdown.fonds_jeugd.total, 50, 'alleen het ingevoerde bedrag (€50), niet €45 en niet €45×12');
  });

  await test('C. Twee fondsbetalingen (€500 + €620) → totaal €1.120', async () => {
    const u1 = await makeUser('scenarioC-1@test.invalid');
    const u2 = await makeUser('scenarioC-2@test.invalid');
    await makeFondsMember({ userId: u1, fondsType: 'volwassenenfonds', amount: 500, createdAt: '2026-05-10 12:00:00' });
    await makeFondsMember({ userId: u2, fondsType: 'volwassenenfonds', amount: 620, createdAt: '2026-05-20 12:00:00' });

    const body = await callIncome('2026-05');
    assert.equal(body.breakdown.fonds_volwassenen.total, 1120);
    assert.equal(body.breakdown.fonds_volwassenen.count, 2);
  });

  await test('D. Een fondsbetaling mag niet dubbel worden geteld', async () => {
    // Eén fondsbetaling, gekoppeld aan TWEE user_memberships-rijen (kan
    // gebeuren als een lid meerdere lidmaatschap-records heeft) — de oude
    // JOIN-gebaseerde query telde de prijs dan 2×. De nieuwe query leest
    // fonds_members rechtstreeks en mag dus maar één keer tellen.
    const uid = await makeUser('scenarioD@test.invalid');
    await makeFondsMember({ userId: uid, fondsType: 'jeugdsportfonds', amount: 75, createdAt: '2026-06-01 08:00:00' });
    const fondsRow = await db.execute({ sql: `SELECT id FROM fonds_members WHERE user_id = ?`, args: [uid] });
    await makeMembership({ userId: uid, priceMonthly: 45, fondsMemberId: fondsRow.rows[0].id, paymentType: 'fonds' });
    await makeMembership({ userId: uid, priceMonthly: 45, fondsMemberId: fondsRow.rows[0].id, paymentType: 'fonds' });

    const body = await callIncome('2026-06');
    assert.equal(body.breakdown.fonds_jeugd.total, 75, 'mag maar 1× de €75 zijn, niet 2×45 of 75+90');
    assert.equal(body.breakdown.fonds_jeugd.count, 1);
  });

  await test('E. Gewone betalende abonnementen blijven volledig werken', async () => {
    await db.execute({
      sql: `INSERT INTO payments (user_id, amount, status, created_at) VALUES (1, 65, 'paid', '2026-07-15 10:00:00')`,
    });
    await db.execute({
      sql: `INSERT INTO cash_payments (user_id, amount, payment_type, payment_date) VALUES (1, 60, 'membership', '2026-07-16')`,
    });
    const body = await callIncome('2026-07');
    assert.equal(body.breakdown.mollie.total, 65);
    assert.equal(body.breakdown.cash_membership.total, 60);
    assert.equal(body.total, 65 + 60, 'geen fondsen deze maand, totaal = mollie + cash');
  });

  await test('F. Jeugdfonds Sport en Volwassenenfonds Sport correct onder Fondsen', async () => {
    const u1 = await makeUser('scenarioF-1@test.invalid');
    const u2 = await makeUser('scenarioF-2@test.invalid');
    await makeFondsMember({ userId: u1, fondsType: 'jeugdsportfonds', amount: 40, createdAt: '2026-08-01 10:00:00' });
    await makeFondsMember({ userId: u2, fondsType: 'volwassenenfonds', amount: 55, createdAt: '2026-08-02 10:00:00' });

    const body = await callIncome('2026-08');
    assert.equal(body.breakdown.fonds_jeugd.total, 40);
    assert.equal(body.breakdown.fonds_volwassenen.total, 55);
    assert.equal(body.total, 95, 'beide fondscategorieën samen in het totaal');
  });

  await test('G. "Verwacht volgende maand" projecteert geen fondsbedrag (eenmalige betaling, geen abonnement)', async () => {
    const uid = await makeUser('scenarioG@test.invalid');
    await makeFondsMember({ userId: uid, fondsType: 'jeugdsportfonds', amount: 999, createdAt: '2026-09-01 10:00:00' });
    const body = await callIncome('2026-09');
    assert.equal(body.expected_next_month.fonds, 0, 'geen geprojecteerd fondsbedrag voor volgende maand');
  });
}

function cleanup() {
  try { db.close(); } catch (_) {}
  try { fs.rmSync(tmpDbPath, { force: true }); } catch (_) {} // Windows kan de file-handle even vasthouden — geen probleem, tmpdir ruimt dit later zelf op
}

main()
  .then(cleanup)
  .catch((e) => { console.error(e); cleanup(); process.exit(1); });
