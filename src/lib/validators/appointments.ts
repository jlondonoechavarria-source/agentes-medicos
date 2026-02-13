// ============================================================
// Validadores Zod para citas
// Valida datos antes de crear/modificar citas en la DB
// ============================================================

import { z } from 'zod'

// Validar datos para crear una cita nueva
export const createAppointmentSchema = z.object({
  clinic_id: z.string().uuid('ID de clínica no válido'),
  doctor_id: z.string().uuid('ID de doctor no válido'),
  patient_id: z.string().uuid('ID de paciente no válido'),
  starts_at: z.string().datetime({ message: 'Fecha de inicio no válida (debe ser ISO 8601)' }),
  ends_at: z.string().datetime({ message: 'Fecha de fin no válida (debe ser ISO 8601)' }),
  reason: z.string().max(500, 'El motivo no puede exceder 500 caracteres').optional(),
  source: z.enum(['whatsapp_agent', 'manual', 'dashboard']).default('whatsapp_agent'),
})

// Validar datos para cancelar una cita
export const cancelAppointmentSchema = z.object({
  appointment_id: z.string().uuid('ID de cita no válido'),
  reason: z.string().max(500, 'El motivo no puede exceder 500 caracteres'),
})

// Validar datos para reagendar una cita
export const rescheduleAppointmentSchema = z.object({
  appointment_id: z.string().uuid('ID de cita no válido'),
  new_starts_at: z.string().datetime({ message: 'Nueva fecha no válida (debe ser ISO 8601)' }),
  new_ends_at: z.string().datetime({ message: 'Nueva fecha fin no válida (debe ser ISO 8601)' }),
})

// Validar teléfono colombiano
export const colombianPhoneSchema = z
  .string()
  .regex(
    /^\+573\d{9}$/,
    'Teléfono no válido. Formato esperado: +573XXXXXXXXX'
  )

// Tipos derivados de los schemas
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>
