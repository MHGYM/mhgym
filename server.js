require('dotenv').config();
const app          = require('./src/app');
const ensureSchema = require('./scripts/ensure-schema');
const cron         = require('node-cron');
const { runFondsReminders, runQuarterlyReminders } = require('./src/controllers/cashController');

const PORT = process.env.PORT || 8080;

// ── Global crash guards ──────────────────────────────────────────────────────
// Node 20 crashes the process on unhandled rejections — log them clearly
// so Railway logs show the cause before the container exits.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

async function start() {
  console.log(`[Startup] NODE_ENV  = ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Startup] PORT      = ${PORT}`);
  console.log(`[Startup] DB_PATH   = ${process.env.DB_PATH || './mhgym.db'}`);

  // Set up / verify database schema before accepting traffic
  await ensureSchema();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Startup] ✅ Server luistert op http://0.0.0.0:${PORT}`);
  });

  // ── Dagelijkse reminders (elke dag om 08:00) ──────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Fonds reminders verwerken…');
    try { const r = await runFondsReminders(); console.log('[Cron] Fonds klaar:', r); }
    catch (e) { console.error('[Cron] Fonds reminders fout:', e.message); }

    console.log('[Cron] Kwartaal reminders verwerken…');
    try { const r = await runQuarterlyReminders(); console.log('[Cron] Kwartaal klaar:', r); }
    catch (e) { console.error('[Cron] Kwartaal reminders fout:', e.message); }
  }, { timezone: 'Europe/Amsterdam' });

  console.log('[Startup] ⏰ Dagelijkse cron actief (08:00 Amsterdam)');
}

start().catch(err => {
  console.error('[Startup] ❌ Startup mislukt:', err);
  process.exit(1);
});
