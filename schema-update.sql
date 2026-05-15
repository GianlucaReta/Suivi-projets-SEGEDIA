-- Migrations à appliquer dans Supabase SQL Editor
-- Page Factures — refonte 2025

ALTER TABLE factures ADD COLUMN IF NOT EXISTS montant_paye NUMERIC DEFAULT 0;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS litige BOOLEAN DEFAULT false;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_relance DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS telephone TEXT;
