// ============================================================
// Cliente Supabase con service_role — acceso TOTAL a la DB
// SOLO usar en el servidor (API routes, webhooks, cron jobs)
// NUNCA importar en código del cliente/navegador
// ============================================================

import { createClient } from '@supabase/supabase-js'

// Verificar que las variables de entorno existen
// Si faltan, el servidor no arranca (mejor fallar temprano que con errores raros)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL en .env.local')
}
if (!supabaseServiceKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local')
}

// Singleton: se crea UNA sola vez y se reutiliza en toda la app
// auth: autoRefreshToken y persistSession desactivados porque es server-side
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
