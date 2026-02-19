// ============================================================
// Tipos TypeScript para TODAS las tablas de Supabase
// Cada tipo refleja exactamente las columnas de la tabla SQL
// ============================================================

// --- Horarios de trabajo (usado por clínicas y doctores) ---
export interface WorkingDay {
  start: string   // "08:00"
  end: string     // "18:00"
  active: boolean // true = atiende ese día
}

export interface WorkingHours {
  monday: WorkingDay
  tuesday: WorkingDay
  wednesday: WorkingDay
  thursday: WorkingDay
  friday: WorkingDay
  saturday: WorkingDay
  sunday: WorkingDay
}

// --- FAQ personalizada de cada clínica ---
export interface FaqItem {
  pregunta: string
  respuesta: string
}

// --- CLÍNICAS (tabla: clinics) ---
export interface Clinic {
  id: string
  name: string
  slug: string
  phone: string
  whatsapp_phone_id: string | null
  whatsapp_token: string | null
  address: string | null
  city: string
  department: string
  specialty: string | null
  consultation_price: number | null        // COP sin decimales
  consultation_duration_minutes: number
  working_hours: WorkingHours
  faq: FaqItem[]
  agent_name: string
  agent_personality: string
  welcome_message: string | null
  subscription_status: 'trial' | 'active' | 'cancelled' | 'expired'
  subscription_plan: 'basic' | 'pro'
  trial_ends_at: string | null             // ISO 8601
  google_sheet_id: string | null           // ID de Google Sheets vinculado
  doctor_email: string | null              // Email del doctor para compartir Sheet
  created_at: string
  updated_at: string
}

// --- DOCTORES (tabla: doctors) ---
export interface Doctor {
  id: string
  clinic_id: string
  name: string
  specialty: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  working_hours: WorkingHours | null       // null = usa horarios de la clínica
  created_at: string
}

// --- PACIENTES (tabla: patients) ---
export type DocumentType = 'CC' | 'TI' | 'CE' | 'PP'

export interface Patient {
  id: string
  clinic_id: string
  name: string
  phone: string                            // +573XXXXXXXXX
  email: string | null
  document_type: DocumentType
  document_number: string | null
  date_of_birth: string | null             // YYYY-MM-DD
  eps: string | null
  notes: string | null
  no_show_count: number
  total_appointments: number
  data_consent_at: string | null           // null = no ha aceptado privacidad
  created_at: string
  updated_at: string
}

// --- CITAS (tabla: appointments) ---
export type AppointmentStatus =
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'rescheduled'

export type AppointmentSource =
  | 'whatsapp_agent'
  | 'manual'
  | 'dashboard'

export interface Appointment {
  id: string
  clinic_id: string
  doctor_id: string
  patient_id: string
  starts_at: string                        // ISO 8601 en UTC
  ends_at: string
  status: AppointmentStatus
  reason: string | null
  source: AppointmentSource
  notes: string | null
  reminder_24h_sent: boolean
  reminder_2h_sent: boolean
  confirmation_received: boolean
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

// --- CONVERSACIONES (tabla: conversations) ---
export type ConversationStatus = 'active' | 'resolved' | 'escalated'

export interface Conversation {
  id: string
  clinic_id: string
  patient_id: string | null
  whatsapp_phone: string
  status: ConversationStatus
  escalated_to: string | null
  escalated_at: string | null
  last_message_at: string
  context: Record<string, unknown>
  created_at: string
}

// --- MENSAJES (tabla: messages) ---
export type MessageRole = 'patient' | 'agent' | 'staff'

export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  whatsapp_message_id: string | null
  message_type: string                     // text, image, audio, etc.
  metadata: Record<string, unknown>
  created_at: string
}

// --- RECORDATORIOS (tabla: reminders) ---
export type ReminderType = '24h' | '2h'
export type ReminderStatus = 'pending' | 'sent' | 'failed'
export type ReminderResponse = 'confirmed' | 'rescheduled' | 'cancelled' | 'no_response'

export interface Reminder {
  id: string
  appointment_id: string
  type: ReminderType
  scheduled_for: string
  sent_at: string | null
  status: ReminderStatus
  response: ReminderResponse | null
  created_at: string
}

// --- LISTA DE ESPERA (tabla: waitlist) ---
export type WaitlistStatus = 'waiting' | 'notified' | 'converted' | 'expired'
export type PreferredTime = 'morning' | 'afternoon' | 'any'

export interface WaitlistEntry {
  id: string
  clinic_id: string
  patient_id: string
  doctor_id: string
  preferred_dates: string[]                // ["2026-02-15", "2026-02-16"]
  preferred_time: PreferredTime
  reason: string | null
  status: WaitlistStatus
  notified_at: string | null
  converted_appointment_id: string | null
  created_at: string
}

// --- AUDITORÍA (tabla: audit_log) ---
export type ActorType = 'agent' | 'staff' | 'system' | 'patient'

export interface AuditLog {
  id: string
  clinic_id: string
  action: string
  actor_type: ActorType
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  created_at: string
}

// --- Tipos auxiliares para consultas con JOINs ---
// Cuando consultamos una cita, a veces necesitamos el nombre del paciente y doctor
export interface AppointmentWithDetails extends Appointment {
  patient: Pick<Patient, 'name' | 'phone'>
  doctor: Pick<Doctor, 'name' | 'specialty'>
}
