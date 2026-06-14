const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');
const msgCtrl = require('../controllers/messagesController');

// ── TIJDELIJK: SMTP diagnostiek zonder JWT (beveiligd via ADMIN_SECRET) ────
router.get('/test-email-public', async (req, res) => {
  if (!process.env.ADMIN_SECRET || req.query.secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Onbevoegd.' });
  }
  const nodemailer = require('nodemailer');
  const to = req.query.to || 'test@mhgym.nl';
  const cfg = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_USER || process.env.FROM_EMAIL,
  };
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return res.json({ ok: false, error: 'SMTP_HOST, SMTP_USER of SMTP_PASS ontbreekt.', cfg: { host: cfg.host, user: cfg.user, passSet: !!cfg.pass } });
  }
  const t = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: false,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
  try {
    await t.verify();
    const info = await t.sendMail({ from: `"MHGym Test" <${cfg.from}>`, to, subject: 'MHGym SMTP test', text: 'SMTP werkt via Railway.' });
    res.json({ ok: true, messageId: info.messageId, from: cfg.from, to, host: cfg.host, port: cfg.port });
  } catch (err) {
    res.json({ ok: false, error: err.message, code: err.code, responseCode: err.responseCode, response: err.response, from: cfg.from, host: cfg.host, port: cfg.port });
  }
});

router.use(authenticate, requireAdmin);

// ── Statistieken ────────────────────────────────────────────────────────────
router.get('/stats', ctrl.getStats);

// ── Leden ───────────────────────────────────────────────────────────────────
router.post('/members/create-sepa',       ctrl.createMemberWithSepa);
router.get('/members',                    ctrl.listMembers);
router.get('/members/:id',                ctrl.getMember);
router.put('/members/:id/role',           ctrl.setMemberRole);
router.put('/members/:id/notes',          ctrl.updateMemberNotes);
router.put('/members/:id/pause',          ctrl.pauseMembership);
router.put('/members/:id/custom-amount',  ctrl.updateCustomAmount);
router.post('/members/:id/membership',    ctrl.assignMembership);
router.put('/members/:id/memberships/:mid/paid', ctrl.markCashPaid);
router.post('/members/:id/pt-lessons',    ctrl.addPtLessons);
router.delete('/members/:id',             ctrl.deleteMember);

// ── Lessen ───────────────────────────────────────────────────────────────────
router.get('/classes',             ctrl.adminListClasses);
router.post('/classes',            ctrl.adminCreateClass);
router.put('/classes/:id',         ctrl.adminUpdateClass);
router.delete('/classes/:id',      ctrl.adminCancelClass);
router.get('/classes/:id/bookings', ctrl.adminGetClassBookings);

// ── Boekingen ─────────────────────────────────────────────────────────────────
router.get('/bookings',        ctrl.adminListBookings);
router.post('/bookings/class', ctrl.adminBookClass);
router.post('/bookings/pt',    ctrl.adminBookPt);

// ── Betalingen ─────────────────────────────────────────────────────────────────
router.get('/payments', ctrl.adminListPayments);

// ── Betalingsfouten ────────────────────────────────────────────────────────────
router.get('/payment-failures',                      ctrl.getPaymentFailures);
router.get('/payment-failures/:id',                  ctrl.getPaymentDetail);
router.post('/payment-failures/:id/remind',          ctrl.sendPaymentReminder);
router.post('/payment-failures/:id/paylink',         ctrl.sendPayLink);
router.post('/payment-failures/auto-remind',         ctrl.processAutoReminders);
router.put('/payment-failures/:id/paid',             ctrl.markPaymentPaid);
router.put('/payment-failures/:id/pause',            ctrl.pauseMembershipFromFailure);

// ── E-mail diagnostiek ─────────────────────────────────────────────────────
router.get('/test-email', async (req, res) => {
  const nodemailer = require('nodemailer');
  const to = req.query.to || req.user?.email;
  if (!to) return res.status(400).json({ error: 'Geef ?to=email mee.' });

  const cfg = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER,
    from: process.env.SMTP_USER || process.env.FROM_EMAIL,
  };

  if (!cfg.host || !cfg.user || !process.env.SMTP_PASS) {
    return res.json({ ok: false, error: 'SMTP_HOST, SMTP_USER of SMTP_PASS ontbreekt op Railway.' });
  }

  const t = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: false,
    auth: { user: cfg.user, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });

  try {
    await t.verify();
    const info = await t.sendMail({
      from: `"MHGym Test" <${cfg.from}>`, to,
      subject: 'MHGym SMTP test', text: 'SMTP werkt.',
    });
    res.json({ ok: true, messageId: info.messageId, from: cfg.from, to, host: cfg.host });
  } catch (err) {
    res.json({ ok: false, error: err.message, code: err.code, responseCode: err.responseCode, response: err.response, from: cfg.from, host: cfg.host });
  }
});

// ── Berichten (chat) ────────────────────────────────────────────────────────
router.get('/messages/unread-count',     msgCtrl.adminUnreadCount);
router.get('/messages',                  msgCtrl.adminListConversations);
router.get('/messages/:memberId',        msgCtrl.adminGetConversation);
router.post('/messages/:memberId',       msgCtrl.adminSendMessage);

module.exports = router;
