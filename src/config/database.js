const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';

const db = createClient({
  url: `file:${path.resolve(dbPath)}`,
});

module.exports = db;
