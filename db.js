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

  // Coloane pentru profil utilizator
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT`);

  // Tabel pentru invitații utilizatori
  await q(`
    CREATE TABLE IF NOT EXISTS public.user_invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT NOT NULL,
      company_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `);
  
  // Migrație: adaug company_id dacă nu există
  console.log("🔄 DB Migration: Adaug company_id în user_invites...");
  try {
    await q(`ALTER TABLE public.user_invites ADD COLUMN IF NOT EXISTS company_id TEXT`);
    console.log("✅ DB Migration: company_id adăugat cu succes");
  } catch (e) {
    console.error("❌ DB Migration error (company_id):", e.message);
  }
  
  // Migrație: adaug coloana role dacă nu există
  try {
    await q(`ALTER TABLE public.user_invites ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  } catch (e) {
    console.error("❌ DB Migration error (role):", e.message);
  }
  await q(`CREATE INDEX IF NOT EXISTS idx_invites_token ON public.user_invites(token)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_invites_email ON public.user_invites(email)`);

  // Migrație: utilizatorii cu role='admin' devin 'superadmin' (Administrator principal)
  await q(`UPDATE users SET role = 'superadmin' WHERE role = 'admin'`);
  
  // Asigură-te că superadminul existent rămâne aprobat (pentru compatibilitate)
  await q(`UPDATE users SET is_approved = true WHERE role = 'superadmin'`);
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
    trip_number VARCHAR(20) UNIQUE,
    departure_time VARCHAR(10),
    arrival_time VARCHAR(10),
    purpose TEXT,
    tech_check_departure BOOLEAN DEFAULT false,
    tech_check_arrival BOOLEAN DEFAULT false,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )
`);

// Migrație: Adaugă coloanele noi dacă nu există (pentru tabele existente)
try {
  await q(`ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS trip_number VARCHAR(20)`);
  await q(`ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS departure_time VARCHAR(10)`);
  await q(`ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS arrival_time VARCHAR(10)`);
  await q(`ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS purpose TEXT`);
  await q(`ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS tech_check_departure BOOLEAN DEFAULT false`);
  await q(`ALTER TABLE trip_sheets ADD COLUMN IF NOT EXISTS tech_check_arrival BOOLEAN DEFAULT false`);
} catch (e) {
  console.log('Note: trip_sheets migration:', e.message);
}

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

// ================= MULTI-TENANT FUNCTIONS =================

// Tabela master pentru companii (în schema public)
async function ensureCompaniesTable() {
  if (!pool) return;
  
  await q(`
    CREATE TABLE IF NOT EXISTS public.companies (
      id TEXT PRIMARY KEY,
      schema_name TEXT UNIQUE NOT NULL,
      admin_email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      cui TEXT,
      address TEXT,
      city TEXT,
      phone TEXT,
      plan TEXT NOT NULL DEFAULT 'starter',
      status TEXT NOT NULL DEFAULT 'pending_verification',
      trial_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // Indexuri pentru căutare rapidă
  await q(`CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_companies_admin_email ON public.companies(admin_email)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_companies_created_at ON public.companies(created_at)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_companies_plan ON public.companies(plan)`);
  
  // Migrație: adaugă coloana plan dacă nu există
  try {
    await q(`ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter'`);
    console.log("✅ DB Migration: plan adăugat în companies");
  } catch (e) {
    console.log("Note: plan migration:", e.message);
  }
}

// Tabel pentru superadmini
async function ensureSuperadminsTable() {
  if (!pool) return;
  
  await q(`
    CREATE TABLE IF NOT EXISTS public.superadmins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // Index
  await q(`CREATE INDEX IF NOT EXISTS idx_superadmins_username ON public.superadmins(username)`);
}

// Creează superadmin default dacă nu există
async function ensureDefaultSuperadmin() {
  if (!pool) return;
  
  try {
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash('Nouamartie123', 10);
    
    await q(`
      INSERT INTO public.superadmins (username, password_hash, email, active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (username) DO NOTHING
    `, ['superadminob', passwordHash, 'superadmin@openbill.ro']);
    
    console.log("✅ Superadmin default creat/verificat");
  } catch (e) {
    console.error("Eroare la crearea superadmin:", e.message);
  }
}

// Creare schema nouă pentru tenant cu toate tabelele
async function createTenantSchema(schemaName, companyData) {
  if (!pool) throw new Error("DB neconfigurat");
  
  // Validare nume schema (doar litere, cifre, underscore)
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error("Nume schema invalid");
  }
  
  // 1. Creăm schema
  await q(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  
  // 2. Creăm toate tabelele în schema nouă
  
  // USERS - modificat pentru email-based auth
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active BOOLEAN NOT NULL DEFAULT true,
      is_approved BOOLEAN NOT NULL DEFAULT false,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      email_verification_code TEXT,
      email_verification_expires_at TIMESTAMPTZ,
      resend_attempts INT NOT NULL DEFAULT 0,
      resend_last_try TIMESTAMPTZ,
      failed_attempts INT NOT NULL DEFAULT 0,
      unlock_at TIMESTAMPTZ,
      last_failed_at TIMESTAMPTZ,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      position TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // CLIENTS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT,
      category TEXT,
      cui TEXT,
      payment_terms INTEGER DEFAULT 0,
      prices JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // PRODUCTS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.products (
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
  
  // ORDERS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.orders (
      id TEXT PRIMARY KEY,
      client JSONB NOT NULL,
      items JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_procesare',
      sent_to_smartbill BOOLEAN NOT NULL DEFAULT false,
      smartbill_draft_sent BOOLEAN NOT NULL DEFAULT false,
      smartbill_error TEXT,
      smartbill_response JSONB,
      smartbill_series TEXT,
      smartbill_number TEXT,
      due_date DATE,
      payment_terms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // STOCK
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.stock (
      id TEXT PRIMARY KEY,
      gtin TEXT NOT NULL,
      product_name TEXT NOT NULL,
      lot TEXT NOT NULL,
      expires_at DATE NOT NULL,
      qty INT NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT 'A',
      warehouse TEXT NOT NULL DEFAULT 'depozit',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // STOCK_TRANSFERS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.stock_transfers (
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
  
  // DRIVERS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.drivers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // VEHICLES
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.vehicles (
      id TEXT PRIMARY KEY,
      plate_number TEXT NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // TRIP_SHEETS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.trip_sheets (
      id TEXT PRIMARY KEY,
      date DATE NOT NULL,
      driver_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      km_start INTEGER NOT NULL,
      km_end INTEGER,
      locations TEXT NOT NULL DEFAULT '',
      trip_number VARCHAR(20) UNIQUE,
      departure_time VARCHAR(10),
      arrival_time VARCHAR(10),
      purpose TEXT,
      tech_check_departure BOOLEAN DEFAULT false,
      tech_check_arrival BOOLEAN DEFAULT false,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // Migrație: Adaugă coloanele noi dacă nu există (pentru tabele existente în schema companiei)
  try {
    await q(`ALTER TABLE ${schemaName}.trip_sheets ADD COLUMN IF NOT EXISTS trip_number VARCHAR(20)`);
    await q(`ALTER TABLE ${schemaName}.trip_sheets ADD COLUMN IF NOT EXISTS departure_time VARCHAR(10)`);
    await q(`ALTER TABLE ${schemaName}.trip_sheets ADD COLUMN IF NOT EXISTS arrival_time VARCHAR(10)`);
    await q(`ALTER TABLE ${schemaName}.trip_sheets ADD COLUMN IF NOT EXISTS purpose TEXT`);
    await q(`ALTER TABLE ${schemaName}.trip_sheets ADD COLUMN IF NOT EXISTS tech_check_departure BOOLEAN DEFAULT false`);
    await q(`ALTER TABLE ${schemaName}.trip_sheets ADD COLUMN IF NOT EXISTS tech_check_arrival BOOLEAN DEFAULT false`);
  } catch (e) {
    // Ignoră erorile de migrație
  }
  
  // FUEL_RECEIPTS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.fuel_receipts (
      id TEXT PRIMARY KEY,
      trip_sheet_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('diesel', 'adblue')),
      receipt_number TEXT NOT NULL,
      liters NUMERIC(8,2) NOT NULL,
      km_at_refuel INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // AUDIT
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.audit (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      user_json JSONB,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  
  // USER_INVITES
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.user_invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      token TEXT UNIQUE NOT NULL,
      invited_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `);
  
  // COMPANY_SETTINGS
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.company_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT NOT NULL,
      cui TEXT NOT NULL,
      smartbill_series TEXT DEFAULT 'FMD',
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'Romania',
      phone TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  
  // CLIENT_BALANCES
  await q(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.client_balances (
      id SERIAL PRIMARY KEY,
      client_id TEXT,
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
  
  // 3. Inserăm datele companiei în company_settings
  await q(`
    INSERT INTO ${schemaName}.company_settings (id, name, cui, address, city, phone)
    VALUES ('default', $1, $2, $3, $4, $5)
  `, [companyData.name, companyData.cui || '', companyData.address || '', companyData.city || '', companyData.phone || '']);
  
  // 4. Indexuri pentru performanță
  await q(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON ${schemaName}.orders (created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_stock_gtin ON ${schemaName}.stock (gtin)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON ${schemaName}.stock (warehouse)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_products_name ON ${schemaName}.products (name)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_products_category ON ${schemaName}.products (category)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_clients_name ON ${schemaName}.clients (name)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON ${schemaName}.audit (created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_trip_sheets_date ON ${schemaName}.trip_sheets (date DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_fuel_receipts_sheet ON ${schemaName}.fuel_receipts (trip_sheet_id)`);
  
  // Unique index pentru gtin
  await q(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_gtin_ux 
    ON ${schemaName}.products (gtin) 
    WHERE gtin IS NOT NULL
  `);
  
  return true;
}

// Ștergere schema tenant
async function dropTenantSchema(schemaName) {
  if (!pool) throw new Error("DB neconfigurat");
  
  // Validare nume schema
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error("Nume schema invalid");
  }
  
  await q(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
  return true;
}

// Curățare companii nevalidate (cron job)
async function cleanupUnverifiedCompanies() {
  if (!pool) return { deleted: 0 };
  
  // Găsim companiile nevalidate, create acum > 10 minute
  const expired = await q(`
    SELECT id, schema_name 
    FROM public.companies 
    WHERE status = 'pending_verification' 
    AND created_at < NOW() - INTERVAL '10 minutes'
  `);
  
  let deleted = 0;
  for (const company of expired.rows) {
    try {
      // Ștergem schema
      await dropTenantSchema(company.schema_name);
      // Ștergem înregistrarea
      await q(`DELETE FROM public.companies WHERE id = $1`, [company.id]);
      deleted++;
      console.log(`🗑️ Șters cont nevalidat: ${company.schema_name}`);
    } catch (err) {
      console.error(`Eroare la ștergerea ${company.schema_name}:`, err.message);
    }
  }
  
  return { deleted };
}

// Obține schema pentru un email
async function getSchemaByEmail(email) {
  if (!pool) return null;
  
  const r = await q(`
    SELECT schema_name, status, trial_expires_at 
    FROM public.companies 
    WHERE admin_email = $1
  `, [email.toLowerCase().trim()]);
  
  if (r.rows.length === 0) return null;
  return r.rows[0];
}

module.exports = { 
  q, 
  ensureTables, 
  hasDb, 
  auditLog,
  // Multi-tenant exports
  ensureCompaniesTable,
  ensureSuperadminsTable,
  ensureDefaultSuperadmin,
  createTenantSchema,
  dropTenantSchema,
  cleanupUnverifiedCompanies,
  getSchemaByEmail
};