-- Migrații pentru funcționalitatea Telegram Bot
-- Rulare manuală în PostgreSQL

-- ============================================
-- 1. Adăugare coloane în tabela public.companies
-- ============================================
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS telegram_code TEXT UNIQUE;

-- Index pentru căutare rapidă după cod
CREATE INDEX IF NOT EXISTS idx_companies_telegram_code ON public.companies(telegram_code);

-- Index pentru filtrare companii cu Telegram activat
CREATE INDEX IF NOT EXISTS idx_companies_telegram_enabled ON public.companies(telegram_enabled);

-- ============================================
-- 2. Creare tabel pentru asocieri Telegram-Companie
-- ============================================
CREATE TABLE IF NOT EXISTS public.telegram_users (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(chat_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_chat_id ON public.telegram_users(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_company_id ON public.telegram_users(company_id);

-- ============================================
-- 3. Creare tabel pentru facturi procesate via Telegram
-- ============================================
CREATE TABLE IF NOT EXISTS public.telegram_invoices (
    id SERIAL PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_name TEXT,
    extracted_text TEXT,
    matched_products JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_invoices_company_id ON public.telegram_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_telegram_invoices_chat_id ON public.telegram_invoices(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_invoices_status ON public.telegram_invoices(status);

-- ============================================
-- 4. Funcție pentru generare cod unic
-- ============================================
CREATE OR REPLACE FUNCTION generate_telegram_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generează cod de 8 caractere (litere mari și cifre)
        new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8));
        
        -- Verifică dacă codul există deja
        SELECT EXISTS(SELECT 1 FROM public.companies WHERE telegram_code = new_code) INTO code_exists;
        
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. Trigger pentru actualizare updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_telegram_users_updated_at ON public.telegram_users;
CREATE TRIGGER update_telegram_users_updated_at
    BEFORE UPDATE ON public.telegram_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_telegram_invoices_updated_at ON public.telegram_invoices;
CREATE TRIGGER update_telegram_invoices_updated_at
    BEFORE UPDATE ON public.telegram_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. Migrație: Adăugare telegram_chat_id în schema fiecărei companii (opțional)
-- ============================================
-- NOTĂ: Aceasta trebuie rulată pentru fiecare companie existentă
-- DO $$ 
-- DECLARE
--     company_record RECORD;
-- BEGIN
--     FOR company_record IN SELECT schema_name FROM public.companies WHERE status = 'active'
--     LOOP
--         EXECUTE format('ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT', company_record.schema_name);
--     END LOOP;
-- END $$;
