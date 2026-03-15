-- Script pentru curățarea datelor de test din schema public
-- ATENȚIE: Rulează acest script doar dacă ești sigur că datele din public nu mai sunt necesare!

-- Șterge datele din tabelele care ar trebui să fie goale în schema public
-- (acestea ar trebui să fie populate doar în schemele companiilor)

DELETE FROM public.clients;
DELETE FROM public.products;
DELETE FROM public.orders;
DELETE FROM public.order_items;
DELETE FROM public.stock;
DELETE FROM public.stock_transfers;
DELETE FROM public.drivers;
DELETE FROM public.vehicles;
DELETE FROM public.trip_sheets;
DELETE FROM public.fuel_receipts;
DELETE FROM public.company_settings;
DELETE FROM public.client_balances;
DELETE FROM public.audit;

-- Păstrează doar:
-- public.companies (lista companiilor)
-- public.user_invites (invitațiile)

-- Verificare: ar trebui să rămână doar companiile și invitațiile
SELECT 'Companii ramase:' as info, COUNT(*) as count FROM public.companies
UNION ALL
SELECT 'Invitatii ramase:', COUNT(*) FROM public.user_invites
UNION ALL
SELECT 'Clienti in public (ar trebui 0):', COUNT(*) FROM public.clients
UNION ALL
SELECT 'Produse in public (ar trebui 0):', COUNT(*) FROM public.products
UNION ALL
SELECT 'Comenzi in public (ar trebui 0):', COUNT(*) FROM public.orders;
