// ============================================================
// Sincroniza la pestaña "Finanzas" del Google Sheet
// Resumen mensual de los últimos 6 meses con ingresos en COP
// ============================================================

import { getSheetsClient } from './client'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatCOP, nowColombia } from '@/lib/utils/dates'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'

export async function syncFinancesTab(clinicId: string, sheetId: string): Promise<void> {
  const sheets = getSheetsClient()

  // Obtener precio de consulta
  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('consultation_price')
    .eq('id', clinicId)
    .single()

  const price = clinic?.consultation_price ?? 0
  const now = nowColombia()
  const rows: (string | number)[][] = []

  // Últimos 6 meses
  for (let i = 0; i < 6; i++) {
    const monthDate = subMonths(now, i)
    const monthStart = startOfMonth(monthDate).toISOString()
    const monthEnd = endOfMonth(monthDate).toISOString()
    const monthLabel = format(monthDate, 'MMMM yyyy', { locale: es })

    const { data: appointments } = await supabaseAdmin
      .from('appointments')
      .select('status')
      .eq('clinic_id', clinicId)
      .gte('starts_at', monthStart)
      .lte('starts_at', monthEnd)

    const completed = (appointments ?? []).filter(a => a.status === 'completed').length
    const noShows = (appointments ?? []).filter(a => a.status === 'no_show').length
    const cancelled = (appointments ?? []).filter(a => a.status === 'cancelled').length
    const total = completed + noShows

    rows.push([
      monthLabel,
      completed,
      noShows,
      cancelled,
      formatCOP(completed * price),
      formatCOP(noShows * price),
      total > 0 ? `${Math.round((noShows / total) * 100)}%` : '0%',
    ])
  }

  const headers = [
    'Mes', 'Completadas', 'No-Shows', 'Canceladas',
    'Ingresos', 'Ingresos Perdidos', 'Tasa No-Show'
  ]

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Finanzas!A:Z',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Finanzas!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers, ...rows] },
  })
}
