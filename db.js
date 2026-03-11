// db.js
const { Pool } = require("pg");
const crypto = require("crypto");

const connectionString = process.env.DATABASE_URL;

let pool = null;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Railway Postgres
  });
}

function hasDb() {
  return !!pool;
}

async function q(text, params) {
  if (!pool) throw new Error("DATABASE_URL lipsă (DB neconfigurat).");
  return pool.query(text, params);
}

async function ensureTables() {
  if (!pool) return;

  // ================= ORDERS =================
  await q(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      client JSONB NOT NULL,
      items JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_procesare',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ================= STOCK =================
  await q(`
    CREATE TABLE IF NOT EXISTS stock (
      id TEXT PRIMARY KEY,
      gtin TEXT NOT NULL,
      product_name TEXT NOT NULL,
      lot TEXT NOT NULL,
      expires_at DATE NOT NULL,
      qty INT NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT 'A',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ================= AUDIT =================
  await q(`
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      user_json JSONB,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ================= USERS =================
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ================= CLIENTS =================
  await q(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT,
      category TEXT,
      prices JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ================= PRODUCTS =================
  await q(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gtin TEXT,
      gtins JSONB NOT NULL DEFAULT '[]'::jsonb,
      category TEXT,
      price NUMERIC(12,2),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // =========================================================
  // ✅ MIGRĂRI pentru DB vechi (AICI era problema ta)
  // Dacă id-urile au fost create ca INTEGER în trecut, le facem TEXT.
  // =========================================================
  await q(`ALTER TABLE products ALTER COLUMN id TYPE TEXT USING id::text`);
  await q(`ALTER TABLE stock    ALTER COLUMN id TYPE TEXT USING id::text`);
  await q(`ALTER TABLE orders   ALTER COLUMN id TYPE TEXT USING id::text`);
  await q(`ALTER TABLE clients  ALTER COLUMN id TYPE TEXT USING id::text`);
  await q(`ALTER TABLE audit    ALTER COLUMN id TYPE TEXT USING id::text`);

  // coloane lipsă (safe)
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin TEXT`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS gtins JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(12,2)`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`);

  await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS prices JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE users   ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`);

  // Coloană pentru aprobare admin (NOU)
await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false`);

// Coloană pentru deblocare automată după 30 minute
await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ`);

// În funcția ensureTables(), adaugă:
await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ`);
await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0`);

// Asigură-te că adminul existent rămâne aprobat (pentru compatibilitate)
await q(`UPDATE users SET is_approved = true WHERE role = 'admin'`);
await q(`UPDATE users SET is_approved = false WHERE is_approved IS NULL`);

  // indexuri
  await q(`CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS stock_gtin_idx ON stock (gtin)`);
  await q(`CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit (created_at DESC)`);

  await q(`CREATE INDEX IF NOT EXISTS products_name_idx ON products (name)`);
  await q(`CREATE INDEX IF NOT EXISTS products_category_idx ON products (category)`);
  await q(`CREATE INDEX IF NOT EXISTS products_active_idx ON products (active)`);

  // unique gtin (parțial)
  await q(`
    CREATE UNIQUE INDEX IF NOT EXISTS products_gtin_ux
    ON products (gtin)
    WHERE gtin IS NOT NULL
  `);

  // normalize active null (dacă au existat rânduri fără active)
  await q(`UPDATE products SET active = true WHERE active IS NULL`);

  // TABEL ȘOFERI
await q(`
  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

// TABEL MAȘINI (Numere de înmatriculare)
await q(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    plate_number TEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

// TABEL FOi DE PARCURS
await q(`
  CREATE TABLE IF NOT EXISTS trip_sheets (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    driver_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    km_start INTEGER NOT NULL,
    km_end INTEGER,
    locations TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )
`);

// TABEL BONURI ALIMENTARE
await q(`
  CREATE TABLE IF NOT EXISTS fuel_receipts (
    id TEXT PRIMARY KEY,
    trip_sheet_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('diesel', 'adblue')),
    receipt_number TEXT NOT NULL,
    liters NUMERIC(8,2) NOT NULL,
    km_at_refuel INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (trip_sheet_id) REFERENCES trip_sheets(id) ON DELETE CASCADE
  )
`);
await q(`
  ALTER TABLE trip_sheets 
  ADD COLUMN IF NOT EXISTS trip_number VARCHAR(20) UNIQUE
`);

// Indexuri pentru performanță
await q(`CREATE INDEX IF NOT EXISTS idx_trip_sheets_date ON trip_sheets(date DESC)`);
await q(`CREATE INDEX IF NOT EXISTS idx_trip_sheets_driver ON trip_sheets(driver_id)`);
await q(`CREATE INDEX IF NOT EXISTS idx_fuel_receipts_sheet ON fuel_receipts(trip_sheet_id)`);


// Adaugă coloana warehouse în stock (dacă nu există)
await q(`ALTER TABLE stock ADD COLUMN IF NOT EXISTS warehouse TEXT NOT NULL DEFAULT 'depozit'`);

// Update stock existent să fie depozit (păstrăm compatibilitate)
await q(`UPDATE stock SET warehouse = 'depozit' WHERE warehouse IS NULL`);

// Index pentru performanță
await q(`CREATE INDEX IF NOT EXISTS stock_warehouse_idx ON stock (warehouse)`);

// Tabel pentru transferuri (istoric)
await q(`
  CREATE TABLE IF NOT EXISTS stock_transfers (
    id TEXT PRIMARY KEY,
    gtin TEXT NOT NULL,
    product_name TEXT NOT NULL,
    lot TEXT NOT NULL,
    expires_at DATE,
    qty INT NOT NULL,
    from_warehouse TEXT NOT NULL,
    to_warehouse TEXT NOT NULL,
    from_location TEXT,
    to_location TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

// În funcția ensureTables(), adaugă după cea mai recentă migrare:

// Coloane pentru SmartBill integration
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_draft_sent BOOLEAN NOT NULL DEFAULT false`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_error TEXT`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_response JSONB`); // Salvăm răspunsul complet pentru debug

// Index pentru căutare rapidă comenzi cu eroare
await q(`CREATE INDEX IF NOT EXISTS orders_smartbill_error_idx ON orders (smartbill_draft_sent) WHERE smartbill_draft_sent = false AND smartbill_error IS NOT NULL`);

// Company settings (date firmă)
await q(`
  CREATE TABLE IF NOT EXISTS company_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT NOT NULL DEFAULT 'Fast Medical Distribution',
    cui TEXT NOT NULL DEFAULT 'RO47095864',
    smartbill_series TEXT DEFAULT 'FMD',
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'Romania',
    updated_at TIMESTAMPTZ DEFAULT now()
  )
`);

await q(`
  INSERT INTO company_settings (id, name, cui, smartbill_series)
  VALUES ('default', 'Fast Medical Distribution', 'RO47095864', 'FMD')
  ON CONFLICT (id) DO NOTHING
`);

// Coloane SmartBill pentru comenzi
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_draft_sent BOOLEAN NOT NULL DEFAULT false`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_error TEXT`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_response JSONB`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_series TEXT`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_number TEXT`);

// Index pentru comenzi cu eroare
await q(`CREATE INDEX IF NOT EXISTS orders_smartbill_error_idx ON orders (smartbill_draft_sent) WHERE smartbill_draft_sent = false AND smartbill_error IS NOT NULL`);

// Coloană CUI pentru clienți (pentru grupare sold SmartBill)
await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS cui TEXT`);

// Termen de plată (0 = plată pe loc, 30/60/90 = zile termen)
await q(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms INTEGER DEFAULT 0`);

// Tabel pentru solduri clienți (din raportul zilnic SmartBill)
await q(`
  CREATE TABLE IF NOT EXISTS client_balances (
    id SERIAL PRIMARY KEY,
    client_id TEXT REFERENCES clients(id),
    cui TEXT,
    invoice_number TEXT,
    invoice_date DATE,
    due_date DATE,
    currency TEXT,
    total_value NUMERIC(12,2),
    balance_due NUMERIC(12,2),
    days_overdue INTEGER,
    status TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Index pentru căutare rapidă
await q(`CREATE INDEX IF NOT EXISTS idx_balances_client ON client_balances(client_id)`);
await q(`CREATE INDEX IF NOT EXISTS idx_balances_cui ON client_balances(cui)`);
await q(`CREATE INDEX IF NOT EXISTS idx_balances_uploaded ON client_balances(uploaded_at)`);


// Coloane noi pentru fluxul SmartBill (comandă salvată local, trimisă manual)
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sent_to_smartbill BOOLEAN NOT NULL DEFAULT false`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_date DATE`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_series TEXT`);
await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS smartbill_number TEXT`);

// Index pentru căutare rapidă comenzi netrimise
await q(`CREATE INDEX IF NOT EXISTS orders_sent_idx ON orders (sent_to_smartbill) WHERE sent_to_smartbill = false`);
}

// ================= AUDIT LOG (DB) =================
async function auditLog({ action, entity, entity_id = null, user = null, details = null }) {
  if (!pool) return;

  const id = crypto.randomUUID();

  await q(
    `INSERT INTO audit (id, action, entity, entity_id, user_json, details)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
    [
      id,
      String(action),
      String(entity),
      entity_id ? String(entity_id) : null,
      JSON.stringify(user || null),
      JSON.stringify(details || null)
    ]
  );

  return id;
}

module.exports = { q, ensureTables, hasDb, auditLog };