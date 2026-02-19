// ============================================================
// Sincroniza la pestaña "Pacientes" del Google Sheet
// Estrategia: FULL REPLACE (borrar + escribir)
// ============================================================

import { getSheetsClient } from './client'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatPhone } from '@/lib/utils/dates'

export async function syncPatientsTab(clinicId: string, sheetId: string): Promise<void> {
  const sheets = getSheetsClient()

  const { data: patients } = await supabaseAdmin
    .from('patients')
    .select('name, phone, document_type, document_number, eps, total_appointments, no_show_count, no_show_probability, created_at')
    .eq('clinic_id', clinicId)
    .order('name', { ascending: true })

  if (!patients) return

  const headers = [
    'Nombre', 'Teléfono', 'Tipo Doc', 'Documento', 'EPS',
    'Citas Totales', 'No-Shows', '% No-Show', 'Registrado'
  ]

  const rows = patients.map(p => [
    p.name,
    formatPhone(p.phone),
    p.document_type ?? '',
    p.document_number ?? '',
    p.eps ?? '',
    p.total_appointments ?? 0,
    p.no_show_count ?? 0,
    `${p.no_show_probability ?? 0}%`,
    new Date(p.created_at).toLocaleDateString('es-CO'),
  ])

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Pacientes!A:Z',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Pacientes!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers, ...rows] },
  })
}
