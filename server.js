require('dotenv').config();
const app          = require('./src/app');
const ensureSchema = require('./scripts/ensure-schema');

const PORT = process.env.PORT || 3000;

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
}

start().catch(err => {
  console.error('[Startup] ❌ Startup mislukt:', err);
  process.exit(1);
});
