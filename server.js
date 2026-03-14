require('dotenv').config();
console.log("DATABASE_URL exists:", !!process.env.DATABASE_URL);
console.log("DATABASE_URL value:", process.env.DATABASE_URL?.substring(0, 30) + "...");
const session = require("express-session");
const bcrypt = require("bcrypt");
const express = require("express");


const fs = require("fs");
const path = require("path");
const db = require("./db");
const crypto = require("crypto");

// ===== EMAIL CONFIG (Nodemailer) =====
const nodemailer = require("nodemailer");

// Funcție pentru testare API SendGrid direct
async function testSendGridAPI() {
  try {
    console.log("📧 Testing SendGrid API directly...");
    const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
      headers: {
        'Authorization': `Bearer ${process.env.EMAIL_PASS}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log("📧 SendGrid API test SUCCESS:", data);
      return { success: true, data };
    } else {
      const error = await response.text();
      console.log("📧 SendGrid API test FAILED:", error);
      return { success: false, error };
    }
  } catch (err) {
    console.log("📧 SendGrid API test ERROR:", err.message);
    return { success: false, error: err.message };
  }
}

// Funcție pentru trimitere email prin SendGrid API (HTTP)
const https = require('https');

async function sendEmailViaSendGridAPI(to, subject, html, text, attempt = 1) {
  const maxAttempts = 3;
  
  console.log(`📧 ========== SENDGRID API CALL (attempt ${attempt}/${maxAttempts}) ==========`);
  console.log("📧 To:", to);
  console.log("📧 Subject:", subject);
  
  const apiKey = process.env.EMAIL_PASS || '';
  
  if (!apiKey) {
    console.log("📧 ERROR: EMAIL_PASS not set!");
    return { success: false, error: "EMAIL_PASS not configured" };
  }
  
  const body = JSON.stringify({
    personalizations: [{
      to: [{ email: to }]
    }],
    from: { email: process.env.EMAIL_FROM || 'support@openbill.ro', name: 'openBill' },
    subject: subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html }
    ]
  });
  
  console.log("📧 Making HTTPS request to SendGrid...");
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.sendgrid.com',
      port: 443,
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000 // 30 sec timeout
    };
    
    const req = https.request(options, (res) => {
      console.log("📧 Response status:", res.statusCode);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log("📧 SendGrid API send SUCCESS");
          resolve({ success: true, messageId: 'sendgrid-api-' + Date.now() });
        } else {
          console.log("📧 SendGrid API send FAILED:", data);
          resolve({ success: false, error: data, status: res.statusCode });
        }
      });
    });
    
    req.on('error', async (err) => {
      console.error("📧 HTTPS Request Error:", err.message);
      
      // Retry on error
      if (attempt < maxAttempts) {
        console.log(`📧 Retrying in 2 seconds... (attempt ${attempt + 1})`);
        setTimeout(async () => {
          const retryResult = await sendEmailViaSendGridAPI(to, subject, html, text, attempt + 1);
          resolve(retryResult);
        }, 2000);
      } else {
        resolve({ success: false, error: err.message });
      }
    });
    
    req.on('timeout', () => {
      console.error("📧 HTTPS Request Timeout");
      req.destroy();
      
      // Retry on timeout
      if (attempt < maxAttempts) {
        console.log(`📧 Retrying after timeout... (attempt ${attempt + 1})`);
        setTimeout(async () => {
          const retryResult = await sendEmailViaSendGridAPI(to, subject, html, text, attempt + 1);
          resolve(retryResult);
        }, 2000);
      } else {
        resolve({ success: false, error: 'Request timeout after 3 attempts' });
      }
    });
    
    req.write(body);
    req.end();
  });
}

// Configurare Email (Gmail sau SendGrid)
let emailTransporter = null;
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const isGmail = process.env.EMAIL_HOST.includes('gmail') || process.env.EMAIL_HOST.includes('google');
  const isSendGrid = process.env.EMAIL_HOST.includes('sendgrid');
  
  let transportConfig;
  
  if (isSendGrid) {
    // Configurare SendGrid - cel mai fiabil pentru producție
    transportConfig = {
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',  // SendGrid folosește "apikey" ca username
        pass: process.env.EMAIL_PASS
      },
      debug: true,
      logger: true
    };
  } else if (isGmail) {
    // Configurare Gmail
    transportConfig = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      debug: true,
      logger: true
    };
  } else {
    // Configurare custom
    transportConfig = {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      debug: true,
      logger: true
    };
  }
  
  emailTransporter = nodemailer.createTransport(transportConfig);
  
  console.log("📧 Email transporter configurat");
  console.log("📧 Folosind serviciu:", isSendGrid ? 'sendgrid' : isGmail ? 'gmail' : 'custom');
  console.log("📧 EMAIL_PASS setat:", process.env.EMAIL_PASS ? "DA (lungime: " + process.env.EMAIL_PASS.length + ")" : "NU");
  if (isSendGrid) {
    console.log("📧 SendGrid API Key format valid:", process.env.EMAIL_PASS && process.env.EMAIL_PASS.startsWith('SG.'));
  }
  
  console.log("📧 Email transporter configurat cu succes");
} else {
  console.log("📧 Email transporter not configured - missing env vars");
  console.log("📧 EMAIL_HOST:", process.env.EMAIL_HOST ? 'setat' : 'lipsă');
  console.log("📧 EMAIL_USER:", process.env.EMAIL_USER ? 'setat' : 'lipsă');
  console.log("📧 EMAIL_PASS:", process.env.EMAIL_PASS ? 'setat' : 'lipsă');
}

// Wrapper cu timeout pentru sendEmail
async function sendEmailWithTimeout(to, subject, html, text, timeoutMs = 30000) {
  console.log("📧 Starting sendEmailWithTimeout, timeout:", timeoutMs, "ms");
  return Promise.race([
    sendEmail(to, subject, html, text),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Email timeout - operation took too long')), timeoutMs)
    )
  ]);
}

async function sendEmail(to, subject, html, text) {
  console.log("📧 ========== SEND EMAIL (GLOBAL) ==========");
  console.log("📧 To:", to);
  
  // Verificare simplă: dacă avem cheie SendGrid, o folosim
  const emailPass = process.env.EMAIL_PASS || '';
  const isSendGridKey = emailPass.startsWith('SG.');
  
  console.log("📧 EMAIL_PASS length:", emailPass.length);
  console.log("📧 Is SendGrid key:", isSendGridKey);
  
  if (isSendGridKey) {
    console.log("📧 Using SendGrid API (Global)");
    return sendEmailViaSendGridAPI(to, subject, html, text);
  }
  
  // Fallback la SMTP dacă avem transporter
  if (emailTransporter) {
    console.log("📧 Using SMTP transporter");
    try {
      const info = await emailTransporter.sendMail({
        from: `"openBill" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html
      });
      console.log("📧 SMTP Email sent:", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error("📧 SMTP Error:", err.message);
      return { success: false, error: err.message };
    }
  }
  
  console.log("📧 ERROR: No email configuration found!");
  console.log("📧 Set EMAIL_PASS=SG.xxx (SendGrid API key)");
  return { success: false, error: "Email not configured. Set EMAIL_PASS environment variable." };
  
  console.log("📧 ========== START SEND EMAIL ==========");
  console.log("📧 To:", to);
  console.log("📧 From:", process.env.EMAIL_FROM || process.env.EMAIL_USER);
  console.log("📧 Subject:", subject);
  
  try {
    console.log("📧 Calling sendMail...");
    const info = await emailTransporter.sendMail({
      from: `"openBill" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
      replyTo: process.env.EMAIL_USER
    });
    console.log("📧 sendMail completed!");
    console.log("📧 Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("📧 Email error:", err.message);
    console.error("📧 Error details:", err);
    return { success: false, error: err.message };
  }
}


const app = express();

// ===== SMARTBILL CONFIG =====
const SMARTBILL_TOKEN = process.env.SMARTBILL_TOKEN || 'cristiana_paun@yahoo.com:002|797b74e49656fba88457a0eb0854941e';
const SMARTBILL_BASE_URL = 'https://ws.smartbill.ro/SBORO/api';

// Cache per-schema pentru multi-tenant
const companyCache = new Map();

async function getCompanyDetails() {
  // Pentru multi-tenant, folosim schema curentă ca key
  const cacheKey = 'current_schema';
  
  // Verificăm dacă avem deja date în cache pentru această sesiune
  // Dar nu folosim cache în mod agresiv pentru multi-tenant
  try {
    const r = await db.q(`SELECT * FROM company_settings WHERE id = 'default'`);
    if (r.rows.length && r.rows[0].name) {
      return r.rows[0];
    }
  } catch (e) {
    console.error('Eroare la citire date firmă:', e);
  }
  
  // Fallback la datele din sesiune sau default
  return {
    name: 'openBill',
    cui: '',
    smartbill_series: 'FMD'
  };
}

function getSmartbillAuthHeaders() {
  const authString = Buffer.from(SMARTBILL_TOKEN).toString('base64');
  return {
    'Authorization': `Basic ${authString}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}


async function sendDraftToSmartBill(order, clientCui) {
  if (!SMARTBILL_TOKEN) {
    throw new Error('Token SmartBill neconfigurat');
  }

  const company = await getCompanyDetails();

  // Validare: toate produsele trebuie să aibă GTIN
  for (const item of order.items || []) {
    if (!item.gtin) {
      throw new Error(`Produsul "${item.name}" nu are GTIN configurat`);
    }
  }
  // Calculează data scadenței
const today = new Date();
const dueDate = new Date(today);
dueDate.setDate(today.getDate() + (client.payment_terms || 30)); // default 30 zile

// Formatează pentru SmartBill: AAAA-LL-ZZ
const dueDateFormatted = dueDate.toISOString().split('T')[0];

// În payload-ul pentru SmartBill, adaugă:
const smartbillPayload = {
  // ... celelalte câmpuri ...
  dueDate: dueDateFormatted,  // <-- Data scadență calculată
  // ...
};

  const payload = {
    companyVatCode: company.cui,           // RO47095864 - Fast Medical Distribution
    client: {
      name: order.client?.name || 'Client',
      vatCode: clientCui || '',            // RO9285726 - Al Shefa (din DB)
      isTaxPayer: true,
      country: 'Romania'
    },
    isDraft: true,                          // CIORNĂ
    seriesName: company.smartbill_series,   // FMD
    issueDate: new Date().toISOString().split('T')[0],
    useStock: true,
    
    // MENȚIUNI - apare pe factura PDF în SmartBill
mentions: `Punct de lucru: ${order.client?.name || 'Client'}`,    
    products: (order.items || []).map(item => ({
      name: item.name,
      code: item.gtin,                      // GTIN pentru identificare în SmartBill
      measuringUnitName: "BUC",
      currency: 'RON',
      quantity: Number(item.qty || 0),
      price: Number(item.unitPrice || item.price || 0),  // Preț unitar
      isTaxIncluded: false,                  // Prețul include TVA
      taxName: 'Normala',
      taxPercentage: 21,                    // TVA 21%
      isDiscount: false,
      warehouseName: "DISTRIBUTIE",
      isService: false,
      saveToDb: false,                      // Nu salvăm produsul în catalogul SmartBill
      productDescription: (item.allocations || []).map(alloc => {
        const lot = alloc.lot || '-';
        const exp = alloc.expiresAt ? new Date(alloc.expiresAt).toLocaleDateString('ro-RO') : '-';
        return `LOT: ${lot} | EXP: ${exp}`;
      }).join('\n')
    }))
  };

  console.log('=== SMARTBILL PAYLOAD ===');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${SMARTBILL_BASE_URL}/invoice`, {
      method: 'POST',
      headers: getSmartbillAuthHeaders(),
      body: JSON.stringify(payload)
    });

    const responseData = await response.json().catch(() => ({}));
    
    console.log('=== SMARTBILL RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Data:', responseData);

    if (!response.ok) {
      const errorMsg = responseData.error || responseData.message || `Eroare HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    return {
      success: true,
      data: responseData,  // Conține series, number, url etc.
      httpStatus: response.status
    };

  } catch (error) {
    console.error('SmartBill API Error:', error);
    return {
      success: false,
      error: error.message,
      httpStatus: error.status || 0
    };
  }
}

// Middleware pentru verificare superadmin (din DB, nu din session)
async function isSuperAdmin(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(403).json({ error: "Nu ești autentificat." });
  }
  
  try {
    const r = await db.q(`SELECT role FROM users WHERE id = $1`, [req.session.user.id]);
    if (r.rows.length === 0 || r.rows[0].role !== 'superadmin') {
      return res.status(403).json({ error: "Acces interzis. Doar Administratorul principal." });
    }
    // Actualizează session cu rolul corect
    req.session.user.role = r.rows[0].role;
    next();
  } catch (e) {
    console.error('Eroare isSuperAdmin:', e);
    return res.status(500).json({ error: "Eroare server." });
  }
}

// Middleware pentru verificare admin (SuperAdmin sau Admin) - din DB
async function isAdmin(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(403).json({ error: "Nu ești autentificat." });
  }
  
  try {
    const r = await db.q(`SELECT role FROM users WHERE id = $1`, [req.session.user.id]);
    if (r.rows.length === 0) {
      return res.status(403).json({ error: "Utilizator negăsit." });
    }
    
    const role = r.rows[0].role;
    if (role !== 'superadmin' && role !== 'admin') {
      return res.status(403).json({ error: "Acces interzis. Doar admin." });
    }
    
    // Actualizează session cu rolul corect
    req.session.user.role = role;
    next();
  } catch (e) {
    console.error('Eroare isAdmin:', e);
    return res.status(500).json({ error: "Eroare server." });
  }
}

// Middleware pentru verificare autentificare (orice user)
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Nu ești autentificat." });
  }
  next();
}

app.get("/api/version", (req, res) => {
  res.json({
    version: "2026-02-22-1",
    hasDb: db.hasDb()
  });
});
app.set("trust proxy", 1);




// middleware
app.use(express.json());

app.use(session({
  name: "magazin.sid",
  secret: process.env.SESSION_SECRET || "schimba-asta-cu-o-cheie-lunga",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
}));

// Middleware Multi-Tenant: Setează schema PostgreSQL pentru request
app.use(async (req, res, next) => {
  // Dacă userul e logat și are schema_name, setăm search_path
  if (req.session?.user?.schema_name && db.hasDb()) {
    try {
      const schemaName = req.session.user.schema_name;
      // Validare nume schema pentru securitate
      if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
        console.error("Nume schema invalid:", schemaName);
        return res.status(500).json({ error: "Configurație invalidă" });
      }
      // Setăm search_path pentru această conexiune
      await db.q(`SET search_path TO ${schemaName}, public`);
    } catch (err) {
      console.error("Eroare setare schema:", err.message);
    }
  }
  next();
});

// Endpoint pentru verificarea autentificării (pentru frontend)
app.get("/api/auth/check", async (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });
  
  // Verifică dacă rolul s-a schimbat în DB (pentru multi-tenant)
  try {
    const r = await db.q(
      `SELECT role, is_approved, first_name, last_name, email FROM users WHERE id = $1`,
      [req.session.user.id]
    );
    
    if (r.rows.length > 0) {
      const dbUser = r.rows[0];
      // Actualizează session dacă rolul s-a schimbat
      if (dbUser.role !== req.session.user.role) {
        console.log(`🔄 Rol actualizat pentru ${req.session.user.email}: ${req.session.user.role} → ${dbUser.role}`);
        req.session.user.role = dbUser.role;
      }
      // Actualizează și alte câmpuri
      req.session.user.is_approved = dbUser.is_approved;
      if (dbUser.first_name) req.session.user.first_name = dbUser.first_name;
      if (dbUser.last_name) req.session.user.last_name = dbUser.last_name;
      if (dbUser.email) req.session.user.email = dbUser.email;
    }
  } catch (e) {
    console.error('Eroare verificare rol:', e);
  }
  
  // Returnăm userul cu toate câmpurile relevante pentru frontend
  res.json({ 
    loggedIn: true, 
    user: {
      id: req.session.user.id,
      email: req.session.user.email,
      role: req.session.user.role,
      is_approved: req.session.user.is_approved,
      first_name: req.session.user.first_name,
      last_name: req.session.user.last_name,
      company_name: req.session.user.company_name,
      trial_expires_at: req.session.user.trial_expires_at
    }
  });
});

// Protejare companie.html - doar SuperAdmin are acces (verificare async în DB)
app.use(async (req, res, next) => {
  if (req.path === '/companie.html' || req.path === '/companie') {
    // Dacă nu are session, respinge
    if (!req.session?.user) {
      return res.status(403).send(accessDeniedHtml());
    }
    
    // Verifică rolul direct din DB (nu din session)
    try {
      const r = await db.q(
        `SELECT role FROM users WHERE id = $1`,
        [req.session.user.id]
      );
      
      if (r.rows.length === 0 || r.rows[0].role !== 'superadmin') {
        return res.status(403).send(accessDeniedHtml());
      }
      
      // Actualizează și session-ul
      req.session.user.role = r.rows[0].role;
    } catch (e) {
      console.error('Eroare verificare acces companie:', e);
      return res.status(403).send(accessDeniedHtml());
    }
  }
  next();
});

// Ruta principală - servește landing.html dacă nu ești logat, altfel index.html
app.get("/", (req, res) => {
  if (req.session?.user) {
    // Utilizator logat - servește index.html
    res.sendFile(path.join(__dirname, "public", "index.html"));
  } else {
    // Utilizator nelogat - servește landing.html
    res.sendFile(path.join(__dirname, "public", "landing.html"));
  }
});

// Servește fișierele statice din public (excluzând index.html care e servit de ruta de mai sus)
app.use(express.static("public", { index: false }));

function accessDeniedHtml() {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>Acces interzis</title></head>
    <body style="font-family: Arial; text-align: center; padding: 50px;">
      <h1>⛔ Acces interzis</h1>
      <p>Doar Administratorul principal poate accesa această pagină.</p>
      <a href="/">Înapoi la aplicație</a>
    </body>
    </html>
  `;
}

const DATA_DIR = path.join(__dirname, "data");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STOCK_FILE = path.join(DATA_DIR, "stock.json");

async function seedClientsFromFileIfEmpty() {
  if (!db.hasDb()) return;

  // există tabelă, dar e goală? -  > seed din clients.json
  const r = await db.q("SELECT COUNT(*)::int AS n FROM clients");
  if ((r.rows?.[0]?.n ?? 0) > 0) return;

  const fileClients = readJson(CLIENTS_FILE, []);
  for (const c of fileClients) {
    const id = String(c.id ?? (Date.now().toString() + Math.random().toString(36).slice(2)));

    const name = String(c.name ?? "").trim();
    if (!name) continue;

    const group = String(c.group ?? "");
    const category = String(c.category ?? "");
    const prices = c.prices && typeof c.prices === "object" ? c.prices : {};

    await db.q(
      `INSERT INTO clients (id, name, group_name, category, prices)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, group, category, JSON.stringify(prices)]
    );
  }

  console.log("✅ Clients seeded into DB from clients.json");
}

async function seedProductsFromFileIfEmpty() {
  if (!db.hasDb()) return;

  const r = await db.q("SELECT COUNT(*)::int AS n FROM products");
  if ((r.rows?.[0]?.n ?? 0) > 0) return;

  const list = readProductsAsList();

  for (const p of list) {
    const name = String(p.name || "").trim();
    if (!name) continue;

    const id = (p.id != null && String(p.id).trim() !== "") ? String(p.id) : null;

    const gtinClean = normalizeGTIN(p.gtin || "") || null;

    const gtinsArr = []
      .concat(gtinClean ? [gtinClean] : [])
      .concat(Array.isArray(p.gtins) ? p.gtins : [])
      .map(normalizeGTIN)
      .filter(Boolean);

    const category = String(p.category || "Altele").trim() || "Altele";
    const price = (p.price != null && p.price !== "") ? Number(p.price) : null;

   const idFinal = id && String(id).trim() ? String(id) : crypto.randomUUID();

await db.q(
  `INSERT INTO products (id, name, gtin, gtins, category, price, active)
   VALUES ($1,$2,$3,$4::jsonb,$5,$6,true)
   ON CONFLICT (gtin) DO UPDATE SET
     name = EXCLUDED.name,
     gtins = EXCLUDED.gtins,
     category = EXCLUDED.category,
     price = EXCLUDED.price,
     active = true`,
  [
    idFinal,
    name,
    gtinClean,
    JSON.stringify(gtinsArr),
    category,
    (Number.isFinite(price) ? price : null)
  ]
);
  }

  console.log("✅ Products seeded into DB from products.json");
}


function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const txt = fs.readFileSync(filePath, "utf8");
    if (!txt.trim()) return fallback;
    return JSON.parse(txt);
  } catch (e) {
    console.error("Eroare citire JSON:", filePath, e.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

const AUDIT_FILE = path.join(DATA_DIR, "audit.json");

async function logAudit(req, action, entity, entityId, details = {}) {
  const u = req?.session?.user || null;

  const row = {
   id: crypto.randomUUID(),
    action,
    entity,
    entityId: String(entityId || ""),
    user: u ? { id: u.id, username: u.username, role: u.role } : null,
    details,
    createdAt: new Date().toISOString()
  };

  // ✅ dacă avem DB -> scriem în Postgres
  if (db.hasDb()) {
    try {
      await db.q(
        `INSERT INTO audit (id, action, entity, entity_id, user_json, details, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::timestamptz)`,
        [
          row.id,
          row.action,
          row.entity,
          row.entityId,
          JSON.stringify(row.user),
          JSON.stringify(row.details),
          row.createdAt
        ]
      );
      return;
    } catch (e) {
      console.error("AUDIT DB ERROR:", e.message);
      // dacă pică DB-ul, NU blocăm aplicația — continuăm cu fallback
    }
  }

  // ✅ fallback JSON (local)
  const audit = readJson(AUDIT_FILE, []);
  audit.push({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    user: row.user,
    details: row.details,
    createdAt: row.createdAt
  });
  writeJson(AUDIT_FILE, audit);
}






// ----- FLATTEN HELPERS (tree -> list) -----
function flattenClientsTree(tree) {
  // tree: { "Exterior": { "Valcea": [..] }, "Craiova": [..] }
  const out = [];
  let id = 1;

  function addClient(name, pathArr) {
    if (!name) return; // skip null/empty
    out.push({
      id: id++,
      name,
      path: pathArr.join(" / "),
      group: pathArr[0] || "",
      area: pathArr[1] || "",
    });
  }

  for (const top of Object.keys(tree || {})) {
    const node = tree[top];
    if (Array.isArray(node)) {
      // Craiova: [clients]
      node.forEach((c) => addClient(c, [top]));
    } else if (node && typeof node === "object") {
      // Exterior: { "Valcea": [clients], ... }
      for (const sub of Object.keys(node)) {
        const arr = node[sub];
        if (Array.isArray(arr)) {
          arr.forEach((c) => addClient(c, [top, sub]));
        }
      }
    }
  }
  return out;
}

function flattenProductsTree(tree) {
  const out = [];

  function walk(node, pathArr) {
    if (Array.isArray(node)) {
      node.forEach(item => {
        if (!item || !item.name) return;

        // IMPORTANT: luăm id-ul din products.json
        if (!item.id) {
          console.warn("Produs fără id:", item.name);
          return; // sau throw, dacă vrei să fie obligatoriu
        }

        const pathStr = pathArr.join(" / ");

out.push({
  id: String(item.id),
  name: item.name,
  gtin: item.gtin || "",
  price: item.price ?? null,

  // dacă nu ai path în tree, fă path din category
  path: pathStr || `Produse / ${item.category || "Altele"}`,

  // ✅ PRIORITAR: category din produs (listă)
  category: item.category || pathArr[0] || "",
  subcategory: item.subcategory || pathArr[1] || "",
  subsubcategory: item.subsubcategory || pathArr[2] || ""
});

      });
      return;
    }

    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) {
        walk(node[key], [...pathArr, key]);
      }
    }
  }

  walk(tree, []);
  return out;
}


const LOCATION_ORDER = ["A", "B", "C", "R1", "R2", "R3"];

function locRank(loc) {
  const i = LOCATION_ORDER.indexOf(String(loc || "").toUpperCase());
  return i === -1 ? 999 : i;
}

function sqlLocOrderCase(colName = "location") {
  // ordinea ta: A, B, C, R1, R2, R3, restul la final
  return `
    CASE UPPER(${colName})
      WHEN 'A' THEN 1
      WHEN 'B' THEN 2
      WHEN 'C' THEN 3
      WHEN 'R1' THEN 4
      WHEN 'R2' THEN 5
      WHEN 'R3' THEN 6
      ELSE 999
    END
  `;
}

function normalizeGTIN(gtin) {
  let g = String(gtin || "").replace(/\D/g, "");
  if (g.length === 14 && g.startsWith("0")) g = g.slice(1);
  return g;
}


function allocateStockByLocation(stock, gtin, neededQty) {
  const g = normalizeGTIN(gtin);

  const lots = stock
    .filter(s =>
      normalizeGTIN(s.gtin) === g && Number(s.qty) > 0
    )
    .sort((a, b) => {
      const r = locRank(a.location) - locRank(b.location);
      if (r !== 0) return r;
      return new Date(a.expiresAt) - new Date(b.expiresAt);
    });

  let remaining = Number(neededQty);
  const allocated = [];

  for (const lot of lots) {
    if (remaining <= 0) break;

    const take = Math.min(Number(lot.qty), remaining);

    allocated.push({
      stockId: lot.id,
      lot: lot.lot,
      expiresAt: lot.expiresAt,
      location: lot.location,
      qty: take
    });

    lot.qty -= take;
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error("Stoc insuficient");
  }

  return allocated;
}



function allocateFromSpecificLot(stock, gtin, lot, neededQty) {
  const g = normalizeGTIN(gtin);
  const lotStr = String(lot || "").trim();

  const lots = stock
    .filter(s =>
      normalizeGTIN(s.gtin) === g &&
      String(s.lot || "").trim() === lotStr &&
      Number(s.qty) > 0
    )
    .sort((a, b) => {
      const r = locRank(a.location) - locRank(b.location);
      if (r !== 0) return r;
      return new Date(a.expiresAt) - new Date(b.expiresAt);
    });

  let remaining = Number(neededQty);
  const allocated = [];

  for (const entry of lots) {
    if (remaining <= 0) break;

    const take = Math.min(Number(entry.qty), remaining);

    allocated.push({
      stockId: entry.id,
      lot: entry.lot,
      expiresAt: entry.expiresAt,
      location: entry.location || "A",
      qty: take
    });

    entry.qty = Number(entry.qty) - take;
    remaining -= take;
  }

  if (remaining > 0) throw new Error("Stoc insuficient pe lotul scanat");

  return allocated;
}









// ----- API CLIENTS -----
app.get("/api/clients-tree", async (req, res) => {
  try {
    if (db.hasDb()) {
      // Citește din PostgreSQL
      const r = await db.q(
        `SELECT name, group_name as "group", category 
         FROM clients 
         ORDER BY name ASC`
      );
      
      // Transformă în format flat pentru funcția existentă
      const flat = r.rows.map(row => ({
        name: row.name,
        group: row.group || "",      // group_name mapat la group
        category: row.category || ""
      }));
      
      res.json(buildClientsTreeFromFlat(flat));
    } else {
      // Fallback pe fișier dacă nu e DB
      const flat = readJson(CLIENTS_FILE, []);
      res.json(buildClientsTreeFromFlat(Array.isArray(flat) ? flat : []));
    }
  } catch (e) {
    console.error("clients-tree error:", e);
    res.status(500).json({ error: "Eroare la clienți" });
  }
});

app.get("/api/clients-flat", async (req, res) => {
  try {
    if (db.hasDb()) {
      const r = await db.q(
        `SELECT id, name, group_name, category, prices
         FROM clients
         ORDER BY name ASC`
      );

     // În app.get("/api/clients-flat", ...)
const out = r.rows.map(row => ({
  id: row.id,
  name: row.name,
  group: row.group_name || "",
  category: row.category || "",
  cui: row.cui || "", // Adăugat
  prices: row.prices || {}
}));

      return res.json(out);
    }

    // fallback local
    const clients = readJson(CLIENTS_FILE, []);
    return res.json(clients);
  } catch (e) {
    console.error("clients-flat error:", e);
    res.status(500).json({
  error: "Eroare la produse",
  detail: e.message,
  code: e.code
});
  }
});

// === Client details (din DB) ===
app.get("/api/clients/:id", async (req, res) => {
  try {
    const id = String(req.params.id);

    const r = await db.q(
      `SELECT id, name, group_name AS "group", category, prices, cui, payment_terms
       FROM clients
       WHERE id = $1`,
      [id]
    );

    if (!r.rows.length) return res.status(404).json({ error: "Client inexistent" });

    const c = r.rows[0];
    c.prices = c.prices || {};
    return res.json(c);
  } catch (e) {
    console.error("GET /api/clients/:id error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});


// === Save prices (în DB) ===
// body: { prices: { "<productId>": 12.34, ... } }
app.put("/api/clients/:id/prices", async (req, res) => {
  try {
    const id = String(req.params.id);
    const prices = req.body?.prices;

    if (!prices || typeof prices !== "object" || Array.isArray(prices)) {
      return res.status(400).json({ error: "Body invalid. Trimite { prices: {...} }" });
    }

    await db.q(
      `UPDATE clients SET prices = $1::jsonb WHERE id = $2`,
      [JSON.stringify(prices), id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/clients/:id/prices error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ===== API: Categorii unice de clienți =====
app.get("/api/client-categories", async (req, res) => {
  try {
    if (db.hasDb()) {
      const r = await db.q(
        `SELECT DISTINCT category FROM clients WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`
      );
      return res.json(r.rows.map(row => row.category));
    }
    // fallback local
    const clients = readJson(CLIENTS_FILE, []);
    const categories = [...new Set(clients.map(c => c.category).filter(Boolean))].sort();
    return res.json(categories);
  } catch (e) {
    console.error("GET /api/client-categories error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ===== API: Update categorie client =====
app.put("/api/clients/:id/category", async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;
    
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: "Categoria este obligatorie" });
    }
    
    if (db.hasDb()) {
      await db.q(
        `UPDATE clients SET category = $1 WHERE id = $2`,
        [category.trim(), id]
      );
      return res.json({ success: true, message: "Categorie actualizată" });
    }
    
    // fallback local
    const clients = readJson(CLIENTS_FILE, []);
    const idx = clients.findIndex(c => String(c.id) === String(id));
    if (idx >= 0) {
      clients[idx].category = category.trim();
      writeJson(CLIENTS_FILE, clients);
      return res.json({ success: true, message: "Categorie actualizată" });
    }
    return res.status(404).json({ error: "Client negăsit" });
  } catch (e) {
    console.error("PUT /api/clients/:id/category error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ===== COMPANY SETTINGS API =====
// Doar SuperAdmin poate vedea/modifica setările companiei
app.get("/api/company-settings", isSuperAdmin, async (req, res) => {
  try {
    if (db.hasDb()) {
      const r = await db.q(`SELECT * FROM company_settings WHERE id = 'default'`);
      if (r.rows.length > 0) {
        return res.json(r.rows[0]);
      }
    }
    // fallback default
    res.json({
      name: 'Fast Medical Distribution',
      cui: 'RO47095864',
      smartbill_series: 'FMD',
      address: '',
      city: '',
      county: '',
      phone: ''
    });
  } catch (e) {
    console.error("GET /api/company-settings error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

app.put("/api/company-settings", isSuperAdmin, async (req, res) => {
  try {
    const { name, cui, smartbill_series, address, city, county, phone } = req.body;
    
    if (db.hasDb()) {
      await db.q(
        `INSERT INTO company_settings (id, name, cui, smartbill_series, address, city, county, phone, updated_at)
         VALUES ('default', $1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           cui = EXCLUDED.cui,
           smartbill_series = EXCLUDED.smartbill_series,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           county = EXCLUDED.county,
           phone = EXCLUDED.phone,
           updated_at = NOW()`,
        [name, cui, smartbill_series, address, city, county, phone]
      );
      return res.json({ success: true, message: "Setări salvate" });
    }
    
    res.json({ success: true, message: "Setări salvate (fallback)" });
  } catch (e) {
    console.error("PUT /api/company-settings error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ===== COMPANY INFO (PUBLIC - pentru toți utilizatorii logați) =====
// Returnează doar numele și CUI-ul companiei pentru afișare în navbar
app.get("/api/company-info", requireAuth, async (req, res) => {
  try {
    // Luăm numele companiei din sesiune (setat la login)
    const sessionCompanyName = req.session.user?.company_name;
    
    if (db.hasDb()) {
      // Încercăm să citim din company_settings din schema curentă (setată de middleware)
      try {
        const r = await db.q(`SELECT name, cui FROM company_settings WHERE id = 'default'`);
        if (r.rows.length > 0 && r.rows[0].name) {
          return res.json({
            name: r.rows[0].name,
            cui: r.rows[0].cui || ''
          });
        }
      } catch (dbErr) {
        // Dacă tabela nu există în schema, continuăm cu fallback
        console.log('company_settings negăsit în schema, folosim fallback');
      }
    }
    
    // Fallback la numele din sesiune sau default
    res.json({
      name: sessionCompanyName || 'openBill',
      cui: ''
    });
  } catch (e) {
    console.error("GET /api/company-info error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ===== CLIENT CATEGORIES MANAGEMENT API =====
// Adaugă categorie nouă
app.post("/api/client-categories", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Numele categoriei este obligatoriu" });
    }
    
    const trimmedName = String(name).trim();
    
    // Verifică dacă există deja
    if (db.hasDb()) {
      const check = await db.q(`SELECT 1 FROM clients WHERE category = $1 LIMIT 1`, [trimmedName]);
      if (check.rows.length > 0) {
        return res.status(400).json({ error: "Categoria există deja" });
      }
    }
    
    // Crează o înregistrare dummy pentru a "rezerva" categoria
    // Sau pur și simplu returnează succes - categoriile sunt date de clients.category
    res.json({ success: true, message: "Categorie creată" });
  } catch (e) {
    console.error("POST /api/client-categories error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// Redenumește categorie
app.put("/api/client-categories/rename", async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName || !String(newName).trim()) {
      return res.status(400).json({ error: "Numele vechi și nou sunt obligatorii" });
    }
    
    const trimmedNew = String(newName).trim();
    
    if (db.hasDb()) {
      await db.q(
        `UPDATE clients SET category = $1 WHERE category = $2`,
        [trimmedNew, oldName]
      );
      return res.json({ success: true, message: "Categorie redenumită" });
    }
    
    // fallback local
    const clients = readJson(CLIENTS_FILE, []);
    let modified = false;
    clients.forEach(c => {
      if (c.category === oldName) {
        c.category = trimmedNew;
        modified = true;
      }
    });
    if (modified) writeJson(CLIENTS_FILE, clients);
    
    res.json({ success: true, message: "Categorie redenumită" });
  } catch (e) {
    console.error("PUT /api/client-categories/rename error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// Șterge categorie (setează clienții la null)
app.delete("/api/client-categories", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Numele categoriei este obligatoriu" });
    }
    
    if (db.hasDb()) {
      await db.q(
        `UPDATE clients SET category = NULL WHERE category = $1`,
        [name]
      );
      return res.json({ success: true, message: "Categorie ștearsă" });
    }
    
    // fallback local
    const clients = readJson(CLIENTS_FILE, []);
    let modified = false;
    clients.forEach(c => {
      if (c.category === name) {
        c.category = null;
        modified = true;
      }
    });
    if (modified) writeJson(CLIENTS_FILE, clients);
    
    res.json({ success: true, message: "Categorie ștearsă" });
  } catch (e) {
    console.error("DELETE /api/client-categories error:", e);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ===== CLIENTS ADAPTERS (for new flat clients.json) =====
function buildClientsTreeFromFlat(flat) {
  const tree = {};

  flat.forEach(c => {
    if (!c || !c.group || !c.category || !c.name) return;

    if (!tree[c.group]) tree[c.group] = {};
    if (!tree[c.group][c.category]) tree[c.group][c.category] = [];

    // IMPORTANT: frontend expects strings in arrays
    tree[c.group][c.category].push(c.name);
  });

  return tree;
}

function buildClientsFlatFromFlat(flat) {
  return flat
    .filter(Boolean)
    .map(c => ({
      id: c.id,
      name: c.name,
      group: c.group,
      path: `${c.group} / ${c.category}`,
      prices: c.prices || {} // ✅ IMPORTANT
    }));
}



function readProductsAsList() {
  const data = readJson(PRODUCTS_FILE, []);

  // ✅ dacă e deja listă (cum ai tu acum)
  if (Array.isArray(data)) return data;

  // ✅ dacă e vechiul format tree
  if (data && typeof data === "object") {
    return flattenProductsTree(data);
  }

  return [];
}


// ----- API PRODUCTS -----
app.get("/api/products-tree", async (req, res) => {
  try {
    let list = [];

    if (db.hasDb()) {
    const r = await db.q(`
  SELECT id, name, category
  FROM products
  WHERE COALESCE(active, true) = true
  ORDER BY name ASC
`);
      list = r.rows.map(x => ({ id: x.id, name: x.name, category: x.category || "Altele" }));
    } else {
      list = readProductsAsList();
    }

    const CATEGORY_ORDER = ["Seni Active Classic x30","Seni Active Classic x10","Seni Classic Air x30","Seni Classic Air x10","Seni Aleze x30","Seni Lady","Manusi","Altele","Absorbante Bella",];
    const treeByCategory = {};

    list.forEach(p => {
      const cat = (p.category || "Altele").trim();
      if (!treeByCategory[cat]) treeByCategory[cat] = [];
      treeByCategory[cat].push({ id: p.id, name: p.name });
    });

    Object.keys(treeByCategory).forEach(cat => {
      treeByCategory[cat].sort((a,b) => a.name.localeCompare(b.name, "ro"));
    });

    const sorted = {};
    CATEGORY_ORDER.forEach(cat => { if (treeByCategory[cat]) sorted[cat] = treeByCategory[cat]; });
    Object.keys(treeByCategory).forEach(cat => { if (!sorted[cat]) sorted[cat] = treeByCategory[cat]; });

    res.json(sorted);
  } catch (e) {
    console.error("products-tree error:", e);
    res.status(500).json({ error: "Eroare la produse" });
  }
});


app.put("/api/products/:id", async (req, res) => {
  try {
    if (!db.hasDb()) return res.status(500).json({ error: "DB neconfigurat" });

    const id = String(req.params.id);
    const { name, gtin, category, price, gtins } = req.body || {};

    const gtinClean = normalizeGTIN(gtin || "") || null;

    const gtinsArr = []
      .concat(gtinClean ? [gtinClean] : [])
      .concat(Array.isArray(gtins) ? gtins : [])
      .map(normalizeGTIN)
      .filter(Boolean);

    const cat = String(category || "Altele").trim() || "Altele";
    const pr = (price != null && price !== "") ? Number(price) : null;

    await db.q(
      `UPDATE products
       SET name=$1, gtin=$2, gtins=$3::jsonb, category=$4, price=$5
       WHERE id=$6`,
      [String(name || "").trim(), gtinClean, JSON.stringify(gtinsArr), cat, (Number.isFinite(pr) ? pr : null), id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/products/:id error:", e);
    return res.status(500).json({ error: e.message || "Eroare DB edit produs" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!db.hasDb()) return res.status(500).json({ error: "DB neconfigurat" });

    const id = String(req.params.id);

    await db.q(`UPDATE products SET active=false WHERE id=$1`, [id]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/products/:id error:", e);
    return res.status(500).json({ error: e.message || "Eroare DB arhivare produs" });
  }
});


app.get("/api/products-flat", async (req, res) => {
  try {
    if (db.hasDb()) {
     const r = await db.q(
  `SELECT id, name, gtin, gtins, category, price
   FROM products
   WHERE COALESCE(active, true) = true
   ORDER BY name ASC`
);

     return res.json(r.rows.map(x => {
  const arr = Array.isArray(x.gtins) ? x.gtins : [];
  const primary = x.gtin || arr[0] || "";

  return {
    id: String(x.id),
    name: x.name,
    gtin: primary,          // ✅ GTIN principal mereu
    gtins: arr,
    category: x.category || "Altele",
    price: x.price,
    path: `Produse / ${x.category || "Altele"}`
  };
}));
    }

    // fallback JSON
    const data = readJson(PRODUCTS_FILE, []);
    if (Array.isArray(data)) return res.json(data);
    return res.json(flattenProductsTree(data));
  } catch (e) {
   console.error("products-flat error:", e);
res.status(500).json({ error: "Eroare la produse", detail: e.message, code: e.code });
  }
});




// ----- API ORDERS -----
app.get("/api/orders", async (req, res) => {
  try {
    if (!db.hasDb()) {
      const orders = readJson(ORDERS_FILE, []);
      return res.json(orders);
    }

    const r = await db.q(
      `SELECT id, client, items, status, created_at, sent_to_smartbill, 
              smartbill_series, smartbill_number, due_date, smartbill_error
       FROM orders
       ORDER BY created_at DESC`
    );

    const orders = r.rows.map(x => ({
      id: x.id,
      client: x.client,
      items: x.items,
      status: x.status,
      createdAt: x.created_at,
      sentToSmartbill: x.sent_to_smartbill,
      smartbillSeries: x.smartbill_series,
      smartbillNumber: x.smartbill_number,
      dueDate: x.due_date,
      smartbillError: x.smartbill_error
    }));

    res.json(orders);
  } catch (e) {
    console.error("GET /api/orders error:", e);
    res.status(500).json({ error: "Eroare DB la încărcare comenzi" });
  }
});






app.post("/api/orders", async (req, res) => {
  try {
    const { client, items } = req.body;
    
    if (!items || !items.length) {
      return res.status(400).json({ error: "Comandă goală" });
    }

    // Validare: toate produsele trebuie să aibă GTIN
    for (const item of items) {
      if (!item.gtin) {
        return res.status(400).json({ 
          error: `Produsul "${item.name}" nu are GTIN configurat.` 
        });
      }
    }

    // Alocare stoc și pregătire items
    const itemsWithAllocations = [];
    
    for (const item of items) {
      const qty = Number(item.qty || 0);
      if (qty <= 0) continue;
      
      const unitPrice = Number(item.price || 0);
      
      let allocations = [];
      try {
        if (db.hasDb()) {
          allocations = await allocateStockFromDB(item.gtin, qty);
        } else {
          const stock = readJson(STOCK_FILE, []);
          allocations = allocateStockByLocation(stock, item.gtin, qty);
          writeJson(STOCK_FILE, stock);
        }
      } catch (e) {
        return res.status(400).json({ 
          error: `Stoc insuficient pentru ${item.name}. ${e.message}` 
        });
      }
      
      itemsWithAllocations.push({
        id: item.id,
        name: item.name,
        gtin: item.gtin,
        qty: qty,
        unitPrice: unitPrice,
        lineTotal: unitPrice * qty,
        allocations: allocations
      });
    }

    // Citește payment_terms din DB pentru client
    let paymentTerms = 0;
    let dueDate = null;
    
    if (db.hasDb() && client.id) {
      const clientRes = await db.q(
        `SELECT payment_terms FROM clients WHERE id = $1`,
        [client.id]
      );
      if (clientRes.rows.length > 0) {
        paymentTerms = clientRes.rows[0].payment_terms || 0;
      }
    }
    
    // Calculează due_date (data scadență)
    if (paymentTerms > 0) {
      const today = new Date();
      dueDate = new Date(today);
      dueDate.setDate(today.getDate() + paymentTerms);
      dueDate = dueDate.toISOString().split('T')[0];
    }

    const newOrder = {
      id: Date.now().toString(),
      client,
      items: itemsWithAllocations,
      status: "in_procesare",
      sent_to_smartbill: false,
      smartbill_draft_sent: false,
      smartbill_error: null,
      smartbill_series: null,
      smartbill_number: null,
      payment_terms: paymentTerms,
      due_date: dueDate,
      createdAt: new Date().toISOString()
    };

    if (!db.hasDb()) {
      const orders = readJson(ORDERS_FILE, []);
      orders.push(newOrder);
      writeJson(ORDERS_FILE, orders);
      return res.json({ ok: true, order: newOrder });
    }

    await db.q(
      `INSERT INTO orders (id, client, items, status, created_at, sent_to_smartbill, 
       smartbill_draft_sent, smartbill_error, due_date, payment_terms)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::timestamptz, $6, $7, $8, $9, $10)`,
      [
        newOrder.id, 
        JSON.stringify(client), 
        JSON.stringify(itemsWithAllocations), 
        newOrder.status, 
        newOrder.createdAt, 
        false, 
        false, 
        null,
        dueDate,
        paymentTerms
      ]
    );

    await logAudit(req, "ORDER_CREATE", "order", newOrder.id, {
      clientName: client?.name,
      paymentTerms,
      dueDate
    });

    return res.json({ 
      ok: true, 
      order: newOrder,
      message: "Comandă salvată. Poți să o trimiți la SmartBill când ești gata."
    });

  } catch (e) {
    console.error("POST /api/orders error:", e);
    res.status(500).json({ error: "Eroare la salvare comandă" });
  }
});

// TRIMITE COMANDA LA SMARTBILL (doar când userul confirmă manual)
app.post("/api/orders/:id/send", async (req, res) => {
  try {
    const orderId = String(req.params.id);
    
    if (!db.hasDb()) {
      return res.status(500).json({ error: "DB neconfigurat" });
    }
    
    // 1. Ia comanda din DB
    const orderRes = await db.q(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );
    
    if (!orderRes.rows.length) {
      return res.status(404).json({ error: "Comandă inexistentă" });
    }
    
    const order = orderRes.rows[0];
    
    // 2. Verifică dacă nu a fost deja trimisă
    if (order.sent_to_smartbill) {
      return res.status(400).json({ 
        error: "Comanda a fost deja trimisă la SmartBill",
        smartbillSeries: order.smartbill_series,
        smartbillNumber: order.smartbill_number
      });
    }
    
    // 3. Pregătește datele pentru SmartBill
    const clientRes = await db.q(`SELECT cui FROM clients WHERE id = $1`, [order.client?.id]);
    const clientCui = clientRes.rows[0]?.cui || '';
    
    const company = await getCompanyDetails();
    
    const payload = {
      companyVatCode: company.cui,
      client: {
        name: order.client?.name || 'Client',
        vatCode: clientCui,
        isTaxPayer: true,
        country: 'Romania'
      },
      isDraft: true,
      seriesName: company.smartbill_series,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: order.due_date,
      useStock: true,
      mentions: `Punct de lucru: ${order.client?.name || 'Client'}`,
      products: (order.items || []).map(item => ({
        name: item.name,
        code: item.gtin,
        measuringUnitName: "BUC",
        currency: 'RON',
        quantity: Number(item.qty || 0),
        price: Number(item.unitPrice || item.price || 0),
        isTaxIncluded: false,
        taxName: 'Normala',
        taxPercentage: 21,
        isDiscount: false,
        warehouseName: "DISTRIBUTIE",
        isService: false,
        saveToDb: false,
        productDescription: (item.allocations || []).map(alloc => {
          const lot = alloc.lot || '-';
          const exp = alloc.expiresAt ? new Date(alloc.expiresAt).toLocaleDateString('ro-RO') : '-';
          return `LOT: ${lot} | EXP: ${exp}`;
        }).join('\n')
      }))
    };
    
    console.log('=== SMARTBILL SEND PAYLOAD ===');
    console.log(JSON.stringify(payload, null, 2));
    
    // 4. Trimite la SmartBill
    try {
      const response = await fetch(`${SMARTBILL_BASE_URL}/invoice`, {
        method: 'POST',
        headers: getSmartbillAuthHeaders(),
        body: JSON.stringify(payload)
      });
      
      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || `Eroare HTTP ${response.status}`);
      }
      
      // 5. Update DB - marchează ca trimis
      await db.q(
        `UPDATE orders SET 
          sent_to_smartbill = true,
          smartbill_draft_sent = true,
          smartbill_response = $1,
          smartbill_series = $2,
          smartbill_number = $3,
          status = 'facturata'
         WHERE id = $4`,
        [
          JSON.stringify(responseData),
          responseData.series || null,
          responseData.number || null,
          orderId
        ]
      );
      
      await logAudit(req, "ORDER_SEND_SMARTBILL", "order", orderId, {
        clientName: order.client?.name,
        smartbillSeries: responseData.series,
        smartbillNumber: responseData.number
      });
      
      return res.json({
        success: true,
        message: "Comandă trimisă cu succes în SmartBill",
        smartbillSeries: responseData.series,
        smartbillNumber: responseData.number,
        smartbillUrl: responseData.url,
        dueDate: order.due_date
      });
      
    } catch (smartbillErr) {
      await db.q(
        `UPDATE orders SET 
          smartbill_error = $1,
          smartbill_response = $2
         WHERE id = $3`,
        [smartbillErr.message, JSON.stringify({error: smartbillErr.message}), orderId]
      );
      
      await logAudit(req, "ORDER_SEND_SMARTBILL_FAIL", "order", orderId, {
        error: smartbillErr.message
      });
      
      return res.status(500).json({
        error: `Eroare SmartBill: ${smartbillErr.message}`,
        requiresRetry: true
      });
    }
    
  } catch (e) {
    console.error("POST /api/orders/:id/send error:", e);
    res.status(500).json({ error: e.message || "Eroare server" });
  }
});

// UPDATE order (pentru editorder.html)
app.put("/api/orders/:id", async (req, res) => {
  try {
    const orderId = String(req.params.id);
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "Items invalid" });
    }

    if (!db.hasDb()) {
      return res.status(500).json({ error: "DB neconfigurat" });
    }

    // 1) Verifică dacă comanda există și nu e trimisă deja
    const checkRes = await db.q(
      `SELECT sent_to_smartbill, items FROM orders WHERE id=$1`,
      [orderId]
    );

    if (!checkRes.rows.length) {
      return res.status(404).json({ error: "Comandă inexistentă" });
    }
    
    if (checkRes.rows[0].sent_to_smartbill) {
      return res.status(403).json({ 
        error: "Comanda a fost deja trimisă la SmartBill și nu poate fi modificată"
      });
    }

    // 2) Returnează stocul vechi
    const oldItems = checkRes.rows[0].items || [];
    for (const oldItem of oldItems) {
      const allocs = oldItem.allocations || [];
      for (const alloc of allocs) {
        if (alloc.stockId && alloc.qty) {
          await db.q(
            `UPDATE stock SET qty = qty + $1 WHERE id=$2`,
            [Number(alloc.qty), alloc.stockId]
          );
        }
      }
    }

    // 3) Alocă stoc nou
    const newItems = [];
    
    for (const it of items) {
      const qty = Number(it.qty || 0);
      if (qty <= 0) continue;

      const unitPrice = Number(it.price || 0);
      const allocations = await allocateStockFromDB(it.gtin, qty);
      
      newItems.push({
        id: it.id,
        name: it.name,
        gtin: it.gtin,
        qty: qty,
        unitPrice: unitPrice,
        lineTotal: unitPrice * qty,
        allocations: allocations
      });
    }

    // 4) Salvează
    await db.q(
      `UPDATE orders SET items=$1::jsonb WHERE id=$2`,
      [JSON.stringify(newItems), orderId]
    );

    await logAudit(req, "ORDER_UPDATE", "order", orderId, {
      itemsCount: newItems.length
    });

    res.json({ ok: true, message: "Comandă actualizată" });
  } catch (e) {
    console.error("PUT /api/orders/:id error:", e);
    res.status(500).json({ error: e.message || "Eroare la actualizare" });
  }
});

// Funcție nouă pentru alocare stoc din DB
// Funcție modificată pentru alocare cu fallback pe locații
// Funcție modificată pentru alocare cu suport multiple GTIN-uri
async function allocateStockFromDB(gtin, neededQty, preferredWarehouse = 'depozit') {
  const g = normalizeGTIN(gtin);
  if (!g) throw new Error("GTIN invalid");

  // 1. Găsim produsul după GTIN
  const productRes = await db.q(
    `SELECT id, gtin, gtins FROM products 
     WHERE gtin = $1 OR gtins::jsonb @> to_jsonb($1) 
     LIMIT 1`,
    [g]
  );
  
  if (!productRes.rows.length) {
    throw new Error(`Produs cu GTIN ${gtin} nu există în catalog`);
  }
  
  const product = productRes.rows[0];
  
  // 2. Construim lista tuturor GTIN-urilor produsului
  let allGtins = [];
  
  if (product.gtin) allGtins.push(product.gtin);
  
  if (product.gtins) {
    try {
      const gtinsArray = typeof product.gtins === 'string' 
        ? JSON.parse(product.gtins) 
        : product.gtins;
      if (Array.isArray(gtinsArray)) {
        allGtins = allGtins.concat(gtinsArray);
      }
    } catch (e) {
      console.error('Eroare parsing gtins:', e);
    }
  }

  // Normalizăm și eliminăm duplicatele
  const uniqueGtins = [...new Set(allGtins.map(normalizeGTIN))].filter(Boolean);
  
  console.log(`[Stock] Produs ${product.id}, GTIN-uri: ${uniqueGtins.join(', ')}`);

  const locCase = sqlLocOrderCase("location");
  let remaining = Number(neededQty);
  const allocated = [];

  // 3. Încercăm să alocăm din stocul oricărui GTIN al produsului
  // Mai întâi din Depozit (preferredWarehouse)
  for (const productGtin of uniqueGtins) {
    if (remaining <= 0) break;
    
    let r = await db.q(
      `SELECT id, gtin, lot, expires_at, qty, location, warehouse
       FROM stock
       WHERE gtin=$1 AND warehouse=$2 AND qty > 0
       ORDER BY ${locCase} ASC, expires_at ASC
       FOR UPDATE`,
      [productGtin, preferredWarehouse]
    );

    for (const s of r.rows) {
      if (remaining <= 0) break;

      const avail = Number(s.qty || 0);
      if (avail <= 0) continue;

      const take = Math.min(avail, remaining);

      await db.q(`UPDATE stock SET qty = qty - $1 WHERE id=$2`, [take, s.id]);

      allocated.push({
        stockId: s.id,
        lot: s.lot,
        expiresAt: s.expires_at ? s.expires_at.toISOString().slice(0, 10) : null,
        location: s.location || (s.warehouse === 'magazin' ? 'MAGAZIN' : 'A'),
        warehouse: s.warehouse,
        qty: take,
        gtinUsed: s.gtin
      });

      remaining -= take;
    }
  }

  // 4. ✅ FALLBACK: Dacă nu a ajuns stocul din Depozit, luăm din Magazin
  if (remaining > 0) {
    console.log(`[Stock] Fallback Magazin pentru ${gtin}, mai lipsesc ${remaining} buc`);
    
    for (const productGtin of uniqueGtins) {
      if (remaining <= 0) break;
      
      let r = await db.q(
        `SELECT id, gtin, lot, expires_at, qty, location, warehouse
         FROM stock
         WHERE gtin=$1 AND warehouse='magazin' AND qty > 0
         ORDER BY expires_at ASC
         FOR UPDATE`,
        [productGtin]
      );

      for (const s of r.rows) {
        if (remaining <= 0) break;

        const avail = Number(s.qty || 0);
        if (avail <= 0) continue;

        const take = Math.min(avail, remaining);

        await db.q(`UPDATE stock SET qty = qty - $1 WHERE id=$2`, [take, s.id]);

        allocated.push({
          stockId: s.id,
          lot: s.lot,
          expiresAt: s.expires_at ? s.expires_at.toISOString().slice(0, 10) : null,
          location: s.location || 'MAGAZIN',
          warehouse: 'magazin',
          qty: take,
          gtinUsed: s.gtin
        });

        remaining -= take;
      }
    }
  }

  if (remaining > 0) {
    throw new Error(`Stoc insuficient. Lipsă ${remaining} buc în Depozit și Magazin`);
  }

  return allocated;
}



app.post("/api/orders/:id/status", async (req, res) => {
  try {
    const allowed = new Set(["in_procesare", "facturata", "gata_de_livrare", "livrata"]);
    if (!allowed.has(req.body.status)) {
      return res.status(400).json({ error: "Status invalid" });
    }

    const id = String(req.params.id);
    const newStatus = req.body.status;

    if (!db.hasDb()) {
      const orders = readJson(ORDERS_FILE, []);
      const order = orders.find(o => String(o.id) === id);
      if (!order) return res.status(404).json({ error: "Comandă inexistentă" });

      order.status = newStatus;
      writeJson(ORDERS_FILE, orders);

      await logAudit(req, "ORDER_STATUS", "order", order.id, {
        clientName: order.client?.name,
        newStatus: order.status
      });

      return res.json({ ok: true });
    }

    const r = await db.q(`UPDATE orders SET status=$1 WHERE id=$2 RETURNING id, client`, [newStatus, id]);
    if (!r.rows.length) return res.status(404).json({ error: "Comandă inexistentă" });

   await logAudit(req, "ORDER_STATUS", "order", id, {
      clientName: r.rows[0].client?.name,
      newStatus
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/orders/:id/status error:", e);
    res.status(500).json({ error: "Eroare DB status" });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    const orderId = String(req.params.id);
    
    if (!db.hasDb()) {
      return res.status(500).json({ error: "DB neconfigurat" });
    }
    
    // Verifică mai întâi dacă e trimisă
    const checkRes = await db.q(
      `SELECT sent_to_smartbill, items FROM orders WHERE id = $1`,
      [orderId]
    );
    
    if (!checkRes.rows.length) {
      return res.status(404).json({ error: "Comandă inexistentă" });
    }
    
    if (checkRes.rows[0].sent_to_smartbill) {
      return res.status(403).json({ 
        error: "Comanda a fost deja trimisă la SmartBill și nu poate fi ștearsă",
        smartbillSeries: checkRes.rows[0].smartbill_series,
        smartbillNumber: checkRes.rows[0].smartbill_number
      });
    }
    
    // Returnează stocul înainte de ștergere
    const items = checkRes.rows[0].items || [];
    for (const item of items) {
      for (const alloc of item.allocations || []) {
        if (alloc.stockId && alloc.qty) {
          await db.q(`UPDATE stock SET qty = qty + $1 WHERE id=$2`, [alloc.qty, alloc.stockId]);
        }
      }
    }
    
    await db.q(`DELETE FROM orders WHERE id = $1`, [orderId]);
    await logAudit(req, "ORDER_DELETE", "order", orderId, {});
    
    res.json({ ok: true, message: "Comandă ștearsă" });
    
  } catch (e) {
    console.error("DELETE /api/orders/:id error:", e);
    res.status(500).json({ error: e.message || "Eroare la ștergere" });
  }
});


app.post("/api/orders/:id/replace-lot", async (req, res) => {
  const orderId = String(req.params.id);

  const gtin = normalizeGTIN(req.body.gtin);
  const oldLot = String(req.body.oldLot || "").trim();
  const newLot = String(req.body.newLot || "").trim();
  const qtyReq = Number(req.body.qty);

  if (!gtin || !oldLot || !newLot || !Number.isFinite(qtyReq) || qtyReq <= 0) {
    return res.status(400).json({ error: "Date invalide (gtin/oldLot/newLot/qty)" });
  }

  // ====== FALLBACK JSON (dacă nu există DB) ======
  if (!db.hasDb()) {
    try {
      const orders = readJson(ORDERS_FILE, []);
      const stock = readJson(STOCK_FILE, []);

      const order = orders.find(o => String(o.id) === orderId);
      if (!order) return res.status(404).json({ error: "Comandă inexistentă" });

      const item = (order.items || []).find(i => normalizeGTIN(i.gtin) === gtin);
      if (!item) return res.status(400).json({ error: "Produsul nu există în comandă" });

      item.allocations = Array.isArray(item.allocations) ? item.allocations : [];

      const oldAllocs = item.allocations.filter(a => String(a.lot) === oldLot);
      const oldTotal = oldAllocs.reduce((s, a) => s + Number(a.qty || 0), 0);
      if (oldTotal <= 0) return res.status(400).json({ error: "Old LOT nu există în allocations" });
      if (qtyReq > oldTotal) {
        return res.status(400).json({ error: `Cantitatea cerută (${qtyReq}) depășește alocarea din lot (${oldTotal})` });
      }

      // return în stoc pt oldLot
      let remainingReturn = qtyReq;
      for (const a of oldAllocs) {
        if (remainingReturn <= 0) break;

        const takeBack = Math.min(Number(a.qty || 0), remainingReturn);
        const st = stock.find(s => String(s.id) === String(a.stockId));
        if (st) st.qty = Number(st.qty || 0) + takeBack;

        a.qty = Number(a.qty || 0) - takeBack;
        remainingReturn -= takeBack;
      }

      item.allocations = item.allocations.filter(a => Number(a.qty || 0) > 0);

      // alocare din newLot
      const newAllocs = allocateFromSpecificLot(stock, gtin, newLot, qtyReq);

      newAllocs.forEach(na => {
        const existing = item.allocations.find(a =>
          String(a.lot) === String(na.lot) &&
          String(a.location || "") === String(na.location || "")
        );
        if (existing) existing.qty = Number(existing.qty || 0) + Number(na.qty || 0);
        else item.allocations.push(na);
      });

      writeJson(STOCK_FILE, stock);
      writeJson(ORDERS_FILE, orders);

     await logAudit(req, "ORDER_REPLACE_LOT", "order", order.id, { gtin, oldLot, newLot, qty: qtyReq });

      return res.json({ ok: true, order });
    } catch (e) {
      console.error("replace-lot JSON error:", e);
      return res.status(400).json({ error: e.message || "Eroare" });
    }
  }

  // ====== DB MODE ======
  try {
    await db.q("BEGIN");

    // 1) luăm comanda (lock)
    const rOrder = await db.q(
      `SELECT id, client, items, status, created_at
       FROM orders
       WHERE id=$1
       FOR UPDATE`,
      [orderId]
    );

    if (!rOrder.rows.length) {
      await db.q("ROLLBACK");
      return res.status(404).json({ error: "Comandă inexistentă" });
    }

    const orderRow = rOrder.rows[0];
    const items = Array.isArray(orderRow.items) ? orderRow.items : [];

    const item = items.find(i => normalizeGTIN(i.gtin) === gtin);
    if (!item) {
      await db.q("ROLLBACK");
      return res.status(400).json({ error: "Produsul nu există în comandă" });
    }

    item.allocations = Array.isArray(item.allocations) ? item.allocations : [];

    // 2) validăm oldLot allocations
    const oldAllocs = item.allocations.filter(a => String(a.lot) === oldLot);
    const oldTotal = oldAllocs.reduce((s, a) => s + Number(a.qty || 0), 0);

    if (oldTotal <= 0) {
      await db.q("ROLLBACK");
      return res.status(400).json({ error: "Old LOT nu există în allocations" });
    }
    if (qtyReq > oldTotal) {
      await db.q("ROLLBACK");
      return res.status(400).json({ error: `Cantitatea cerută (${qtyReq}) depășește alocarea din lot (${oldTotal})` });
    }

    // 3) returnăm qty în stoc pe stockId-urile vechi
    let remainingReturn = qtyReq;
    for (const a of oldAllocs) {
      if (remainingReturn <= 0) break;

      const takeBack = Math.min(Number(a.qty || 0), remainingReturn);
      if (a.stockId) {
        await db.q(`UPDATE stock SET qty = qty + $1 WHERE id=$2`, [takeBack, String(a.stockId)]);
      }
      a.qty = Number(a.qty || 0) - takeBack;
      remainingReturn -= takeBack;
    }

    // curățăm allocations cu qty 0
    item.allocations = item.allocations.filter(a => Number(a.qty || 0) > 0);

    // 4) alocăm qtyReq din NEW LOT: luăm rânduri stock din lotul nou (lock)
    const locCase = sqlLocOrderCase("location");
    const rStock = await db.q(
      `SELECT id, gtin, lot, expires_at, qty, location
       FROM stock
       WHERE gtin=$1 AND lot=$2 AND qty > 0
       ORDER BY ${locCase} ASC, expires_at ASC
       FOR UPDATE`,
      [gtin, newLot]
    );

    let remainingNeed = qtyReq;
    const newAllocs = [];

    for (const s of rStock.rows) {
      if (remainingNeed <= 0) break;

      const avail = Number(s.qty || 0);
      if (avail <= 0) continue;

      const take = Math.min(avail, remainingNeed);

      // scădem din stock
      await db.q(`UPDATE stock SET qty = qty - $1 WHERE id=$2`, [take, s.id]);

      newAllocs.push({
        stockId: s.id,
        lot: s.lot,
        expiresAt: String(s.expires_at).slice(0, 10),
        location: s.location || "A",
        qty: take
      });

      remainingNeed -= take;
    }

    if (remainingNeed > 0) {
      await db.q("ROLLBACK");
      return res.status(400).json({ error: "Stoc insuficient pe lotul scanat (DB)" });
    }

    // 5) mergem allocations: cumulăm dacă există deja lot+location
    newAllocs.forEach(na => {
      const existing = item.allocations.find(a =>
        String(a.lot) === String(na.lot) &&
        String(a.location || "") === String(na.location || "")
      );
      if (existing) existing.qty = Number(existing.qty || 0) + Number(na.qty || 0);
      else item.allocations.push(na);
    });

    // 6) salvăm items în DB
    await db.q(`UPDATE orders SET items=$1::jsonb WHERE id=$2`, [JSON.stringify(items), orderId]);

    await db.q("COMMIT");

   await logAudit(req, "ORDER_REPLACE_LOT", "order", orderId, {
      gtin,
      oldLot,
      newLot,
      qty: qtyReq
    });

    // return order “fresh”
    const rFresh = await db.q(
      `SELECT id, client, items, status, created_at
       FROM orders
       WHERE id=$1`,
      [orderId]
    );

    const x = rFresh.rows[0];
    return res.json({
      ok: true,
      order: {
        id: x.id,
        client: x.client,
        items: x.items,
        status: x.status,
        createdAt: x.created_at
      }
    });

  } catch (e) {
    try { await db.q("ROLLBACK"); } catch {}
    console.error("replace-lot DB error:", e);
    return res.status(500).json({ error: e.message || "Eroare DB replace-lot" });
  }
});


app.get("/api/debug-db", async (req, res) => {
  try {
    if (!db.hasDb()) return res.json({ hasDb: false });

    const r = await db.q("select current_database() as db, inet_server_addr() as host");
    const c1 = await db.q("select count(*)::int as n from orders");
    let c2 = { rows: [{ n: null }] };
    try { c2 = await db.q("select count(*)::int as n from stock"); } catch {}

    res.json({
      hasDb: true,
      db: r.rows[0],
      ordersCount: c1.rows[0].n,
      stockCount: c2.rows[0].n
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/stock", async (req, res) => {
  try {
    const warehouse = req.query.warehouse || 'depozit';
    
    if (!db.hasDb()) {
      const stock = readJson(STOCK_FILE, []).filter(s => (s.warehouse || 'depozit') === warehouse);
      return res.json(stock);
    }

    const r = await db.q(
      `SELECT id, gtin, product_name, lot, expires_at, qty, location, warehouse, created_at
       FROM stock 
       WHERE warehouse = $1
       ORDER BY created_at DESC`,
      [warehouse]
    );

    const out = r.rows.map(s => ({
      id: s.id,
      gtin: s.gtin,
      productName: s.product_name,
      lot: s.lot,
      expiresAt: s.expires_at,
      qty: Number(s.qty || 0),
      location: s.location || (s.warehouse === 'magazin' ? 'MAGAZIN' : 'A'),
      warehouse: s.warehouse || 'depozit',
      createdAt: s.created_at
    }));

    res.json(out);
  } catch (e) {
    console.error("GET /api/stock error:", e);
    res.status(500).json({ error: "Eroare DB stock" });
  }
});

// POST transfer
app.post("/api/stock/transfer", async (req, res) => {
  try {
    const { gtin, productName, lot, expiresAt, qty, fromWarehouse, toWarehouse, fromLocation, toLocation } = req.body;
    
    if (!gtin || !lot || !qty || !fromWarehouse || !toWarehouse) {
      return res.status(400).json({ error: "Date incomplete" });
    }

    const transferQty = Number(qty);
    if (!Number.isFinite(transferQty) || transferQty <= 0) {
      return res.status(400).json({ error: "Cantitate invalidă" });
    }

    // Normalizare GTIN
    const g = normalizeGTIN(gtin);
    
    // Determină locațiile exacte
    const sourceLoc = fromWarehouse === 'magazin' ? 'MAGAZIN' : (fromLocation || 'A');
    const destLoc = toWarehouse === 'magazin' ? 'MAGAZIN' : (toLocation || 'A');

    console.log(`Transfer: ${transferQty} buc ${g} lot ${lot} din ${fromWarehouse}/${sourceLoc} în ${toWarehouse}/${destLoc}`);

    await db.q("BEGIN");

    // 1. Verifică și scade din sursă
    // Căutăm după GTIN normalizat, lot exact, warehouse și locație
    const r1 = await db.q(
      `UPDATE stock SET qty = qty - $1 
       WHERE gtin=$2 AND lot=$3 AND warehouse=$4 AND location=$5 AND qty >= $1
       RETURNING id, qty as remaining`,
      [transferQty, g, lot, fromWarehouse, sourceLoc]
    );

    if (r1.rows.length === 0) {
      await db.q("ROLLBACK");
      return res.status(400).json({ 
        error: "Stoc insuficient în sursă sau lotul nu există în locația selectată",
        debug: { gtin: g, lot, fromWarehouse, sourceLoc }
      });
    }

    // 2. Verifică dacă există în destinație
    const r2 = await db.q(
      `SELECT id, qty FROM stock WHERE gtin=$1 AND lot=$2 AND warehouse=$3 AND location=$4`,
      [g, lot, toWarehouse, destLoc]
    );

    if (r2.rows.length > 0) {
      // Există, incrementăm
      await db.q(
        `UPDATE stock SET qty = qty + $1 WHERE id=$2`,
        [transferQty, r2.rows[0].id]
      );
    } else {
      // Nu există, creăm intrare nouă
      const newId = crypto.randomUUID();
      await db.q(
        `INSERT INTO stock (id, gtin, product_name, lot, expires_at, qty, location, warehouse)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newId, g, productName, lot, expiresAt, transferQty, destLoc, toWarehouse]
      );
    }

    // 3. Log transfer
    await db.q(
      `INSERT INTO stock_transfers (id, gtin, product_name, lot, expires_at, qty, from_warehouse, to_warehouse, from_location, to_location, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [crypto.randomUUID(), g, productName, lot, expiresAt, transferQty, fromWarehouse, toWarehouse, sourceLoc, destLoc, req.session?.user?.username || 'system']
    );

    await db.q("COMMIT");
    res.json({ ok: true, message: `Transfer ${transferQty} buc realizat cu succes` });

  } catch (e) {
    try { await db.q("ROLLBACK"); } catch {}
    console.error("Transfer error:", e);
    res.status(500).json({ error: e.message || "Eroare internă la transfer" });
  }
});

app.get("/api/audit", async (req, res) => {
  try {
    if (!db.hasDb()) return res.json(readJson(AUDIT_FILE, []));
    const r = await db.q(
      `SELECT id, action, entity, entity_id, user_json, details, created_at
       FROM audit
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(r.rows.map(x => ({
      id: x.id,
      action: x.action,
      entity: x.entity,
      entityId: x.entity_id,
      user: x.user_json,
      details: x.details,
      createdAt: x.created_at
    })));
  } catch (e) {
    res.status(500).json({ error: "Eroare audit" });
  }
});


// ADD stock
app.post("/api/stock", async (req, res) => {
  try {
    const warehouse = req.body.warehouse || 'depozit';
    const location = warehouse === 'magazin' ? 'MAGAZIN' : (req.body.location || 'A');
    
    const entry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      gtin: String(req.body.gtin || "").trim(),
      productName: String(req.body.productName || "").trim(),
      lot: String(req.body.lot || "").trim(),
      expiresAt: String(req.body.expiresAt || "").slice(0, 10),
      qty: Number(req.body.qty),
      location: location,
      warehouse: warehouse, // 'magazin' sau 'depozit'
      createdAt: new Date().toISOString()
    };

    if (!entry.gtin) return res.status(400).json({ error: "Lipsește GTIN" });

    if (!db.hasDb()) {
      const stock = readJson(STOCK_FILE, []);
      stock.push(entry);
      writeJson(STOCK_FILE, stock);
      return res.json({ ok: true, entry });
    }

    await db.q(
      `INSERT INTO stock (id, gtin, product_name, lot, expires_at, qty, location, warehouse, created_at)
       VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9::timestamptz)`,
      [entry.id, entry.gtin, entry.productName, entry.lot, entry.expiresAt, entry.qty, entry.location, entry.warehouse, entry.createdAt]
    );

    await logAudit(req, "STOCK_ADD", "stock", entry.id, {
      gtin: entry.gtin,
      productName: entry.productName,
      lot: entry.lot,
      qty: entry.qty,
      warehouse: entry.warehouse,
      location: entry.location
    });

    res.json({ ok: true, entry });
  } catch (e) {
    console.error("POST /api/stock error:", e);
    res.status(500).json({ error: "Eroare DB stock add" });
  }
});

// UPDATE stock lot
app.put("/api/stock/:id", async (req, res) => {
  try {
    const id = String(req.params.id);

    if (!db.hasDb()) {
      const stock = readJson(STOCK_FILE, []);
      const item = stock.find(s => String(s.id) === id);
      if (!item) return res.status(404).json({ error: "Intrare stoc inexistentă" });

      const beforeQty = item.qty;
      const beforeLoc = item.location || "A";

      if (req.body.qty != null) item.qty = Number(req.body.qty);
      if (req.body.location != null) item.location = String(req.body.location);

      writeJson(STOCK_FILE, stock);

await logAudit(req, "STOCK_EDIT", "stock", item.id, {
        gtin: item.gtin,
        productName: item.productName,
        lot: item.lot,
        beforeQty,
        afterQty: item.qty,
        beforeLoc,
        afterLoc: item.location
      });

      return res.json({ ok: true, item });
    }

    const r0 = await db.q(`SELECT * FROM stock WHERE id=$1`, [id]);
    if (!r0.rows.length) return res.status(404).json({ error: "Intrare stoc inexistentă" });

    const before = r0.rows[0];
    const newQty = req.body.qty != null ? Number(req.body.qty) : Number(before.qty);
    const newLoc = req.body.location != null ? String(req.body.location) : String(before.location || "A");

    await db.q(`UPDATE stock SET qty=$1, location=$2 WHERE id=$3`, [newQty, newLoc, id]);

   await logAudit(req, "STOCK_EDIT", "stock", id, {
      gtin: before.gtin,
      productName: before.product_name,
      lot: before.lot,
      beforeQty: Number(before.qty),
      afterQty: newQty,
      beforeLoc: before.location,
      afterLoc: newLoc
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/stock/:id error:", e);
    res.status(500).json({ error: "Eroare DB stock edit" });
  }
});

// DELETE stock lot
app.delete("/api/stock/:id", async (req, res) => {
  try {
    const id = String(req.params.id);

    if (!db.hasDb()) {
      const stock = readJson(STOCK_FILE, []);
      const index = stock.findIndex(s => String(s.id) === id);
      if (index === -1) return res.status(404).json({ error: "Intrare stoc inexistentă" });

      const item = stock[index];

     await logAudit(req, "STOCK_DELETE", "stock", item.id, {
        productName: item.productName,
        lot: item.lot,
        expiresAt: item.expiresAt,
        qty: item.qty
      });

      stock.splice(index, 1);
      writeJson(STOCK_FILE, stock);
      return res.json({ ok: true });
    }

    const r0 = await db.q(`SELECT * FROM stock WHERE id=$1`, [id]);
    if (!r0.rows.length) return res.status(404).json({ error: "Intrare stoc inexistentă" });

    const item = r0.rows[0];

    await db.q(`DELETE FROM stock WHERE id=$1`, [id]);

   await logAudit(req, "STOCK_DELETE", "stock", id, {
      productName: item.product_name,
      lot: item.lot,
      expiresAt: item.expires_at,
      qty: Number(item.qty || 0)
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/stock/:id error:", e);
    res.status(500).json({ error: "Eroare DB stock delete" });
  }
});








// DIAGNOSTIC: Test bcrypt direct (fără DB)
app.get("/api/test-bcrypt", async (req, res) => {
  try {
    const testPassword = "test123";
    console.log("🧪 TEST BCRYPT - Generare hash...");
    const hash = await bcrypt.hash(testPassword, 10);
    console.log("🧪 TEST BCRYPT - Hash generat:", hash.substring(0, 30) + "...");
    
    console.log("🧪 TEST BCRYPT - Verificare parolă corectă...");
    const correct = await bcrypt.compare(testPassword, hash);
    console.log("🧪 TEST BCRYPT - Rezultat parolă corectă:", correct);
    
    console.log("🧪 TEST BCRYPT - Verificare parolă greșită...");
    const wrong = await bcrypt.compare("wrongpass", hash);
    console.log("🧪 TEST BCRYPT - Rezultat parolă greșită:", wrong);
    
    res.json({
      ok: true,
      bcryptWorks: correct === true && wrong === false,
      hashGenerated: hash.substring(0, 30) + "...",
      correctPasswordTest: correct,
      wrongPasswordTest: wrong,
      bcryptVersion: bcrypt.version || "unknown"
    });
  } catch (err) {
    console.error("🧪 TEST BCRYPT - EROARE:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DIAGNOSTIC: Test login pas cu pas
app.post("/api/test-login", async (req, res) => {
  const { email, password } = req.body;
  const results = { steps: [], errors: [] };
  
  try {
    results.steps.push("1. Verificare DB...");
    if (!db.hasDb()) {
      results.errors.push("DB neconfigurat");
      return res.json(results);
    }
    results.steps.push("✓ DB conectat");
    
    results.steps.push("2. Căutare companie după email...");
    const compRes = await db.q(
      `SELECT id, schema_name FROM public.companies WHERE admin_email = $1`,
      [email.toLowerCase().trim()]
    );
    
    if (compRes.rows.length === 0) {
      results.errors.push("Companie negăsită pentru email: " + email);
      return res.json(results);
    }
    results.steps.push("✓ Companie găsită: " + compRes.rows[0].schema_name);
    
    const schemaName = compRes.rows[0].schema_name;
    
    results.steps.push("3. Căutare utilizator în schema " + schemaName + "...");
    const userRes = await db.q(
      `SELECT * FROM ${schemaName}.users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    
    if (userRes.rows.length === 0) {
      results.errors.push("Utilizator negăsit în schema");
      return res.json(results);
    }
    results.steps.push("✓ Utilizator găsit: " + userRes.rows[0].email);
    
    const u = userRes.rows[0];
    results.user = {
      id: u.id,
      email: u.email,
      active: u.active,
      role: u.role,
      hasPasswordHash: !!u.password_hash,
      hashPrefix: u.password_hash ? u.password_hash.substring(0, 20) + "..." : null
    };
    
    results.steps.push("4. Verificare parolă cu bcrypt...");
    results.passwordReceived = password ? "******" : "(goală)";
    
    const ok = await bcrypt.compare(password, u.password_hash);
    results.bcryptResult = ok;
    results.steps.push("✓ bcrypt.compare rezultat: " + ok);
    
    if (!ok) {
      results.errors.push("Parola nu se potrivește (bcrypt a returnat false)");
    } else {
      results.steps.push("✓ LOGIN REUȘIT!");
    }
    
    res.json(results);
  } catch (err) {
    results.errors.push("EXCEPTIE: " + err.message);
    console.error("🧪 TEST LOGIN - EROARE:", err);
    res.json(results);
  }
});

// DEBUG: Lista toate companiile (fără date sensibile)
app.get("/api/debug/companies", async (req, res) => {
  try {
    if (!db.hasDb()) return res.json({ error: "DB neconfigurat" });
    
    const result = await db.q(
      `SELECT id, name, admin_email, schema_name, status, created_at 
       FROM public.companies 
       ORDER BY created_at DESC`
    );
    
    res.json({
      count: result.rows.length,
      companies: result.rows.map(c => ({
        id: c.id,
        name: c.name,
        admin_email: c.admin_email,
        schema_name: c.schema_name,
        status: c.status,
        created_at: c.created_at
      }))
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Login Multi-Tenant
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!db.hasDb()) return res.status(500).json({ error: "DB neconfigurat" });
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email și parolă sunt obligatorii" });
    }
    
    const emailClean = email.toLowerCase().trim();

    // 1. Găsim compania după email
    const companyRes = await db.q(
      `SELECT id, schema_name, status, trial_expires_at, name 
       FROM public.companies 
       WHERE admin_email = $1 LIMIT 1`,
      [emailClean]
    );
    
    if (companyRes.rows.length === 0) {
      return res.status(401).json({ error: "Email sau parolă greșită" });
    }
    
    const company = companyRes.rows[0];
    
    // 2. Verificăm statusul companiei
    if (company.status === 'pending_verification') {
      return res.status(403).json({ 
        unverified: true, 
        message: "Emailul nu a fost verificat. Verifică căsuța de email." 
      });
    }
    
    if (company.status === 'suspended') {
      return res.status(403).json({ 
        suspended: true, 
        message: "Contul a fost suspendat. Contactează administratorul." 
      });
    }
    
    // Verificăm trialul
    if (company.status === 'trial' && company.trial_expires_at) {
      if (new Date() > new Date(company.trial_expires_at)) {
        await db.q(
          `UPDATE public.companies SET status = 'trial_expired' WHERE id = $1`,
          [company.id]
        );
        company.status = 'trial_expired';
      }
    }
    
    if (company.status === 'trial_expired') {
      return res.status(403).json({ 
        trialExpired: true, 
        message: "Perioada de trial a expirat. Contactează-ne pentru activare." 
      });
    }

    // 3. Căutăm userul în schema tenant
    const schemaName = company.schema_name;
    const r = await db.q(
      `SELECT id, email, password_hash, role, active, is_approved, 
              failed_attempts, unlock_at, last_failed_at, first_name, last_name
       FROM ${schemaName}.users WHERE email=$1 LIMIT 1`,
      [emailClean]
    );

    const u = r.rows[0];
    if (!u) return res.status(401).json({ error: "Email sau parolă greșită" });

    const now = new Date();

    // Reset counter după 30 min de inactivitate
    if (u.failed_attempts > 0 && u.last_failed_at) {
      const lastFail = new Date(u.last_failed_at);
      const thirtyMinAgo = new Date(now.getTime() - 30 * 60000);
      
      if (lastFail < thirtyMinAgo) {
        await db.q(
          `UPDATE ${schemaName}.users SET failed_attempts = 0, unlock_at = null, last_failed_at = null WHERE id = $1`,
          [u.id]
        );
        u.failed_attempts = 0;
        u.unlock_at = null;
      }
    }

    // Verifică blocare
    if (u.failed_attempts >= 3 && u.unlock_at) {
      const unlockTime = new Date(u.unlock_at);
      if (unlockTime > now) {
        const minutesLeft = Math.ceil((unlockTime - now) / 60000);
        return res.status(403).json({ 
          locked: true,
          minutesLeft: minutesLeft,
          message: `Cont blocat. Mai așteaptă ${minutesLeft} minute.` 
        });
      } else {
        await db.q(
          `UPDATE ${schemaName}.users SET failed_attempts = 0, unlock_at = null, last_failed_at = null WHERE id = $1`,
          [u.id]
        );
        u.failed_attempts = 0;
      }
    }

    if (!u.active) return res.status(401).json({ error: "Email sau parolă greșită" });

    // Verificare parolă cu bcrypt async
    console.log("🔐 LOGIN - Verificare parolă:");
    console.log("  - Email:", email);
    console.log("  - Parola primită:", password ? "******" : "(goală)");
    console.log("  - Hash din DB:", u.password_hash ? u.password_hash.substring(0, 20) + "..." : "(lipsă)");
    
    let ok;
    try {
      ok = await bcrypt.compare(password, u.password_hash);
      console.log("  - bcrypt.compare rezultat:", ok);
    } catch (err) {
      console.error("Eroare bcrypt compare:", err);
      return res.status(500).json({ error: "Eroare server" });
    }
    
    if (!ok) {
      console.log("  - Parolă INCORECTĂ pentru:", email);
      const newAttempts = (u.failed_attempts || 0) + 1;
      
      if (newAttempts >= 3) {
        const unlockAt = new Date(now.getTime() + 30 * 60000);
        await db.q(
          `UPDATE ${schemaName}.users SET failed_attempts = $1, last_failed_at = NOW(), unlock_at = $2 WHERE id = $3`,
          [newAttempts, unlockAt, u.id]
        );
        
        return res.status(403).json({ 
          locked: true, 
          minutesLeft: 30,
          message: "Cont blocat pentru 30 minute după 3 încercări eșuate." 
        });
      } else {
        await db.q(
          `UPDATE ${schemaName}.users SET failed_attempts = $1, last_failed_at = NOW() WHERE id = $2`,
          [newAttempts, u.id]
        );
        
        return res.status(401).json({ 
          error: "Email sau parolă greșită",
          attemptsLeft: 3 - newAttempts 
        });
      }
    }

    // Login reușit
    await db.q(
      `UPDATE ${schemaName}.users SET failed_attempts = 0, unlock_at = null, last_failed_at = null WHERE id = $1`,
      [u.id]
    );

    // Setăm sesiunea cu schema_name pentru multi-tenant
    req.session.user = { 
      id: u.id, 
      email: u.email, 
      role: u.role, 
      is_approved: u.is_approved,
      first_name: u.first_name,
      last_name: u.last_name,
      company_name: company.name,
      schema_name: schemaName,
      trial_expires_at: company.trial_expires_at
    };
    
    res.json({ 
      ok: true, 
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        first_name: u.first_name,
        last_name: u.last_name,
        company_name: company.name
      }
    });
    
  } catch (e) {
    console.error("LOGIN error:", e);
    res.status(500).json({ error: "Eroare login" });
  }
});

// Register 
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, inviteToken } = req.body;

    if (!username || !password) return res.status(400).json({ error: "Date lipsă" });
    if (!db.hasDb()) return res.status(500).json({ error: "DB neconfigurat" });

    // Verifică token de invitație dacă există
    let inviteData = null;
    if (inviteToken) {
      const inviteRes = await db.q(
        `SELECT email, first_name, last_name, role, status, expires_at
         FROM user_invites
         WHERE token = $1`,
        [inviteToken]
      );
      
      if (inviteRes.rows.length === 0) {
        return res.status(400).json({ error: "Token de invitație invalid" });
      }
      
      inviteData = inviteRes.rows[0];
      
      if (inviteData.status !== 'pending') {
        return res.status(400).json({ error: "Invitația a fost deja folosită" });
      }
      
      if (new Date(inviteData.expires_at) < new Date()) {
        return res.status(400).json({ error: "Invitația a expirat" });
      }
      
      // Verifică că username-ul (email) corespunde cu cel din invitație
      if (username.trim().toLowerCase() !== inviteData.email.toLowerCase()) {
        return res.status(400).json({ error: "Email-ul trebuie să corespundă cu cel din invitație" });
      }
    } else {
      // Fără invitație, înregistrarea nu este permisă
      return res.status(403).json({ error: "Înregistrarea este permisă doar prin invitație" });
    }

    // Hash parolă async
    console.log("🔐 REGISTER - Hash parolă:");
    console.log("  - Parola primită:", password ? "******" : "(goală)");
    const passwordHash = await bcrypt.hash(password, 10);
    console.log("  - Hash generat:", passwordHash.substring(0, 20) + "...");

    // Creează userul cu datele din invitație (inclusiv rolul)
    const userRole = inviteData.role || 'user';
    console.log("📧 Register - inviteData.role:", inviteData.role, "=> userRole:", userRole);
    const r = await db.q(
      `INSERT INTO users (username, password_hash, role, active, is_approved, failed_attempts, first_name, last_name, email)
       VALUES ($1,$2,$3,true,false,0,$4,$5,$6)
       RETURNING id, username, role, is_approved, first_name, last_name`,
      [username.trim(), passwordHash, userRole, inviteData.first_name || null, inviteData.last_name || null, inviteData.email]
    );
    
    // Marchează invitația ca folosită
    await db.q(
      `UPDATE user_invites SET status = 'used', used_at = NOW() WHERE token = $1`,
      [inviteToken]
    );

    res.json({ 
      ok: true, 
      message: "Cont creat. Așteaptă aprobarea administratorului.",
      user: r.rows[0] 
    });
  } catch (e) {
    if (String(e.message || "").includes("duplicate key")) {
      return res.status(400).json({ error: "Utilizator existent" });
    }
    console.error("REGISTER error:", e);
    res.status(500).json({ error: "Eroare register" });
  }
});




// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});









app.post("/api/products", async (req, res) => {
  try {
    const { name, gtin, category, price, gtins } = req.body;

    if (!name) return res.status(400).json({ error: "Lipsește numele" });
    if (!db.hasDb()) return res.status(500).json({ error: "DB neconfigurat" });

    const id = crypto.randomUUID();

    const gtinClean = normalizeGTIN(gtin || "") || null;

    const gtinsArr = []
      .concat(gtinClean ? [gtinClean] : [])
      .concat(Array.isArray(gtins) ? gtins : [])
      .map(normalizeGTIN)
      .filter(Boolean);

    const cat = String(category || "Altele").trim() || "Altele";
    const pr = (price != null && price !== "") ? Number(price) : null;

    // ✅ setăm gtin = primul gtin din listă (dacă există), ca să ai GTIN principal mereu
    const primaryGtin = gtinClean || (gtinsArr[0] || null);

    const r = await db.q(
      `INSERT INTO products (id, name, gtin, gtins, category, price, active)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,true)
       RETURNING id`,
      [
        id,
        String(name).trim(),
        primaryGtin,
        JSON.stringify(gtinsArr),
        cat,
        (Number.isFinite(pr) ? pr : null)
      ]
    );

    await logAudit(req, "PRODUCT_ADD", "product", r.rows[0].id, {
      name: String(name).trim(),
      gtin: primaryGtin,
      category: cat,
      price: pr
    });

    return res.json({ ok: true, id: r.rows[0].id });

  } catch (e) {
    if (String(e.code) === "23505") {
      const c = String(e.constraint || "");
      if (c.includes("gtin")) return res.status(400).json({ error: "GTIN existent deja" });
      if (c.includes("name")) return res.status(400).json({ error: "Produs existent deja (nume duplicat)" });
      return res.status(400).json({ error: "Valoare existentă deja (duplicat)" });
    }

    console.error("POST /api/products error:", e);
    return res.status(500).json({ error: e.message || "Eroare DB product add" });
  }
});

app.post("/api/clients", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const group = String(req.body.group || "").trim();
    const category = String(req.body.category || "").trim();
    const cui = String(req.body.cui || "").trim().toUpperCase(); // Nou
    const prices = (req.body.prices && typeof req.body.prices === "object") ? req.body.prices : {};

    if (!name) return res.status(400).json({ error: "Lipsește numele clientului" });

    // DB
    if (db.hasDb()) {
      const id = Date.now().toString();
      await db.q(
        `INSERT INTO clients (id, name, group_name, category, cui, prices)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [id, name, group, category, cui || null, JSON.stringify(prices)]
      );

      return res.json({ ok: true, id, cui });
    }

    // fallback local file
    const clients = readJson(CLIENTS_FILE, []);
    const id = Date.now().toString();
    clients.push({ id, name, group, category, cui, prices });
    writeJson(CLIENTS_FILE, clients);
    return res.json({ ok: true, id });

  } catch (e) {
    console.error("POST /api/clients error:", e);
    res.status(500).json({ error: "Eroare la salvarea clientului" });
  }
});

// ==========================================
// ADMIN ENDPOINTS (User Management)
// ==========================================


// Lista utilizatori în așteptare
app.get("/api/users/pending", isAdmin, async (req, res) => {
  try {
    const r = await db.q(
      `SELECT id, email, first_name, last_name, created_at, failed_attempts 
       FROM users 
       WHERE is_approved = false AND role = 'user'
       ORDER BY 
         CASE WHEN failed_attempts >= 3 THEN 0 ELSE 1 END,
         created_at DESC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/users/unlock/:id", isAdmin, async (req, res) => {
  try {
    await db.q(
      `UPDATE users 
       SET failed_attempts = 0, 
           unlock_at = null,
           last_failed_at = null
       WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true, message: "Utilizator deblocat" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aprobare utilizator
app.post("/api/users/approve/:id", isAdmin, async (req, res) => {
  try {
    await db.q(
      `UPDATE users SET is_approved = true, failed_attempts = 0 WHERE id = $1 AND role = 'user'`,
      [req.params.id]
    );
    res.json({ ok: true, message: "Utilizator aprobat și deblocat" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lista utilizatori blocați (failed_attempts >= 3 sau unlock_at există)
app.get("/api/users/locked", isAdmin, async (req, res) => {
  try {
    const r = await db.q(
      `SELECT id, email, first_name, last_name, failed_attempts, unlock_at, 
              CASE 
                WHEN unlock_at > NOW() THEN EXTRACT(EPOCH FROM (unlock_at - NOW()))/60
                ELSE 0 
              END as minutes_left
       FROM users 
       WHERE failed_attempts >= 3 OR unlock_at IS NOT NULL
       ORDER BY unlock_at DESC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Respingere utilizator
app.post("/api/users/reject/:id", isAdmin, async (req, res) => {
  try {
    await db.q(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lista toți utilizatorii
app.get("/api/users", isAdmin, async (req, res) => {
  try {
    const r = await db.q(
      `SELECT id, email, first_name, last_name, role, is_approved, active, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== PROFIL UTILIZATOR ==========

// GET /api/me - Obține profilul utilizatorului curent (multi-tenant)
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const r = await db.q(
      `SELECT id, email, role, first_name, last_name, phone, position, created_at 
       FROM users 
       WHERE id = $1`,
      [userId]
    );
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Utilizator negăsit" });
    }
    
    // Adăugăm company_name din sesiune pentru frontend
    const userData = r.rows[0];
    userData.company_name = req.session.user?.company_name;
    userData.trial_expires_at = req.session.user?.trial_expires_at;
    
    res.json(userData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/me - Actualizează profilul utilizatorului curent
app.put("/api/me", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { first_name, last_name, phone, email, position } = req.body;
    
    const r = await db.q(
      `UPDATE users 
       SET first_name = $1, last_name = $2, phone = $3, email = $4, position = $5
       WHERE id = $6
       RETURNING id, username, role, first_name, last_name, phone, email, position, created_at`,
      [first_name || null, last_name || null, phone || null, email || null, position || null, userId]
    );
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Utilizator negăsit" });
    }
    
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== INVITE SYSTEM ==========
// Generează token unic pentru invitație
function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/invites - Trimite invitație (doar admin)
app.post("/api/invites", isAdmin, async (req, res) => {
  try {
    const { email, first_name, last_name, role: requestedRole } = req.body;
    
    console.log("📧 INVITE REQUEST received:");
    console.log("  - email:", email);
    console.log("  - first_name:", first_name);
    console.log("  - last_name:", last_name);
    console.log("  - requestedRole:", requestedRole);
    console.log("  - inviterRole:", req.session.user.role);
    console.log("  - body:", JSON.stringify(req.body));
    
    // Determină rolul pentru invitație
    let inviteRole = 'user'; // Default
    
    if (requestedRole) {
      // SuperAdmin poate invita cu orice rol (admin sau user)
      if (req.session.user.role === 'superadmin') {
        if (requestedRole === 'admin' || requestedRole === 'user') {
          inviteRole = requestedRole;
        }
      } 
      // Admin obișnuit poate invita doar cu rolul 'user'
      else if (req.session.user.role === 'admin' && requestedRole === 'user') {
        inviteRole = 'user';
      }
      // Orice alt rol solicitat e resetat la 'user'
    }
    
    console.log("📧 Final inviteRole:", inviteRole);
    
    if (!email) {
      return res.status(400).json({ error: "Email-ul este obligatoriu" });
    }
    
    // Validare format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("📧 INVALID EMAIL format:", email);
      return res.status(400).json({ error: "Format email invalid" });
    }
    
    // Normalize email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim();
    console.log("📧 Normalized email:", normalizedEmail);
    
    // Verifică dacă email-ul e deja folosit
    const existingUser = await db.q(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Există deja un utilizator cu acest email" });
    }
    
    // Verifică dacă există deja o invitație activă
    console.log("📧 Checking for existing invite...");
    const existingInvite = await db.q(
      "SELECT id, status, expires_at FROM user_invites WHERE email = $1 AND status = 'pending' AND expires_at > NOW()",
      [normalizedEmail]
    );
    console.log("📧 Existing invites found:", existingInvite.rows.length);
    if (existingInvite.rows.length > 0) {
      console.log("📧 Existing invite details:", existingInvite.rows[0]);
      return res.status(400).json({ error: "Există deja o invitație activă pentru acest email" });
    }
    
    // Generează token și salvează invitația
    const token = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expiră în 7 zile
    
    const inviteId = crypto.randomUUID();
    await db.q(
      `INSERT INTO user_invites (id, email, first_name, last_name, role, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [inviteId, normalizedEmail, first_name || null, last_name || null, inviteRole, token, req.session.user.email || req.session.user.username, expiresAt]
    );
    
    // Trimite email
    const inviteLink = `${req.protocol}://${req.get('host')}/accept-invite.html?invite=${token}`;
    
    // Obține datele companiei
    const company = await getCompanyDetails();
    const companyName = company.name || 'openBill';
    console.log("📧 Company name for invite:", companyName);
    
    const fullName = [first_name, last_name].filter(Boolean).join(' ');
    const displayName = fullName || email;
    const inviterName = req.session.user.first_name && req.session.user.last_name 
      ? `${req.session.user.first_name} ${req.session.user.last_name}` 
      : req.session.user.username;
    const inviterEmail = req.session.user.email || 'support@openbill.ro';
    
    // Text pentru rol
    const roleText = inviteRole === 'admin' ? 'Administrator' : 'Utilizator';
    
    const emailSubject = `${inviterName} te invită în echipa ${companyName} pe openBill`;
    const emailText = `📋 openBill Platformă

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bună ${displayName},

${inviterName} te invită să te alături echipei ${companyName} pe openBill! 🎉

Rol: ${roleText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

openBill este platforma modernă pentru managementul stocurilor, facturilor și operațiunilor de business - totul într-un singur loc, simplu și intuitiv.

Pentru a-ți activa contul, accesează linkul de mai jos (valabil 7 zile):
👉 ${inviteLink}

Ai întrebări? Contactează-l pe ${inviterName} la ${inviterEmail}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

© 2026 openBill - Toate drepturile rezervate
https://openbill.ro
`;
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; background: #f1f5f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 30px; text-align: center; }
    .logo-container { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 15px; }
    .logo-icon { width: 45px; height: 45px; background: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    .logo-text { font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
    .company-name { font-size: 14px; opacity: 0.9; margin-top: 5px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .welcome-box { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; margin-bottom: 25px; }
    .welcome-box h3 { margin: 0 0 10px; color: #065f46; font-size: 18px; }
    .welcome-box p { margin: 0; color: #047857; font-size: 14px; }
    .inviter-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 25px; border-radius: 12px; margin: 25px 0; text-align: center; }
    .inviter-avatar { width: 60px; height: 60px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 24px; margin: 0 auto 15px; }
    .inviter-info h4 { margin: 0 0 8px; color: #1e293b; font-size: 20px; font-weight: 600; }
    .inviter-info p { margin: 0; color: #64748b; font-size: 15px; }
    .inviter-info .highlight { color: #0ea5e9; font-weight: 600; }
    .button-container { text-align: center; margin: 35px 0; }
    .button { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 18px 45px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 17px; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); transition: all 0.3s; }
    .button:hover { transform: translateY(-2px); box-shadow: 0 6px 25px rgba(16, 185, 129, 0.5); }
    .link-box { background: #f1f5f9; padding: 20px; border-radius: 10px; margin: 25px 0; }
    .link-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 600; }
    .link { word-break: break-all; color: #0ea5e9; font-family: monospace; font-size: 13px; background: #e0f2fe; padding: 12px; border-radius: 6px; }
    .expiry { text-align: center; color: #94a3b8; font-size: 14px; margin-top: 25px; padding: 15px; background: #fef3c7; border-radius: 8px; }
    .expiry strong { color: #d97706; }
    .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 30px 0; padding: 20px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
    .feature { text-align: center; padding: 15px; }
    .feature-icon { font-size: 28px; margin-bottom: 10px; }
    .feature-text { font-size: 13px; color: #64748b; font-weight: 500; }
    .footer { background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer p { margin: 5px 0; font-size: 13px; color: #94a3b8; }
    .footer a { color: #0ea5e9; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        <div class="logo-icon">📋</div>
        <div class="logo-text">openBill</div>
      </div>
      <div class="company-name">Echipa ${companyName}</div>
    </div>
    <div class="content">
      <div class="welcome-box">
        <h3>👋 Salut, ${displayName}!</h3>
        <p>Ai primit o invitație specială să faci parte din echipa noastră. Împreună vom construi succesul!</p>
      </div>
      
      <div class="inviter-box">
        <div class="inviter-avatar">${inviterName.charAt(0).toUpperCase()}</div>
        <div class="inviter-info">
          <h4>${inviterName}</h4>
          <p><span class="highlight">te invită să te alături echipei ${companyName} pe openBill</span></p>
          <p style="margin-top: 10px;"><span style="background: ${inviteRole === 'admin' ? '#8b5cf6' : '#10b981'}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${roleText}</span></p>
        </div>
      </div>

      <p style="color: #475569; font-size: 15px; line-height: 1.7;">
        <strong>openBill</strong> este soluția modernă pentru managementul stocurilor, facturilor și operațiunilor de business - totul într-un singur loc, simplu și intuitiv.
      </p>

      <div class="features">
        <div class="feature">
          <div class="feature-icon">📦</div>
          <div class="feature-text">Management Stocuri</div>
        </div>
        <div class="feature">
          <div class="feature-icon">📊</div>
          <div class="feature-text">Rapoarte Live</div>
        </div>
        <div class="feature">
          <div class="feature-icon">🤝</div>
          <div class="feature-text">Colaborare Echipă</div>
        </div>
      </div>

      <p style="text-align: center; color: #64748b; margin-bottom: 20px;">
        Gata să începi? Creează-ți contul acum:
      </p>

      <div class="button-container">
        <a href="${inviteLink}" class="button">Creează Contul Meu →</a>
      </div>

      <div class="link-box">
        <div class="link-label">Link alternativ (copiază și lipește în browser):</div>
        <div class="link">${inviteLink}</div>
      </div>

      <p class="expiry">⏰ Acest link este valabil <strong>7 zile</strong></p>

      <p style="text-align: center; color: #64748b; font-size: 13px; margin-top: 25px;">
        Ai întrebări? Contactează-l pe <strong>${inviterName}</strong> la <a href="mailto:${inviterEmail}">${inviterEmail}</a>
      </p>
    </div>
    
    <div class="footer">
      <p>Dacă nu tu ai solicitat această invitație, te rugăm să ignori acest email.</p>
      <p>© 2026 openBill - Toate drepturile rezervate | <a href="https://openbill.ro">openbill.ro</a></p>
    </div>
  </div>
</body>
</html>`;
    
    const emailResult = await sendEmailWithTimeout(normalizedEmail, emailSubject, emailHtml, emailText);
    console.log("📧 Email send result:", emailResult);
    console.log(`📧 Email result for ${email}:`, emailResult);
    
    res.json({ 
      ok: true, 
      message: emailResult.success 
        ? "Invitație trimisă cu succes pe email" 
        : "Invitație creată, dar emailul nu a putut fi trimis",
      inviteLink, // Pentru testare (doar dacă emailul eșuează)
      email: normalizedEmail,
      first_name,
      last_name,
      emailSent: emailResult.success
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invites - Lista invitații (doar admin)
app.get("/api/invites", isAdmin, async (req, res) => {
  try {
    const r = await db.q(
      `SELECT i.*, u.email as invited_by_email, u.first_name as invited_by_first_name, u.last_name as invited_by_last_name
       FROM user_invites i
       LEFT JOIN users u ON i.invited_by = u.email
       ORDER BY i.created_at DESC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invites/validate/:token - Validează un token de invitație
app.get("/api/invites/validate/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const r = await db.q(
      `SELECT email, first_name, last_name, status, expires_at
       FROM user_invites
       WHERE token = $1`,
      [token]
    );
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Invitație invalidă" });
    }
    
    const invite = r.rows[0];
    
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: "Invitația a fost deja folosită" });
    }
    
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: "Invitația a expirat" });
    }
    
    res.json({ ok: true, invite });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/invites/:id - Șterge o invitație (doar admin)
app.delete("/api/invites/:id", isAdmin, async (req, res) => {
  try {
    await db.q(
      "DELETE FROM user_invites WHERE id = $1",
      [req.params.id]
    );
    res.json({ ok: true, message: "Invitație ștearsă" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/invites/cleanup - Șterge toate invitațiile pentru un email (doar admin)
app.post("/api/invites/cleanup", isAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email obligatoriu" });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Vezi ce există înainte
    const before = await db.q(
      "SELECT id, status, created_at FROM user_invites WHERE email = $1",
      [normalizedEmail]
    );
    
    // Șterge toate invitațiile pentru acest email
    const result = await db.q(
      "DELETE FROM user_invites WHERE email = $1 RETURNING id",
      [normalizedEmail]
    );
    
    res.json({ 
      ok: true, 
      message: `Șterse ${result.rows.length} invitații pentru ${normalizedEmail}`,
      deleted: result.rows.length,
      found_before: before.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/test-email - Testează configurația email (doar admin)
app.get("/api/test-email", isAdmin, async (req, res) => {
  try {
    console.log("📧 Test email requested by:", req.session.user.username);
    console.log("📧 EMAIL_HOST:", process.env.EMAIL_HOST);
    console.log("📧 EMAIL_USER:", process.env.EMAIL_USER);
    console.log("📧 EMAIL_PASS length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);
    
    // Verifică dacă transporter e configurat
    if (!emailTransporter) {
      return res.json({
        ok: false,
        error: "Email transporter not configured - check env vars",
        config: {
          host: process.env.EMAIL_HOST || 'not set',
          user: process.env.EMAIL_USER || 'not set',
          passConfigured: !!process.env.EMAIL_PASS,
          passLength: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0
        }
      });
    }
    
    // Testează API SendGrid direct
    const isSendGrid = process.env.EMAIL_HOST && process.env.EMAIL_HOST.includes('sendgrid');
    if (isSendGrid) {
      console.log("📧 Testing SendGrid API...");
      const apiTest = await testSendGridAPI();
      if (!apiTest.success) {
        return res.json({
          ok: false,
          error: "SendGrid API test failed: " + apiTest.error,
          config: {
            host: process.env.EMAIL_HOST,
            user: process.env.EMAIL_USER,
            apiTest
          }
        });
      }
      console.log("📧 SendGrid API test passed!");
    }
    
    const testEmail = req.session.user.email || process.env.EMAIL_FROM || 'support@openbill.ro';
    console.log("📧 Sending test email to:", testEmail);
    
    const testResult = await sendEmailWithTimeout(
      testEmail,
      "Test openBill Email",
      "<h1>Test Email</h1><p>Acesta este un email de test.</p>",
      "Test Email - Acesta este un email de test."
    );
    
    console.log("📧 Test email result:", testResult);
    
    res.json({
      ok: testResult.success,
      message: testResult.success ? "Email de test trimis" : "Eroare la trimitere",
      error: testResult.error || null,
      config: {
        host: process.env.EMAIL_HOST || 'not set',
        user: process.env.EMAIL_USER || 'not set',
        passConfigured: !!process.env.EMAIL_PASS
      }
    });
  } catch (e) {
    console.error("📧 Test email error:", e);
    res.status(500).json({ 
      error: e.message,
      config: {
        host: process.env.EMAIL_HOST || 'not set',
        user: process.env.EMAIL_USER || 'not set',
        passConfigured: !!process.env.EMAIL_PASS
      }
    });
  }
});

// POST /api/invites/accept - Acceptă o invitație și creează cont
app.post("/api/invites/accept", async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: "Token și parola sunt obligatorii" });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: "Parola trebuie să aibă minim 6 caractere" });
    }
    
    // Găsește invitația
    const inviteRes = await db.q(
      `SELECT id, email, first_name, last_name, role, status, expires_at 
       FROM user_invites 
       WHERE token = $1`,
      [token]
    );
    
    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: "Invitație invalidă" });
    }
    
    const invite = inviteRes.rows[0];
    
    // Verifică status
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: "Invitația a fost deja folosită" });
    }
    
    // Verifică expirarea
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: "Invitația a expirat" });
    }
    
    // Verifică dacă există deja un utilizator cu acest email
    const existingUser = await db.q(
      "SELECT id FROM users WHERE email = $1",
      [invite.email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Există deja un cont cu acest email" });
    }
    
    // Hash parola async
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Creează utilizatorul cu rolul din invitație
    console.log("📧 Accept invite - invite.role:", invite.role);
    const userResult = await db.q(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, 
                          is_approved, active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, true, NOW())
       RETURNING id, email, role, first_name, last_name`,
      [invite.email, passwordHash, invite.role, invite.first_name, invite.last_name]
    );
    
    // Marchează invitația ca folosită
    await db.q(
      "UPDATE user_invites SET status = 'used', used_at = NOW() WHERE id = $1",
      [invite.id]
    );
    
    console.log(`✅ Cont creat pentru ${invite.email} cu rolul ${invite.role}`);
    
    res.json({
      ok: true,
      message: "Cont creat cu succes",
      user: userResult.rows[0]
    });
    
  } catch (e) {
    console.error("Eroare acceptare invitație:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/company-info-public - Info companie pentru pagina publică (fără auth)
app.get("/api/company-info-public", async (req, res) => {
  try {
    // Încearcă să obțină din company_settings
    const r = await db.q(`SELECT name, cui FROM company_settings WHERE id = 'default'`);
    if (r.rows.length > 0) {
      return res.json({
        name: r.rows[0].name || 'openBill',
        cui: r.rows[0].cui || ''
      });
    }
    
    res.json({ name: 'openBill', cui: '' });
  } catch (e) {
    res.json({ name: 'openBill', cui: '' });
  }
});

// POST /api/invites/:id/resend - Retrimite o invitație (doar admin)
app.post("/api/invites/:id/resend", isAdmin, async (req, res) => {
  try {
    // Obține datele invitației
    const r = await db.q(
      "SELECT * FROM user_invites WHERE id = $1",
      [req.params.id]
    );
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Invitație negăsită" });
    }
    
    const invite = r.rows[0];
    
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: "Invitația nu mai este activă" });
    }
    
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: "Invitația a expirat" });
    }
    
    // Generează linkul
    const inviteLink = `${req.protocol}://${req.get('host')}/accept-invite.html?invite=${invite.token}`;
    
    // Trimite email
    const fullName = [invite.first_name, invite.last_name].filter(Boolean).join(' ');
    const displayName = fullName || invite.email;
    
    const emailSubject = "Invitație pentru cont openBill";
    const emailText = `Bună ${displayName},\n\nAi fost invitat să te alături platformei openBill.\n\nPentru a-ți crea contul, accesează linkul de mai jos:\n${inviteLink}\n\nEchipa openBill`;
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1>🎉 Invitație openBill</h1>
    </div>
    <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Bună <strong>${displayName}</strong>,</p>
      <p>Ai fost invitat să te alături platformei <strong>openBill</strong>.</p>
      <p><a href="${inviteLink}" style="display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">Creează contul</a></p>
      <p>Sau copiază linkul: ${inviteLink}</p>
      <p><small>Linkul este valabil până la ${new Date(invite.expires_at).toLocaleDateString('ro-RO')}.</small></p>
    </div>
  </div>
</body>
</html>`;
    
    const emailResult = await sendEmail(invite.email, emailSubject, emailHtml, emailText);
    
    res.json({ 
      ok: true, 
      message: emailResult.success ? "Email retrimis" : "Emailul nu a putut fi trimis",
      inviteLink,
      emailSent: emailResult.success
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint pentru schimbarea parolei
app.post('/api/schimba-parola', async (req, res) => {
  const { username, parolaVeche, parolaNoua } = req.body;
  
  if (!username || !parolaVeche || !parolaNoua) {
    return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
  }

  if (parolaNoua.length < 6) {
    return res.status(400).json({ error: 'Parola nouă trebuie să aibă minim 6 caractere' });
  }

  try {
    // Verifică parola veche - FOLOSEȘTE db.q și password_hash
    const userResult = await db.q(
      'SELECT password_hash FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizator negăsit' });
    }

    const validPassword = await bcrypt.compare(parolaVeche, userResult.rows[0].password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Parola veche este incorectă' });
    }

    // Hash parola nouă
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(parolaNoua, saltRounds);

    // Update în baza de date - FOLOSEȘTE db.q
    await db.q(
      'UPDATE users SET password_hash = $1 WHERE username = $2',
      [hashedPassword, username]
    );

    res.json({ message: 'Parola a fost schimbată cu succes' });
  } catch (error) {
    console.error('Eroare schimbare parolă:', error);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// ==========================================
// SMARTBILL TEST - de activat mâine cu token
// ==========================================

const SMARTBILL_CIF_TEST = 'RO12345678'; // CUI Al Shefa (completezi mâine)

// Test endpoint: http://localhost:3000/test-smartbill
app.get('/test-smartbill', async (req, res) => {
  if (!SMARTBILL_TOKEN) {
    return res.status(500).json({ error: 'Token SmartBill lipsă. Setează SMARTBILL_TOKEN în .env' });
  }

  try {
    console.log('=== TEST SMARTBILL ===');
    
    // 1. Facturi
    const facturiRes = await fetch(
      `https://api.smartbill.ro/invoice?cifClient=${SMARTBILL_CIF_TEST}`, 
      {
        headers: {
          'Authorization': SMARTBILL_TOKEN,
          'Accept': 'application/json'
        }
      }
    );
    
    if (!facturiRes.ok) throw new Error(`HTTP ${facturiRes.status}`);
    const facturiData = await facturiRes.json();
    
    // 2. Plăți
    const platiRes = await fetch(
      `https://api.smartbill.ro/payment?clientCif=${SMARTBILL_CIF_TEST}`,
      {
        headers: {
          'Authorization': SMARTBILL_TOKEN,
          'Accept': 'application/json'
        }
      }
    );
    
    const platiData = await platiRes.json();
    
    // 3. Calcul sold
    const totalFacturi = (facturiData.list || []).reduce((sum, f) => sum + (f.totalValue || 0), 0);
    const totalPlati = (platiData.list || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({
      success: true,
      client: SMARTBILL_CIF_TEST,
      sold: totalFacturi - totalPlati,
      totalFacturi,
      totalPlati,
      numarFacturi: facturiData.list?.length || 0,
      facturi: facturiData.list?.slice(0, 3), // Primele 3 facturi
      raw: { facturi: facturiData, plati: platiData } // Tot răspunsul brut
    });
    
  } catch (error) {
    console.error('Eroare SmartBill:', error);
    res.status(500).json({ error: error.message });
  }
});








const PORT = process.env.PORT || 3000;

// Creează un admin implicit (doar dacă tabela users e goală)
async function ensureDefaultAdmin() {
  if (!db.hasDb()) return;

  // Dacă nu există niciun user, creăm adminul implicit
  const r = await db.q("SELECT COUNT(*)::int AS n FROM users");
  const n = r.rows?.[0]?.n ?? 0;
  
  if (n > 0) return; // Există deja useri, nu creăm nimic automat

  const username = String(process.env.ADMIN_USER || "admin").trim();
  const password = String(process.env.ADMIN_PASS || "admin").trim();

  if (!username || !password) {
    console.warn("⚠️ ADMIN_USER/ADMIN_PASS lipsesc -> sar peste crearea adminului implicit.");
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await db.q(
    "INSERT INTO users (username, password_hash, role, is_approved, active) VALUES ($1, $2, $3, true, true)",
    [username, hash, "admin"]
  );

  console.log(`✅ Admin implicit creat: ${username} (aprobat automat)`);
}

async function seedInitialData() {
  if (!db.hasDb()) return;

  try {
    // ȘOFERI
    const soferi = [
      "Calinescu Andrei-Alexandru",
      "Paun Rares-Alexandru", 
      "Cristiana Paun"
    ];

    for (const nume of soferi) {
      // Verifică dacă există deja
      const check = await db.q(
        `SELECT id FROM drivers WHERE name = $1`,
        [nume]
      );
      
      if (check.rows.length === 0) {
        const id = crypto.randomUUID();
        await db.q(
          `INSERT INTO drivers (id, name, active) VALUES ($1, $2, true)`,
          [id, nume]
        );
        console.log(`✅ Șofer adăugat: ${nume}`);
      } else {
        console.log(`ℹ️ Șoferul există deja: ${nume}`);
      }
    }

    // MAȘINI (Numere de înmatriculare)
    const masini = ["DJ05FMD", "DJ50FMD"];
    
    for (const numar of masini) {
      // Verifică dacă există deja
      const check = await db.q(
        `SELECT id FROM vehicles WHERE plate_number = $1`,
        [numar]
      );
      
      if (check.rows.length === 0) {
        const id = crypto.randomUUID();
        await db.q(
          `INSERT INTO vehicles (id, plate_number, active) VALUES ($1, $2, true)`,
          [id, numar]
        );
        console.log(`✅ Mașină adăugată: ${numar}`);
      } else {
        console.log(`ℹ️ Mașina există deja: ${numar}`);
      }
    }
    
    console.log("✅ Date inițiale verificate/adăugate cu succes!");
  } catch (e) {
    console.error("❌ Eroare la adăugarea datelor inițiale:", e.message);
  }
}

 // ==========================================
// API ȘOFERI
// ==========================================
app.get("/api/drivers", async (req, res) => {
  try {
    const r = await db.q(`SELECT id, name, active FROM drivers WHERE active=true ORDER BY name`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/drivers", isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const id = crypto.randomUUID();
    await db.q(`INSERT INTO drivers (id, name) VALUES ($1,$2)`, [id, name]);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// API MAȘINI
// ==========================================
app.get("/api/vehicles", async (req, res) => {
  try {
    const r = await db.q(`SELECT id, plate_number, active FROM vehicles WHERE active=true ORDER BY plate_number`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/vehicles", isAdmin, async (req, res) => {
  try {
    const { plate_number } = req.body;
    const id = crypto.randomUUID();
    await db.q(`INSERT INTO vehicles (id, plate_number) VALUES ($1,$2)`, [id, plate_number.toUpperCase()]);
    res.json({ ok: true, id });
  } catch (e) {
    if (e.message.includes("unique")) return res.status(400).json({ error: "Numărul există deja" });
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// API FOi DE PARCURS
// ==========================================
app.get("/api/trip-sheets", async (req, res) => {
  try {
    const r = await db.q(`
      SELECT 
        t.id, t.date, t.km_start, t.km_end, t.locations, 
        t.trip_number, t.departure_time, t.arrival_time, 
        t.purpose, t.tech_check_departure, t.tech_check_arrival,
        t.created_at,
        d.name as driver_name,
        v.plate_number
      FROM trip_sheets t
      JOIN drivers d ON t.driver_id = d.id
      JOIN vehicles v ON t.vehicle_id = v.id
      ORDER BY t.date DESC
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/trip-sheets", async (req, res) => {
  try {
    const { 
      date, driver_id, vehicle_id, km_start, locations,
      trip_number, departure_time, arrival_time, purpose,
      tech_check_departure, tech_check_arrival 
    } = req.body;
    
    const id = crypto.randomUUID();
    
    await db.q(`
      INSERT INTO trip_sheets (
        id, date, driver_id, vehicle_id, km_start, locations,
        trip_number, departure_time, arrival_time, purpose,
        tech_check_departure, tech_check_arrival, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      id, date, driver_id, vehicle_id, km_start, locations || '',
      trip_number, departure_time, arrival_time, purpose,
      tech_check_departure || false, tech_check_arrival || false,
      req.session.user.username
    ]);
    
    res.json({ ok: true, id, trip_number });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/trip-sheets/:id", async (req, res) => {
  try {
    const { km_end, locations } = req.body;
    const r = await db.q(`
      UPDATE trip_sheets 
      SET km_end = $1, locations = $2
      WHERE id = $3
      RETURNING km_start, km_end
    `, [km_end, locations, req.params.id]);
    
    if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
    
    const km_total = r.rows[0].km_end - r.rows[0].km_start;
    res.json({ ok: true, km_total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/trip-sheets/:id", async (req, res) => {
  try {
    await db.q(`DELETE FROM trip_sheets WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET ultimul KM pentru o mașină
app.get("/api/vehicles/:id/last-km", async (req, res) => {
  try {
    const vehicleId = req.params.id;
    
    // Caută ultima foaie de parcurs pentru această mașină (cea mai mare dată + km_end existent)
    const r = await db.q(`
      SELECT km_end 
      FROM trip_sheets 
      WHERE vehicle_id = $1 AND km_end IS NOT NULL
      ORDER BY date DESC, created_at DESC 
      LIMIT 1
    `, [vehicleId]);
    
    if (r.rows.length > 0 && r.rows[0].km_end) {
      res.json({ lastKm: parseInt(r.rows[0].km_end) });
    } else {
      res.json({ lastKm: 0 }); // Dacă nu există istoric, începe de la 0
    }
  } catch (e) {
    console.error("Eroare la obținerea ultimului KM:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/trip-sheets", async (req, res) => {
  try {
    const { 
      date, driver_id, vehicle_id, km_start, locations,
      trip_number, departure_time, arrival_time, purpose,
      tech_check_departure, tech_check_arrival 
    } = req.body;
    
    // Validare: Verifică dacă există deja o foaie cu KM mai mare pentru această mașină
    const lastKmCheck = await db.q(`
      SELECT km_end FROM trip_sheets 
      WHERE vehicle_id = $1 AND km_end IS NOT NULL
      ORDER BY date DESC, created_at DESC 
      LIMIT 1
    `, [vehicle_id]);
    
    if (lastKmCheck.rows.length > 0) {
      const lastKm = parseInt(lastKmCheck.rows[0].km_end);
      if (km_start < lastKm) {
        return res.status(400).json({ 
          error: `KM Plecare (${km_start}) nu poate fi mai mic decât ultimul KM înregistrat (${lastKm})` 
        });
      }
    }
    
    const id = crypto.randomUUID();
    
    await db.q(`
      INSERT INTO trip_sheets (
        id, date, driver_id, vehicle_id, km_start, locations,
        trip_number, departure_time, arrival_time, purpose,
        tech_check_departure, tech_check_arrival, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      id, date, driver_id, vehicle_id, km_start, locations || '',
      trip_number, departure_time, arrival_time, purpose,
      tech_check_departure || false, tech_check_arrival || false,
      req.session.user.username
    ]);
    
    res.json({ ok: true, id, trip_number });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// API BONURI ALIMENTARE
// ==========================================
app.get("/api/trip-sheets/:id/fuel-receipts", async (req, res) => {
  try {
    const r = await db.q(`
      SELECT id, type, receipt_number, liters, km_at_refuel 
      FROM fuel_receipts 
      WHERE trip_sheet_id = $1 
      ORDER BY km_at_refuel
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/trip-sheets/:id/fuel-receipts", async (req, res) => {
  try {
    const { type, receipt_number, liters, km_at_refuel } = req.body;
    const id = crypto.randomUUID();
    
    await db.q(`
      INSERT INTO fuel_receipts (id, trip_sheet_id, type, receipt_number, liters, km_at_refuel)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [id, req.params.id, type, receipt_number, liters, km_at_refuel]);
    
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/fuel-receipts/:id", async (req, res) => {
  try {
    await db.q(`DELETE FROM fuel_receipts WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ==========================================
// SOLDURI CLIENȚI (Raport facturi scadente)
// ==========================================

// TEST - să vedem dacă serverul răspunde
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "Server funcționează!" });
});

// POST /api/balances/upload - Încarcă raportul Excel cu facturi scadente

app.post("/api/balances/upload", async (req, res) => {
  try {
    const { invoices } = req.body;
    
    if (!invoices || !Array.isArray(invoices)) {
      return res.status(400).json({ error: "Date invalide. Trimite array de facturi." });
    }
    
    // ȘTERGE TOATE datele vechi (nu doar cele de 24h) - curăță complet
    await db.q(`DELETE FROM client_balances`);
    
    // Găsim clienții după CUI pentru matching
    const clientsRes = await db.q(`SELECT id, cui FROM clients WHERE cui IS NOT NULL`);
    const clientsByCui = {};
    clientsRes.rows.forEach(c => {
      const cuiCurat = String(c.cui).replace(/^RO/i, '').replace(/\s/g, '').trim();
      clientsByCui[cuiCurat] = c.id;
    });
    
    // Inserăm cu ON CONFLICT (protecție dublă la duplicat)
    let inserted = 0;
    for (const inv of invoices) {
      const cuiCurat = String(inv.cui || '').replace(/^RO/i, '').replace(/\s/g, '').trim();
      const clientId = clientsByCui[cuiCurat] || null;
      
      // Verificăm dacă factura există deja pentru acest client (extra safety)
      const check = await db.q(
        `SELECT 1 FROM client_balances WHERE client_id = $1 AND invoice_number = $2 LIMIT 1`,
        [clientId, inv.invoice_number]
      );
      
      if (check.rows.length === 0) {
        await db.q(`
          INSERT INTO client_balances 
          (client_id, cui, invoice_number, invoice_date, due_date, currency, total_value, balance_due, days_overdue, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          clientId, inv.cui, inv.invoice_number, inv.invoice_date, inv.due_date,
          inv.currency, inv.total_value, inv.balance_due, inv.days_overdue, inv.status
        ]);
        inserted++;
      }
    }
    
    res.json({ success: true, inserted, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("Upload balances error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/clients/:id/balances", async (req, res) => {
  try {
    const clientId = String(req.params.id);
    
    // Luăm facturile pentru clientul specific
    const result = await db.q(`
      SELECT * FROM client_balances 
      WHERE client_id = $1 
      ORDER BY due_date ASC
    `, [clientId]);
    
    // Luăm data ultimei încărcări din TOT tabelul (global pentru toți clienții)
    const lastUploadRes = await db.q(`
      SELECT MAX(uploaded_at) as last_upload 
      FROM client_balances
    `);
    
    const lastUpload = lastUploadRes.rows[0]?.last_upload || new Date().toISOString();
    
    if (result.rows.length === 0) {
      return res.json({ 
        expired: false, 
        lastUpload: lastUpload,  // Data când s-a încărcat Excelul pentru toți
        invoices: [], 
        totalBalance: 0,
        message: "Nu sunt facturi scadente pentru acest client" 
      });
    }
    
    const total = result.rows.reduce((sum, r) => sum + parseFloat(r.balance_due || 0), 0);
    
    res.json({
      expired: false,
      lastUpload: lastUpload,  // Aceeași dată pentru toți clienții
      invoices: result.rows,
      totalBalance: total,
      count: result.rows.length
    });
  } catch (e) {
    console.error("Get balances error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST adaugă preț special (folosește JSONB)
app.post("/api/clients/:id/prices", async (req, res) => {
  try {
    const { id } = req.params;
    const { product_id, special_price } = req.body;
    
    console.log("📊 POST /api/clients/:id/prices received:");
    console.log("  - client_id:", id);
    console.log("  - product_id:", product_id);
    console.log("  - special_price:", special_price);
    console.log("  - typeof special_price:", typeof special_price);
    
    // Validare
    if (!product_id) {
      return res.status(400).json({ error: "ID produs lipsă" });
    }
    
    const priceValue = Number(special_price);
    console.log("  - Number(special_price):", priceValue);
    console.log("  - Number.isFinite:", Number.isFinite(priceValue));
    
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return res.status(400).json({ error: "Preț invalid. Trebuie să fie un număr mai mare decât 0." });
    }
    
    // Ia prețurile curente
    const r = await db.q(
      `SELECT prices FROM clients WHERE id = $1`,
      [id]
    );
    
    if (!r.rows.length) return res.status(404).json({ error: "Client negăsit" });
    
    const prices = r.rows[0].prices || {};
    prices[String(product_id)] = priceValue;
    
    // Salvează
    await db.q(
      `UPDATE clients SET prices = $1::jsonb WHERE id = $2`,
      [JSON.stringify(prices), id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error("Eroare adăugare preț:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// GET prețuri speciale pentru client
app.get("/api/clients/:id/prices", async (req, res) => {
  try {
    const id = String(req.params.id);
    
    // Ia prețurile din client
    const r = await db.q(`SELECT prices FROM clients WHERE id = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: "Client negăsit" });
    
    const prices = r.rows[0].prices || {};
    const productIds = Object.keys(prices);
    
    if (productIds.length === 0) return res.json({ prices: [] });
    
    // Ia detaliile produselor din tabela products
    const productsRes = await db.q(
      `SELECT id, name, gtin, price as standard_price 
       FROM products 
       WHERE id = ANY($1::text[])`,
      [productIds]
    );
    
    const productsMap = {};
    productsRes.rows.forEach(p => productsMap[p.id] = p);
    
    // Combină datele
    const pricesWithDetails = Object.entries(prices).map(([productId, specialPrice]) => {
      const prod = productsMap[productId] || {};
      return {
        product_id: productId,
        product_name: prod.name || 'Produs necunoscut',
        gtin: prod.gtin || '-',
        standard_price: prod.standard_price || 0,
        special_price: specialPrice
      };
    });
    
    res.json({ prices: pricesWithDetails });
  } catch (err) {
    console.error("Eroare GET prices:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// DELETE preț special
app.delete("/api/clients/:id/prices/:productId", async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    // Ia prețurile curente
    const r = await db.q(
      `SELECT prices FROM clients WHERE id = $1`,
      [id]
    );
    
    if (!r.rows.length) return res.status(404).json({ error: "Client negăsit" });
    
    const prices = r.rows[0].prices || {};
    delete prices[String(productId)];
    
    // Salvează
    await db.q(
      `UPDATE clients SET prices = $1::jsonb WHERE id = $2`,
      [JSON.stringify(prices), id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error("Eroare stergere pret:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// POST import produse din JSON
app.post("/api/import-products", async (req, res) => {
  try {
    if (!db.hasDb()) {
      return res.status(500).json({ error: "Baza de date nu este configurată" });
    }
    
    const list = readProductsAsList();
    let added = 0;
    let updated = 0;
    
    for (const p of list) {
      const name = String(p.name || "").trim();
      if (!name) continue;
      
      const id = (p.id != null && String(p.id).trim() !== "") ? String(p.id) : crypto.randomUUID();
      const gtinClean = normalizeGTIN(p.gtin || "") || null;
      
      const gtinsArr = []
        .concat(gtinClean ? [gtinClean] : [])
        .concat(Array.isArray(p.gtins) ? p.gtins : [])
        .map(normalizeGTIN)
        .filter(Boolean);
      
      const category = String(p.category || "Altele").trim() || "Altele";
      const price = (p.price != null && p.price !== "") ? Number(p.price) : null;
      
      // Verifică dacă produsul există deja
      const checkRes = await db.q(`SELECT id FROM products WHERE id = $1`, [id]);
      const exists = checkRes.rows.length > 0;
      
      await db.q(
        `INSERT INTO products (id, name, gtin, gtins, category, price, active)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           gtin = EXCLUDED.gtin,
           gtins = EXCLUDED.gtins,
           category = EXCLUDED.category,
           price = EXCLUDED.price,
           active = true`,
        [id, name, gtinClean, JSON.stringify(gtinsArr), category, 
         (Number.isFinite(price) ? price : null)]
      );
      
      if (exists) {
        updated++;
      } else {
        added++;
      }
    }
    
    console.log(`✅ Import produse finalizat: ${added} adăugate, ${updated} actualizate`);
    res.json({ success: true, added, updated, total: list.length });
    
  } catch (err) {
    console.error("Eroare import produse:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// GET căutare produse
app.get("/api/products/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    
    const r = await db.q(
      `SELECT id, name, gtin, price 
       FROM products 
       WHERE (name ILIKE $1 OR gtin ILIKE $1) AND active = true
       LIMIT 10`,
      [`%${q}%`]
    );
    
    res.json(r.rows);
  } catch (err) {
    console.error("Eroare căutare:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ==========================================
// MULTI-TENANT AUTH API
// ==========================================

// Helper: Generare cod verificare 6 cifre
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Generare schema name din company name
function generateSchemaName(companyName) {
  const normalized = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 20);
  const random = Math.random().toString(36).substring(2, 8);
  return `tenant_${normalized}_${random}`;
}

// POST /api/auth/register - Înregistrare nouă companie
app.post("/api/auth/register", async (req, res) => {
  try {
    const { companyName, cui, email, password, firstName, lastName, phone, address, city } = req.body;
    
    // Validare
    if (!companyName || !email || !password) {
      return res.status(400).json({ error: "Companie, email și parolă sunt obligatorii" });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: "Parola trebuie să aibă minim 6 caractere" });
    }
    
    const emailClean = email.toLowerCase().trim();
    
    // Verificăm dacă emailul e deja folosit
    const existingCheck = await db.q(
      `SELECT 1 FROM public.companies WHERE admin_email = $1`,
      [emailClean]
    );
    
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({ error: "Acest email este deja înregistrat" });
    }
    
    // Generăm schema name unic
    const schemaName = generateSchemaName(companyName);
    const companyId = crypto.randomUUID();
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minute
    const trialExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 zile
    
    // Hash parolă
    const bcrypt = require("bcrypt");
    const passwordHash = await bcrypt.hash(password, 10);
    
    // 1. Inserăm în public.companies
    await db.q(`
      INSERT INTO public.companies (id, schema_name, admin_email, name, cui, address, city, phone, status, trial_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_verification', $9)
    `, [companyId, schemaName, emailClean, companyName, cui || '', address || '', city || '', phone || '', trialExpiresAt]);
    
    // 2. Creăm schema și tabelele
    await db.createTenantSchema(schemaName, {
      name: companyName,
      cui: cui || '',
      address: address || '',
      city: city || '',
      phone: phone || ''
    });
    
    // 3. Inserăm userul admin în schema nouă
    await db.q(`
      INSERT INTO ${schemaName}.users (email, password_hash, role, is_approved, email_verified, email_verification_code, email_verification_expires_at, first_name, last_name, phone)
      VALUES ($1, $2, 'superadmin', true, false, $3, $4, $5, $6, $7)
    `, [emailClean, passwordHash, verificationCode, codeExpiresAt, firstName || '', lastName || '', phone || '']);
    
    // 4. Trimitem email cu codul
    const emailSubject = 'Verificare cont openBill';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Bun venit în openBill!</h2>
        <p>Mulțumim pentru înregistrare, <strong>${firstName || ''} ${lastName || ''}</strong>.</p>
        <p>Pentru a activa contul companiei <strong>${companyName}</strong>, folosește codul de mai jos:</p>
        <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${verificationCode}</span>
        </div>
        <p style="color: #dc2626;"><strong>Important:</strong> Codul expiră în 10 minute.</p>
        <p>Dacă nu ai solicitat acest cont, ignoră acest email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px;">openBill - Sistem de Management pentru Distribuție Medicală</p>
      </div>
    `;
    const emailText = `Bun venit în openBill!\n\nCodul tău de verificare este: ${verificationCode}\n\nAcest cod expiră în 10 minute.\n\nDacă nu ai solicitat acest cont, ignoră acest email.`;
    
    const emailResult = await sendEmailViaSendGridAPI(emailClean, emailSubject, emailHtml, emailText);
    
    if (!emailResult.success) {
      console.error("Eroare trimitere email:", emailResult.error);
      // Continuăm chiar dacă emailul nu a fost trimis - logăm codul în consolă
      console.log(`\n📧 EMAIL DE VERIFICARE (fallback console) pentru ${emailClean}:`);
      console.log(`   Cod: ${verificationCode}`);
    } else {
      console.log(`✅ Email de verificare trimis către ${emailClean}`);
    }
    
    res.json({
      success: true,
      message: "Cont creat. Verifică emailul pentru cod.",
      email: emailClean,
      // În development returnăm codul pentru testare
      _dev_code: verificationCode
    });
    
  } catch (err) {
    console.error("Eroare înregistrare:", err);
    res.status(500).json({ error: err.message || "Eroare server" });
  }
});

// POST /api/auth/verify-email - Verificare cod
app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: "Email și cod sunt obligatorii" });
    }
    
    const emailClean = email.toLowerCase().trim();
    
    // Găsim compania
    const companyRes = await db.q(
      `SELECT id, schema_name, status FROM public.companies WHERE admin_email = $1`,
      [emailClean]
    );
    
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: "Cont negăsit" });
    }
    
    const company = companyRes.rows[0];
    
    if (company.status !== 'pending_verification') {
      return res.status(400).json({ error: "Email deja verificat sau cont suspendat" });
    }
    
    // Verificăm codul în schema tenant
    const userRes = await db.q(`
      SELECT email_verification_code, email_verification_expires_at
      FROM ${company.schema_name}.users
      WHERE email = $1
    `, [emailClean]);
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Utilizator negăsit în sistem" });
    }
    
    const user = userRes.rows[0];
    
    // Verificăm expirarea
    if (new Date() > new Date(user.email_verification_expires_at)) {
      return res.status(410).json({ error: "Cod expirat. Solicită un cod nou." });
    }
    
    // Verificăm codul
    if (user.email_verification_code !== code) {
      return res.status(400).json({ error: "Cod incorect" });
    }
    
    // Marcăm ca verificat
    await db.q(`
      UPDATE ${company.schema_name}.users
      SET email_verified = true, 
          email_verification_code = NULL,
          email_verification_expires_at = NULL
      WHERE email = $1
    `, [emailClean]);
    
    // Actualizăm status companie
    await db.q(`
      UPDATE public.companies
      SET status = 'trial'
      WHERE id = $1
    `, [company.id]);
    
    res.json({
      success: true,
      message: "Email verificat cu succes!",
      redirect: "/login.html"
    });
    
  } catch (err) {
    console.error("Eroare verificare email:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// POST /api/auth/resend-code - Retrimitere cod
app.post("/api/auth/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email obligatoriu" });
    }
    
    const emailClean = email.toLowerCase().trim();
    
    // Găsim compania
    const companyRes = await db.q(
      `SELECT schema_name, status FROM public.companies WHERE admin_email = $1`,
      [emailClean]
    );
    
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: "Cont negăsit" });
    }
    
    const company = companyRes.rows[0];
    
    if (company.status !== 'pending_verification') {
      return res.status(400).json({ error: "Email deja verificat" });
    }
    
    // Verificăm limitele de retry
    const userRes = await db.q(`
      SELECT resend_attempts, resend_last_try
      FROM ${company.schema_name}.users
      WHERE email = $1
    `, [emailClean]);
    
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Utilizator negăsit" });
    }
    
    const user = userRes.rows[0];
    
    // Max 3 încercări totale
    if (user.resend_attempts >= 3) {
      return res.status(429).json({ error: "Prea multe încercări. Creează un cont nou." });
    }
    
    // Cooldown 60 secunde
    if (user.resend_last_try) {
      const lastTry = new Date(user.resend_last_try);
      const now = new Date();
      const diffSeconds = (now - lastTry) / 1000;
      
      if (diffSeconds < 60) {
        const waitSeconds = Math.ceil(60 - diffSeconds);
        return res.status(429).json({ 
          error: `Așteaptă ${waitSeconds} secunde înainte să soliciți un nou cod.` 
        });
      }
    }
    
    // Generăm cod nou
    const newCode = generateVerificationCode();
    const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Actualizăm
    await db.q(`
      UPDATE ${company.schema_name}.users
      SET email_verification_code = $1,
          email_verification_expires_at = $2,
          resend_attempts = resend_attempts + 1,
          resend_last_try = NOW()
      WHERE email = $3
    `, [newCode, newExpiresAt, emailClean]);
    
    // Trimitem email cu codul nou
    const resendSubject = 'Cod nou de verificare - openBill';
    const resendHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Cod nou de verificare</h2>
        <p>Ai solicitat un nou cod de verificare pentru contul tău openBill.</p>
        <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${newCode}</span>
        </div>
        <p style="color: #dc2626;"><strong>Important:</strong> Codul expiră în 10 minute.</p>
        <p>Dacă nu ai solicitat acest cod, ignoră acest email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px;">openBill - Sistem de Management pentru Distribuție Medicală</p>
      </div>
    `;
    const resendText = `Cod nou de verificare openBill\n\nCodul tău este: ${newCode}\n\nAcest cod expiră în 10 minute.`;
    
    const resendResult = await sendEmailViaSendGridAPI(emailClean, resendSubject, resendHtml, resendText);
    
    if (!resendResult.success) {
      console.error("Eroare trimitere email resend:", resendResult.error);
      console.log(`\n📧 EMAIL RESEND (fallback console) pentru ${emailClean}:`);
      console.log(`   Cod: ${newCode}`);
    } else {
      console.log(`✅ Email resend trimis către ${emailClean} (încercarea ${user.resend_attempts + 1}/3)`);
    }
    
    res.json({
      success: true,
      message: "Cod nou trimis. Verifică emailul.",
      _dev_code: newCode
    });
    
  } catch (err) {
    console.error("Eroare resend code:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// GET /api/auth/check-email - Verifică dacă emailul există (pentru login)
app.get("/api/auth/check-email", async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: "Email obligatoriu" });
    }
    
    const emailClean = email.toLowerCase().trim();
    
    const result = await db.q(
      `SELECT status, trial_expires_at FROM public.companies WHERE admin_email = $1`,
      [emailClean]
    );
    
    if (result.rows.length === 0) {
      return res.json({ exists: false });
    }
    
    const company = result.rows[0];
    
    // Verificăm dacă trialul a expirat
    if (company.status === 'trial' && company.trial_expires_at) {
      if (new Date() > new Date(company.trial_expires_at)) {
        // Actualizăm status
        await db.q(
          `UPDATE public.companies SET status = 'trial_expired' WHERE admin_email = $1`,
          [emailClean]
        );
        company.status = 'trial_expired';
      }
    }
    
    res.json({
      exists: true,
      status: company.status,
      canLogin: company.status === 'trial' || company.status === 'active'
    });
    
  } catch (err) {
    console.error("Eroare check email:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ==========================================
// FORGOT PASSWORD / RESET PASSWORD
// ==========================================

// Tabel pentru reset tokens (va fi creat automat în schema fiecărei companii)
async function ensurePasswordResetTable() {
  try {
    await db.q(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.q(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`);
    await db.q(`CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email)`);
  } catch (e) {
    console.error("Eroare creare tabel password_resets:", e.message);
  }
}

// POST /api/auth/forgot-password - Cere resetare parolă
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    await ensurePasswordResetTable();
    
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email obligatoriu" });
    }
    
    const emailClean = email.toLowerCase().trim();
    
    // Verifică dacă utilizatorul există
    const userRes = await db.q(
      "SELECT id, email, first_name, last_name FROM users WHERE email = $1",
      [emailClean]
    );
    
    // Nu dezvăluim dacă emailul există sau nu (securitate)
    if (userRes.rows.length === 0) {
      console.log(`📧 Forgot password requested for non-existent email: ${emailClean}`);
      return res.json({ 
        ok: true, 
        message: "Dacă există un cont cu acest email, vei primi un link de resetare." 
      });
    }
    
    const user = userRes.rows[0];
    
    // Generează token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Expiră în 1 oră
    
    // Salvează token
    await db.q(
      `INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)`,
      [emailClean, token, expiresAt]
    );
    
    // Trimite email
    const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
    
    const emailSubject = 'Resetare parolă openBill';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3b82f6;">Resetare parolă</h2>
        <p>Salut <strong>${user.first_name || ''} ${user.last_name || ''}</strong>,</p>
        <p>Ai solicitat resetarea parolei pentru contul tău openBill.</p>
        <p>Click pe butonul de mai jos pentru a seta o parolă nouă:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block;">Resetează parola</a>
        </div>
        <p>Sau copiază linkul în browser:</p>
        <p style="word-break: break-all; color: #64748b;">${resetLink}</p>
        <p style="color: #dc2626;"><strong>Atenție:</strong> Linkul expiră în 1 oră.</p>
        <p>Dacă nu tu ai solicitat resetarea, ignoră acest email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 12px;">openBill - Sistem de Management pentru Distribuție Medicală</p>
      </div>
    `;
    const emailText = `Resetare parolă openBill\n\nSalut,\n\nAi solicitat resetarea parolei.\n\nAccesează linkul:\n${resetLink}\n\nLinkul expiră în 1 oră.\n\nDacă nu tu ai solicitat, ignoră acest email.`;
    
    const emailResult = await sendEmailViaSendGridAPI(emailClean, emailSubject, emailHtml, emailText);
    
    if (!emailResult.success) {
      console.error("Eroare trimitere email reset:", emailResult.error);
    } else {
      console.log(`✅ Email resetare trimis către ${emailClean}`);
    }
    
    res.json({ 
      ok: true, 
      message: "Dacă există un cont cu acest email, vei primi un link de resetare." 
    });
    
  } catch (err) {
    console.error("Eroare forgot password:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// GET /api/auth/validate-reset-token - Validează token de resetare
app.get("/api/auth/validate-reset-token", async (req, res) => {
  try {
    await ensurePasswordResetTable();
    
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: "Token lipsă" });
    }
    
    const result = await db.q(
      `SELECT * FROM password_resets 
       WHERE token = $1 
         AND used = false 
         AND expires_at > NOW()`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Token invalid sau expirat" });
    }
    
    res.json({ ok: true });
    
  } catch (err) {
    console.error("Eroare validare token:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// POST /api/auth/reset-password - Resetează parola
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    await ensurePasswordResetTable();
    
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: "Token și parola sunt obligatorii" });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: "Parola trebuie să aibă minim 6 caractere" });
    }
    
    // Găsește token valid
    const resetRes = await db.q(
      `SELECT * FROM password_resets 
       WHERE token = $1 
         AND used = false 
         AND expires_at > NOW()`,
      [token]
    );
    
    if (resetRes.rows.length === 0) {
      return res.status(400).json({ error: "Token invalid sau expirat" });
    }
    
    const reset = resetRes.rows[0];
    
    // Hash noua parolă async
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Actualizează parola
    await db.q(
      "UPDATE users SET password_hash = $1 WHERE email = $2",
      [passwordHash, reset.email]
    );
    
    // Marchează tokenul ca folosit
    await db.q(
      "UPDATE password_resets SET used = true WHERE id = $1",
      [reset.id]
    );
    
    console.log(`✅ Parolă resetată pentru ${reset.email}`);
    
    res.json({ ok: true, message: "Parola a fost resetată cu succes" });
    
  } catch (err) {
    console.error("Eroare reset password:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

// ==========================================
// CRON JOB - Curățare conturi nevalidate
// ==========================================

// Rulează la fiecare 60 secunde
setInterval(async () => {
  try {
    const result = await db.cleanupUnverifiedCompanies();
    if (result.deleted > 0) {
      console.log(`🧹 Cleanup: ${result.deleted} conturi nevalidate șterse`);
    }
  } catch (err) {
    console.error("Eroare cleanup:", err.message);
  }
}, 60 * 1000);

console.log("✅ Multi-tenant auth system activat");
console.log("⏰ Cron job curățare: fiecare 60 secunde");



// ==========================================
// SEED DATE INIȚIALE - ȘOFERI ȘI MAȘINI
// ==========================================

(async () => {
  try {
    await db.ensureTables();
    await db.ensureCompaniesTable();
    console.log("✅ DB ready (multi-tenant)");
    // Configurare seed: Admin + Produse (fara clienti)
    // await seedClientsFromFileIfEmpty();  // Dezactivat - clienti goi
    await seedProductsFromFileIfEmpty();      // Activat - produse din JSON
    await ensureDefaultAdmin();               // Activat - admin implicit
    // await seedInitialData();
  } catch (e) {
    console.error("❌ DB init error (pornesc fără DB):", e?.message || e);
  }

  app.listen(PORT, () => console.log("Server pornit pe port", PORT));
})();



