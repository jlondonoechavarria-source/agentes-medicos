-- ============================================================
-- MIGRACIÓN 00003: Campos para no-show, recordatorios y overbooking
-- Agrega campos a patients y appointments para:
-- - Probabilidad de no-show por paciente
-- - Tracking de recordatorios enviados y confirmaciones
-- - Notas del doctor por paciente
-- ============================================================

-- PACIENTES: agregar probabilidad de no-show y notas del doctor
ALTER TABLE patients ADD COLUMN IF NOT EXISTS no_show_probability DECIMAL DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS doctor_notes TEXT;

-- CITAS: agregar tracking de recordatorio y confirmación
-- (reminder_24h_sent y reminder_2h_sent ya existen)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_confirmed BOOLEAN DEFAULT NULL;
-- NULL = no se ha enviado recordatorio, true = confirmó, false = no confirmó/no respondió

-- ÍNDICE para buscar citas por fecha y estado (usado por cron de recordatorios)
CREATE INDEX IF NOT EXISTS idx_appointments_reminder ON appointments(starts_at, reminder_24h_sent, status);
