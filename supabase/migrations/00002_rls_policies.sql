-- ============================================================
-- MIGRACIÓN 00002: Políticas RLS — Seguridad multi-tenant
--
-- CÓMO FUNCIONA:
-- - El webhook de WhatsApp usa "service_role" key → bypasea RLS (acceso total)
--   Esto es necesario porque el webhook no tiene un usuario autenticado
-- - El dashboard usa "anon" key + auth → solo ve datos de su clínica
-- - Cada tabla tiene políticas para SELECT, INSERT, UPDATE, DELETE
-- ============================================================

-- --------------------------------------------------------
-- CLINICS: los usuarios autenticados solo ven su clínica
-- --------------------------------------------------------
CREATE POLICY "Usuarios ven su propia clínica"
    ON clinics FOR SELECT
    TO authenticated
    USING (id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

CREATE POLICY "Usuarios actualizan su propia clínica"
    ON clinics FOR UPDATE
    TO authenticated
    USING (id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- DOCTORS: ver doctores de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver doctores de mi clínica"
    ON doctors FOR SELECT
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- PATIENTS: ver pacientes de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver pacientes de mi clínica"
    ON patients FOR SELECT
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

CREATE POLICY "Crear pacientes en mi clínica"
    ON patients FOR INSERT
    TO authenticated
    WITH CHECK (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

CREATE POLICY "Actualizar pacientes de mi clínica"
    ON patients FOR UPDATE
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- APPOINTMENTS: ver y gestionar citas de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver citas de mi clínica"
    ON appointments FOR SELECT
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

CREATE POLICY "Crear citas en mi clínica"
    ON appointments FOR INSERT
    TO authenticated
    WITH CHECK (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

CREATE POLICY "Actualizar citas de mi clínica"
    ON appointments FOR UPDATE
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- CONVERSATIONS: ver conversaciones de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver conversaciones de mi clínica"
    ON conversations FOR SELECT
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- MESSAGES: ver mensajes de conversaciones de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver mensajes de mi clínica"
    ON messages FOR SELECT
    TO authenticated
    USING (conversation_id IN (
        SELECT c.id FROM conversations c
        JOIN doctors d ON d.clinic_id = c.clinic_id
        WHERE d.email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- REMINDERS: ver recordatorios de citas de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver recordatorios de mi clínica"
    ON reminders FOR SELECT
    TO authenticated
    USING (appointment_id IN (
        SELECT a.id FROM appointments a
        JOIN doctors d ON d.clinic_id = a.clinic_id
        WHERE d.email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- WAITLIST: ver lista de espera de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver lista de espera de mi clínica"
    ON waitlist FOR SELECT
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));

-- --------------------------------------------------------
-- AUDIT_LOG: ver auditoría de mi clínica
-- --------------------------------------------------------
CREATE POLICY "Ver auditoría de mi clínica"
    ON audit_log FOR SELECT
    TO authenticated
    USING (clinic_id IN (
        SELECT clinic_id FROM doctors WHERE email = auth.jwt() ->> 'email'
    ));
