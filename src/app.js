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

// ── Security & parsing ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
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
  // SPA fallback — send index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 404 (only reached in development for unknown API routes)
app.use((_, res) => res.status(404).json({ error: 'Endpoint niet gevonden.' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
