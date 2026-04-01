// =================================================================
// 1. CONFIGURACIÓN GLOBAL
// =================================================================
const DRIVE_FOLDER_ID = '1oX1IuNvouuBp5G4dPTZjAT4DVl-XQwUN';
const REPORTES_SHEET_NAME = 'Reportes';
const EJECUTIVOS_SHEET_NAME = 'Ejecutivos';
const CONFIG_SHEET_NAME = 'Contrasena';
const APP_URL = 'https://neumann-reservas.github.io/i-D-actividades/';

// --- Destinatarios de Correo ---
// ¡CAMBIO REALIZADO! Se ha actualizado el destinatario del reporte consolidado.
const CONSOLIDATED_RECIPIENT = 'director@neumann.education'; 
const NEW_REPORT_RECIPIENT = 'anthony.robles@neumann.education';
// Las constantes NEW_REPORT_CC y STATE_CHANGE_CC han sido eliminadas porque ahora se generarán dinámicamente.


// =================================================================
// 2. FUNCIÓN PRINCIPAL DE ENTRADA (POST REQUESTS)
// =================================================================

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
      case "validatePassword":
        responsePayload = validatePassword(data.password);
        break;
      case "updateStatus":
        responsePayload = updateStatus(data.reportId, data.newStatus, data.password, data.comment);
        break;
      case "sendConsolidatedReport":
        responsePayload = sendConsolidatedReport(data.reports, data.startDate, data.endDate, data.password);
        break;
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


// =================================================================
// 3. FUNCIONES DE ACCIÓN PRINCIPALES
// =================================================================

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

  const newRow = [
    reportId, timestamp, formData.ejecutivo, formData.cargo, formData.fechaReporte,
    formData.actividadesDetalladas, ...imageUrls.slice(0, 5), 'Enviado', ''
  ];
  sheet.appendRow(newRow);

  sendNewReportNotification(formData.ejecutivo);
  
  return { status: "success", message: `Reporte de ${formData.ejecutivo} guardado.` };
}

function updateStatus(reportId, newStatus, password, comment = '') {
  const correctPassword = getPassword();
  if (password !== correctPassword) { throw new Error("Contraseña incorrecta. Acción no autorizada."); }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTES_SHEET_NAME);
  const idColumnValues = sheet.getRange("A:A").getValues();
  const reportRowIndex = idColumnValues.findIndex(row => row[0] == reportId) + 1;

  if (reportRowIndex > 0) {
    sheet.getRange(reportRowIndex, 12).setValue(newStatus);
    sheet.getRange(reportRowIndex, 13).setValue(comment);
    sendStateChangeEmail(reportId, newStatus, comment);
    return { status: "success", message: `Estado actualizado a ${newStatus} y notificación enviada.` };
  } else { throw new Error(`No se encontró el reporte con ID ${reportId}.`); }
}

function sendConsolidatedReport(reports, startDate, endDate, password) {
  const correctPassword = getPassword();
  if (password !== correctPassword) { throw new Error("Contraseña incorrecta. Acción no autorizada."); }
  if (!reports || reports.length === 0) { throw new Error("No hay reportes para enviar."); }
  
  const subject = "Actividades diarias del equipo de Innovación y Desarrollo";
  const htmlBody = createConsolidatedEmailTemplate(reports, startDate, endDate);
  
  MailApp.sendEmail({
    to: CONSOLIDATED_RECIPIENT,
    subject: subject,
    htmlBody: htmlBody
  });

  return { status: "success", message: `Reporte consolidado enviado exitosamente.` };
}

// --- ¡FUNCIÓN MODIFICADA! ---
function sendStateChangeEmail(reportId, newStatus, comment) {
  const reportData = findReportById(reportId);
  if (!reportData) return;
  const ejecutivoNombre = reportData[2];
  const ejecutivoCorreo = getExecutiveEmail(ejecutivoNombre);
  if (!ejecutivoCorreo) return;

  // Se obtiene la lista dinámica de todos los correos para el CC.
  const dynamicCC = getAllExecutiveEmails();

  const cargo = reportData[3];
  const fecha = new Date(reportData[4]).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const actividadesHtml = reportData[5];
  const imageUrls = reportData.slice(6, 11).filter(url => url);
  const subject = "Remisión de Actividades de Innovación y Desarrollo";
  const htmlBody = createRichEmailTemplate(ejecutivoNombre, cargo, fecha, actividadesHtml, imageUrls, newStatus, comment);

  MailApp.sendEmail({
    to: ejecutivoCorreo,
    cc: dynamicCC, // Se usa la lista dinámica en CC
    subject: subject,
    htmlBody: htmlBody
  });
}

// --- ¡FUNCIÓN MODIFICADA! ---
function sendNewReportNotification(executiveName) {
    const subject = "Remisión de Actividades de Innovación y Desarrollo";
    const body = `Estimado(a),\n\n${executiveName} ha registrado un nuevo reporte de actividades.\n\nPuedes revisarlo en el dashboard: ${APP_URL}\n\nSaludos.`;
    
    // Se obtiene la lista dinámica de todos los correos para el CC.
    const dynamicCC = getAllExecutiveEmails();

    MailApp.sendEmail({
        to: NEW_REPORT_RECIPIENT,
        cc: dynamicCC, // Se usa la lista dinámica en CC
        subject: subject,
        body: body
    });
}

function validatePassword(password) {
  if (!password) { return { status: "error", message: "No se proporcionó contraseña." }; }
  const correctPassword = getPassword();
  const isValid = (password.toString() === correctPassword.toString());
  return { status: "success", data: { isValid: isValid } };
}


// =================================================================
// 4. FUNCIONES DE LECTURA DE DATOS (GETTERS)
// =================================================================

function getAllReports() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTES_SHEET_NAME);
  if (sheet.getLastRow() < 2) { return []; }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function getExecutives() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EJECUTIVOS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) { return []; }
  
  // Leemos las columnas disponibles (mínimo 3, máximo 4)
  const lastCol = Math.min(sheet.getLastColumn(), 4);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  
  return data
    .filter(row => {
      const hasName = row[0] && row[0].toString().trim() !== "";
      const isActive = (row[3] === undefined || row[3] === "" || row[3] == 1); // Activo por defecto si está vacío o es 1
      return hasName && isActive;
    })
    .map(row => ({ name: row[0], role: row[1], email: row[2] }));
}

function getPassword() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) throw new Error(`La hoja de configuración "${CONFIG_SHEET_NAME}" no existe.`);
  return sheet.getRange("A1").getValue();
}


// =================================================================
// 5. FUNCIONES AUXILIARES
// =================================================================

// --- ¡NUEVA FUNCIÓN AUXILIAR! ---
// Esta función lee todos los correos de la hoja 'Ejecutivos' y los devuelve como un string para el campo CC.
function getAllExecutiveEmails() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EJECUTIVOS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) { return ''; }
  
  const lastCol = Math.min(sheet.getLastColumn(), 4);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  
  const emailList = data
    .filter(row => {
      const isActive = (row[3] === undefined || row[3] === "" || row[3] == 1);
      return isActive && row[2] && row[2].includes('@');
    })
    .map(row => row[2]);

  return emailList.join(',');
}


function uploadImageToDrive(base64Data, fileName, folder) {
  const parts = base64Data.split(',');
  const mimeType = parts[0].match(/:(.*?);/)[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/file/d/${file.getId()}/preview`;
}

function findReportById(reportId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REPORTES_SHEET_NAME);
  const idColumnValues = sheet.getRange("A:A").getValues();
  const reportRowIndex = idColumnValues.findIndex(row => row[0] == reportId) + 1;
  if (reportRowIndex > 0) {
    return sheet.getRange(reportRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  }
  return null;
}

function getExecutiveEmail(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EJECUTIVOS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  const executive = data.find(row => row[0] === name);
  return executive ? executive[2] : null;
}


// =================================================================
// 6. PLANTILLAS DE CORREO HTML
// =================================================================

// (Las plantillas de correo no necesitan cambios)

function createRichEmailTemplate(ejecutivo, cargo, fecha, actividadesHtml, imageUrls, newStatus, comment) {
  let imagesSection = '';
  if (imageUrls && imageUrls.length > 0) {
    imagesSection += '<tr><td style="padding-top: 15px;"><h3 style="margin:0; font-size: 16px; color: #4A2E6F; font-family: Arial, sans-serif;">Archivos Adjuntos</h3></td></tr>';
    imageUrls.forEach(url => {
      let thumbnailUrl = url.replace('/file/d/', '/uc?id=').replace('/preview', '');
      imagesSection += `<tr><td style="padding: 10px 0;"><a href="${url}" target="_blank" style="text-decoration: none; border: 1px solid #ddd; padding: 5px; border-radius: 8px; display: inline-block;"><img src="${thumbnailUrl}" alt="Vista previa" style="width: 200px; height: auto; display: block; border-radius: 4px;"></a></td></tr>`;
    });
  }

  let commentSection = '';
  if (comment && comment.trim() !== '') {
    commentSection = `
      <h3 style="margin:20px 0 10px 0; font-size: 16px; color: #4A2E6F; font-family: Arial, sans-serif;">Comentarios de Revisión:</h3>
      <p style="margin: 0; font-family: Arial, sans-serif; font-size: 16px; color: #333; border-left: 3px solid #dc3545; padding-left: 15px; font-style: italic;">
        ${comment}
      </p>
    `;
  }

  const statusColors = { Recibido: { bg: '#d1e7dd', text: '#0f5132' }, Observado: { bg: '#f8d7da', text: '#842029' }, Enviado: { bg: '#fff3cd', text: '#664d03' } };
  const statusColor = statusColors[newStatus] || { bg: '#cfe2ff', text: '#084298' };
  const statusSection = `<p style="margin: 20px 0 5px 0; font-family: Arial, sans-serif; font-size: 16px; color: #333;"><strong>Estado:</strong><span style="background-color: ${statusColor.bg}; color: ${statusColor.text}; padding: 5px 12px; border-radius: 50rem; font-size: 14px; font-weight: bold; margin-left: 10px;">${newStatus}</span></p>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f5f7;"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding: 20px;"><table width="650" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);"><tr><td align="center" style="padding: 20px; background-color: #5D3B8C; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px;"><h1 style="margin:0; font-size: 24px;">Resumen de Actividades</h1></td></tr><tr><td style="padding: 30px 40px;"><p style="margin: 0 0 5px 0; font-size: 18px; color: #333;"><strong>De:</strong> ${ejecutivo} (${cargo})</p><p style="margin: 0 0 10px 0; font-size: 16px; color: #555;"><strong>Fecha del Reporte:</strong> ${fecha}</p>${statusSection}${commentSection}<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"><div class="ql-snow" style="font-size:16px; line-height:1.6;"><div class="ql-editor">${actividadesHtml}</div></div><table width="100%" border="0" cellspacing="0" cellpadding="0">${imagesSection}</table></td></tr><tr><td align="center" style="padding: 20px; color: #999; font-size: 12px;">Correo generado por el Sistema de Reportes de Actividades.</td></tr></table></td></tr></table></body></html>`;
}

function createConsolidatedEmailTemplate(reports, startDate, endDate) {
  function formatTextDate(dateString) {
      if (!dateString) return '';
      const parts = dateString.split('-');
      const dateObj = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
      return dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  let dateText = '';
  if (startDate && endDate) {
    const start = formatTextDate(startDate);
    const end = formatTextDate(endDate);
    dateText = (start === end) ? `del día ${start}` : `del periodo del ${start} al ${end}`;
  } else {
    dateText = 'de todos los reportes registrados';
  }
  let reportsHtml = '';
  reports.forEach(report => {
    const ejecutivo = report[2], cargo = report[3], fecha = new Date(report[4]).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const actividadesHtml = report[5], imageUrls = report.slice(6, 11).filter(url => url);
    let imagesSection = '';
    if (imageUrls.length > 0) {
      imagesSection += '<p style="margin-top: 15px; margin-bottom: 10px; color: #555; font-size: 14px; font-weight:bold;">Archivos Adjuntos:</p>';
      imageUrls.forEach(url => {
        let thumbnailUrl = url.replace('/file/d/', '/uc?id=').replace('/preview', '');
        imagesSection += `<a href="${url}" target="_blank" style="display: inline-block; margin-right: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px;"><img src="${thumbnailUrl}" alt="Adjunto" style="width: 150px; height: auto; display: block;"></a>`;
      });
    }
    reportsHtml += `<div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #eee;"><p style="margin: 0; font-size: 16px;"><strong style="color: #4A2E6F;">${ejecutivo}</strong> <span style="color: #555;">(${cargo})</span></p><p style="margin: 5px 0 15px 0; font-size: 14px; color: #555;">Reporte del ${fecha}</p><div class="ql-snow" style="font-size:16px; line-height:1.6;"><div class="ql-editor">${actividadesHtml}</div></div>${imagesSection}</div>`;
  });
  // ¡CAMBIO REALIZADO! Se ha personalizado el saludo en la plantilla del consolidado.
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f5f7;"><table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding: 20px;"><table width="700" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);"><tr><td align="center" style="padding: 20px; background-color: #5D3B8C; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px;"><h1 style="margin:0; font-size: 24px;">Reporte Consolidado de Actividades</h1></td></tr><tr><td style="padding: 30px 40px;"><p style="margin: 0 0 25px 0; font-size: 16px; color: #555;">Estimado Sr. Alejandro, remito a continuación las actividades del equipo de innovación ${dateText}.</p>${reportsHtml}</td></tr><tr><td align="center" style="padding: 20px; color: #999; font-size: 12px;">Correo generado por el Sistema de Reportes de Actividades.</td></tr></table></td></tr></table></body></html>`;
}