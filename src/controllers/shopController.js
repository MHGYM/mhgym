const db = require('../config/database');
const mollieClient = require('../config/mollie');
const { sendOrderConfirmation } = require('../services/emailService');

// GET /api/shop/products  — lijst alle actieve producten
const listProducts = async (req, res) => {
  const { category } = req.query;

  let sql = 'SELECT * FROM products WHERE active = 1';
  const args = [];
  if (category) { sql += ' AND category = ?'; args.push(category); }
  sql += ' ORDER BY category, name';

  const result = await db.execute({ sql, args });
  res.json({ products: result.rows });
};

// GET /api/shop/products/:id
const getProduct = async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM products WHERE id = ? AND active = 1',
    args: [req.params.id],
  });
  if (!result.rows[0]) return res.status(404).json({ error: 'Product niet gevonden.' });
  res.json({ product: result.rows[0] });
};

// POST /api/shop/checkout  — maak bestelling + start Mollie betaling
// Body: { items: [{ product_id, quantity }] }
const startShopCheckout = async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Winkelwagen is leeg.' });
  }

  // Haal producten op + valideer voorraad
  let totalAmount = 0;
  const resolvedItems = [];

  for (const item of items) {
    const pRes = await db.execute({
      sql: 'SELECT * FROM products WHERE id = ? AND active = 1',
      args: [item.product_id],
    });
    const product = pRes.rows[0];
    if (!product) return res.status(404).json({ error: `Product ${item.product_id} niet gevonden.` });

    const qty = parseInt(item.quantity) || 1;
    if (product.stock !== -1 && product.stock < qty) {
      return res.status(400).json({ error: `Onvoldoende voorraad voor "${product.name}".` });
    }

    totalAmount += product.price * qty;
    resolvedItems.push({ ...product, quantity: qty });
  }

  // Maak order aan
  const orderRes = await db.execute({
    sql: `INSERT INTO orders (user_id, total_amount, status) VALUES (?, ?, 'pending')`,
    args: [req.user.id, totalAmount],
  });
  const orderId = orderRes.lastInsertRowid;

  // Voeg order items toe
  await db.batch(
    resolvedItems.map((item) => ({
      sql: `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
            VALUES (?, ?, ?, ?)`,
      args: [orderId, item.id, item.quantity, item.price],
    })),
    'write'
  );

  // Mollie betaling aanmaken
  const description = `MHGym Winkel — Bestelling #${orderId}`;
  const redirectUrl = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL}/shop?bestelling=geslaagd`;
  const webhookUrl  = process.env.MOLLIE_WEBHOOK_URL;

  let payment;
  try {
    payment = await mollieClient.payments.create({
      amount:   { currency: 'EUR', value: Number(totalAmount).toFixed(2) },
      description,
      redirectUrl,
      webhookUrl,
      locale:   'nl_NL',
      metadata: { type: 'shop', order_id: String(orderId), user_id: String(req.user.id) },
    });
  } catch (mollieErr) {
    const msg = mollieErr?.message || 'Betaling aanmaken mislukt.';
    console.error('[Mollie shop] fout:', msg);
    return res.status(502).json({ error: `Mollie fout: ${msg}` });
  }

  // Koppel Mollie payment aan order
  await db.execute({
    sql: `UPDATE orders SET mollie_payment_id = ?, checkout_url = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [payment.id, payment.getCheckoutUrl(), orderId],
  });

  // Sla ook op in payments tabel voor centrale betalingshistorie
  await db.execute({
    sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, checkout_url)
          VALUES (?, ?, ?, ?, 'shop', ?)`,
    args: [req.user.id, payment.id, totalAmount, description, payment.getCheckoutUrl()],
  });

  res.json({
    checkout_url: payment.getCheckoutUrl(),
    payment_id:   payment.id,
    order_id:     orderId,
    total:        totalAmount,
  });
};

// GET /api/shop/orders  — eigen bestellingen
const myOrders = async (req, res) => {
  const ordersRes = await db.execute({
    sql: `SELECT o.* FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`,
    args: [req.user.id],
  });

  const orders = [];
  for (const order of ordersRes.rows) {
    const itemsRes = await db.execute({
      sql: `SELECT oi.*, p.name AS product_name, p.category AS product_category
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?`,
      args: [order.id],
    });
    orders.push({ ...order, items: itemsRes.rows });
  }

  res.json({ orders });
};

// Admin routes ──────────────────────────────────────────────────────────────

// GET /api/shop/admin/products
const adminListProducts = async (req, res) => {
  const result = await db.execute('SELECT * FROM products ORDER BY category, name');
  res.json({ products: result.rows });
};

// POST /api/shop/admin/products
const adminCreateProduct = async (req, res) => {
  const { name, category, description, price, stock, image_url } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Naam en prijs zijn verplicht.' });

  const result = await db.execute({
    sql: `INSERT INTO products (name, category, description, price, stock, image_url)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [name, category || 'accessoires', description || null, price, stock ?? 0, image_url || null],
  });
  const product = await db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json({ product: product.rows[0] });
};

// PUT /api/shop/admin/products/:id
const adminUpdateProduct = async (req, res) => {
  const { name, category, description, price, stock, image_url, active } = req.body;
  await db.execute({
    sql: `UPDATE products SET
            name = COALESCE(?, name),
            category = COALESCE(?, category),
            description = COALESCE(?, description),
            price = COALESCE(?, price),
            stock = COALESCE(?, stock),
            image_url = COALESCE(?, image_url),
            active = COALESCE(?, active),
            updated_at = datetime('now')
          WHERE id = ?`,
    args: [name ?? null, category ?? null, description ?? null, price ?? null,
           stock ?? null, image_url ?? null, active ?? null, req.params.id],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [req.params.id] });
  if (!updated.rows[0]) return res.status(404).json({ error: 'Product niet gevonden.' });
  res.json({ product: updated.rows[0] });
};

// DELETE /api/shop/admin/products/:id  — soft delete
const adminDeleteProduct = async (req, res) => {
  await db.execute({ sql: `UPDATE products SET active = 0 WHERE id = ?`, args: [req.params.id] });
  res.json({ message: 'Product verwijderd.' });
};

// GET /api/shop/admin/orders
const adminListOrders = async (req, res) => {
  const ordersRes = await db.execute(`
    SELECT o.*, u.first_name, u.last_name, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `);

  const orders = [];
  for (const order of ordersRes.rows) {
    const itemsRes = await db.execute({
      sql: `SELECT oi.*, p.name AS product_name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
      args: [order.id],
    });
    orders.push({ ...order, items: itemsRes.rows });
  }

  res.json({ orders });
};

module.exports = {
  listProducts, getProduct, startShopCheckout, myOrders,
  adminListProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct, adminListOrders,
};
