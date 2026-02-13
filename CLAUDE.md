# CLAUDE.md — Agente IA WhatsApp para Clínicas (Colombia)

> **Estado:** Ideación → MVP | **Mercado:** Colombia 🇨🇴 | **Cliente:** Consultorios 1-3 médicos | **Modelo:** Setup + mensualidad

---

## 📌 Resumen

SaaS B2B: agente de IA por WhatsApp para consultorios médicos pequeños en Colombia. Reemplaza tareas de secretaria: agenda citas, responde FAQ, envía recordatorios, reduce no-shows. Cobro: setup inicial + suscripción mensual.

**Propuesta de valor:** "Tu consultorio atendiendo 24/7 por WhatsApp, sin contratar más personal."

### Nombres sugeridos
- **Sekre** — referencia a "secretaria", memorable
- **AgenDA Med** — Agente + Agenda + Med
- **Clio Salud** — profesional y humano
- **MediBot.co** — directo, dominio .co

---

## 🎯 Problema

1. Secretaria/doctor pasan horas respondiendo WhatsApp para agendar citas
2. No-shows del 20-35% = dinero perdido
3. Nadie responde fuera de horario → se pierden pacientes
4. "¿Cuánto cuesta?", "¿Dónde queda?" se responde 30+ veces/día
5. Gestión en Excel/papel/iSalud sin automatización

---

## 🏗️ Stack Tecnológico

```
FRONTEND + BACKEND    →  Next.js 14+ (App Router) + TypeScript → Vercel
BASE DE DATOS         →  Supabase (PostgreSQL + Auth + Realtime)
MENSAJERÍA            →  WhatsApp Business Cloud API (Meta)
IA                    →  Claude API (Anthropic) — claude-sonnet
CRON JOBS             →  Vercel Cron / Supabase Edge Functions
PAGOS                 →  Wompi (PSE, Nequi, tarjetas en COP)
UI                    →  Tailwind CSS + shadcn/ui
VALIDACIÓN            →  Zod
FECHAS                →  date-fns + date-fns-tz
```

**¿Por qué?** Un solo proyecto fullstack (Next.js), DB managed sin config (Supabase), deploy sin servidores (Vercel), tiers gratis generosos para MVP. Claude es el mejor modelo para conversaciones empáticas en español.

---

## 📁 Estructura del Proyecto

```
src/
├── app/
│   ├── (auth)/login/ & register/
│   ├── (dashboard)/
│   │   ├── appointments/        # Ver/gestionar citas
│   │   ├── patients/            # Directorio pacientes
│   │   ├── settings/            # Config agente, horarios, precios, FAQ
│   │   ├── analytics/           # Métricas no-show, citas
│   │   └── conversations/       # Ver conversaciones del agente
│   ├── api/
│   │   ├── webhooks/whatsapp/   # Recibe mensajes de WhatsApp
│   │   ├── appointments/        # CRUD citas
│   │   ├── patients/            # CRUD pacientes
│   │   └── cron/                # Recordatorios programados
│   └── page.tsx                 # Landing pública
├── agents/
│   ├── appointment-agent.ts     # Agente principal
│   ├── faq-agent.ts             # Respuestas automáticas
│   ├── reminder-agent.ts        # Lógica recordatorios
│   └── prompts/                 # System prompts por agente
├── lib/
│   ├── supabase/                # client.ts, server.ts, admin.ts
│   ├── whatsapp/                # client.ts, templates.ts, webhook-handler.ts
│   ├── anthropic/               # client.ts, tools.ts
│   ├── payments/wompi.ts
│   ├── validators/              # Schemas Zod
│   └── utils.ts
├── components/
│   ├── ui/                      # shadcn/ui base
│   ├── dashboard/
│   └── appointments/
├── hooks/
├── types/                       # database.ts, whatsapp.ts, appointments.ts
└── styles/
supabase/
├── migrations/                  # SQL migrations
├── seed.sql
└── functions/send-reminders/
```

---

## 🗄️ Base de Datos (Supabase/PostgreSQL)

```sql
-- CLÍNICAS (tenants principales)
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    whatsapp_phone_id TEXT,
    whatsapp_token TEXT,                    -- ENCRIPTADO
    address TEXT,
    city TEXT DEFAULT 'Pereira',
    department TEXT DEFAULT 'Risaralda',
    specialty TEXT,
    consultation_price INTEGER,             -- COP sin decimales
    consultation_duration_minutes INTEGER DEFAULT 30,
    working_hours JSONB DEFAULT '{
        "monday":{"start":"08:00","end":"18:00","active":true},
        "tuesday":{"start":"08:00","end":"18:00","active":true},
        "wednesday":{"start":"08:00","end":"18:00","active":true},
        "thursday":{"start":"08:00","end":"18:00","active":true},
        "friday":{"start":"08:00","end":"18:00","active":true},
        "saturday":{"start":"08:00","end":"13:00","active":true},
        "sunday":{"start":"08:00","end":"12:00","active":false}
    }',
    faq JSONB DEFAULT '[]',
    agent_name TEXT DEFAULT 'Asistente',
    agent_personality TEXT DEFAULT 'profesional y amable',
    welcome_message TEXT,
    subscription_status TEXT DEFAULT 'trial',
    subscription_plan TEXT DEFAULT 'basic',
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOCTORES
CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    working_hours JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PACIENTES
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,                     -- +57 3XX XXX XXXX
    email TEXT,
    document_type TEXT DEFAULT 'CC',         -- CC, TI, CE, PP
    document_number TEXT,
    date_of_birth DATE,
    eps TEXT,
    notes TEXT,
    no_show_count INTEGER DEFAULT 0,
    total_appointments INTEGER DEFAULT 0,
    data_consent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id, phone)
);

-- CITAS
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(id),
    patient_id UUID REFERENCES patients(id),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'confirmed',         -- confirmed, cancelled, completed, no_show, rescheduled
    reason TEXT,
    source TEXT DEFAULT 'whatsapp_agent',    -- whatsapp_agent, manual, dashboard
    notes TEXT,
    reminder_24h_sent BOOLEAN DEFAULT false,
    reminder_2h_sent BOOLEAN DEFAULT false,
    confirmation_received BOOLEAN DEFAULT false,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSACIONES
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id),
    whatsapp_phone TEXT NOT NULL,
    status TEXT DEFAULT 'active',            -- active, resolved, escalated
    escalated_to TEXT,
    escalated_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    context JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENSAJES
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                      -- patient, agent, staff
    content TEXT NOT NULL,
    whatsapp_message_id TEXT,
    message_type TEXT DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RECORDATORIOS
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                      -- 24h, 2h
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',           -- pending, sent, failed
    response TEXT,                           -- confirmed, rescheduled, cancelled, no_response
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDITORÍA
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id),
    action TEXT NOT NULL,
    actor_type TEXT NOT NULL,                -- agent, staff, system, patient
    actor_id TEXT,
    target_type TEXT,
    target_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ÍNDICES
CREATE INDEX idx_appointments_clinic_date ON appointments(clinic_id, starts_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_patients_clinic_phone ON patients(clinic_id, phone);
CREATE INDEX idx_conversations_clinic ON conversations(clinic_id, status);
CREATE INDEX idx_reminders_pending ON reminders(status, scheduled_for);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- RLS (cada clínica solo ve sus datos)
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
```

---

## 🤖 Agente de WhatsApp

### Flujo

```
Paciente escribe → Webhook recibe → Identificar clínica → Buscar/crear paciente
→ Cargar contexto (conversación + citas + config) → Claude API (prompt + tools)
→ Ejecutar tool si aplica → Enviar respuesta por WhatsApp → Guardar en DB
```

### System Prompt (base)

```
Eres el asistente virtual de {clinic.name}. Tu nombre es {clinic.agent_name}.

ROL: Secretaria virtual. Agendas citas, respondes FAQ, confirmas/cancelas citas.

INFO DEL CONSULTORIO:
- Especialidad: {specialty} | Dirección: {address}, {city}
- Precio: ${consultation_price} COP | Duración: {duration} min
- Horarios: {working_hours}
- Doctor: {doctor.name} — {doctor.specialty}
- FAQ: {clinic.faq}

REGLAS INQUEBRANTABLES:
1. NUNCA des diagnósticos ni recomiendes medicamentos
2. NUNCA compartas info de un paciente con otro
3. NUNCA inventes info (precios, horarios, servicios)
4. Emergencia → "Llama al 123 o ve a urgencias AHORA"
5. Paciente pide humano (1 intento de retención) → escala
6. No sabes algo → "Lo consulto con el consultorio"
7. SIEMPRE confirma datos antes de agendar (fecha, hora, nombre)
8. Hora colombiana: 2:00 PM (no 14:00). Dinero: $80.000 COP
9. Primer mensaje a paciente nuevo → aviso de privacidad

TONO: {agent_personality}. Tutear. Lenguaje sencillo. Breve (3-4 líneas máx).
Emojis con moderación. NO markdown. NO "Estimado usuario".
SÍ: "¡Hola!", "¡Listo!", "¡Perfecto!", "Con gusto"

CONFIRMACIÓN DE CITA:
✅ Cita agendada:
📅 [martes 15 de marzo]
🕐 [2:00 PM]
👨‍⚕️ [Doctor]
📍 [Dirección]

ZONA HORARIA: America/Bogota (UTC-5). Fecha actual: {now}
```

### Tools (Function Calling)

| Tool | Descripción | Params requeridos |
|---|---|---|
| `check_availability` | Horarios disponibles | doctor_id, preferred_date?, preferred_time? |
| `create_appointment` | Agendar cita (solo tras confirmación del paciente) | doctor_id, patient_name, patient_phone, starts_at |
| `get_patient_appointments` | Citas futuras del paciente | patient_phone |
| `cancel_appointment` | Cancelar cita | appointment_id, reason |
| `reschedule_appointment` | Reagendar cita | appointment_id, new_starts_at |
| `escalate_to_human` | Escalar a humano | reason, urgency (low/medium/high/emergency) |

### Config Claude API
- Modelo: `claude-sonnet-4-20250514`
- Max tokens: 1024 (respuestas cortas para WhatsApp)
- Temperature: 0.3 (consistencia)
- Siempre incluir tools en cada llamada

---

## 🗺️ Roadmap

### Fase 0 — Setup (Semana 1-2)
- [ ] Next.js + TS + Tailwind + shadcn/ui
- [ ] Supabase: proyecto, tablas, auth, RLS
- [ ] WhatsApp Business API (Meta Business Manager)
- [ ] API key Claude (Anthropic)
- [ ] Git repo + .env.example + deploy Vercel

### Fase 1 — MVP: Agente + Citas (Semana 3-6)
- [ ] Webhook WhatsApp funcionando
- [ ] Claude API + system prompt + tools
- [ ] check_availability, create_appointment, cancel_appointment
- [ ] FAQ automáticas (horarios, precios, ubicación)
- [ ] Dashboard mínimo: citas del día
- [ ] Registro auto de pacientes nuevos
- [ ] Aviso de privacidad en primer contacto
- [ ] **🎯 1 clínica piloto en producción**

### Fase 2 — Anti No-Show (Semana 7-9)
- [ ] Recordatorio 24h antes (WhatsApp template)
- [ ] Recordatorio 2h antes con confirmar/cancelar
- [ ] Reagendamiento desde recordatorio
- [ ] Cron job envío recordatorios
- [ ] Marcado automático de no-shows

### Fase 3 — Dashboard Completo (Semana 10-13)
- [ ] Calendario visual (día/semana)
- [ ] Gestión horarios doctor (bloquear fechas, vacaciones)
- [ ] Config FAQ, nombre y tono del agente
- [ ] Directorio pacientes + historial
- [ ] Ver/responder conversaciones (takeover humano)
- [ ] Notificaciones al staff
- [ ] Onboarding guiado nuevas clínicas

### Fase 4 — Monetización (Semana 14-16)
- [ ] Wompi (PSE, Nequi, tarjetas COP)
- [ ] Planes Basic/Pro + trial 14 días
- [ ] Landing + pricing
- [ ] Panel admin interno

### Fase 5 — Escalar (Mes 5+)
- [ ] SEO Colombia, múltiples doctores, export CSV (iSalud)
- [ ] Agente de voz, telemedicina, app móvil

---

## 🔒 Seguridad — Ley 1581/2012 (Colombia)

**REGLAS NO NEGOCIABLES:**
1. Consentimiento obligatorio antes de interactuar (aviso de privacidad en primer mensaje)
2. Datos de salud = dato SENSIBLE → consentimiento explícito + seguridad reforzada
3. Derechos ARCO: paciente puede pedir acceso, rectificación, cancelación, oposición
4. Registrar bases de datos en RNBD (Superintendencia de Industria y Comercio)
5. Variables sensibles SOLO en .env (nunca en código)
6. Tokens WhatsApp encriptados en DB
7. HTTPS obligatorio
8. Supabase RLS activo siempre (multi-tenant)
9. Audit log para acciones críticas
10. Sanitizar input del paciente antes del LLM
11. Rate limiting en webhooks/API
12. No loggear datos sensibles (teléfonos completos, documentos)

---

## 🆘 Emergencias y Escalamiento

**Emergencia médica** → "⚠️ Llama al 123 o ve a urgencias AHORA" + notificar staff
**Ideación suicida** → Empatía + Línea 106 (Colombia) + escalar urgency:emergency
**Pide humano** → 1 intento de retención → escalar sin resistencia

---

## 💰 Precios Sugeridos

| | Basic | Pro |
|---|---|---|
| Setup (único) | $200.000 COP | $400.000 COP |
| Mensualidad | $150.000 COP | $300.000 COP |
| Doctores | 1 | Hasta 3 |
| Conversaciones/mes | 500 | 2.000 |
| Recordatorios | ✅ | ✅ |
| FAQ personalizadas | 10 | Ilimitadas |
| Dashboard | Básico | Completo + analytics |

**Costo operativo por clínica:** ~$10-50 USD/mes → margen saludable.

---

## 🔄 Convivencia con iSalud

**MVP:** Agenda propia en Supabase. Sync manual. Export CSV desde dashboard.
**Futuro:** Investigar API de iSalud o posicionarse como reemplazo para consultorios pequeños.

---

## 🧪 Tests Críticos

| Escenario | Esperado |
|---|---|
| Agenda horario disponible | ✅ Cita + confirmación |
| Horario ocupado | Ofrece alternativas |
| Domingo (cerrado) | Informa horarios |
| Cancela cita | ✅ Cancelada + ofrece reagendar |
| Emergencia | "Llama al 123" |
| Pregunta precio | Precio correcto en COP |
| Escribe 11 PM | Responde (24/7) |
| Pide humano | Escala tras 1 intento |
| Audio/imagen | "Solo manejo texto por ahora" |
| 2 pacientes misma hora | Solo 1 lo logra |

---

## 📏 Convenciones de Código

```
TYPESCRIPT estricto. No `any`. Tipos para todo.
Archivos: kebab-case. Funciones: camelCase. Tipos: PascalCase. DB: snake_case.
Imports: @/ aliases.
Errores: try/catch siempre. NUNCA exponer al paciente. Mensaje genérico + "escribe 'hablar con humano'".
Validar input con Zod. Filtrar SIEMPRE por clinic_id.
WhatsApp: máx 4096 chars. Templates para proactivos, reactivos sin template.
Commits en español: feat(agente): agregar reagendamiento
Dinero: $150.000 COP (punto como separador miles, sin decimales).
Teléfono: almacenar +57, mostrar 3XX XXX XXXX.
Zona horaria: SIEMPRE America/Bogota. UTC en DB, COT para mostrar.
```

---

## 🌐 Variables de Entorno

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
WHATSAPP_VERIFY_TOKEN=mi-token-secreto
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_EVENTS_SECRET=test_events_...
WOMPI_ENVIRONMENT=sandbox
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
CRON_SECRET=secreto-cron
```

---

## 🚀 Comandos

```bash
npm run dev          # localhost:3000
npm run build        # Build producción
npm run lint         # Linter
npm run test         # Tests
npx supabase start   # DB local
npx supabase db push # Migraciones
npx supabase gen types typescript --local > src/types/database.ts
npm run seed         # Datos demo
```

---

## 📞 WhatsApp Templates (requieren aprobación Meta)

```
RECORDATORIO 24H (appointment_reminder_24h, UTILITY):
"Hola {{1}}, te recordamos tu cita mañana {{2}} a las {{3}} en {{4}}.
¿Confirmas? ✅ Sí | ❌ No puedo | 📅 Reagendar"

RECORDATORIO 2H (appointment_reminder_2h, UTILITY):
"{{1}}, tu cita es en 2 horas ({{2}}). 📍 {{3}}. Te esperamos."

CITA CONFIRMADA (appointment_confirmed, UTILITY):
"✅ Cita agendada: 📅 {{1}} 🕐 {{2}} 👨‍⚕️ {{3}} 📍 {{4}}.
Si necesitas cambiar algo, escríbenos."
```

---

## 📝 Notas para Claude Code

```
1. SOY NUEVO EN PROGRAMACIÓN. Explica decisiones. Sugiere mejores prácticas.
2. COLOMBIA: COP sin decimales ($150.000), +57 cel, CC/TI/CE, EPS,
   America/Bogota UTC-5, DD/MM/YYYY, 12h AM/PM.
3. PRIORIDAD: Que funcione > que sea perfecto. MVP funcional primero.
4. Cada archivo nuevo debe seguir la estructura de este CLAUDE.md.
5. Si agregas dependencia, explica POR QUÉ y si hay alternativa más simple.
6. WhatsApp = mensajes CORTOS y NATURALES. Nada de "Estimado usuario".
7. Comentarios y UI en ESPAÑOL. Nombres técnicos en inglés.
8. Ante la duda entre dos opciones, elige la más SIMPLE.
9. SIEMPRE verificar que RLS esté activo y filtrar por clinic_id.
10. Zona horaria: America/Bogota SIEMPRE. Cuidado con UTC vs COT.
```

---

*Última actualización: Febrero 2026 | Versión: 1.0 — MVP*
