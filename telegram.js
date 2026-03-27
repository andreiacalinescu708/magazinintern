/**
 * Modul Telegram Bot pentru OpenBill
 * Funcționalități:
 * - /start - Activare cu cod companie
 * - /adauga - Procesare facturi PDF de la furnizori
 * - Matching produse cu bază de date
 */

const TelegramBot = require('node-telegram-bot-api');
const PDFExtract = require('pdf-extraction').PDFExtract;
const { Pool } = require('pg');

// Configurare - TOKEN trebuie setat în .env
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Stocare sesiuni utilizatori (cod -> company_id temporar)
const userSessions = new Map();

// Bot instance
let bot = null;

// ============================================
// INITIALIZARE
// ============================================

async function initTelegramBot(pool) {
  if (!TOKEN) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN nu este setat. Botul Telegram nu pornește.');
    return null;
  }

  try {
    // Creare bot fără polling mai întâi
    bot = new TelegramBot(TOKEN, { polling: false });
    
    // Verificăm dacă tokenul e valid
    const me = await bot.getMe();
    console.log(`🤖 Bot Telegram valid: @${me.username}`);
    
    // Pornim polling abia după ce verificăm tokenul
    bot.startPolling();
    console.log('🤖 Bot Telegram inițializat cu succes!');

    // Setup handlers
    setupCommandHandlers(pool);
    setupMessageHandlers(pool);
    setupCallbackHandlers(pool);

    return bot;
  } catch (error) {
    console.error('❌ Eroare la inițializarea botului Telegram:', error.message);
    console.log('⚠️  Botul Telegram nu va fi disponibil. Verifică TELEGRAM_BOT_TOKEN.');
    return null;
  }
}

// ============================================
// COMMAND HANDLERS
// ============================================

function setupCommandHandlers(pool) {
  // /start - Început conversație
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name;
    
    await bot.sendMessage(chatId, 
      `👋 Bună ${msg.from.first_name}!\n\n` +
      `Bine ai venit la *OpenBill Bot*.\n\n` +
      `Pentru a te conecta la compania ta, te rog să introduci codul de activare primit de la administrator.\n\n` +
      `📌 Exemplu: \`ABCD1234\``,
      { parse_mode: 'Markdown' }
    );
    
    // Salvăm starea utilizatorului ca așteptând cod
    userSessions.set(chatId, { step: 'waiting_code' });
  });

  // /adauga - Adăugare factură nouă
  bot.onText(/\/adauga/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Verificăm dacă utilizatorul este asociat cu o companie
    const companyId = await getCompanyByChatId(pool, chatId);
    
    if (!companyId) {
      await bot.sendMessage(chatId, 
        '❌ Nu ești conectat la nicio companie.\n\n' +
        'Folosește /start și introdu codul de activare primit de la administrator.'
      );
      return;
    }

    // Verificăm dacă Telegram este activat pentru companie
    const isEnabled = await isTelegramEnabled(pool, companyId);
    if (!isEnabled) {
      await bot.sendMessage(chatId, 
        '❌ Funcționalitatea Telegram nu este activată pentru compania ta.\n\n' +
        'Contactează administratorul pentru detalii.'
      );
      return;
    }

    await bot.sendMessage(chatId,
      '📄 *Adăugare Factură Furnizor*\n\n' +
      'Te rog să trimiți factura în format PDF.\n\n' +
      'Botul va extrage automat informațiile și va face matching cu produsele din baza de date.',
      { parse_mode: 'Markdown' }
    );
    
    userSessions.set(chatId, { step: 'waiting_pdf', company_id: companyId });
  });

  // /help - Ajutor
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId,
      '📚 *Comenzi disponibile:*\n\n' +
      '`/start` - Conectare la companie\n' +
      '`/adauga` - Adăugare factură PDF\n' +
      '`/status` - Verificare status conexiune\n' +
      '`/help` - Afișare ajutor\n\n' +
      '📧 Pentru suport: contact@openbill.ro',
      { parse_mode: 'Markdown' }
    );
  });

  // /status - Status conexiune
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const companyInfo = await getCompanyInfoByChatId(pool, chatId);
    
    if (!companyInfo) {
      await bot.sendMessage(chatId,
        '⚠️ *Neconectat*\n\n' +
        'Nu ești asociat cu nicio companie.\n' +
        'Folosește /start pentru a te conecta.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await bot.sendMessage(chatId,
      `✅ *Conectat*\n\n` +
      `🏢 Companie: ${companyInfo.name}\n` +
      `📧 Admin: ${companyInfo.admin_email}\n` +
      `📅 Conectat din: ${new Date(companyInfo.created_at).toLocaleDateString('ro-RO')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /deconectare - Dezactivare asociere
  bot.onText(/\/deconectare/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId,
      '⚠️ Ești sigur că vrei să te deconectezi?\n\n' +
      'Vei pierde accesul la această companie și va trebui să introduci din nou codul de activare.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Da, deconectează-mă', callback_data: 'confirm_disconnect' }],
            [{ text: '❌ Anulează', callback_data: 'cancel_disconnect' }]
          ]
        }
      }
    );
  });
}

// ============================================
// MESSAGE HANDLERS
// ============================================

function setupMessageHandlers(pool) {
  // Handler pentru mesaje text (coduri de activare)
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    
    // Ignorăm comenzile (încep cu /)
    if (!text || text.startsWith('/')) return;
    
    console.log(`📨 Mesaj primit de la ${chatId}: "${text}"`);
    
    const session = userSessions.get(chatId);
    
    // Procesare cod de activare - acceptăm și fără session (direct)
    // Verificăm dacă textul arată ca un cod (8 caractere alfanumerice)
    const looksLikeCode = /^[A-Z0-9]{8}$/i.test(text);
    
    if (session?.step === 'waiting_code' || looksLikeCode) {
      console.log(`🔑 Procesare cod activare: "${text}"`);
      await handleActivationCode(pool, chatId, text, msg.from);
      return;
    }
    
    // Dacă nu e cod și nu e în session, informăm utilizatorul
    await bot.sendMessage(chatId, 
      '❓ Nu înțeleg mesajul.\n\n' +
      'Folosește /start pentru a te conecta sau /help pentru ajutor.'
    );
  });

  // Handler pentru documente (PDF)
  bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    
    // Verificăm dacă așteptăm un PDF
    if (session?.step !== 'waiting_pdf') {
      await bot.sendMessage(chatId,
        '❌ Nu aștept un document acum.\n\n' +
        'Folosește /adauga pentru a începe procesul de adăugare factură.'
      );
      return;
    }

    const document = msg.document;
    
    // Verificăm dacă este PDF
    if (!document.mime_type || document.mime_type !== 'application/pdf') {
      await bot.sendMessage(chatId, '❌ Te rog să trimiți doar fișiere PDF.');
      return;
    }

    // Limităm dimensiunea (max 10MB)
    if (document.file_size > 10 * 1024 * 1024) {
      await bot.sendMessage(chatId, '❌ Fișierul este prea mare. Limita maximă este 10MB.');
      return;
    }

    await handlePdfUpload(pool, chatId, document, session.company_id);
  });
}

// ============================================
// CALLBACK HANDLERS
// ============================================

function setupCallbackHandlers(pool) {
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    if (data === 'confirm_disconnect') {
      await disconnectUser(pool, chatId);
      await bot.sendMessage(chatId, '✅ Te-ai deconectat cu succes. Folosește /start pentru a te reconecta.');
      userSessions.delete(chatId);
    } else if (data === 'cancel_disconnect') {
      await bot.sendMessage(chatId, '✅ Acțiune anulată.');
    } else if (data.startsWith('edit_match_')) {
      const invoiceId = data.replace('edit_match_', '');
      await handleEditMatch(pool, chatId, invoiceId);
    } else if (data.startsWith('confirm_match_')) {
      const invoiceId = data.replace('confirm_match_', '');
      await handleConfirmMatch(pool, chatId, invoiceId);
    } else if (data.startsWith('cancel_match_')) {
      const invoiceId = data.replace('cancel_match_', '');
      await handleCancelMatch(pool, chatId, invoiceId);
    }
  });
}

// ============================================
// FUNCȚII AUXILIARE - ACTIVARE
// ============================================

async function handleActivationCode(pool, chatId, code, userInfo) {
  try {
    console.log(`🔍 Căutare companie pentru cod: "${code}" (uppercase: "${code.toUpperCase()}")`);
    
    // Căutăm compania după cod
    const result = await pool.query(
      'SELECT id, name, telegram_enabled, telegram_code FROM public.companies WHERE telegram_code = $1 AND status = $2',
      [code.toUpperCase(), 'active']
    );
    
    console.log(`📊 Rezultat căutare: ${result.rows.length} companii găsite`);
    if (result.rows.length > 0) {
      console.log(`   Companie: ${result.rows[0].name}, enabled: ${result.rows[0].telegram_enabled}`);
    }

    if (result.rows.length === 0) {
      await bot.sendMessage(chatId, 
        '❌ Cod invalid sau compania nu este activă.\n\n' +
        'Te rog să verifici codul și să încerci din nou.'
      );
      return;
    }

    const company = result.rows[0];

    // Verificăm dacă Telegram este activat pentru companie
    if (!company.telegram_enabled) {
      await bot.sendMessage(chatId,
        '❌ Funcționalitatea Telegram nu este activată pentru această companie.\n\n' +
        'Contactează administratorul companiei.'
      );
      return;
    }

    // Salvăm asocierea în baza de date (fără ON CONFLICT - verificăm manual)
    const existingUser = await pool.query(
      'SELECT id FROM public.telegram_users WHERE chat_id = $1 AND company_id = $2',
      [chatId.toString(), company.id]
    );
    
    if (existingUser.rows.length > 0) {
      // Update existing
      await pool.query(
        'UPDATE public.telegram_users SET is_active = true, updated_at = NOW(), username = $3, first_name = $4, last_name = $5 WHERE chat_id = $1 AND company_id = $2',
        [chatId.toString(), company.id, userInfo.username, userInfo.first_name, userInfo.last_name]
      );
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO public.telegram_users (chat_id, company_id, username, first_name, last_name, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [chatId.toString(), company.id, userInfo.username, userInfo.first_name, userInfo.last_name]
      );
    }

    // Ștergem sesiunea
    userSessions.delete(chatId);

    await bot.sendMessage(chatId,
      `✅ *Conectare reușită!*\n\n` +
      `🏢 Ești acum conectat la compania: *${company.name}*\n\n` +
      `Comenzi disponibile:\n` +
      `• /adauga - Adaugă factură furnizor\n` +
      `• /status - Verifică status conexiune\n` +
      `• /help - Ajutor\n\n` +
      `Pentru a te deconecta, folosește /deconectare`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Eroare la activare:', error);
    await bot.sendMessage(chatId, '❌ A apărut o eroare. Te rog să încerci din nou mai târziu.');
  }
}

async function disconnectUser(pool, chatId) {
  try {
    await pool.query(
      'UPDATE public.telegram_users SET is_active = false WHERE chat_id = $1',
      [chatId.toString()]
    );
  } catch (error) {
    console.error('Eroare la deconectare:', error);
  }
}

async function getCompanyByChatId(pool, chatId) {
  try {
    const result = await pool.query(
      `SELECT company_id FROM public.telegram_users 
       WHERE chat_id = $1 AND is_active = true`,
      [chatId.toString()]
    );
    return result.rows.length > 0 ? result.rows[0].company_id : null;
  } catch (error) {
    console.error('Eroare la getCompanyByChatId:', error);
    return null;
  }
}

async function getCompanyInfoByChatId(pool, chatId) {
  try {
    const result = await pool.query(
      `SELECT c.name, c.admin_email, c.created_at 
       FROM public.companies c
       JOIN public.telegram_users tu ON c.id = tu.company_id
       WHERE tu.chat_id = $1 AND tu.is_active = true`,
      [chatId.toString()]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Eroare la getCompanyInfoByChatId:', error);
    return null;
  }
}

async function isTelegramEnabled(pool, companyId) {
  try {
    const result = await pool.query(
      'SELECT telegram_enabled FROM public.companies WHERE id = $1',
      [companyId]
    );
    return result.rows.length > 0 ? result.rows[0].telegram_enabled : false;
  } catch (error) {
    console.error('Eroare la isTelegramEnabled:', error);
    return false;
  }
}

// ============================================
// FUNCȚII AUXILIARE - PROCESARE PDF
// ============================================

async function extractTextFromPdf(pdfBuffer) {
  const pdfExtract = new PDFExtract();
  const options = {};
  
  return new Promise((resolve, reject) => {
    pdfExtract.extractBuffer(pdfBuffer, options, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Extragem textul din toate paginile
      let text = '';
      if (data && data.pages) {
        for (const page of data.pages) {
          if (page.content) {
            for (const item of page.content) {
              if (item.str) {
                text += item.str + ' ';
              }
            }
          }
        }
      }
      resolve(text.trim());
    });
  });
}

async function handlePdfUpload(pool, chatId, document, companyId) {
  try {
    await bot.sendMessage(chatId, '📄 Se descarcă factura...');

    // Descărcăm fișierul
    const fileStream = bot.getFileStream(document.file_id);
    const chunks = [];
    
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    
    const pdfBuffer = Buffer.concat(chunks);

    await bot.sendMessage(chatId, '🔍 Se extrage textul din PDF...');

    // Extragem textul din PDF
    let extractedText = '';
    try {
      console.log('📄 Începere extracție text din PDF...');
      extractedText = await extractTextFromPdf(pdfBuffer);
      console.log(`✅ Text extras: ${extractedText.length} caractere`);
      console.log('📝 Primele 500 caractere:', extractedText.substring(0, 500));
      
      // Verificăm dacă PDF-ul e scanat (imagine-based)
      if (extractedText.length < 50) {
        await bot.sendMessage(chatId,
          '⚠️ *PDF scanat detectat*\n\n' +
          'Factura ta pare să fie scanată (imagine), nu poate fi procesată automat.\n\n' +
          '📋 *Ce poți face:*\n' +
          '1. Folosește aplicația web openbill.ro\n' +
          '2. Mergi la secțiunea "Gestiune → Intrări"\n' +
          '3. Adaugă manual produsele din factură\n\n' +
          'Sau trimite factura în format digital (PDF text) dacă o ai disponibilă.',
          { parse_mode: 'Markdown' }
        );
        return;
      }
    } catch (pdfError) {
      console.error('❌ Eroare la extragerea textului din PDF:', pdfError);
      extractedText = '[Eroare la procesarea PDF-ului]';
    }

    await bot.sendMessage(chatId, '📊 Se caută produsele în baza de date...');

    // Salvăm factura în baza de date
    const invoiceResult = await pool.query(
      `INSERT INTO public.telegram_invoices (company_id, chat_id, file_id, file_name, extracted_text, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [companyId, chatId.toString(), document.file_id, document.file_name, extractedText]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Obținem schema companiei
    const schemaResult = await pool.query(
      'SELECT schema_name FROM public.companies WHERE id = $1',
      [companyId]
    );
    
    if (schemaResult.rows.length === 0) {
      throw new Error('Schema companie negăsită');
    }
    
    const schemaName = schemaResult.rows[0].schema_name;

    // Facem matching cu produsele
    const matchedProducts = await matchProducts(pool, schemaName, extractedText);

    // Actualizăm factura cu produsele găsite
    await pool.query(
      'UPDATE public.telegram_invoices SET matched_products = $1 WHERE id = $2',
      [JSON.stringify(matchedProducts), invoiceId]
    );

    // Afișăm rezultatele
    await displayMatchResults(chatId, invoiceId, matchedProducts);

  } catch (error) {
    console.error('Eroare la procesare PDF:', error);
    await bot.sendMessage(chatId, 
      '❌ A apărut o eroare la procesarea facturii.\n\n' +
      'Eroare: ' + error.message
    );
  }
}

async function matchProducts(pool, schemaName, text) {
  const matches = [];
  
  try {
    console.log(`🔍 Căutare produse în schema: ${schemaName}`);
    
    // Obținem toate produsele din compania respectivă
    const productsResult = await pool.query(
      `SELECT id, name, gtin, gtins, category FROM ${schemaName}.products WHERE active = true`
    );

    const products = productsResult.rows;
    console.log(`📊 Produse în DB: ${products.length}`);
    if (products.length > 0) {
      console.log('📝 Primele 3 produse:', products.slice(0, 3).map(p => p.name));
    }
    
    // Parsează liniile de produse din factură
    const invoiceLines = parseInvoiceLines(text);
    console.log(`📄 Linii produse găsite în factură: ${invoiceLines.length}`);
    
    for (const line of invoiceLines) {
      console.log(`🔍 Procesare linie: "${line.name}" LOT:${line.lot} EXP:${line.expiresAt} QTY:${line.quantity}`);
      
      // Căutăm produsul în DB după nume sau GTIN
      let matchedProduct = null;
      let bestScore = 0;
      
      for (const product of products) {
        const score = calculateMatchScoreForLine(product, line);
        if (score > bestScore && score > 0.5) {
          bestScore = score;
          matchedProduct = product;
        }
      }
      
      if (matchedProduct) {
        console.log(`✅ Produs găsit: ${matchedProduct.name} (scor: ${bestScore})`);
        
        // Adăugăm în stock automat
        await addToStock(pool, schemaName, matchedProduct, line);
        
        matches.push({
          product_id: matchedProduct.id,
          product_name: matchedProduct.name,
          gtin: matchedProduct.gtin,
          category: matchedProduct.category,
          lot: line.lot,
          expires_at: line.expiresAt,
          quantity: line.quantity,
          match_score: bestScore,
          added_to_stock: true
        });
      } else {
        console.log(`❌ Produs negăsit pentru: ${line.name}`);
        matches.push({
          product_name: line.name,
          lot: line.lot,
          expires_at: line.expiresAt,
          quantity: line.quantity,
          match_score: 0,
          added_to_stock: false,
          not_found: true
        });
      }
    }

  } catch (error) {
    console.error('Eroare la matchProducts:', error);
  }

  return matches;
}

// Parsează liniile de produse din textul facturii
function parseInvoiceLines(text) {
  const lines = [];
  const textLines = text.split('\n');
  
  console.log(`📝 Total linii în text: ${textLines.length}`);
  
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i].trim();
    if (!line || line.length < 5) continue;
    
    // Ignorăm linii care nu sunt produse
    if (line.match(/^(factura|total|valoare|tva|cif|nr\.?\s*doc|furnizor|client|produs|denumire)/i)) continue;
    if (line.match(/^(subtotal|total factura|termen plata|cota tva)/i)) continue;
    
    // Pattern pentru linie de produs cu număr la început
    // Ex: "1 Scutece chilot adulti Seni Active Classic Small pachet a'30 LOT:1402437237 2031-01-31 30 58.00"
    const lineMatch = line.match(/^(?:\d+\s+)?(.+?)(?:\s+LOT[:\s]*([A-Z0-9]+))?\s+(\d{4}-\d{2}-\d{2})\s+(\d+)\s+\d+[.,]\d+/i);
    
    if (lineMatch) {
      const name = lineMatch[1].trim();
      const lot = lineMatch[2] || extractLotFromLine(line) || 'N/A';
      const expiresAt = lineMatch[3];
      const quantity = parseInt(lineMatch[4]) || 1;
      
      console.log(`✅ Linie produs găsită: "${name.substring(0, 50)}..." QTY:${quantity} LOT:${lot}`);
      
      lines.push({
        name: name,
        lot: lot,
        expiresAt: expiresAt,
        quantity: quantity
      });
    } else {
      // Încercăm pattern alternativ pentru linii fără număr la început
      const altMatch = line.match(/^(.+?)(?:\s+LOT[:\s]*([A-Z0-9]+))?\s+(\d{4}-\d{2}-\d{2})/i);
      if (altMatch && altMatch[1].length > 10) {
        // Căutăm cantitatea în restul liniei
        const qtyMatch = line.match(/(\d{4}-\d{2}-\d{2})\s+(\d+)\s+\d+[.,]\d+/);
        if (qtyMatch) {
          const name = altMatch[1].trim();
          const lot = altMatch[2] || extractLotFromLine(line) || 'N/A';
          const expiresAt = altMatch[3];
          const quantity = parseInt(qtyMatch[2]) || 1;
          
          console.log(`✅ Linie produs (alt pattern): "${name.substring(0, 50)}..." QTY:${quantity}`);
          
          lines.push({
            name: name,
            lot: lot,
            expiresAt: expiresAt,
            quantity: quantity
          });
        }
      }
    }
  }
  
  console.log(`📦 Total produse extrase: ${lines.length}`);
  return lines;
}

// Extrage lotul din linie
function extractLotFromLine(line) {
  const lotMatch = line.match(/LOT[:\s]*([A-Z0-9]+)/i);
  return lotMatch ? lotMatch[1] : null;
}

// Extrage data din linie
function extractDateFromLine(line) {
  const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
  return dateMatch ? dateMatch[1] : null;
}

// Extrage cantitatea din linie
function extractQuantityFromLine(line) {
  // Caută numărul înainte de preț sau la final
  const qtyMatch = line.match(/(\d+)\s+(?:\d+[.,]\d+|lei|ron|$)/i);
  return qtyMatch ? parseInt(qtyMatch[1]) : null;
}

// Calculează scorul de matching pentru o linie de factură
function calculateMatchScoreForLine(product, line) {
  const productName = product.name.toLowerCase();
  const lineName = line.name.toLowerCase();
  
  // Match exact
  if (productName === lineName) return 1.0;
  
  // Conține numele produsului
  if (lineName.includes(productName) || productName.includes(lineName)) return 0.95;
  
  // Cuvinte cheie comune
  const productWords = productName.split(/\s+/).filter(w => w.length > 3);
  const lineWords = lineName.split(/\s+/).filter(w => w.length > 3);
  
  let commonWords = 0;
  for (const word of productWords) {
    if (lineWords.some(lw => lw.includes(word) || word.includes(lw))) {
      commonWords++;
    }
  }
  
  if (productWords.length > 0) {
    return commonWords / productWords.length;
  }
  
  return 0;
}

// Adaugă produsul în stock
async function addToStock(pool, schemaName, product, line) {
  try {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    const gtin = product.gtin || 'N/A';
    
    await pool.query(
      `INSERT INTO ${schemaName}.stock (id, gtin, product_name, lot, expires_at, qty, location, warehouse)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, gtin, product.name, line.lot, line.expiresAt, line.quantity, 'A', 'depozit']
    );
    
    console.log(`✅ Adăugat în stock: ${product.name} | LOT:${line.lot} | QTY:${line.quantity}`);
  } catch (error) {
    console.error(`❌ Eroare la adăugare în stock: ${error.message}`);
  }
}

function calculateMatchScore(product, text) {
  let score = 0;
  const nameLower = product.name.toLowerCase();
  
  // Verificăm numele produsului
  if (text.includes(nameLower)) {
    score = 1.0;
  } else {
    // Verificăm cuvinte cheie din nume
    const keywords = nameLower.split(/\s+/).filter(w => w.length > 3);
    let matchedWords = 0;
    
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matchedWords++;
      }
    }
    
    if (keywords.length > 0) {
      score = matchedWords / keywords.length;
    }
  }
  
  // Verificăm GTIN dacă există
  if (product.gtin && text.includes(product.gtin)) {
    score = 1.0; // Match perfect
  }
  
  // Verificăm GTIN-uri multiple
  if (product.gtins && Array.isArray(product.gtins)) {
    for (const gtin of product.gtins) {
      if (text.includes(gtin)) {
        score = 1.0;
        break;
      }
    }
  }
  
  return score;
}

function extractPriceForProduct(text, productName) {
  // Pattern pentru prețuri în format românesc și internațional
  const pricePatterns = [
    /(\d+[.,]?\d*)\s*(lei|ron|roni)/i,
    /(\d+[.,]?\d*)\s*€/,
    /(\d+[.,]?\d*)\s*EUR/i,
    /(?:pret|preț|price)[\s:]*(\d+[.,]?\d*)/i
  ];
  
  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  
  return null;
}

function extractQuantityForProduct(text, productName) {
  // Pattern pentru cantități
  const qtyPatterns = [
    /(\d+)\s*(buc|bc|pcs|pieces)/i,
    /(\d+)\s*x/i,
    /(?:cantitate|qty|quantity)[\s:]*(\d+)/i
  ];
  
  for (const pattern of qtyPatterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }
  
  return 1; // Default
}

async function displayMatchResults(chatId, invoiceId, matches) {
  if (matches.length === 0) {
    await bot.sendMessage(chatId,
      '⚠️ *Niciun produs găsit*\n\n' +
      'Nu am găsit produse care să corespundă cu factura.\n' +
      'Verifică dacă produsele sunt adăugate în baza de date.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let message = `✅ *Am găsit ${matches.length} produse:*\n\n`;
  
  for (let i = 0; i < Math.min(matches.length, 10); i++) {
    const match = matches[i];
    const confidence = Math.round(match.match_score * 100);
    const price = match.suggested_price ? `${match.suggested_price} lei` : 'N/A';
    const qty = match.suggested_quantity || 1;
    
    message += `${i + 1}. *${match.product_name}*\n`;
    message += `   📊 Match: ${confidence}% | 💰 ${price} | 📦 ${qty} buc\n\n`;
  }

  if (matches.length > 10) {
    message += `...și încă ${matches.length - 10} produse.\n\n`;
  }

  message += 'Ce dorești să faci?';

  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Confirmă toate', callback_data: `confirm_match_${invoiceId}` }],
        [{ text: '✏️ Editează', callback_data: `edit_match_${invoiceId}` }],
        [{ text: '❌ Anulează', callback_data: `cancel_match_${invoiceId}` }]
      ]
    }
  });
}

// ============================================
// EDITARE ȘI CONFIRMARE MATCH-URI
// ============================================

async function handleEditMatch(pool, chatId, invoiceId) {
  try {
    const result = await pool.query(
      'SELECT matched_products FROM public.telegram_invoices WHERE id = $1',
      [invoiceId]
    );

    if (result.rows.length === 0) {
      await bot.sendMessage(chatId, '❌ Factura nu a fost găsită.');
      return;
    }

    const matches = result.rows[0].matched_products;
    
    // Aici am putea implementa un wizard de editare pas cu pas
    // Pentru moment, afișăm un mesaj simplu
    await bot.sendMessage(chatId,
      '✏️ *Mod editare*\n\n' +
      'Funcționalitatea de editare detaliată va fi disponibilă în curând.\n\n' +
      'Pentru moment, poți:\n' +
      '• Confirma match-urile actuale\n' +
      '• Sau anula și încerca cu alt PDF',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Confirmă', callback_data: `confirm_match_${invoiceId}` }],
            [{ text: '❌ Anulează', callback_data: `cancel_match_${invoiceId}` }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('Eroare la editare:', error);
    await bot.sendMessage(chatId, '❌ Eroare la încărcarea datelor.');
  }
}

async function handleConfirmMatch(pool, chatId, invoiceId) {
  try {
    // Actualizăm statusul facturii
    await pool.query(
      "UPDATE public.telegram_invoices SET status = 'confirmed' WHERE id = $1",
      [invoiceId]
    );

    // Aici am putea adăuga logica de salvare în stoc/stock
    
    await bot.sendMessage(chatId,
      '✅ *Factura a fost confirmată!*\n\n' +
      'Produsele au fost adăugate în sistem.\n' +
      'Poți verifica stocul folosind aplicația web.',
      { parse_mode: 'Markdown' }
    );

    // Ștergem sesiunea
    userSessions.delete(chatId);

  } catch (error) {
    console.error('Eroare la confirmare:', error);
    await bot.sendMessage(chatId, '❌ Eroare la salvarea facturii.');
  }
}

async function handleCancelMatch(pool, chatId, invoiceId) {
  try {
    await pool.query(
      "UPDATE public.telegram_invoices SET status = 'cancelled' WHERE id = $1",
      [invoiceId]
    );

    await bot.sendMessage(chatId,
      '❌ Factura a fost anulată.\n\n' +
      'Poți încerca din nou cu /adauga'
    );

    // Ștergem sesiunea
    userSessions.delete(chatId);

  } catch (error) {
    console.error('Eroare la anulare:', error);
    await bot.sendMessage(chatId, '❌ Eroare la anulare.');
  }
}

// ============================================
// API FUNCTIONS (pentru server.js)
// ============================================

/**
 * Generează un cod nou de activare pentru o companie
 */
async function generateTelegramCode(pool, companyId) {
  try {
    // Generăm cod unic
    const codeResult = await pool.query(
      'SELECT generate_telegram_code() as code'
    );
    const code = codeResult.rows[0].code;

    // Salvăm codul în companie
    await pool.query(
      'UPDATE public.companies SET telegram_code = $1 WHERE id = $2',
      [code, companyId]
    );

    return { success: true, code };
  } catch (error) {
    console.error('Eroare la generare cod:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Resetează codul Telegram pentru o companie
 */
async function resetTelegramCode(pool, companyId) {
  try {
    // Deconectăm toți utilizatorii asociați
    await pool.query(
      'UPDATE public.telegram_users SET is_active = false WHERE company_id = $1',
      [companyId]
    );

    // Generăm cod nou
    const codeResult = await pool.query(
      'SELECT generate_telegram_code() as code'
    );
    const code = codeResult.rows[0].code;

    // Actualizăm codul
    await pool.query(
      'UPDATE public.companies SET telegram_code = $1 WHERE id = $2',
      [code, companyId]
    );

    return { success: true, code };
  } catch (error) {
    console.error('Eroare la resetare cod:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Activează/dezactivează Telegram pentru o companie
 */
async function setTelegramEnabled(pool, companyId, enabled) {
  try {
    await pool.query(
      'UPDATE public.companies SET telegram_enabled = $1 WHERE id = $2',
      [enabled, companyId]
    );

    return { success: true };
  } catch (error) {
    console.error('Eroare la setare telegram_enabled:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verifică statusul Telegram pentru o companie
 */
async function getTelegramStatus(pool, companyId) {
  try {
    const result = await pool.query(
      `SELECT telegram_enabled, telegram_code,
        (SELECT COUNT(*) FROM public.telegram_users WHERE company_id = $1 AND is_active = true) as user_count
       FROM public.companies WHERE id = $1`,
      [companyId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Companie negăsită' };
    }

    return { success: true, data: result.rows[0] };
  } catch (error) {
    console.error('Eroare la getTelegramStatus:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  initTelegramBot,
  generateTelegramCode,
  resetTelegramCode,
  setTelegramEnabled,
  getTelegramStatus,
  // Pentru testare
  _bot: () => bot
};
