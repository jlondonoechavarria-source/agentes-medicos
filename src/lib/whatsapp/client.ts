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

  console.log(`[WhatsApp] Enviando mensaje a: ${to.slice(0, 5)}***`)

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

    const responseBody = await response.json()

    if (!response.ok) {
      const errorCode = responseBody?.error?.code
      const errorMessage = responseBody?.error?.message ?? 'Error desconocido'

      // Logging detallado por tipo de error
      if (errorCode === 190) {
        console.error(`[WhatsApp] TOKEN EXPIRADO (code ${errorCode}): ${errorMessage}`)
        console.error('[WhatsApp] → Regenera el token en developers.facebook.com > WhatsApp > API Setup')
      } else if (errorCode === 131030) {
        console.error(`[WhatsApp] NÚMERO NO AUTORIZADO (code ${errorCode}): ${errorMessage}`)
        console.error('[WhatsApp] → Agrega el número en developers.facebook.com > WhatsApp > API Setup > "To" phone number')
      } else if (errorCode === 131047) {
        console.error(`[WhatsApp] FUERA DE VENTANA 24H (code ${errorCode}): ${errorMessage}`)
        console.error('[WhatsApp] → El paciente no ha escrito en las últimas 24h. Usa un template aprobado.')
      } else {
        console.error(`[WhatsApp] ERROR ${response.status} (code ${errorCode}): ${errorMessage}`)
        console.error('[WhatsApp] Response completa:', JSON.stringify(responseBody))
      }

      return null
    }

    const messageId = responseBody.messages?.[0]?.id ?? null
    console.log(`[WhatsApp] Mensaje enviado OK. ID: ${messageId}`)
    return messageId
  } catch (error) {
    console.error('[WhatsApp] Error de red (no se pudo conectar a Meta):', error)
    return null
  }
}

/**
 * Marca un mensaje como leído (los dos checks azules ✓✓)
 * @param messageId - ID del mensaje recibido de WhatsApp
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
    console.error('[WhatsApp] Error marcando como leído:', error)
  }
}
