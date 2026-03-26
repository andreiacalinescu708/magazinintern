# 🤖 OpenBill Telegram Bot

Bot Telegram pentru gestionarea facturilor de la furnizori prin PDF.

## Funcționalități

### Pentru Utilizatori
- **/start** - Conectare la companie folosind cod de activare
- **/adauga** - Încărcare factură PDF de la furnizor
- **/status** - Verificare status conexiune
- **/help** - Afișare ajutor
- **/deconectare** - Deconectare de la companie

### Procesare Facturi
1. Extrage text din PDF folosind OCR
2. Face matching între produsele din factură și baza de date a companiei
3. Afișează rezultatele cu opțiunea de editare
4. Permite confirmarea sau anularea importului

## Configurare

### 1. Creare Bot în Telegram
1. Deschide Telegram și caută **@BotFather**
2. Trimite comanda `/newbot`
3. Urmează instrucțiunile pentru a seta numele și username-ul botului
4. Copiază token-ul primit

### 2. Configurare Variabilă de Mediu
Adaugă în fișierul `.env`:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### 3. Activare pentru Companii
- SuperAdmin poate activa/dezactiva Telegram pentru fiecare companie din panoul de administrare
- Fiecare companie primește un cod unic de activare
- Utilizatorii folosesc acest cod pentru a se conecta la bot

## Flow Activare

### Pentru Administrator
1. Accesează pagina **Admin** → tab-ul **Telegram**
2. Dacă Telegram este activat pentru companie, se afișează codul de activare
3. Poate genera cod nou sau reseta codul (deconectează toți utilizatorii)

### Pentru Utilizatori
1. Deschide Telegram și caută **@openbill_ro_bot**
2. Apasă **START**
3. Introdu codul de activare primit de la administrator
4. Folosește **/adauga** pentru a trimite facturi PDF

## Arhitectură Multi-Tenant

Botul suportă arhitectura multi-tenant a aplicației:
- Fiecare companie are schema proprie în PostgreSQL
- Codul de activare leagă utilizatorul Telegram de o companie specifică
- Procesarea facturilor se face în contextul schemei companiei respective

## Structură Baza de Date

### Tabela `public.companies`
- `telegram_enabled` (BOOLEAN) - Activează/dezactivează Telegram
- `telegram_code` (TEXT) - Cod unic de activare

### Tabela `public.telegram_users`
- `chat_id` - ID unic Telegram
- `company_id` - Referință la companie
- `username`, `first_name`, `last_name` - Info utilizator
- `is_active` - Status conexiune

### Tabela `public.telegram_invoices`
- `company_id` - Compania care a procesat factura
- `chat_id` - Utilizatorul care a trimis factura
- `file_id`, `file_name` - Info fișier PDF
- `extracted_text` - Text extras din PDF
- `matched_products` (JSONB) - Produse găsite cu scor de matching
- `status` - pending, confirmed, cancelled

## API Endpoints

### Pentru Admin
- `GET /api/telegram/status` - Status Telegram pentru compania curentă
- `POST /api/telegram/generate-code` - Generează cod nou de activare
- `POST /api/telegram/reset-code` - Resetează codul și deconectează utilizatorii

### Pentru SuperAdmin
- `GET /api/telegram/companies` - Lista companiilor cu status Telegram
- `PUT /api/telegram/enable` - Activează/dezactivează Telegram pentru o companie

## Algoritm Matching Produse

Botul folosește un algoritm de matching bazat pe:
1. **Nume produs** - Potrivire exactă sau parțială (cuvinte cheie)
2. **GTIN/Cod de bare** - Match perfect dacă este găsit în PDF
3. **Scor de similaritate** - Calculat pe baza numărului de cuvinte cheie găsite

Produsele sunt sortate după scorul de matching și afișate utilizatorului pentru confirmare.

## Securitate

- Codurile de activare sunt generate aleator (8 caractere, litere mari și cifre)
- Fiecare cod este unic în sistem
- Resetarea codului deconectează automat toți utilizatorii
- Token-ul botului este stocat în variabilă de mediu, niciodată în cod
