// ============================================================
// Orquestador de sincronización Google Sheets
// Uso: syncClinicSheet(clinicId, ['appointments', 'patients'])
// FIRE-AND-FORGET: nunca lanza errores, solo loguea
// ============================================================

import { supabaseAdmin } from '@/lib/supabase/admin'
import { syncPatientsTab } from './sync-patients'
import { syncAppointmentsTab } from './sync-appointments'
import { syncFinancesTab } from './sync-finances'
import { syncNoShowStatsTab } from './sync-noshow-stats'

type SyncTab = 'patients' | 'appointments' | 'finances' | 'noshow_stats'

export async function syncClinicSheet(
  clinicId: string,
  tabs: SyncTab[]
): Promise<void> {
  try {
    // Verificar que la clínica tiene Google Sheet configurado
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('google_sheet_id')
      .eq('id', clinicId)
      .single()

    if (!clinic?.google_sheet_id) {
      // No tiene hoja configurada — silencioso
      return
    }

    const sheetId = clinic.google_sheet_id

    // Ejecutar syncs en paralelo (son independientes entre sí)
    const syncPromises: Promise<void>[] = []

    if (tabs.includes('patients')) {
      syncPromises.push(syncPatientsTab(clinicId, sheetId))
    }
    if (tabs.includes('appointments')) {
      syncPromises.push(syncAppointmentsTab(clinicId, sheetId))
    }
    if (tabs.includes('finances')) {
      syncPromises.push(syncFinancesTab(clinicId, sheetId))
    }
    if (tabs.includes('noshow_stats')) {
      syncPromises.push(syncNoShowStatsTab(clinicId, sheetId))
    }

    await Promise.allSettled(syncPromises)

    console.log(`[Sheets] Sync completado para clínica ${clinicId}: [${tabs.join(', ')}]`)
  } catch (error) {
    // NUNCA lanzar — fire-and-forget
    console.error(`[Sheets] Error sincronizando clínica ${clinicId}:`, error)
  }
}

export { createClinicSheet } from './create-sheet'
