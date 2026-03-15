-- Vezi în ce bază de date ești acum
SELECT current_database() AS baza_curenta, current_schema() AS schema_curenta;

-- Listează toate bazele de date disponibile
SELECT datname FROM pg_database WHERE datistemplate = false;
