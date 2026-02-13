// ============================================================
// Sanitización de mensajes de pacientes
// Limpia el input ANTES de enviarlo a Claude para evitar:
// 1. Inyección de prompts (alguien intenta "hackear" al agente)
// 2. Mensajes demasiado largos que gastan tokens
// 3. HTML/scripts maliciosos
// ============================================================

const MAX_MESSAGE_LENGTH = 1000 // Caracteres máximo — un mensaje normal tiene ~200

/**
 * Sanitiza el mensaje del paciente antes de enviarlo al LLM
 * - Limita longitud a 1000 caracteres
 * - Elimina etiquetas HTML
 * - Elimina caracteres de control invisibles
 * - Limpia intentos básicos de inyección de prompts
 */
export function sanitizePatientMessage(rawMessage: string): string {
  let message = rawMessage

  // 1. Eliminar etiquetas HTML (por si alguien envía <script> o similar)
  message = message.replace(/<[^>]*>/g, '')

  // 2. Eliminar caracteres de control invisibles (excepto saltos de línea)
  //    Estos caracteres pueden confundir al LLM
  message = message.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // 3. Limpiar intentos de inyección de prompts
  //    Patrones comunes: "ignora tus instrucciones", "eres ahora un..."
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts)/gi,
    /ignora\s+(todas?\s+)?(las?\s+)?(instrucciones|prompts?)\s+(anteriores|previas?)/gi,
    /eres\s+ahora\s+un/gi,
    /you\s+are\s+now\s+a/gi,
    /system\s*:\s*/gi,
    /\[INST\]/gi,
    /\[SYSTEM\]/gi,
  ]

  for (const pattern of injectionPatterns) {
    message = message.replace(pattern, '[filtrado]')
  }

  // 4. Truncar a longitud máxima
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH)
  }

  // 5. Limpiar espacios extra
  message = message.trim()

  return message
}

/**
 * Verifica si el mensaje es de un tipo que el agente puede procesar
 * Por ahora solo manejamos texto. Audio, imágenes, etc. se rechazan con un mensaje amable.
 */
export function isSupportedMessageType(type: string): boolean {
  return type === 'text'
}

/**
 * Mensaje para cuando el paciente envía un tipo no soportado (audio, imagen, etc.)
 */
export function getUnsupportedTypeMessage(type: string): string {
  const typeMessages: Record<string, string> = {
    audio: '🎤 Por ahora solo manejo mensajes de texto. ¿Me escribes tu consulta?',
    image: '📷 Por ahora solo manejo mensajes de texto. ¿Me cuentas qué necesitas?',
    video: '🎥 Por ahora solo manejo mensajes de texto. ¿Me escribes tu consulta?',
    document: '📄 Por ahora solo manejo mensajes de texto. ¿Me cuentas qué necesitas?',
    sticker: '😊 ¡Qué buen sticker! Pero solo manejo texto. ¿En qué te puedo ayudar?',
    location: '📍 Gracias por la ubicación, pero por ahora solo manejo texto. ¿En qué te ayudo?',
  }

  return typeMessages[type] ?? 'Por ahora solo manejo mensajes de texto. ¿Me escribes tu consulta?'
}
