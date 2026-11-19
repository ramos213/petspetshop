import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("Defina um JWT_SECRET com pelo menos 32 caracteres no ambiente de produção.");
}
if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
  throw new Error("Defina ADMIN_PASSWORD antes de inicializar o administrador em produção.");
}
const jwtSecret = process.env.JWT_SECRET || "development-only-change-me";
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

const money = (value) => Math.round(Number(value) * 100);
const userById = db.prepare("SELECT id,name,email,phone,role FROM users WHERE id=?");
function auth(required = true, role) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return required ? res.status(401).json({ error: "Entre na sua conta para continuar." }) : next();
    try {
      req.user = jwt.verify(token, jwtSecret);
      if (role && req.user.role !== role) return res.status(403).json({ error: "Acesso restrito ao administrador." });
      next();
    } catch {
      return res.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    }
  };
}
const settings = () => Object.fromEntries(db.prepare("SELECT key,value FROM company_settings").all().map(({ key, value }) => [key, value]));
const publicProduct = (row) => ({ ...row, rating: row.approved_rating ?? row.rating, price: row.price_cents / 100, original_price: row.original_price_cents ? row.original_price_cents / 100 : null, prescription_required: Boolean(row.prescription_required) });
const productQuery = `SELECT p.*, c.name AS category,
  COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.target_type='product' AND r.target_id=p.id AND r.approved=1),p.rating) AS approved_rating
  FROM products p LEFT JOIN categories c ON c.id=p.category_id`;
const serviceQuery = "SELECT * FROM services";
function shopClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/bootstrap", (_req, res) => res.json({
  company: settings(),
  categories: db.prepare("SELECT * FROM categories ORDER BY name").all(),
  products: db.prepare(`${productQuery} WHERE p.active=1 ORDER BY p.id`).all().map(publicProduct),
  services: db.prepare(`${serviceQuery} WHERE active=1 ORDER BY id`).all().map((s) => ({ ...s, price: s.price_cents / 100 })),
  reviews: db.prepare("SELECT * FROM reviews WHERE approved=1 ORDER BY id DESC LIMIT 6").all(),
  employees: db.prepare("SELECT id,name,role FROM employees WHERE active=1 ORDER BY id").all(),
}));

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(200),
  phone: z.string().trim().min(8).max(25), password: z.string().min(8).max(100),
});
app.post("/api/auth/register", (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Confira seus dados." });
  const { name, email, phone, password } = parsed.data;
  try {
    const result = db.prepare("INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)")
      .run(name, email.toLowerCase(), phone, bcrypt.hashSync(password, 10));
    const user = userById.get(result.lastInsertRowid);
    res.status(201).json({ token: jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: "7d" }), user });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Este e-mail já possui uma conta." });
    next(error);
  }
});
app.post("/api/auth/login", (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe e-mail e senha válidos." });
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(parsed.data.email.toLowerCase());
  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) return res.status(401).json({ error: "E-mail ou senha incorretos." });
  res.json({ token: jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: "7d" }), user: userById.get(user.id) });
});
app.get("/api/auth/me", auth(), (req, res) => res.json(userById.get(req.user.id)));

app.get("/api/availability", (req, res) => {
  const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), serviceId: z.coerce.number().int().positive() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Data ou serviço inválido." });
  if (query.data.date < shopClock().date) return res.status(400).json({ error: "Escolha uma data futura." });
  const service = db.prepare("SELECT duration_minutes FROM services WHERE id=? AND active=1").get(query.data.serviceId);
  if (!service) return res.status(404).json({ error: "Serviço não encontrado." });
  if (new Date(`${query.data.date}T12:00:00`).getDay() === 0) return res.json({ slots: [] });
  const employees = db.prepare("SELECT id FROM employees WHERE active=1").all();
  const bookings = db.prepare("SELECT employee_id,start_time,duration_minutes FROM appointments WHERE appointment_date=? AND status IN ('confirmed','pending')").all(query.data.date);
  const open = settings().openTime || "09:00";
  const close = settings().closeTime || "18:00";
  const [openHour, openMinute] = open.split(":").map(Number);
  const [closeHour, closeMinute] = close.split(":").map(Number);
  const opening = openHour * 60 + openMinute;
  const closing = closeHour * 60 + closeMinute;
  const slots = [];
  for (let start = opening; start + service.duration_minutes <= closing; start += 30) {
    const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const available = employees.some((employee) => bookings.every((booking) => {
      if (booking.employee_id !== employee.id) return true;
      const [h, m] = booking.start_time.split(":").map(Number);
      const bookedStart = h * 60 + m;
      return start >= bookedStart + booking.duration_minutes || bookedStart >= start + service.duration_minutes;
    }));
    if (available) slots.push(time);
  }
  const now = shopClock();
  res.json({ slots: query.data.date === now.date ? slots.filter((time) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute > now.minutes;
  }) : slots });
});
app.post("/api/appointments", auth(false), (req, res) => {
  const schema = z.object({
    serviceId: z.coerce.number().int().positive(), petName: z.string().trim().min(1).max(80),
    species: z.enum(["Cachorro", "Gato"]), size: z.enum(["Pequeno", "Médio", "Grande"]),
    breed: z.string().trim().max(80).optional().default(""), age: z.coerce.number().int().min(0).max(40).optional().nullable(),
    customerName: z.string().trim().min(2).max(100), customerPhone: z.string().trim().min(8).max(25),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),     time: z.string().regex(/^(?:[01]\d|2[0-3]):(00|30)$/),
  }).safeParse(req.body);
  if (!schema.success) return res.status(400).json({ error: schema.error.issues[0]?.message || "Confira os dados do agendamento." });
  const input = schema.data;
  const now = shopClock();
  if (input.date < now.date) return res.status(400).json({ error: "Escolha uma data futura." });
  if (new Date(`${input.date}T12:00:00`).getDay() === 0) return res.status(400).json({ error: "Não temos atendimento aos domingos." });
  const service = db.prepare("SELECT * FROM services WHERE id=? AND active=1").get(input.serviceId);
  if (!service) return res.status(404).json({ error: "Serviço não encontrado." });
  const employees = db.prepare("SELECT id FROM employees WHERE active=1").all();
  const bookings = db.prepare("SELECT employee_id,start_time,duration_minutes FROM appointments WHERE appointment_date=? AND status IN ('confirmed','pending')").all(input.date);
  const start = Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
  if (input.date === now.date && start <= now.minutes) return res.status(400).json({ error: "Esse horário já passou. Escolha um próximo horário disponível." });
  const openingParts = (settings().openTime || "09:00").split(":").map(Number);
  const closingParts = (settings().closeTime || "18:00").split(":").map(Number);
  const opening = openingParts[0] * 60 + openingParts[1];
  const closing = closingParts[0] * 60 + closingParts[1];
  if (start < opening || start + service.duration_minutes > closing) return res.status(400).json({ error: "Horário fora do funcionamento da loja." });
  const employee = employees.find((candidate) => bookings.every((booking) => {
    if (booking.employee_id !== candidate.id) return true;
    const [hour, minute] = booking.start_time.split(":").map(Number);
    const bookedStart = hour * 60 + minute;
    return start >= bookedStart + booking.duration_minutes || bookedStart >= start + service.duration_minutes;
  }));
  if (!employee) return res.status(409).json({ error: "Este horário acabou de ser reservado. Escolha outro." });
  const result = db.prepare(`INSERT INTO appointments(service_id,employee_id,user_id,pet_name,species,size,breed,pet_age,
    customer_name,customer_phone,appointment_date,start_time,duration_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(service.id, employee.id, req.user?.id || null, input.petName, input.species, input.size, input.breed,
      input.age ?? null, input.customerName, input.customerPhone, input.date, input.time, service.duration_minutes);
  res.status(201).json({ id: result.lastInsertRowid, ...input, service: service.name, employee: db.prepare("SELECT name FROM employees WHERE id=?").get(employee.id).name, duration: service.duration_minutes });
});
app.get("/api/my/appointments", auth(), (req, res) => res.json(db.prepare(`SELECT a.*,s.name AS service FROM appointments a
  JOIN services s ON s.id=a.service_id WHERE a.user_id=? ORDER BY appointment_date DESC,start_time DESC`).all(req.user.id)));
app.patch("/api/my/appointments/:id/cancel", auth(), (req, res) => {
  const result = db.prepare("UPDATE appointments SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('confirmed','pending')").run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Agendamento não encontrado ou não pode ser cancelado." });
  res.json({ ok: true });
});

app.post("/api/orders", auth(false), (req, res) => {
  const schema = z.object({
    customerName: z.string().trim().min(2).max(100), customerEmail: z.string().email().max(200),
    customerPhone: z.string().trim().min(8).max(25), fulfillment: z.enum(["delivery", "pickup"]),
    address: z.string().trim().max(300).optional().default(""), paymentMethod: z.enum(["pix", "card", "store"]),
    items: z.array(z.object({ productId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).min(1).max(30),
  }).safeParse(req.body);
  if (!schema.success) return res.status(400).json({ error: schema.error.issues[0]?.message || "Confira os dados do pedido." });
  const input = schema.data;
  if (input.fulfillment === "delivery" && input.address.length < 8) return res.status(400).json({ error: "Informe o endereço completo para entrega." });
  const createOrder = db.transaction(() => {
    let subtotal = 0;
    const lines = input.items.map(({ productId, quantity }) => {
      const product = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(productId);
      if (!product) throw Object.assign(new Error("Um produto do carrinho não está mais disponível."), { status: 409 });
      if (product.prescription_required) throw Object.assign(new Error("Este produto exige prescrição e não pode ser comprado neste checkout."), { status: 400 });
      if (product.stock < quantity) throw Object.assign(new Error(`Estoque insuficiente para ${product.name}.`), { status: 409 });
      subtotal += product.price_cents * quantity;
      return { product, quantity };
    });
    const shipping = input.fulfillment === "delivery" ? (subtotal >= 15000 ? 0 : 1200) : 0;
    const order = db.prepare(`INSERT INTO orders(user_id,customer_name,customer_email,customer_phone,fulfillment,address,
      subtotal_cents,shipping_cents,total_cents,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(req.user?.id || null, input.customerName, input.customerEmail.toLowerCase(), input.customerPhone,
        input.fulfillment, input.address, subtotal, shipping, subtotal + shipping, input.paymentMethod);
    const item = db.prepare("INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price_cents) VALUES(?,?,?,?,?)");
    const stock = db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?");
    for (const line of lines) {
      const change = stock.run(line.quantity, line.product.id, line.quantity);
      if (!change.changes) throw Object.assign(new Error(`Estoque insuficiente para ${line.product.name}.`), { status: 409 });
      item.run(order.lastInsertRowid, line.product.id, line.product.name, line.quantity, line.product.price_cents);
    }
    return { id: order.lastInsertRowid, subtotal: subtotal / 100, shipping: shipping / 100, total: (subtotal + shipping) / 100 };
  });
  try {
    res.status(201).json(createOrder());
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
app.get("/api/my/orders", auth(), (req, res) => res.json(db.prepare(`SELECT o.*,GROUP_CONCAT(oi.product_name || ' × ' || oi.quantity, ', ') AS items
  FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=? GROUP BY o.id ORDER BY o.id DESC`).all(req.user.id)));
app.get("/api/my/pets", auth(), (req, res) => res.json(db.prepare("SELECT * FROM pets WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.post("/api/my/pets", auth(), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), species: z.enum(["Cachorro", "Gato"]), size: z.enum(["Pequeno", "Médio", "Grande"]), breed: z.string().max(80).optional().default(""), age: z.coerce.number().int().min(0).max(40).optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira as informações do pet." });
  const result = db.prepare("INSERT INTO pets(user_id,name,species,size,breed,age) VALUES(?,?,?,?,?,?)").run(req.user.id, parsed.data.name, parsed.data.species, parsed.data.size, parsed.data.breed, parsed.data.age ?? null);
  res.status(201).json({ id: result.lastInsertRowid, ...parsed.data });
});
app.patch("/api/my/profile", auth(), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(25) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira seu nome e telefone." });
  db.prepare("UPDATE users SET name=?,phone=? WHERE id=?").run(parsed.data.name, parsed.data.phone, req.user.id);
  res.json(userById.get(req.user.id));
});
app.get("/api/my/reviews", auth(), (req, res) => res.json(db.prepare("SELECT * FROM reviews WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.get("/api/my/review-options", auth(), (req, res) => {
  const products = db.prepare(`SELECT DISTINCT 'product' AS target_type,p.id AS target_id,p.name FROM orders o
    JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
    WHERE o.user_id=? AND o.status IN ('completed','delivered')
    AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.user_id=o.user_id AND r.target_type='product' AND r.target_id=p.id)`).all(req.user.id);
  const services = db.prepare(`SELECT DISTINCT 'service' AS target_type,s.id AS target_id,s.name FROM appointments a
    JOIN services s ON s.id=a.service_id WHERE a.user_id=? AND a.status='completed'
    AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.user_id=a.user_id AND r.target_type='service' AND r.target_id=s.id)`).all(req.user.id);
  res.json([...products, ...services]);
});

app.post("/api/reviews", auth(), (req, res) => {
  const parsed = z.object({ targetType: z.enum(["product", "service"]), targetId: z.coerce.number().int().positive(), rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().min(8).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira sua avaliação." });
  const { targetType, targetId, rating, comment } = parsed.data;
  const eligible = targetType === "product"
    ? db.prepare("SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=? AND i.product_id=? AND o.status IN ('completed','delivered')").get(req.user.id, targetId)
    : db.prepare("SELECT 1 FROM appointments WHERE user_id=? AND service_id=? AND status='completed'").get(req.user.id, targetId);
  if (!eligible) return res.status(403).json({ error: "Avaliações ficam disponíveis após uma compra entregue ou serviço concluído." });
  try {
    db.prepare("INSERT INTO reviews(user_id,customer_name,target_type,target_id,rating,comment) VALUES(?,?,?,?,?,?)")
      .run(req.user.id, userById.get(req.user.id).name, targetType, targetId, rating, comment);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Você já avaliou este item." });
    throw error;
  }
  res.status(201).json({ message: "Avaliação enviada para aprovação." });
});

app.get("/api/admin/dashboard", auth(true, "admin"), (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const revenue = db.prepare("SELECT COALESCE(SUM(total_cents),0) AS total FROM orders WHERE status IN ('completed','delivered') AND created_at>=date('now','start of month')").get().total;
  res.json({
    revenue: revenue / 100,
    orders: db.prepare("SELECT COUNT(*) AS total FROM orders").get().total,
    appointmentsToday: db.prepare("SELECT COUNT(*) AS total FROM appointments WHERE appointment_date=? AND status!='cancelled'").get(today).total,
    lowStock: db.prepare("SELECT id,name,stock FROM products WHERE active=1 AND stock<=8 ORDER BY stock LIMIT 8").all(),
    bestsellers: db.prepare("SELECT product_name AS name,SUM(quantity) AS sold FROM order_items GROUP BY product_id ORDER BY sold DESC LIMIT 5").all(),
    recentOrders: db.prepare("SELECT id,customer_name,total_cents,status,created_at FROM orders ORDER BY id DESC LIMIT 6").all().map((o) => ({ ...o, total: o.total_cents / 100 })),
    popularServices: db.prepare("SELECT s.name,COUNT(a.id) AS bookings FROM services s LEFT JOIN appointments a ON a.service_id=s.id GROUP BY s.id ORDER BY bookings DESC LIMIT 5").all(),
  });
});
app.get("/api/admin/products", auth(true, "admin"), (_req, res) => res.json(db.prepare(`${productQuery} ORDER BY p.id DESC`).all().map(publicProduct)));
app.post("/api/admin/products", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(1000), category_id: z.coerce.number().int().positive(), price: z.coerce.number().positive(), original_price: z.coerce.number().positive().nullable().optional(), stock: z.coerce.number().int().min(0), image: z.string().url().max(1000), prescription_required: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira os dados do produto." });
  const p = parsed.data;
  const result = db.prepare(`INSERT INTO products(category_id,name,description,price_cents,original_price_cents,stock,image,prescription_required)
    VALUES(?,?,?,?,?,?,?,?)`).run(p.category_id,p.name,p.description,money(p.price),p.original_price ? money(p.original_price) : null,p.stock,p.image,p.prescription_required ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.put("/api/admin/products/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(1000), category_id: z.coerce.number().int().positive(), price: z.coerce.number().positive(), original_price: z.coerce.number().positive().nullable().optional(), stock: z.coerce.number().int().min(0), image: z.string().url().max(1000), prescription_required: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira os dados do produto." });
  const p = parsed.data;
  const result = db.prepare(`UPDATE products SET category_id=?,name=?,description=?,price_cents=?,original_price_cents=?,stock=?,image=?,prescription_required=? WHERE id=?`)
    .run(p.category_id,p.name,p.description,money(p.price),p.original_price ? money(p.original_price) : null,p.stock,p.image,p.prescription_required ? 1 : 0,req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Produto não encontrado." });
  res.json({ ok: true });
});
app.delete("/api/admin/products/:id", auth(true, "admin"), (req, res) => {
  const result = db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Produto não encontrado." });
  res.json({ ok: true });
});
app.put("/api/admin/services/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ price: z.coerce.number().min(0), duration: z.coerce.number().int().min(15).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Preço ou duração inválidos." });
  const result = db.prepare("UPDATE services SET price_cents=?,duration_minutes=? WHERE id=?").run(money(parsed.data.price), parsed.data.duration, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Serviço não encontrado." });
  res.json({ ok: true });
});
app.get("/api/admin/orders", auth(true, "admin"), (_req, res) => res.json(db.prepare(`SELECT o.*,GROUP_CONCAT(oi.product_name || ' × ' || oi.quantity, ', ') AS items FROM orders o
  LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id ORDER BY o.id DESC`).all()));
app.patch("/api/admin/orders/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ status: z.enum(["received", "processing", "shipped", "delivered", "completed", "cancelled"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status inválido." });
  const updateOrder = db.transaction(() => {
    const order = db.prepare("SELECT status FROM orders WHERE id=?").get(req.params.id);
    if (!order) return false;
    if (order.status === "cancelled" && parsed.data.status !== "cancelled") {
      throw Object.assign(new Error("Um pedido cancelado não pode ser reativado."), { status: 409 });
    }
    if (parsed.data.status === "cancelled" && order.status !== "cancelled") {
      const items = db.prepare("SELECT product_id,quantity FROM order_items WHERE order_id=? AND product_id IS NOT NULL").all(req.params.id);
      const restore = db.prepare("UPDATE products SET stock=stock+? WHERE id=?");
      for (const item of items) restore.run(item.quantity, item.product_id);
    }
    db.prepare("UPDATE orders SET status=? WHERE id=?").run(parsed.data.status, req.params.id);
    return true;
  });
  try {
    if (!updateOrder()) return res.status(404).json({ error: "Pedido não encontrado." });
    res.json({ ok: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
app.get("/api/admin/appointments", auth(true, "admin"), (_req, res) => res.json(db.prepare(`SELECT a.*,s.name AS service,e.name AS employee FROM appointments a
  JOIN services s ON s.id=a.service_id LEFT JOIN employees e ON e.id=a.employee_id ORDER BY appointment_date DESC,start_time DESC LIMIT 100`).all()));
app.patch("/api/admin/appointments/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ status: z.enum(["confirmed", "completed", "cancelled"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status inválido." });
  const result = db.prepare("UPDATE appointments SET status=? WHERE id=?").run(parsed.data.status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Agendamento não encontrado." });
  res.json({ ok: true });
});
app.get("/api/admin/reviews", auth(true, "admin"), (_req, res) => res.json(db.prepare("SELECT * FROM reviews ORDER BY approved,id DESC").all()));
app.patch("/api/admin/reviews/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ approved: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Ação inválida." });
  const result = db.prepare("UPDATE reviews SET approved=? WHERE id=?").run(parsed.data.approved ? 1 : 0, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Avaliação não encontrada." });
  res.json({ ok: true });
});
app.put("/api/admin/company", auth(true, "admin"), (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(100), address: z.string().trim().min(5).max(250),
    phone: z.string().trim().min(8).max(25), whatsapp: z.string().regex(/^\d{10,15}$/),
    instagram: z.string().trim().max(80), hours: z.string().trim().max(100),
    openTime: z.string().regex(/^(0\d|1\d|2[0-3]):(00|30)$/),
    closeTime: z.string().regex(/^(0\d|1\d|2[0-3]):(00|30)$/),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira as informações da empresa." });
  if (parsed.data.openTime >= parsed.data.closeTime) return res.status(400).json({ error: "O encerramento precisa ser depois da abertura." });
  const update = db.prepare("INSERT INTO company_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  Object.entries(parsed.data).forEach(([key, value]) => update.run(key, value));
  res.json({ company: settings() });
});
app.get("/api/admin/categories", auth(true, "admin"), (_req, res) => res.json(db.prepare("SELECT * FROM categories ORDER BY name").all()));
app.post("/api/admin/categories", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe um nome de categoria válido." });
  try {
    const result = db.prepare("INSERT INTO categories(name) VALUES(?)").run(parsed.data.name);
    res.status(201).json({ id: result.lastInsertRowid, name: parsed.data.name });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Esta categoria já existe." });
    throw error;
  }
});
app.put("/api/admin/categories/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe um nome de categoria válido." });
  try {
    const result = db.prepare("UPDATE categories SET name=? WHERE id=?").run(parsed.data.name, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Categoria não encontrada." });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ error: "Esta categoria já existe." });
    throw error;
  }
});
app.delete("/api/admin/categories/:id", auth(true, "admin"), (req, res) => {
  if (db.prepare("SELECT 1 FROM products WHERE category_id=? LIMIT 1").get(req.params.id)) {
    return res.status(409).json({ error: "Mova ou remova os produtos desta categoria antes de excluí-la." });
  }
  const result = db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Categoria não encontrada." });
  res.json({ ok: true });
});
app.get("/api/admin/employees", auth(true, "admin"), (_req, res) => res.json(db.prepare("SELECT * FROM employees ORDER BY active DESC,name").all()));
app.post("/api/admin/employees", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), role: z.string().trim().min(2).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe nome e função do profissional." });
  const result = db.prepare("INSERT INTO employees(name,role) VALUES(?,?)").run(parsed.data.name, parsed.data.role);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.put("/api/admin/employees/:id", auth(true, "admin"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), role: z.string().trim().min(2).max(100), active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confira os dados do profissional." });
  const result = db.prepare("UPDATE employees SET name=?,role=?,active=? WHERE id=?").run(parsed.data.name, parsed.data.role, parsed.data.active ? 1 : 0, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Profissional não encontrado." });
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Ocorreu um erro inesperado. Tente novamente." });
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
}

app.listen(port, () => console.log(`Pets PetShop API pronta em http://localhost:${port}`));
