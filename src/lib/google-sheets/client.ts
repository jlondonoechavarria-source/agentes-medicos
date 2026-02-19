// ============================================================
// Cliente Google Sheets API — Singleton con Service Account
// Usa JWT para autenticarse (no requiere OAuth del usuario)
// ============================================================

import { google, sheets_v4, drive_v3 } from 'googleapis'

let sheetsClient: sheets_v4.Sheets | null = null
let driveClient: drive_v3.Drive | null = null

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!email || !privateKey) {
    throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY en .env')
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  })
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient
  sheetsClient = google.sheets({ version: 'v4', auth: getAuth() })
  return sheetsClient
}

export function getDriveClient(): drive_v3.Drive {
  if (driveClient) return driveClient
  driveClient = google.drive({ version: 'v3', auth: getAuth() })
  return driveClient
}
