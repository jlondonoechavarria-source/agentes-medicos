// ============================================================
// DASHBOARD — Vista de citas del día con semáforo de no-show
// Ruta: /dashboard
//
// Muestra:
// - Citas del día con semáforo (🟢 confirmó, 🟡 pendiente, 🔴 riesgo)
// - Perfil de cada paciente al hacer clic
// - Estadísticas generales de no-show
// ============================================================

import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatTimeForPatient, nowColombia, formatCOP, formatPhone } from '@/lib/utils/dates'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Forzar que se renderice en cada request (datos en tiempo real)
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const now = nowColombia()
  const today = format(now, 'yyyy-MM-dd')
  const todayFormatted = format(now, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })

  // Obtener la primera clínica (MVP: una sola clínica)
  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .limit(1)
    .single()

  if (!clinic) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-gray-500">No hay clínica configurada.</p>
      </main>
    )
  }

  // Citas del día con datos del paciente y doctor
  const { data: appointments } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, starts_at, ends_at, status, reason, reminder_24h_sent, reminder_confirmed,
      patients(id, name, phone, no_show_probability, no_show_count, total_appointments, document_type, document_number, date_of_birth, doctor_notes, data_consent_at),
      doctors(name, specialty)
    `)
    .eq('clinic_id', clinic.id)
    .in('status', ['confirmed', 'rescheduled', 'completed', 'no_show'])
    .gte('starts_at', `${today}T00:00:00-05:00`)
    .lte('starts_at', `${today}T23:59:59-05:00`)
    .order('starts_at', { ascending: true })

  // Estadísticas generales
  const { count: totalAllTime } = await supabaseAdmin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.id)
    .in('status', ['completed', 'no_show'])

  const { count: totalNoShows } = await supabaseAdmin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.id)
    .eq('status', 'no_show')

  const noShowRate = totalAllTime && totalAllTime > 0
    ? Math.round(((totalNoShows ?? 0) / totalAllTime) * 100)
    : 0

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">{clinic.name}</h1>
        <p className="text-gray-500 capitalize">{todayFormatted}</p>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Estadísticas */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Citas hoy"
            value={String(appointments?.length ?? 0)}
            color="blue"
          />
          <StatCard
            label="Tasa de no-show"
            value={`${noShowRate}%`}
            color={noShowRate > 20 ? 'red' : 'green'}
          />
          <StatCard
            label="Consulta"
            value={clinic.consultation_price ? formatCOP(clinic.consultation_price) : '-'}
            color="gray"
          />
        </div>

        {/* Leyenda */}
        <div className="flex gap-4 text-sm text-gray-600">
          <span>🟢 Confirmó</span>
          <span>🟡 Pendiente</span>
          <span>🔴 Alto riesgo no-show</span>
        </div>

        {/* Lista de citas */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Citas del día</h2>
          {(!appointments || appointments.length === 0) ? (
            <p className="text-gray-400 bg-white rounded-lg p-6 text-center">
              No hay citas agendadas para hoy
            </p>
          ) : (
            appointments.map((apt) => {
              const patient = apt.patients as unknown as {
                id: string; name: string; phone: string;
                no_show_probability: number; no_show_count: number;
                total_appointments: number; document_type: string;
                document_number: string; date_of_birth: string;
                doctor_notes: string; data_consent_at: string;
              } | null
              const doctor = apt.doctors as unknown as { name: string; specialty: string } | null

              const probability = patient?.no_show_probability ?? 0
              let indicator = '🟡'
              let bgColor = 'bg-yellow-50 border-yellow-200'

              if (apt.reminder_confirmed === true) {
                indicator = '🟢'
                bgColor = 'bg-green-50 border-green-200'
              } else if (probability > 40) {
                indicator = '🔴'
                bgColor = 'bg-red-50 border-red-200'
              }

              if (apt.status === 'completed') {
                indicator = '✅'
                bgColor = 'bg-gray-50 border-gray-200'
              } else if (apt.status === 'no_show') {
                indicator = '❌'
                bgColor = 'bg-red-100 border-red-300'
              }

              return (
                <details key={apt.id} className={`rounded-lg border p-4 ${bgColor}`}>
                  <summary className="cursor-pointer flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{indicator}</span>
                      <div>
                        <span className="font-medium text-gray-900">
                          {formatTimeForPatient(apt.starts_at)}
                        </span>
                        <span className="mx-2 text-gray-400">—</span>
                        <span className="text-gray-700">{patient?.name ?? 'Paciente'}</span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {probability > 0 && `${probability}% riesgo`}
                    </div>
                  </summary>

                  {/* Perfil del paciente (expandible) */}
                  {patient && (
                    <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Teléfono</p>
                        <p className="font-medium">{formatPhone(patient.phone)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Documento</p>
                        <p className="font-medium">
                          {patient.document_type} {patient.document_number ?? 'No registrado'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Fecha de nacimiento</p>
                        <p className="font-medium">{patient.date_of_birth ?? 'No registrada'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Doctor</p>
                        <p className="font-medium">{doctor?.name ?? '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Motivo</p>
                        <p className="font-medium">{apt.reason ?? 'No especificado'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Recordatorio</p>
                        <p className="font-medium">
                          {apt.reminder_confirmed === true ? '✅ Confirmó' :
                           apt.reminder_confirmed === false ? '❌ No confirmó' :
                           apt.reminder_24h_sent ? '⏳ Enviado, sin respuesta' : '⬜ No enviado aún'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Historial</p>
                        <p className="font-medium">
                          {patient.total_appointments} citas, {patient.no_show_count} no-shows
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Probabilidad no-show</p>
                        <p className={`font-medium ${probability > 40 ? 'text-red-600' : probability > 20 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {probability}%
                        </p>
                      </div>
                      {patient.doctor_notes && (
                        <div className="col-span-2">
                          <p className="text-gray-500">Notas del doctor</p>
                          <p className="font-medium">{patient.doctor_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  }

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color] ?? colorClasses.gray}`}>
      <p className="text-sm opacity-75">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
