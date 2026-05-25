require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

// libSQL returns BigInt for lastInsertRowid — make it JSON-safe globally
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function () { return Number(this); };

const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Trust Railway's reverse proxy so req.ip / req.secure / X-Forwarded-* work
app.set('trust proxy', 1);

// ── Security & parsing ──────────────────────────────────────────────────────
// Relax helmet's default CSP so the Vite-built React assets can load
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: in production the frontend is served from the same origin, so we
// reflect the request Origin (allows the Railway domain and same-origin
// requests without hardcoding the URL). In dev, restrict to the Vite port.
app.use(cors(
  process.env.NODE_ENV === 'production'
    ? { origin: true, credentials: true }
    : { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }
));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/classes',     require('./routes/classes'));
app.use('/api/bookings',    require('./routes/bookings'));
app.use('/api/memberships', require('./routes/memberships'));
app.use('/api/payments',    require('./routes/payments'));
app.use('/api/shop',        require('./routes/shop'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/pt',          require('./routes/pt'));
app.use('/api/agenda',      require('./routes/agenda'));
app.use('/api/vt',          require('./routes/vrijTrainen'));
app.use('/api/community',   require('./routes/community'));
app.use('/api/cash',        require('./routes/cash'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Production: serve React frontend ────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  // SPA fallback — use app.use() (not app.get('*')) because Express 5
  // path-to-regexp v8 no longer accepts bare '*' as a valid wildcard.
  // Pass next so sendFile errors (e.g. missing index.html) reach the
  // global error handler instead of leaving the request hanging.
  app.use((req, res, next) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

// 404 (only reached in development for unknown API routes)
app.use((_, res) => res.status(404).json({ error: 'Endpoint niet gevonden.' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
