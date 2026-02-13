// ============================================================
// Cliente WhatsApp Business Cloud API
// Envía mensajes de texto y marca mensajes como leídos
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// ============================================================

import type { WhatsAppSendTextPayload } from '@/types/whatsapp'

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0'

// Obtener variables de entorno (se validan al usarse)
function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId) throw new Error('Falta WHATSAPP_PHONE_NUMBER_ID en .env.local')
  if (!accessToken) throw new Error('Falta WHATSAPP_ACCESS_TOKEN en .env.local')

  return { phoneNumberId, accessToken }
}

/**
 * Envía un mensaje de texto por WhatsApp
 * @param to - Número del paciente SIN el "+" (ej: "573101112233")
 * @param message - Texto del mensaje (máx 4096 caracteres)
 * @returns ID del mensaje enviado o null si falló
 *
 * NOTA: WhatsApp tiene límite de 4096 caracteres por mensaje.
 * El agente ya está configurado para responder breve (3-4 líneas).
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<string | null> {
  const { phoneNumberId, accessToken } = getConfig()

  // Truncar si excede el límite de WhatsApp
  const truncatedMessage = message.length > 4096
    ? message.slice(0, 4090) + '...'
    : message

  const payload: WhatsAppSendTextPayload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: truncatedMessage },
  }

  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('[WhatsApp] Error enviando mensaje:', JSON.stringify(error))
      return null
    }

    const data = await response.json()
    // Meta devuelve el ID del mensaje enviado
    return data.messages?.[0]?.id ?? null
  } catch (error) {
    console.error('[WhatsApp] Error de red:', error)
    return null
  }
}

/**
 * Marca un mensaje como leído (los dos checks azules ✓✓)
 * @param messageId - ID del mensaje recibido de WhatsApp
 *
 * Esto le indica al paciente que su mensaje fue procesado.
 */
export async function markAsRead(messageId: string): Promise<void> {
  const { phoneNumberId, accessToken } = getConfig()

  try {
    await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      }
    )
  } catch (error) {
    // No es crítico si falla — el paciente simplemente no ve los checks azules
    console.error('[WhatsApp] Error marcando como leído:', error)
  }
}
