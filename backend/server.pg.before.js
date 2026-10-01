require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!JWT_SECRET || !ADMIN_PASSWORD_HASH) {
  console.warn("WARNING: Set JWT_SECRET and ADMIN_PASSWORD_HASH before production.");
}

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : true
}));
app.use(express.json({ limit: "50kb" }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true });
const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true });

const db = new Database("jorjiga-clash.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 provider TEXT NOT NULL,
 provider_reference TEXT,
 amount INTEGER NOT NULL,
 currency TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 gems INTEGER NOT NULL CHECK(gems > 0),
 price INTEGER NOT NULL CHECK(price >= 0),
 currency TEXT NOT NULL DEFAULT 'IRR',
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 player_id TEXT NOT NULL,
 customer_name TEXT,
 customer_contact TEXT,
 total INTEGER NOT NULL CHECK(total >= 0),
 currency TEXT NOT NULL DEFAULT 'IRR',
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 product_id INTEGER NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price INTEGER NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id),
 FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

try { db.exec("ALTER TABLE orders ADD COLUMN user_id INTEGER"); } catch {}

if (db.prepare("SELECT COUNT(*) c FROM products").get().c === 0) {
  const add = db.prepare("INSERT INTO products (name,gems,price,currency) VALUES (?,?,?,?)");
  const seed = db.transaction(() => {
    add.run("80 Gems", 80, 59000, "IRR");
    add.run("500 Gems", 500, 299000, "IRR");
    add.run("1200 Gems", 1200, 649000, "IRR");
    add.run("2500 Gems", 2500, 1199000, "IRR");
  });
  seed();
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !JWT_SECRET) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));


app.post("/api/auth/register", loginLimiter, async (req,res)=>{
 const username=String(req.body?.username||"").trim().toLowerCase(), password=String(req.body?.password||"");
 if(!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({error:"نام کاربری نامعتبر است."});
 if(password.length<8||password.length>72) return res.status(400).json({error:"رمز عبور باید حداقل 8 کاراکتر باشد."});
 try{
  const hash=await bcrypt.hash(password,12);
  const r=db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username,hash);
  const token=jwt.sign({role:"user",userId:Number(r.lastInsertRowid),username},JWT_SECRET,{expiresIn:"7d"});
  res.status(201).json({token,user:{id:Number(r.lastInsertRowid),username}});
 }catch{res.status(409).json({error:"این نام کاربری قبلاً ثبت شده است."});}
});
app.post("/api/auth/user-login", loginLimiter, async (req,res)=>{
 const username=String(req.body?.username||"").trim().toLowerCase(),password=String(req.body?.password||"");
 const u=db.prepare("SELECT id,username,password_hash FROM users WHERE username=?").get(username);
 if(!u||!(await bcrypt.compare(password,u.password_hash))) return res.status(401).json({error:"نام کاربری یا رمز عبور اشتباه است."});
 const token=jwt.sign({role:"user",userId:u.id,username:u.username},JWT_SECRET,{expiresIn:"7d"});
 res.json({token,user:{id:u.id,username:u.username}});
});
function userAuth(req,res,next){
 const h=req.headers.authorization||"",t=h.startsWith("Bearer ")?h.slice(7):null;
 if(!t||!JWT_SECRET)return res.status(401).json({error:"Unauthorized"});
 try{const d=jwt.verify(t,JWT_SECRET);if(d.role!=="user")return res.status(403).json({error:"Forbidden"});req.user=d;next();}
 catch{res.status(401).json({error:"Invalid or expired token"});}
}
app.get("/api/auth/me",userAuth,(req,res)=>res.json({user:{id:req.user.userId,username:req.user.username}}));
app.get("/api/user/orders",userAuth,(req,res)=>res.json(db.prepare("SELECT id,player_id,total,currency,status,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.userId)));

app.get("/api/products", (_req, res) => {
  res.json(db.prepare("SELECT id,name,gems,price,currency FROM products WHERE active=1 ORDER BY gems").all());
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || !ADMIN_PASSWORD_HASH || !JWT_SECRET)
    return res.status(400).json({ error: "Login is not configured correctly" });

  const ok = username === ADMIN_USERNAME && await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ role: "admin", username }, JWT_SECRET, { expiresIn: "4h" });
  res.json({ token, expiresIn: 14400 });
});

app.post("/api/orders", orderLimiter, (req, res) => {
  let orderUserId=null;
  try {
    const h=req.headers.authorization||"";
    if(h.startsWith("Bearer ")){const d=jwt.verify(h.slice(7),JWT_SECRET);if(d.role==="user") orderUserId=d.userId;}
  } catch {}
  const { playerId, customerName, customerContact, items } = req.body || {};

  if (!/^[A-Za-z0-9_-]{3,40}$/.test(String(playerId || "")))
    return res.status(400).json({ error: "Invalid player ID" });
  if (!Array.isArray(items) || items.length < 1 || items.length > 20)
    return res.status(400).json({ error: "Invalid items" });

  const ids = items.map(x => Number(x.productId));
  const uniqueIds = [...new Set(ids)];
  const placeholders = uniqueIds.map(() => "?").join(",");
  const products = db.prepare(`SELECT id,price FROM products WHERE active=1 AND id IN (${placeholders})`).all(...uniqueIds);
  const priceMap = new Map(products.map(p => [p.id, p.price]));

  let total = 0;
  const cleanItems = [];
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || !priceMap.has(productId))
      return res.status(400).json({ error: "Invalid item" });
    total += priceMap.get(productId) * quantity;
    cleanItems.push({ productId, quantity, unitPrice: priceMap.get(productId) });
  }

  const create = db.transaction(() => {
    const order = db.prepare(
      "INSERT INTO orders (player_id,customer_name,customer_contact,total,currency,user_id) VALUES (?,?,?,?,?,?)"
    ).run(
      String(playerId).trim(),
      String(customerName || "").trim().slice(0, 80),
      String(customerContact || "").trim().slice(0, 120),
      total, "IRR", orderUserId
    );
    const addItem = db.prepare("INSERT INTO order_items (order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)");
    for (const item of cleanItems) addItem.run(order.lastInsertRowid, item.productId, item.quantity, item.unitPrice);
    return Number(order.lastInsertRowid);
  });

  const id = create();
  res.status(201).json({ id, status: "pending", total, currency: "IRR" });
});

app.get("/api/orders/:id", (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare("SELECT id,player_id,total,currency,status,created_at FROM orders WHERE id=?").get(id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.get("/api/admin/orders", auth, (_req, res) => {
  res.json(db.prepare(`
    SELECT id,player_id,customer_name,customer_contact,total,currency,status,created_at
    FROM orders ORDER BY id DESC LIMIT 200
  `).all());
});

app.patch("/api/admin/orders/:id", auth, (req, res) => {
  const status = String(req.body?.status || "");
  const allowed = new Set(["pending","processing","completed","cancelled"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "Invalid status" });
  const result = db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Order not found" });
  res.json({ ok: true });
});



app.post("/api/payments/create", (req,res)=>{
  const orderId=Number(req.body?.orderId);
  const order=db.prepare("SELECT id,total,currency,status FROM orders WHERE id=?").get(orderId);
  if(!order)return res.status(404).json({error:"Order not found"});
  if(order.status==="cancelled")return res.status(400).json({error:"Order is cancelled"});
  const existing=db.prepare("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC LIMIT 1").get(orderId);
  if(existing && existing.status==="paid")return res.json({paymentId:existing.id,status:"paid",amount:existing.amount,currency:existing.currency});
  const r=db.prepare("INSERT INTO payments(order_id,provider,amount,currency,status) VALUES(?,?,?,?,?)")
    .run(orderId,"pending-provider",order.total,order.currency,"pending");
  // Provider integration point: replace this response with the selected payment provider's checkout URL.
  res.status(201).json({
    paymentId:Number(r.lastInsertRowid),
    status:"pending",
    amount:order.total,
    currency:order.currency,
    checkoutUrl:null,
    message:"Payment provider is not connected yet."
  });
});

app.get("/api/payments/:id", (req,res)=>{
  const p=db.prepare("SELECT id,order_id,provider,provider_reference,amount,currency,status,created_at FROM payments WHERE id=?").get(Number(req.params.id));
  if(!p)return res.status(404).json({error:"Payment not found"});
  res.json(p);
});

// Provider webhook placeholder. In production, verify the provider signature before changing payment status.
app.post("/api/payments/webhook", (req,res)=>{
  return res.status(501).json({error:"Payment provider webhook is not configured yet."});
});

app.get("/api/admin/stats",auth,(_req,res)=>{
 const s=db.prepare(`SELECT COUNT(*) total,
 SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
 SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) processing,
 SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
 SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) cancelled,
 COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) revenue FROM orders`).get();
 const users=db.prepare("SELECT COUNT(*) c FROM users").get().c; res.json({...s,users});
});
app.listen(PORT, () => console.log(`Jorjiga Clash API running on http://localhost:${PORT}`));
