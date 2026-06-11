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
// Capture raw body for Mollie webhook signature verification
const rawBodySaver = (req, _res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: '10mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: false, limit: '10mb', verify: rawBodySaver }));

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
app.use('/api/chat',        require('./routes/chat'));
app.use('/api/messages',    require('./routes/messages'));
app.use('/api/setup',       require('./routes/setup'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Serve React frontend (if built) ─────────────────────────────────────────
// Check for the built index.html rather than relying on NODE_ENV so the
// frontend is served whenever the build exists — regardless of how Railway
// sets environment variables.
const clientDist  = path.join(__dirname, '..', 'client', 'dist');
const indexHtml   = path.join(clientDist, 'index.html');
const fs          = require('fs');
const frontendBuilt = fs.existsSync(indexHtml);

if (frontendBuilt) {
  console.log('[App] Serving React frontend from', clientDist);
  app.use(express.static(clientDist));
  // SPA fallback — app.use() avoids the Express 5 path-to-regexp wildcard issue.
  // Explicit sendFile callback forwards ENOENT to the error handler.
  app.use((req, res, next) => {
    res.sendFile(indexHtml, (err) => { if (err) next(err); });
  });
} else {
  console.warn('[App] client/dist/index.html not found — frontend not served.');
  // 404 for unknown routes in API-only mode (local dev without a build)
  app.use((_, res) => res.status(404).json({ error: 'Endpoint niet gevonden.' }));
}

// Global error handler
app.use(errorHandler);

module.exports = app;
