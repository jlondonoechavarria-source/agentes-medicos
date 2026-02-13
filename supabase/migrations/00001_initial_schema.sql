-- ============================================================
-- MIGRACIÓN 00001: Schema inicial — Agente WhatsApp Clínicas
-- Crea todas las tablas, índices y habilita RLS
-- ============================================================

-- CLÍNICAS (tenants principales — cada clínica es un "cliente" del SaaS)
-- Toda la data se filtra por clinic_id para que una clínica nunca vea datos de otra
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,                  -- URL amigable: "clinica-dental-perez"
    phone TEXT NOT NULL,                        -- Teléfono de contacto de la clínica
    whatsapp_phone_id TEXT,                     -- ID del número en WhatsApp Business API
    whatsapp_token TEXT,                        -- Token de acceso WhatsApp (ENCRIPTADO en producción)
    address TEXT,
    city TEXT DEFAULT 'Medellín',
    department TEXT DEFAULT 'Antioquia',
    specialty TEXT,                             -- Ej: "Odontología", "Medicina General"
    consultation_price INTEGER,                 -- COP sin decimales (ej: 80000 = $80.000)
    consultation_duration_minutes INTEGER DEFAULT 30,
    working_hours JSONB DEFAULT '{
        "monday":    {"start": "08:00", "end": "18:00", "active": true},
        "tuesday":   {"start": "08:00", "end": "18:00", "active": true},
        "wednesday": {"start": "08:00", "end": "18:00", "active": true},
        "thursday":  {"start": "08:00", "end": "18:00", "active": true},
        "friday":    {"start": "08:00", "end": "18:00", "active": true},
        "saturday":  {"start": "08:00", "end": "13:00", "active": true},
        "sunday":    {"start": "08:00", "end": "12:00", "active": false}
    }',
    faq JSONB DEFAULT '[]',                     -- Preguntas frecuentes personalizadas
    agent_name TEXT DEFAULT 'Asistente',        -- Nombre del agente de IA
    agent_personality TEXT DEFAULT 'profesional y amable',
    welcome_message TEXT,
    subscription_status TEXT DEFAULT 'trial',   -- trial, active, cancelled, expired
    subscription_plan TEXT DEFAULT 'basic',     -- basic, pro
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOCTORES (cada clínica puede tener 1-3 doctores)
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB,                        -- Horarios específicos del doctor (override clínica)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PACIENTES (se crean automáticamente cuando escriben por WhatsApp)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,                         -- Formato: +573XXXXXXXXX
    email TEXT,
    document_type TEXT DEFAULT 'CC',             -- CC, TI, CE, PP
    document_number TEXT,
    date_of_birth DATE,
    eps TEXT,                                    -- Entidad Promotora de Salud
    notes TEXT,
    no_show_count INTEGER DEFAULT 0,            -- Contador de citas perdidas
    total_appointments INTEGER DEFAULT 0,
    data_consent_at TIMESTAMPTZ,                -- Cuándo aceptó aviso de privacidad (Ley 1581)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id, phone)                    -- Un paciente no se duplica por teléfono en la misma clínica
);

-- CITAS (el corazón del sistema)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id),
    patient_id UUID REFERENCES patients(id),
    starts_at TIMESTAMPTZ NOT NULL,             -- Hora inicio en UTC (se muestra en COT al paciente)
    ends_at TIMESTAMPTZ NOT NULL,               -- Hora fin en UTC
    status TEXT DEFAULT 'confirmed',            -- confirmed, cancelled, completed, no_show, rescheduled
    reason TEXT,                                -- Motivo de consulta
    source TEXT DEFAULT 'whatsapp_agent',       -- whatsapp_agent, manual, dashboard
    notes TEXT,
    reminder_24h_sent BOOLEAN DEFAULT false,
    reminder_2h_sent BOOLEAN DEFAULT false,
    confirmation_received BOOLEAN DEFAULT false,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSACIONES (una por paciente por clínica, contiene el contexto del chat)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id),
    whatsapp_phone TEXT NOT NULL,
    status TEXT DEFAULT 'active',               -- active, resolved, escalated
    escalated_to TEXT,                          -- Nombre/teléfono del humano que tomó el caso
    escalated_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    context JSONB DEFAULT '{}',                 -- Contexto adicional para el agente
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENSAJES (historial completo de cada conversación)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                          -- patient, agent, staff
    content TEXT NOT NULL,
    whatsapp_message_id TEXT,                   -- ID del mensaje en WhatsApp (para marcar como leído)
    message_type TEXT DEFAULT 'text',           -- text, image, audio, etc.
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RECORDATORIOS (se programan al crear cita: 24h y 2h antes)
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                          -- 24h, 2h
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',              -- pending, sent, failed
    response TEXT,                              -- confirmed, rescheduled, cancelled, no_response
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LISTA DE ESPERA (cuando no hay disponibilidad, el paciente puede esperar)
-- Si se cancela una cita, se notifica al siguiente en la lista
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id),
    doctor_id UUID REFERENCES doctors(id),
    preferred_dates JSONB DEFAULT '[]',         -- Fechas preferidas del paciente
    preferred_time TEXT DEFAULT 'any',          -- morning, afternoon, any
    reason TEXT,
    status TEXT DEFAULT 'waiting',              -- waiting, notified, converted, expired
    notified_at TIMESTAMPTZ,
    converted_appointment_id UUID REFERENCES appointments(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDITORÍA (registro de acciones importantes para seguridad y Ley 1581)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id),
    action TEXT NOT NULL,                       -- appointment_created, patient_registered, etc.
    actor_type TEXT NOT NULL,                   -- agent, staff, system, patient
    actor_id TEXT,
    target_type TEXT,                           -- appointment, patient, conversation, etc.
    target_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES (aceleran las consultas más frecuentes)
-- ============================================================

-- Buscar citas de una clínica por fecha (consulta más común del dashboard)
CREATE INDEX idx_appointments_clinic_date ON appointments(clinic_id, starts_at);
-- Filtrar citas por estado (confirmed, cancelled, etc.)
CREATE INDEX idx_appointments_status ON appointments(status);
-- Buscar paciente por teléfono en una clínica (cada mensaje de WhatsApp hace esto)
CREATE INDEX idx_patients_clinic_phone ON patients(clinic_id, phone);
-- Buscar conversaciones activas de una clínica
CREATE INDEX idx_conversations_clinic ON conversations(clinic_id, status);
-- Buscar recordatorios pendientes por enviar (el cron job usa esto)
CREATE INDEX idx_reminders_pending ON reminders(status, scheduled_for);
-- Buscar mensajes de una conversación ordenados por fecha
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
-- Buscar en lista de espera por clínica
CREATE INDEX idx_waitlist_clinic ON waitlist(clinic_id, status);

-- ============================================================
-- HABILITAR RLS (Row Level Security) — Seguridad multi-tenant
-- Cada clínica SOLO puede ver sus propios datos
-- ============================================================

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
