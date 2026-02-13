// ============================================================
// Webhook de WhatsApp — El punto de entrada de TODO el sistema
//
// FLUJO COMPLETO:
// 1. Meta/WhatsApp envía un POST con el mensaje del paciente
// 2. Respondemos 200 inmediatamente (Meta exige respuesta rápida)
// 3. En background (waitUntil) procesamos el mensaje:
//    a. Validar payload
//    b. Identificar clínica por whatsapp_phone_id
//    c. Buscar o crear paciente
//    d. Buscar o crear conversación
//    e. Guardar mensaje del paciente en DB
//    f. Si la conversación está escalada → no responder (un humano se encarga)
//    g. Si es paciente nuevo → enviar aviso de privacidad (Ley 1581)
//    h. Sanitizar mensaje → ejecutar agente → guardar respuesta → enviar por WhatsApp
//
// También maneja GET para la verificación inicial del webhook por Meta
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWhatsAppMessage, markAsRead } from '@/lib/whatsapp/client'
import { sanitizePatientMessage, isSupportedMessageType, getUnsupportedTypeMessage } from '@/lib/whatsapp/sanitize'
import { runAppointmentAgent } from '@/agents/appointment-agent'
import { normalizePhone } from '@/lib/utils/dates'
import { whatsappWebhookSchema } from '@/lib/validators/whatsapp'
import type { Clinic, Doctor, Conversation, Patient, Message } from '@/types/database'

// ============================================================
// GET — Verificación del webhook (Meta lo llama UNA vez al configurar)
// Meta envía un token y espera que se lo devolvamos para confirmar
// ============================================================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Verificar que el token coincida con el nuestro
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] Verificación exitosa')
    // Meta espera que devolvamos el challenge como texto plano
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[Webhook] Verificación fallida — token no coincide')
  return NextResponse.json({ error: 'Token no válido' }, { status: 403 })
}

// ============================================================
// POST — Recibe mensajes de WhatsApp
// Respondemos 200 inmediato y procesamos en background
// ============================================================
export async function POST(request: NextRequest) {
  // 1. Leer el body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // 2. Responder 200 inmediato (Meta requiere respuesta en <5 segundos)
  //    El procesamiento real ocurre en background con waitUntil
  const response = NextResponse.json({ status: 'received' }, { status: 200 })

  // 3. Procesar en background — no bloqueamos la respuesta HTTP
  //    waitUntil permite que el código siga corriendo después de enviar el 200
  try {
    // @ts-expect-error — waitUntil existe en el runtime de Vercel/Edge
    const waitUntilFn = globalThis[Symbol.for('next.waitUntil')] ?? (request as unknown as { waitUntil?: (p: Promise<void>) => void }).waitUntil
    if (typeof waitUntilFn === 'function') {
      waitUntilFn(processWebhook(body))
    } else {
      // Fallback: si no hay waitUntil (dev local), procesar directamente
      processWebhook(body).catch((err) =>
        console.error('[Webhook] Error en procesamiento:', err)
      )
    }
  } catch {
    // Si falla el setup de waitUntil, procesar de todas formas
    processWebhook(body).catch((err) =>
      console.error('[Webhook] Error en procesamiento:', err)
    )
  }

  return response
}

// ============================================================
// PROCESAMIENTO PRINCIPAL — Corre en background
// ============================================================
async function processWebhook(body: unknown): Promise<void> {
  // 1. Validar el payload con Zod
  const parsed = whatsappWebhookSchema.safeParse(body)
  if (!parsed.success) {
    console.warn('[Webhook] Payload inválido:', parsed.error.message)
    return
  }

  const payload = parsed.data

  // 2. Extraer el mensaje (puede haber múltiples entries/changes, procesamos el primero)
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { value } = change

      // Ignorar actualizaciones de estado (delivered, read, etc.)
      if (!value.messages || value.messages.length === 0) continue

      const message = value.messages[0]
      const contact = value.contacts?.[0]
      const phoneNumberId = value.metadata.phone_number_id

      // 3. Identificar la clínica por el phone_number_id de WhatsApp
      const clinic = await findClinicByPhoneId(phoneNumberId)
      if (!clinic) {
        console.error(`[Webhook] Clínica no encontrada para phone_id: ${phoneNumberId}`)
        return
      }

      // 4. Obtener el doctor principal (el primero activo)
      const doctor = await findMainDoctor(clinic.id)
      if (!doctor) {
        console.error(`[Webhook] No hay doctor activo para clínica: ${clinic.id}`)
        return
      }

      // 5. Marcar mensaje como leído (checks azules ✓✓)
      await markAsRead(message.id)

      // 6. Normalizar teléfono del paciente
      const patientPhone = normalizePhone(message.from)
      const patientName = contact?.profile?.name ?? 'Paciente'

      // 7. Verificar tipo de mensaje
      if (!isSupportedMessageType(message.type)) {
        // Si es audio, imagen, etc. → responder que solo maneja texto
        const unsupportedMsg = getUnsupportedTypeMessage(message.type)
        await sendWhatsAppMessage(message.from, unsupportedMsg)
        return
      }

      // 8. Obtener el texto del mensaje
      const rawText = message.text?.body
      if (!rawText) return

      // 9. Sanitizar el mensaje (anti-inyección, límite de caracteres)
      const sanitizedText = sanitizePatientMessage(rawText)

      // 10. Buscar o crear paciente
      const patient = await findOrCreatePatient(clinic.id, patientPhone, patientName)

      // 11. Buscar o crear conversación
      const conversation = await findOrCreateConversation(clinic.id, patient.id, patientPhone)

      // 12. Guardar mensaje del paciente en DB
      await saveMessage(conversation.id, 'patient', sanitizedText, message.id)

      // 13. Actualizar último mensaje de la conversación
      await supabaseAdmin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id)

      // 14. Si la conversación está escalada → no responder (un humano se encarga)
      if (conversation.status === 'escalated') {
        console.log(`[Webhook] Conversación escalada, no responder. ID: ${conversation.id}`)
        return
      }

      // 15. Si es paciente nuevo (sin consentimiento) → enviar aviso de privacidad
      if (!patient.data_consent_at) {
        await handleNewPatient(clinic, patient, message.from, conversation.id)
        return
      }

      // 16. Cargar historial de mensajes para dar contexto a Claude
      const messageHistory = await getMessageHistory(conversation.id)

      // 17. Ejecutar el agente de IA
      const agentResponse = await runAppointmentAgent({
        patientMessage: sanitizedText,
        messageHistory,
        clinic,
        doctor,
        patientPhone,
        patientName: patient.name,
      })

      // 18. Guardar respuesta del agente en DB
      await saveMessage(conversation.id, 'agent', agentResponse.text)

      // 19. Enviar respuesta por WhatsApp
      await sendWhatsAppMessage(message.from, agentResponse.text)

      // 20. Si se escaló, marcar la conversación
      if (agentResponse.toolsUsed.includes('escalate_to_human')) {
        await supabaseAdmin
          .from('conversations')
          .update({
            status: 'escalated',
            escalated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id)
      }

      // 21. Registrar en auditoría
      try {
        await supabaseAdmin
          .from('audit_log')
          .insert({
            clinic_id: clinic.id,
            action: 'message_processed',
            actor_type: 'agent',
            details: {
              tools_used: agentResponse.toolsUsed,
              conversation_id: conversation.id,
            },
          })
      } catch { /* no crítico */ }
    }
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Busca la clínica por el ID del número de WhatsApp
 * Este ID viene en cada mensaje y nos dice a qué clínica pertenece
 */
async function findClinicByPhoneId(phoneNumberId: string): Promise<Clinic | null> {
  const { data } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .eq('whatsapp_phone_id', phoneNumberId)
    .single()

  return data as Clinic | null
}

/**
 * Obtiene el doctor principal (primer doctor activo) de una clínica
 */
async function findMainDoctor(clinicId: string): Promise<Doctor | null> {
  const { data } = await supabaseAdmin
    .from('doctors')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return data as Doctor | null
}

/**
 * Busca un paciente por teléfono. Si no existe, lo crea.
 * Los pacientes se crean automáticamente cuando escriben por primera vez.
 */
async function findOrCreatePatient(
  clinicId: string,
  phone: string,
  name: string
): Promise<Patient> {
  // Buscar paciente existente
  const { data: existing } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('phone', phone)
    .single()

  if (existing) return existing as Patient

  // Crear paciente nuevo
  const { data: newPatient, error } = await supabaseAdmin
    .from('patients')
    .insert({
      clinic_id: clinicId,
      name,
      phone,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[findOrCreatePatient] Error:', error)
    throw new Error('Error creando paciente')
  }

  // Registrar en auditoría
  try {
    await supabaseAdmin
      .from('audit_log')
      .insert({
        clinic_id: clinicId,
        action: 'patient_registered',
        actor_type: 'system',
        target_type: 'patient',
        target_id: newPatient.id,
        details: { source: 'whatsapp_auto' },
      })
  } catch { /* no crítico */ }

  return newPatient as Patient
}

/**
 * Busca una conversación activa. Si no existe, crea una nueva.
 * Cada paciente tiene UNA conversación activa por clínica.
 */
async function findOrCreateConversation(
  clinicId: string,
  patientId: string,
  phone: string
): Promise<Conversation> {
  // Buscar conversación activa o escalada
  const { data: existing } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .in('status', ['active', 'escalated'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) return existing as Conversation

  // Crear conversación nueva
  const { data: newConversation, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      whatsapp_phone: phone,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[findOrCreateConversation] Error:', error)
    throw new Error('Error creando conversación')
  }

  return newConversation as Conversation
}

/**
 * Guarda un mensaje en la base de datos
 */
async function saveMessage(
  conversationId: string,
  role: 'patient' | 'agent' | 'staff',
  content: string,
  whatsappMessageId?: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      whatsapp_message_id: whatsappMessageId ?? null,
    })

  if (error) {
    console.error('[saveMessage] Error:', error)
  }
}

/**
 * Carga los últimos 20 mensajes de una conversación (contexto para Claude)
 */
async function getMessageHistory(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) {
    console.error('[getMessageHistory] Error:', error)
    return []
  }

  return (data ?? []) as Message[]
}

/**
 * Maneja el primer mensaje de un paciente nuevo:
 * 1. Envía aviso de privacidad (Ley 1581 de 2012)
 * 2. Marca el consentimiento en la DB
 * 3. Envía el mensaje de bienvenida
 *
 * Nota: en un sistema más robusto, esperaríamos confirmación explícita.
 * Para el MVP, "continuar la conversación" = aceptar.
 */
async function handleNewPatient(
  clinic: Clinic,
  patient: Patient,
  whatsappFrom: string,
  conversationId: string
): Promise<void> {
  // Aviso de privacidad (obligatorio por Ley 1581)
  const privacyNotice =
    `📋 Antes de continuar, te informo que ${clinic.name} tratará tus datos personales ` +
    `según la Ley 1581 de 2012. Al continuar esta conversación, autorizas el tratamiento ` +
    `de tus datos para agendar y gestionar tus citas. Si deseas conocer nuestra política ` +
    `completa o ejercer tus derechos, escribe "privacidad".`

  await sendWhatsAppMessage(whatsappFrom, privacyNotice)
  await saveMessage(conversationId, 'agent', privacyNotice)

  // Marcar consentimiento (al continuar = acepta)
  await supabaseAdmin
    .from('patients')
    .update({ data_consent_at: new Date().toISOString() })
    .eq('id', patient.id)

  // Mensaje de bienvenida
  const welcome = clinic.welcome_message
    ?? `¡Hola! 👋 Soy ${clinic.agent_name}, asistente virtual de ${clinic.name}. ¿En qué te puedo ayudar?`

  await sendWhatsAppMessage(whatsappFrom, welcome)
  await saveMessage(conversationId, 'agent', welcome)
}
