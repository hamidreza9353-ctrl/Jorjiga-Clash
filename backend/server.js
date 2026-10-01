require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!JWT_SECRET || !ADMIN_PASSWORD_HASH) {
  console.warn("WARNING: Set JWT_SECRET and ADMIN_PASSWORD_HASH before production.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
    : true
}));

app.use(express.json({ limit: "50kb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      gems INTEGER NOT NULL CHECK(gems > 0),
      price INTEGER NOT NULL CHECK(price >= 0),
      currency TEXT NOT NULL DEFAULT 'IRR',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      customer_name TEXT,
      customer_contact TEXT,
      total INTEGER NOT NULL CHECK(total >= 0),
      currency TEXT NOT NULL DEFAULT 'IRR',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      provider TEXT NOT NULL,
      provider_reference TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const result = await pool.query(
    "SELECT COUNT(*)::int AS c FROM products"
  );

  if (result.rows[0].c === 0) {
    await pool.query(`
      INSERT INTO products (name, gems, price, currency)
      VALUES
        ('80 Gems', 80, 59000, 'IRR'),
        ('500 Gems', 500, 299000, 'IRR'),
        ('1200 Gems', 1200, 649000, 'IRR'),
        ('2500 Gems', 2500, 1199000, 'IRR')
    `);
  }

  console.log("PostgreSQL database initialized.");
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token || !JWT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function userAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ")
    ? h.slice(7)
    : null;

  if (!t || !JWT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const d = jwt.verify(t, JWT_SECRET);

    if (d.role !== "user") {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.user = d;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", loginLimiter, async (req, res) => {
  const username = String(req.body?.username || "")
    .trim()
    .toLowerCase();

  const password = String(req.body?.password || "");

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({
      error: "نام کاربری نامعتبر است."
    });
  }

  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({
      error: "رمز عبور باید حداقل 8 کاراکتر باشد."
    });
  }

  try {
    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username`,
      [username, hash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      {
        role: "user",
        userId: user.id,
        username: user.username
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user
    });
  } catch {
    res.status(409).json({
      error: "این نام کاربری قبلاً ثبت شده است."
    });
  }
});

app.post("/api/auth/user-login", loginLimiter, async (req, res) => {
  const username = String(req.body?.username || "")
    .trim()
    .toLowerCase();

  const password = String(req.body?.password || "");

  const result = await pool.query(
    `SELECT id, username, password_hash
     FROM users
     WHERE username = $1`,
    [username]
  );

  const u = result.rows[0];

  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({
      error: "نام کاربری یا رمز عبور اشتباه است."
    });
  }

  const token = jwt.sign(
    {
      role: "user",
      userId: u.id,
      username: u.username
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      id: u.id,
      username: u.username
    }
  });
});

app.get("/api/auth/me", userAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.userId,
      username: req.user.username
    }
  });
});

app.get("/api/user/orders", userAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, player_id, total, currency, status, created_at
     FROM orders
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT 100`,
    [req.user.userId]
  );

  res.json(result.rows);
});

app.get("/api/products", async (_req, res) => {
  const result = await pool.query(
    `SELECT id, name, gems, price, currency
     FROM products
     WHERE active = 1
     ORDER BY gems`
  );

  res.json(result.rows);
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password || !ADMIN_PASSWORD_HASH || !JWT_SECRET) {
    return res.status(400).json({
      error: "Login is not configured correctly"
    });
  }

  const ok =
    username === ADMIN_USERNAME &&
    await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

  if (!ok) {
    return res.status(401).json({
      error: "Invalid credentials"
    });
  }

  const token = jwt.sign(
    {
      role: "admin",
      username
    },
    JWT_SECRET,
    {
      expiresIn: "4h"
    }
  );

  res.json({
    token,
    expiresIn: 14400
  });
});

app.post("/api/orders", orderLimiter, async (req, res) => {
  let orderUserId = null;

  try {
    const h = req.headers.authorization || "";

    if (h.startsWith("Bearer ")) {
      const d = jwt.verify(
        h.slice(7),
        JWT_SECRET
      );

      if (d.role === "user") {
        orderUserId = d.userId;
      }
    }
  } catch {}

  const {
    playerId,
    customerName,
    customerContact,
    items
  } = req.body || {};

  if (!/^[A-Za-z0-9_-]{3,40}$/.test(
    String(playerId || "")
  )) {
    return res.status(400).json({
      error: "Invalid player ID"
    });
  }

  if (!Array.isArray(items) ||
      items.length < 1 ||
      items.length > 20) {
    return res.status(400).json({
      error: "Invalid items"
    });
  }

  const ids = items.map(x => Number(x.productId));
  const uniqueIds = [...new Set(ids)];

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const productsResult = await client.query(
      `SELECT id, price
       FROM products
       WHERE active = 1
       AND id = ANY($1::int[])`,
      [uniqueIds]
    );

    const priceMap = new Map(
      productsResult.rows.map(p => [
        Number(p.id),
        Number(p.price)
      ])
    );

    let total = 0;
    const cleanItems = [];

    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20 ||
        !priceMap.has(productId)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Invalid item"
        });
      }

      total += priceMap.get(productId) * quantity;

      cleanItems.push({
        productId,
        quantity,
        unitPrice: priceMap.get(productId)
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders
       (player_id, customer_name, customer_contact,
        total, currency, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        String(playerId).trim(),
        String(customerName || "").trim().slice(0, 80),
        String(customerContact || "").trim().slice(0, 120),
        total,
        "IRR",
        orderUserId
      ]
    );

    const orderId = Number(orderResult.rows[0].id);

    for (const item of cleanItems) {
      await client.query(
        `INSERT INTO order_items
         (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [
          orderId,
          item.productId,
          item.quantity,
          item.unitPrice
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      id: orderId,
      status: "pending",
      total,
      currency: "IRR"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      error: "Could not create order"
    });
  } finally {
    client.release();
  }
});

app.get("/api/orders/:id", async (req, res) => {
  const id = Number(req.params.id);

  const result = await pool.query(
    `SELECT id, player_id, total, currency,
            status, created_at
     FROM orders
     WHERE id = $1`,
    [id]
  );

  const order = result.rows[0];

  if (!order) {
    return res.status(404).json({
      error: "Order not found"
    });
  }

  res.json(order);
});

app.get("/api/admin/orders", auth, async (_req, res) => {
  const result = await pool.query(`
    SELECT id, player_id, customer_name,
           customer_contact, total, currency,
           status, created_at
    FROM orders
    ORDER BY id DESC
    LIMIT 200
  `);

  res.json(result.rows);
});

app.patch("/api/admin/orders/:id", auth, async (req, res) => {
  const status = String(req.body?.status || "");

  const allowed = new Set([
    "pending",
    "processing",
    "completed",
    "cancelled"
  ]);

  if (!allowed.has(status)) {
    return res.status(400).json({
      error: "Invalid status"
    });
  }

  const result = await pool.query(
    `UPDATE orders
     SET status = $1
     WHERE id = $2`,
    [
      status,
      Number(req.params.id)
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      error: "Order not found"
    });
  }

  res.json({
    ok: true
  });
});

app.post("/api/payments/create", async (req, res) => {
  const orderId = Number(req.body?.orderId);

  const orderResult = await pool.query(
    `SELECT id, total, currency, status
     FROM orders
     WHERE id = $1`,
    [orderId]
  );

  const order = orderResult.rows[0];

  if (!order) {
    return res.status(404).json({
      error: "Order not found"
    });
  }

  if (order.status === "cancelled") {
    return res.status(400).json({
      error: "Order is cancelled"
    });
  }

  const existingResult = await pool.query(
    `SELECT *
     FROM payments
     WHERE order_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [orderId]
  );

  const existing = existingResult.rows[0];

  if (existing && existing.status === "paid") {
    return res.json({
      paymentId: existing.id,
      status: "paid",
      amount: existing.amount,
      currency: existing.currency
    });
  }

  const result = await pool.query(
    `INSERT INTO payments
     (order_id, provider, amount, currency, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      orderId,
      "pending-provider",
      order.total,
      order.currency,
      "pending"
    ]
  );

  const paymentId = Number(result.rows[0].id);

  res.status(201).json({
    paymentId,
    status: "pending",
    amount: order.total,
    currency: order.currency,
    checkoutUrl: null,
    message: "Payment provider is not connected yet."
  });
});

app.get("/api/payments/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT id, order_id, provider,
            provider_reference, amount,
            currency, status, created_at
     FROM payments
     WHERE id = $1`,
    [Number(req.params.id)]
  );

  const p = result.rows[0];

  if (!p) {
    return res.status(404).json({
      error: "Payment not found"
    });
  }

  res.json(p);
});

app.post("/api/payments/webhook", (req, res) => {
  return res.status(501).json({
    error: "Payment provider webhook is not configured yet."
  });
});

app.get("/api/admin/stats", auth, async (_req, res) => {
  const statsResult = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'pending'
      )::int AS pending,
      COUNT(*) FILTER (
        WHERE status = 'processing'
      )::int AS processing,
      COUNT(*) FILTER (
        WHERE status = 'completed'
      )::int AS completed,
      COUNT(*) FILTER (
        WHERE status = 'cancelled'
      )::int AS cancelled,
      COALESCE(
        SUM(
          CASE
            WHEN status = 'completed'
            THEN total
            ELSE 0
          END
        ),
        0
      )::bigint AS revenue
    FROM orders
  `);

  const usersResult = await pool.query(
    "SELECT COUNT(*)::int AS c FROM users"
  );

  res.json({
    ...statsResult.rows[0],
    users: usersResult.rows[0].c
  });
});

async function startServer() {
  try {
    await initDatabase();

    await pool.query("SELECT 1");

    app.listen(PORT, () => {
      console.log(
        `Jorjiga Clash API running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Database startup error:", error);
    process.exit(1);
  }
}

startServer();
