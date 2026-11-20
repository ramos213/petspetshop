import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let isPostgres = Boolean(process.env.DATABASE_URL);
const txContext = new AsyncLocalStorage();
let sqlite;
let pool;
let sqliteQueue = Promise.resolve();

async function ensureEngine() {
  if (sqlite || pool) return;
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error("Defina DATABASE_URL para usar o banco persistente no Vercel.");
  }
  isPostgres = Boolean(process.env.DATABASE_URL);
  if (isPostgres) {
    neonConfig.webSocketConstructor = ws;
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    return;
  }
  const { default: Database } = await import("better-sqlite3");
  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(root, process.env.DATABASE_PATH)
    : path.join(root, "data", "pets.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
}

function parameterize(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function execute(sql, params, operation) {
  await ensureEngine();
  if (isPostgres) {
    const insertId = operation === "run" &&
      /^\s*INSERT\s+INTO\s+(?!company_settings\b)/i.test(sql) &&
      !/\bRETURNING\b/i.test(sql);
    try {
      const client = txContext.getStore() || pool;
      const result = await client.query(parameterize(insertId ? `${sql} RETURNING id` : sql), params);
      const rows = result.rows.map((row) => {
        const normalized = { ...row };
        for (const field of result.fields) {
          if (field.dataTypeID === 20 && row[field.name] !== null) {
            const value = Number(row[field.name]);
            if (Number.isSafeInteger(value)) normalized[field.name] = value;
          }
        }
        return normalized;
      });
      if (operation === "get") return rows[0];
      if (operation === "all") return rows;
      const id = result.rows[0]?.id;
      return { lastInsertRowid: id ?? 0, changes: result.rowCount };
    } catch (error) {
      if (error.code === "23505") error.code = "SQLITE_CONSTRAINT_UNIQUE";
      throw error;
    }
  }

  if (txContext.getStore() !== sqlite) {
    const queued = sqliteQueue;
    await queued;
    if (queued !== sqliteQueue) return execute(sql, params, operation);
  }
  const statement = sqlite.prepare(sql);
  if (operation === "get") return statement.get(...params);
  if (operation === "all") return statement.all(...params);
  return statement.run(...params);
}

export const db = {
  get isPostgres() {
    return isPostgres;
  },
  prepare(sql) {
    return {
      get: (...params) => execute(sql, params, "get"),
      all: (...params) => execute(sql, params, "all"),
      run: (...params) => execute(sql, params, "run"),
    };
  },
  async transaction(work) {
    await ensureEngine();
    if (isPostgres) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await txContext.run(client, () => work(db));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    const previous = sqliteQueue;
    let release;
    sqliteQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      sqlite.exec("BEGIN IMMEDIATE");
      const result = await txContext.run(sqlite, () => work(db));
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  },
};

const categories = ["Higiene e cuidados", "Acessórios", "Saúde e bem-estar"];
const products = [
  ["Shampoo Pelos Macios", "Limpeza delicada para deixar a pelagem macia e cheirosa.", 4290, 5290, 24, "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=700&q=80", 1],
  ["Kit cuidado natural", "Um ritual de carinho com ingredientes suaves e naturais.", 6890, null, 18, "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=700&q=80", 1],
  ["Cama Nuvem", "Conforto fofinho para as melhores sonecas do seu pet.", 14990, 17990, 9, "https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?auto=format&fit=crop&w=700&q=80", 2],
  ["Coleira Bosque", "Coleira ajustável, resistente e cheia de estilo.", 5490, null, 31, "https://images.unsplash.com/photo-1601758125946-6ec2ef64daf8?auto=format&fit=crop&w=700&q=80", 2],
  ["Brinquedo Mordedor", "Diversão para gastar energia e estimular seu melhor amigo.", 3290, null, 42, "https://images.unsplash.com/photo-1535294435445-d7249524ef2e?auto=format&fit=crop&w=700&q=80", 2],
  ["Escova desembaraçadora", "Cuidado diário que ajuda a manter os pelos sempre lindos.", 3990, null, 14, "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=700&q=80", 3],
  ["Shampoo suave para gatos", "Fórmula delicada especialmente pensada para felinos.", 4590, null, 17, "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=700&q=80", 1],
  ["Kit dental pet", "Escovação mais fácil para uma rotina de cuidado completa.", 3690, null, 12, "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=700&q=80", 3],
];
const services = [
  ["Banho pequeno porte", "Banho relaxante com produtos selecionados para o seu pet.", 4500, 60, "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=700&q=80"],
  ["Banho médio porte", "Cuidado completo, secagem delicada e muito carinho.", 6000, 75, "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=700&q=80"],
  ["Banho grande porte", "Um momento especial com produtos para todos os tipos de pelo.", 8000, 100, "https://images.unsplash.com/photo-1551717743-49959800b1f6?auto=format&fit=crop&w=700&q=80"],
  ["Tosa higiênica", "Mais conforto e cuidado para a higiene do dia a dia.", 3500, 40, "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=700&q=80"],
  ["Tosa completa", "Visual renovado com atenção especial a cada detalhe.", 5500, 70, "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=700&q=80"],
  ["Corte de unhas", "Cuidado gentil para manter as patinhas sempre bem.", 2000, 20, "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=700&q=80"],
  ["Limpeza de ouvidos", "Higienização cuidadosa para o bem-estar do seu pet.", 1500, 20, "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=700&q=80"],
  ["Hidratação de pelos", "Nutrição profunda para uma pelagem macia e brilhante.", 3000, 35, "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=700&q=80"],
];
const pgSchema = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, species TEXT NOT NULL, size TEXT NOT NULL, breed TEXT DEFAULT '', age INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, category_id INTEGER REFERENCES categories(id),
    name TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL,
    original_price_cents INTEGER, stock INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '',
    rating REAL NOT NULL DEFAULT 5, prescription_required INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    price_cents INTEGER NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 60,
    image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id),
    employee_id INTEGER REFERENCES employees(id), user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pet_name TEXT NOT NULL, species TEXT NOT NULL, size TEXT NOT NULL, breed TEXT DEFAULT '',
    pet_age INTEGER, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
    appointment_date TEXT NOT NULL, start_time TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT NOT NULL,
    fulfillment TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', subtotal_cents INTEGER NOT NULL,
    shipping_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL, target_type TEXT NOT NULL, target_id INTEGER,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Principal', street TEXT NOT NULL, number TEXT NOT NULL,
    complement TEXT DEFAULT '', neighborhood TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL
  )`,
  "CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS appointments_schedule_idx ON appointments(appointment_date, status)",
  "CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at)",
  `CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_target_idx ON reviews(user_id,target_type,target_id)
    WHERE user_id IS NOT NULL AND target_id IS NOT NULL`,
];

async function seed() {
  await db.transaction(async (tx) => {
    if (isPostgres) await tx.prepare("SELECT pg_advisory_xact_lock(67144231)").get();
    for (const name of categories) {
      await tx.prepare("INSERT INTO categories(name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name);
    }
    if (Number((await tx.prepare("SELECT COUNT(*) AS count FROM products").get()).count) === 0) {
      for (const p of products) {
        await tx.prepare(`INSERT INTO products(category_id,name,description,price_cents,original_price_cents,stock,image,rating)
          VALUES(?,?,?,?,?,?,?,?)`).run(p[6], p[0], p[1], p[2], p[3], p[4], p[5], 5);
      }
    }
    if (Number((await tx.prepare("SELECT COUNT(*) AS count FROM services").get()).count) === 0) {
      for (const service of services) {
        await tx.prepare("INSERT INTO services(name,description,price_cents,duration_minutes,image) VALUES(?,?,?,?,?)").run(...service);
      }
    }
    if (Number((await tx.prepare("SELECT COUNT(*) AS count FROM employees").get()).count) === 0) {
      for (const name of ["Marina Costa", "Rafael Lima", "Bia Oliveira"]) {
        await tx.prepare("INSERT INTO employees(name,role) VALUES(?, 'Especialista em banho e tosa')").run(name);
      }
    }
    const settings = {
      name: "Pets PetShop", tagline: "Todo carinho e cuidado que seu melhor amigo merece",
      address: "Rua das Paineiras, 245 — Vila Verde, São Paulo — SP",
      phone: "(11) 3456-7890", whatsapp: process.env.WHATSAPP_NUMBER || "5511999999999",
      instagram: "@petspetshop", hours: "Seg a sáb, das 9h às 18h", openTime: "09:00", closeTime: "18:00",
    };
    for (const [key, value] of Object.entries(settings)) {
      await tx.prepare("INSERT INTO company_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING").run(key, value);
    }
    if (Number((await tx.prepare("SELECT COUNT(*) AS count FROM reviews").get()).count) === 0) {
      const review = tx.prepare("INSERT INTO reviews(customer_name,target_type,rating,comment,approved) VALUES(?, 'store', ?, ?, 1)");
      await review.run("Camila & Lola", 5, "A Lola voltou cheirosa e super tranquila. Atendimento cheio de carinho!");
      await review.run("Pedro & Bento", 5, "Loja linda, produtos ótimos e a equipe é muito atenciosa. Adoramos!");
      await review.run("Ana & Mingau", 5, "Finalmente encontrei um lugar que cuida do Mingau com tanta paciência.");
    }
    const email = process.env.ADMIN_EMAIL || "admin@petspetshop.com";
    if (!(await tx.prepare("SELECT id FROM users WHERE email = ?").get(email))) {
      await tx.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?, 'admin')")
        .run("Admin Pets PetShop", email, "(11) 3456-7890", bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10));
    }
  });
}

let initialization;
export function initializeDatabase() {
  if (!initialization) {
    initialization = (async () => {
      await ensureEngine();
      if (!process.env.ADMIN_PASSWORD) {
        throw new Error("Defina ADMIN_PASSWORD no ambiente antes de inicializar o administrador.");
      }
      if (isPostgres) {
        for (const statement of pgSchema) await pool.query(statement);
      } else {
        sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, species TEXT NOT NULL, size TEXT NOT NULL, breed TEXT DEFAULT '', age INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER REFERENCES categories(id),
        name TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL,
        original_price_cents INTEGER, stock INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '',
        rating REAL NOT NULL DEFAULT 5, prescription_required INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL,
        price_cents INTEGER NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 60,
        image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER NOT NULL REFERENCES services(id),
        employee_id INTEGER REFERENCES employees(id), user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        pet_name TEXT NOT NULL, species TEXT NOT NULL, size TEXT NOT NULL, breed TEXT DEFAULT '',
        pet_age INTEGER, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
        appointment_date TEXT NOT NULL, start_time TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT NOT NULL,
        fulfillment TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', subtotal_cents INTEGER NOT NULL,
        shipping_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, payment_method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL, target_type TEXT NOT NULL, target_id INTEGER,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
        approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Principal', street TEXT NOT NULL, number TEXT NOT NULL,
        complement TEXT DEFAULT '', neighborhood TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS appointments_schedule_idx ON appointments(appointment_date, status);
      CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_target_idx ON reviews(user_id,target_type,target_id)
        WHERE user_id IS NOT NULL AND target_id IS NOT NULL;
        `);
      }
      await seed();
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}
