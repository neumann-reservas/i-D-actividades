# i-D-actividades


// ------------------- CONFIGURACIÓN -------------------
const DRIVE_FOLDER_ID = '1oX1IuNvouuBp5G4dPTZjAT4DVl-XQwUN';
const REPORTES_SHEET_NAME = 'Reportes';
const EJECUTIVOS_SHEET_NAME = 'Ejecutivos';
// -----------------------------------------------------

function doPost(e) {
  let responsePayload;
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const data = request.data || {};

    switch (action) {
      case "getAllReports":
        responsePayload = { status: "success", data: getAllReports() };
        break;
      case "getExecutives":
        responsePayload = { status: "success", data: getExecutives() };
        break;
      case "submitReport":
        responsePayload = submitReport(data);
        break;
      case "updateStatus":
        responsePayload = updateStatus(data.reportId, data.newStatus);
        break;
      // La acción "sendReportByEmail" ha sido eliminada.
      default:
        throw new Error(`Acción no reconocida: '${action}'`);
    }
  } catch (error) {
    Logger.log("Error en doPost: " + error.toString() + "\nStack: " + error.stack);
    responsePayload = { status: "error", message: error.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(responsePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Actualiza el estado de un reporte en la hoja de cálculo.
 */
function updateStatus(reportId, newStatus) {
  if (!reportId || !newStatus) {
    throw new Error("Se requiere el ID del reporte y el nuevo estado.");
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTES_SHEET_NAME);
  const idColumnValues = sheet.getRange("A:A").getValues();
  const reportRowIndex = idColumnValues.findIndex(row => row[0] == reportId) + 1;

  if (reportRowIndex > 0) {
    // La columna de Estado es la 12 (L).
    sheet.getRange(reportRowIndex, 12).setValue(newStatus);
    return { status: "success", message: `Estado del reporte ${reportId} actualizado a ${newStatus}.` };
  } else {
    throw new Error(`No se encontró el reporte con ID ${reportId}.`);
  }
}

/**
 * Guarda un nuevo reporte en la hoja de cálculo.
 */
function submitReport(formData) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(REPORTES_SHEET_NAME);
  if (!sheet) throw new Error(`La hoja "${REPORTES_SHEET_NAME}" no se encontró.`);
  
  const reportId = new Date().getTime().toString();
  const timestamp = new Date();
  const imageUrls = [];

  if (formData.images && formData.images.length > 0) {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    formData.images.forEach((base64Image, index) => {
      const fileName = `${formData.fechaReporte}_${formData.ejecutivo.replace(/\s/g, '-')}_${index + 1}.png`;
      imageUrls.push(uploadImageToDrive(base64Image, fileName, folder));
    });
  }
  while (imageUrls.length < 5) { imageUrls.push(''); }

  // La nueva fila ahora tiene 12 columnas. El estado por defecto es "Enviado".
  const newRow = [
    reportId,                          // Col A: ID
    timestamp,                         // Col B: Timestamp
    formData.ejecutivo,                // Col C: Ejecutivo
    formData.cargo,                    // Col D: Cargo
    formData.fechaReporte,             // Col E: Fecha Reporte
    formData.actividadesDetalladas,    // Col F: Actividades
    imageUrls[0] || '',                // Col G: ImagenURL1
    imageUrls[1] || '',                // Col H: ImagenURL2
    imageUrls[2] || '',                // Col I: ImagenURL3
    imageUrls[3] || '',                // Col J: ImagenURL4
    imageUrls[4] || '',                // Col K: ImagenURL5
    'Enviado'                          // Col L: Estado
  ];
  sheet.appendRow(newRow);
  
  return { status: "success", message: `Reporte de ${formData.ejecutivo} guardado.` };
}


// --- FUNCIONES AUXILIARES ---

function getAllReports() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTES_SHEET_NAME);
  if (sheet.getLastRow() < 2) { return []; }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function getExecutives() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EJECUTIVOS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) { return []; }
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  // Devuelve un array de objetos {name, role} para que sea fácil de usar en el HTML.
  return data
    .filter(row => row[0] && row[0].toString().trim() !== "")
    .map(row => ({ name: row[0], role: row[1] }));
}

function uploadImageToDrive(base64Data, fileName, folder) {
  const parts = base64Data.split(',');
  const mimeType = parts[0].match(/:(.*?);/)[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // Devuelve la URL /preview que funciona en el iframe del modal de detalles.
  return `https://drive.google.com/file/d/${file.getId()}/preview`;
}
