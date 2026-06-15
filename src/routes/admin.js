const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');
const msgCtrl = require('../controllers/messagesController');

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
  const to = req.query.to || req.user?.email;
  if (!to) return res.status(400).json({ error: 'Geef ?to=email mee.' });
  if (!process.env.RESEND_API_KEY) {
    return res.json({ ok: false, error: 'RESEND_API_KEY ontbreekt op Railway.' });
  }
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddr = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const from = `MHGym Test <${fromAddr}>`;
  const { data, error } = await resend.emails.send({
    from, to, subject: 'MHGym e-mail test', text: 'Resend werkt vanuit Railway.',
  });
  if (error) res.json({ ok: false, error: error.message, details: error, from });
  else       res.json({ ok: true, messageId: data?.id, from, to });
});

// ── Berichten (chat) ────────────────────────────────────────────────────────
router.get('/messages/unread-count',     msgCtrl.adminUnreadCount);
router.get('/messages',                  msgCtrl.adminListConversations);
router.get('/messages/:memberId',        msgCtrl.adminGetConversation);
router.post('/messages/:memberId',       msgCtrl.adminSendMessage);

module.exports = router;
