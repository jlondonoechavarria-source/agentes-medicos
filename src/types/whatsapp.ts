// ============================================================
// Tipos para los payloads del webhook de WhatsApp Business API
// Meta envía estos datos cuando un paciente escribe un mensaje
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
// ============================================================

// --- Payload principal que llega al webhook ---
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account'
  entry: WhatsAppEntry[]
}

export interface WhatsAppEntry {
  id: string                               // WhatsApp Business Account ID
  changes: WhatsAppChange[]
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue
  field: 'messages'
}

export interface WhatsAppChangeValue {
  messaging_product: 'whatsapp'
  metadata: WhatsAppMetadata
  contacts?: WhatsAppContact[]             // Info del contacto que escribió
  messages?: WhatsAppIncomingMessage[]      // Los mensajes recibidos
  statuses?: WhatsAppStatus[]              // Actualizaciones de estado (entregado, leído)
}

export interface WhatsAppMetadata {
  display_phone_number: string             // Número de WhatsApp de la clínica
  phone_number_id: string                  // ID del número (para identificar la clínica)
}

// --- Contacto (quien escribe) ---
export interface WhatsAppContact {
  profile: {
    name: string                           // Nombre del contacto en WhatsApp
  }
  wa_id: string                            // Número del paciente (ej: "573101112233")
}

// --- Mensaje entrante ---
export interface WhatsAppIncomingMessage {
  from: string                             // Número del paciente (ej: "573101112233")
  id: string                               // ID único del mensaje en WhatsApp
  timestamp: string                        // Unix timestamp
  type: WhatsAppMessageType
  text?: { body: string }                  // Solo si type = "text"
  image?: WhatsAppMediaInfo                // Solo si type = "image"
  audio?: WhatsAppMediaInfo                // Solo si type = "audio"
  document?: WhatsAppMediaInfo             // Solo si type = "document"
  location?: WhatsAppLocation              // Solo si type = "location"
  interactive?: WhatsAppInteractive        // Solo si type = "interactive" (botones)
  button?: { text: string; payload: string } // Respuesta a botón de template
}

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'sticker'
  | 'reaction'

export interface WhatsAppMediaInfo {
  id: string
  mime_type: string
  caption?: string
}

export interface WhatsAppLocation {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface WhatsAppInteractive {
  type: 'button_reply' | 'list_reply'
  button_reply?: { id: string; title: string }
  list_reply?: { id: string; title: string; description?: string }
}

// --- Estado de mensaje (entregado, leído, etc.) ---
export interface WhatsAppStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: WhatsAppError[]
}

export interface WhatsAppError {
  code: number
  title: string
  message: string
}

// --- Payload para ENVIAR mensajes ---
export interface WhatsAppSendTextPayload {
  messaging_product: 'whatsapp'
  to: string                               // Número destino (ej: "573101112233")
  type: 'text'
  text: { body: string }
}

// --- Payload para enviar mensajes con template (recordatorios) ---
export interface WhatsAppSendTemplatePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string                           // Nombre del template aprobado por Meta
    language: { code: 'es' }
    components: WhatsAppTemplateComponent[]
  }
}

export interface WhatsAppTemplateComponent {
  type: 'body'
  parameters: WhatsAppTemplateParameter[]
}

export interface WhatsAppTemplateParameter {
  type: 'text'
  text: string
}
