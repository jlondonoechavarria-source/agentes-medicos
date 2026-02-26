-- ============================================================
-- Migración: Campos adicionales del paciente
-- Requeridos para el flujo de agendamiento completo
-- ============================================================

-- Dirección de residencia
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;

-- Teléfono adicional (el primario es el WhatsApp, este es el de contacto alterno)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS secondary_phone TEXT;

-- Entidad por la que realiza el procedimiento: EPS, particular, póliza, ARL, SOAT
ALTER TABLE patients ADD COLUMN IF NOT EXISTS procedure_entity TEXT;
