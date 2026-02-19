// ============================================================
// Sincroniza la pestaña "Citas" del Google Sheet
// Muestra las últimas 500 citas ordenadas por fecha (más reciente primero)
// ============================================================

import { getSheetsClient } from './client'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatPhone, formatDateForPatient, formatTimeForPatient } from '@/lib/utils/dates'

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  no_show: 'No asistió',
  rescheduled: 'Reagendada',
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp_agent: 'WhatsApp',
  manual: 'Manual',
  dashboard: 'Dashboard',
}

export async function syncAppointmentsTab(clinicId: string, sheetId: string): Promise<void> {
  const sheets = getSheetsClient()

  const { data: appointments } = await supabaseAdmin
    .from('appointments')
    .select(`
      starts_at, status, reason, source,
      reminder_24h_sent, reminder_confirmed, created_at,
      patients(name, phone),
      doctors(name)
    `)
    .eq('clinic_id', clinicId)
    .order('starts_at', { ascending: false })
    .limit(500)

  if (!appointments) return

  const headers = [
    'Fecha', 'Hora', 'Paciente', 'Teléfono', 'Doctor', 'Estado',
    'Motivo', 'Fuente', 'Recordatorio', 'Confirmó'
  ]

  const rows = appointments.map(apt => {
    const patient = apt.patients as unknown as { name: string; phone: string } | null
    const doctor = apt.doctors as unknown as { name: string } | null

    return [
      formatDateForPatient(apt.starts_at),
      formatTimeForPatient(apt.starts_at),
      patient?.name ?? '',
      patient ? formatPhone(patient.phone) : '',
      doctor?.name ?? '',
      STATUS_LABELS[apt.status] ?? apt.status,
      apt.reason ?? '',
      SOURCE_LABELS[apt.source] ?? apt.source,
      apt.reminder_24h_sent ? 'Sí' : 'No',
      apt.reminder_confirmed === true ? 'Sí' :
        apt.reminder_confirmed === false ? 'No' : 'Pendiente',
    ]
  })

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Citas!A:Z',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Citas!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers, ...rows] },
  })
}
