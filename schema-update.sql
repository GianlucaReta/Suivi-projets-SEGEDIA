-- Migrations à appliquer dans Supabase SQL Editor
-- Page Factures — refonte 2025

ALTER TABLE factures ADD COLUMN IF NOT EXISTS montant_paye NUMERIC DEFAULT 0;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS litige BOOLEAN DEFAULT false;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_relance DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS telephone TEXT;

-- Migration Recouvrement (R2 + Appel)
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_relance_r2 DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS relance_r2_email_id TEXT;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS relance_r2_lue BOOLEAN DEFAULT false;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS date_appel DATE;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS note_appel TEXT;
