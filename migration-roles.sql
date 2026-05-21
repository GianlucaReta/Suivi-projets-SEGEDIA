-- ─────────────────────────────────────────────────────────────
-- Migration : Multi-utilisateurs avec rôles + code PIN par user
-- À exécuter dans Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Colonnes supplémentaires sur employes
ALTER TABLE employes ADD COLUMN IF NOT EXISTS code_pin TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'operationnel'
  CHECK (role IN ('admin', 'commercial', 'operationnel'));

-- 2. Index unique sur le PIN (un PIN = un employé)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_code_pin
  ON employes(code_pin) WHERE code_pin IS NOT NULL;

-- 3. Migrer l'utilisateur principal (Gianluca) avec le code actuel et le rôle admin
-- ⚠️ ADAPTE LE NOM si différent dans ta base
UPDATE employes
   SET code_pin = '030621', role = 'admin', acces_factures = true
 WHERE nom ILIKE '%Gianluca%' AND code_pin IS NULL;

-- 4. Par défaut, les autres employés ont accès aux projets/tâches uniquement (operationnel)
-- Tu pourras attribuer des rôles + codes via l'interface admin

-- ─────────────────────────────────────────────────────────────
-- Pour créer manuellement les utilisateurs :
-- UPDATE employes SET code_pin = '123456', role = 'commercial', acces_factures = true WHERE nom = 'XXX';
-- ─────────────────────────────────────────────────────────────
