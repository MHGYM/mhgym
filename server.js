require('dotenv').config();
const app          = require('./src/app');
const ensureSchema = require('./scripts/ensure-schema');

const PORT = process.env.PORT || 3000;

async function start() {
  // Set up / verify database schema before accepting traffic
  await ensureSchema();

  app.listen(PORT, () => {
    console.log(`🏋️  MHGym API draait op http://localhost:${PORT}`);
    console.log(`📋 Omgeving: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch(err => {
  console.error('Startup mislukt:', err);
  process.exit(1);
});
