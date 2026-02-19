-- ============================================================
-- Migración: Campos para integración Google Sheets
-- Agrega google_sheet_id y doctor_email a la tabla clinics
-- ============================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS google_sheet_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS doctor_email TEXT;
