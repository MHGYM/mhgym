require('dotenv').config();
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');

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

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

// 404
app.use((_, res) => res.status(404).json({ error: 'Endpoint niet gevonden.' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
