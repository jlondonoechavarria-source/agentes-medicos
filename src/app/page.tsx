// ============================================================
// LANDING PAGE — Página principal pública
// Ruta: /
// ============================================================

import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <main className="flex flex-col items-center gap-8 px-6 py-16 text-center">
        <h1 className="text-4xl font-bold text-gray-900">
          Sekre
        </h1>
        <p className="max-w-md text-lg text-gray-600">
          Tu consultorio atendiendo 24/7 por WhatsApp, sin contratar más personal.
        </p>
        <Link
          href="/dashboard"
          className="rounded-full bg-blue-600 px-8 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Ir al Dashboard
        </Link>
      </main>
    </div>
  )
}
