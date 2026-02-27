// ============================================================
// Configura un Google Sheet existente para una clínica
//
// FLUJO:
// 1. El usuario crea un Google Sheet manualmente en sheets.google.com
// 2. Lo comparte con la Service Account como Editor
// 3. Llama a este endpoint con el sheetId
// 4. Este código crea las 4 pestañas y los headers formateados
//
// Por qué no creamos el sheet nosotros: la Service Account no tiene
// cuota de almacenamiento propia en Drive (es una limitación de Google
// para cuentas sin Google Workspace).
// ============================================================

import { getSheetsClient, getDriveClient } from './client'

export async function createClinicSheet(
  clinicName: string,
  doctorEmail?: string,
  existingSheetId?: string
): Promise<string> {
  const sheets = getSheetsClient()

  if (!existingSheetId) {
    throw new Error(
      'Se requiere un sheetId existente. Crea un Google Sheet manualmente, ' +
      'compártelo con la Service Account como Editor, y pasa el ID aquí.'
    )
  }

  const spreadsheetId = existingSheetId

  // 1. Obtener las pestañas actuales del sheet
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const existingSheets = spreadsheet.data.sheets ?? []
  const existingTitles = existingSheets.map(s => s.properties?.title ?? '')

  // 2. Construir las requests para crear/renombrar las 4 pestañas
  const tabNames = ['Pacientes', 'Citas', 'Finanzas', 'Estadísticas No-Show']
  const requests: object[] = []

  // Si solo hay una hoja (la default "Hoja 1" o "Sheet1"), renombrarla
  if (existingSheets.length === 1) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: existingSheets[0].properties?.sheetId, title: 'Pacientes' },
        fields: 'title',
      },
    })
    // Agregar las otras 3
    for (const title of ['Citas', 'Finanzas', 'Estadísticas No-Show']) {
      requests.push({ addSheet: { properties: { title } } })
    }
  } else {
    // Si ya tiene hojas, solo agregar las que faltan
    for (const title of tabNames) {
      if (!existingTitles.includes(title)) {
        requests.push({ addSheet: { properties: { title } } })
      }
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    })
  }

  // 3. Obtener los IDs actualizados de las hojas
  const updated = await sheets.spreadsheets.get({ spreadsheetId })
  const sheetIds = updated.data.sheets?.map(s => s.properties?.sheetId!) ?? []

  // 4. Formatear headers: negrita + fondo gris + primera fila congelada
  const formatRequests = sheetIds.map(sheetIdNum => ({
    repeatCell: {
      range: { sheetId: sheetIdNum, startRowIndex: 0, endRowIndex: 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          textFormat: { bold: true },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  }))

  const freezeRequests = sheetIds.map(sheetIdNum => ({
    updateSheetProperties: {
      properties: {
        sheetId: sheetIdNum,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: 'gridProperties.frozenRowCount',
    },
  }))

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [...formatRequests, ...freezeRequests] },
  })

  // 5. Compartir con el doctor si tiene email (solo lectura)
  if (doctorEmail) {
    const drive = getDriveClient()
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: {
        type: 'user',
        role: 'reader',
        emailAddress: doctorEmail,
      },
      sendNotificationEmail: true,
    })
  }

  return spreadsheetId
}
