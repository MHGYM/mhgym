const db = require('../config/database');

// GET /api/admin/rittenkaart-types
const listTypes = async (req, res) => {
  const result = await db.execute('SELECT * FROM rittenkaart_types ORDER BY ritten ASC');
  res.json({ types: result.rows });
};

// POST /api/admin/rittenkaart-types
const createType = async (req, res) => {
  const { naam, ritten, prijs, geldigheid_dagen } = req.body;
  if (!naam || !ritten || !prijs) return res.status(400).json({ error: 'naam, ritten en prijs zijn verplicht.' });
  const r = await db.execute({
    sql: `INSERT INTO rittenkaart_types (naam, ritten, prijs, geldigheid_dagen) VALUES (?, ?, ?, ?)`,
    args: [naam.trim(), parseInt(ritten), parseFloat(prijs), geldigheid_dagen ? parseInt(geldigheid_dagen) : null],
  });
  const created = await db.execute({ sql: 'SELECT * FROM rittenkaart_types WHERE id = ?', args: [r.lastInsertRowid] });
  res.status(201).json({ type: created.rows[0] });
};

// PUT /api/admin/rittenkaart-types/:id
const updateType = async (req, res) => {
  const { naam, ritten, prijs, geldigheid_dagen } = req.body;
  await db.execute({
    sql: `UPDATE rittenkaart_types SET naam=?, ritten=?, prijs=?, geldigheid_dagen=?, updated_at=datetime('now') WHERE id=?`,
    args: [naam, parseInt(ritten), parseFloat(prijs), geldigheid_dagen ? parseInt(geldigheid_dagen) : null, req.params.id],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM rittenkaart_types WHERE id = ?', args: [req.params.id] });
  res.json({ type: updated.rows[0] });
};

// DELETE /api/admin/rittenkaart-types/:id  — deactivate, do not hard-delete
const deactivateType = async (req, res) => {
  await db.execute({
    sql: `UPDATE rittenkaart_types SET actief=0, updated_at=datetime('now') WHERE id=?`,
    args: [req.params.id],
  });
  res.json({ message: 'Type gedeactiveerd.' });
};

// GET /api/admin/rittenkaarten
const listRittenkaarten = async (req, res) => {
  const result = await db.execute(`
    SELECT rk.*, u.first_name, u.last_name, u.email, t.naam AS type_naam
    FROM rittenkaarten rk
    JOIN users u ON u.id = rk.user_id
    JOIN rittenkaart_types t ON t.id = rk.type_id
    ORDER BY rk.created_at DESC
  `);
  res.json({ kaarten: result.rows });
};

// POST /api/admin/members/:id/rittenkaart
const assignRittenkaart = async (req, res) => {
  const { type_id, betaalmethode, betaald, betaaldatum } = req.body;
  const userId = parseInt(req.params.id);
  if (!type_id) return res.status(400).json({ error: 'type_id is verplicht.' });

  const typeRes = await db.execute({ sql: 'SELECT * FROM rittenkaart_types WHERE id = ? AND actief = 1', args: [type_id] });
  const type = typeRes.rows[0];
  if (!type) return res.status(404).json({ error: 'Rittenkaart type niet gevonden.' });

  const vervaldatum = type.geldigheid_dagen
    ? new Date(Date.now() + type.geldigheid_dagen * 86400000).toISOString().split('T')[0]
    : null;

  const r = await db.execute({
    sql: `INSERT INTO rittenkaarten
            (user_id, type_id, ritten_totaal, ritten_resterend, prijs, betaalmethode, betaald, betaaldatum, vervaldatum, aangemaakt_door)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, type_id, type.ritten, type.ritten, type.prijs, betaalmethode || 'contant', betaald ? 1 : 0, betaaldatum || null, vervaldatum, req.user.id],
  });

  const created = await db.execute({
    sql: `SELECT rk.*, t.naam AS type_naam FROM rittenkaarten rk JOIN rittenkaart_types t ON t.id = rk.type_id WHERE rk.id = ?`,
    args: [r.lastInsertRowid],
  });
  res.status(201).json({ rittenkaart: created.rows[0] });
};

// POST /api/admin/rittenkaarten/:id/correctie
const correctie = async (req, res) => {
  const delta = Number(req.body.delta);
  if (!delta || delta === 0) return res.status(400).json({ error: 'delta mag niet 0 zijn.' });

  const kaartRes = await db.execute({ sql: 'SELECT * FROM rittenkaarten WHERE id = ?', args: [req.params.id] });
  const kaart = kaartRes.rows[0];
  if (!kaart) return res.status(404).json({ error: 'Rittenkaart niet gevonden.' });

  const nieuwSaldo = Number(kaart.ritten_resterend) + delta;
  if (nieuwSaldo < 0) return res.status(400).json({ error: 'Saldo kan niet negatief worden.' });

  const newStatus = nieuwSaldo === 0 ? 'depleted' : 'active';

  await db.batch([
    {
      sql: `UPDATE rittenkaarten SET ritten_resterend=?, status=?, updated_at=datetime('now') WHERE id=?`,
      args: [nieuwSaldo, newStatus, req.params.id],
    },
    {
      sql: `INSERT INTO rittenkaart_transacties (rittenkaart_id, delta, reden, aangemaakt_door) VALUES (?, ?, ?, ?)`,
      args: [req.params.id, delta, req.body.reden || 'handmatige_correctie', req.user.id],
    },
  ], 'write');

  res.json({ message: `Saldo bijgewerkt: ${delta > 0 ? '+' : ''}${delta} rit(ten). Nieuw saldo: ${nieuwSaldo}.` });
};

// POST /api/admin/bookings/:id/aanwezig  — markeer aanwezig + rit aftrekken als geen abonnement
const markAanwezig = async (req, res) => {
  const bookingRes = await db.execute({ sql: 'SELECT * FROM bookings WHERE id = ?', args: [req.params.id] });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (booking.status === 'attended') return res.status(400).json({ error: 'Al gemarkeerd als aanwezig.' });

  await db.execute({ sql: `UPDATE bookings SET status = 'attended' WHERE id = ?`, args: [booking.id] });

  // Rit alleen aftrekken als user geen actief abonnement heeft
  const memberRes = await db.execute({
    sql: `SELECT id FROM user_memberships
          WHERE user_id = ? AND (status = 'active' OR status = 'cancelling')
            AND (cancels_at IS NULL OR cancels_at >= date('now'))
          LIMIT 1`,
    args: [booking.user_id],
  });

  let rit_afgeboekt = false;
  if (!memberRes.rows[0]) {
    const kaartRes = await db.execute({
      sql: `SELECT * FROM rittenkaarten
            WHERE user_id = ? AND status = 'active' AND ritten_resterend > 0
              AND (vervaldatum IS NULL OR vervaldatum >= date('now'))
            ORDER BY created_at ASC LIMIT 1`,
      args: [booking.user_id],
    });
    const kaart = kaartRes.rows[0];
    if (kaart) {
      const nieuwSaldo = Number(kaart.ritten_resterend) - 1;
      const newStatus  = nieuwSaldo === 0 ? 'depleted' : 'active';
      await db.batch([
        {
          sql: `UPDATE rittenkaarten SET ritten_resterend=?, status=?, updated_at=datetime('now') WHERE id=?`,
          args: [nieuwSaldo, newStatus, kaart.id],
        },
        {
          sql: `INSERT INTO rittenkaart_transacties (rittenkaart_id, booking_id, delta, reden, aangemaakt_door) VALUES (?, ?, -1, 'aanwezigheid', ?)`,
          args: [kaart.id, booking.id, req.user.id],
        },
      ], 'write');
      rit_afgeboekt = true;
    }
  }

  res.json({ message: 'Aanwezigheid geregistreerd.', rit_afgeboekt });
};

// GET /api/rittenkaarten/mine  (leden)
const myRittenkaarten = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT rk.*, t.naam AS type_naam
          FROM rittenkaarten rk
          JOIN rittenkaart_types t ON t.id = rk.type_id
          WHERE rk.user_id = ?
          ORDER BY rk.created_at DESC`,
    args: [req.user.id],
  });
  res.json({ kaarten: result.rows });
};

module.exports = {
  listTypes, createType, updateType, deactivateType,
  listRittenkaarten, assignRittenkaart, correctie,
  markAanwezig, myRittenkaarten,
};
