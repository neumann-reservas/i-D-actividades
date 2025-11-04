// --- CONFIGURACIÓN GLOBAL Y VARIABLES ---
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwaqjwz-94rKeJin6yI1YKOS7qaIsAxCNiDvpWNWUDXUExKCiBmfhmj5M7QTN_u0kSE/exec";
const MAX_IMAGES = 5;
let allReportsData = [], executivesData = [], uploadedFiles = [], quill, dataTableInstance;
let spinnerModal, detailModal, imagePreviewModal;

// --- FUNCIONES DE AYUDA Y COMUNICACIÓN ---
function showSpinner(show) { if (!spinnerModal) return; show ? spinnerModal.show() : setTimeout(() => spinnerModal.hide(), 250); }
async function appFetch(action, data = {}) {
    showSpinner(true);
    try {
        const response = await fetch(WEB_APP_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, data }) });
        if (!response.ok) throw new Error(`Error de red: ${response.statusText}`);
        const result = await response.json();
        if (result.status === 'error') throw new Error(result.message);
        return result;
    } catch (error) {
        Swal.fire('Error de Comunicación', error.message, 'error');
        throw error;
    } finally {
        showSpinner(false);
    }
}

// --- FUNCIONES DE LÓGICA PRINCIPAL ---
async function fetchInitialData() {
    try {
        const [reportsResult, executivesResult] = await Promise.all([appFetch("getAllReports"), appFetch("getExecutives")]);
        allReportsData = (reportsResult.data || []).sort((a, b) => new Date(b[1]) - new Date(a[1]));
        executivesData = executivesResult.data || [];
        
        populateExecutiveDropdowns();
        updateDashboard(allReportsData);
        createTable(allReportsData);
        
        document.getElementById('compliance-date-filter').valueAsDate = new Date();
        renderComplianceView();
    } catch (error) {
        document.getElementById("dataTableContainer").innerHTML = `<div class='alert alert-danger'>${error.message}</div>`;
    }
}

function populateExecutiveDropdowns() {
    const filterSelect = $('#filterExecutive'), formSelect = $('#formExecutive');
    filterSelect.html('<option value="">Todos los Ejecutivos</option>'); formSelect.html('<option value="" selected disabled>Seleccione...</option>');
    executivesData.forEach(exec => {
        filterSelect.append(`<option value="${exec.name}">${exec.name}</option>`);
        formSelect.append(`<option value="${exec.name}" data-role="${exec.role}">${exec.name}</option>`);
    });
}

function updateDashboard(data) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayReports = data.filter(row => row[1] && row[1].slice(0, 10) === todayStr).length;
    $('#totalReports').text(data.length); $('#todayReports').text(todayReports); $('#executivesCount').text(executivesData.length);
}

function createTable(data) {
    const container = document.getElementById('dataTableContainer');
    if (dataTableInstance) dataTableInstance.destroy();
    if (!data || data.length === 0) { container.innerHTML = "<div class='text-center p-5'><i class='fas fa-folder-open fa-3x text-muted mb-3'></i><p class='text-muted'>No hay reportes para mostrar.</p></div>"; return; }
    let tableHtml = `<table id="dataTable" class="table w-100"><thead><tr><th>Ejecutivo</th><th>Fechas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>`;
    data.forEach((row) => {
        const [reportId, timestamp, ejecutivo, cargo, fechaActividades,,,,,,, estado] = row;
        const originalIndex = allReportsData.findIndex(r => r[0] === reportId);
        const fechaActividadesFmt = fechaActividades ? new Date(fechaActividades).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'N/A';
        const fechaEnvioFmt = timestamp ? new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const status = estado || 'Enviado';
        const statusSelectHtml = `<select class="status-select-badge status-${status}" data-id="${reportId}" data-current-status="${status}"><option value="Enviado" ${status === 'Enviado' ? 'selected' : ''}>Enviado</option><option value="Recibido" ${status === 'Recibido' ? 'selected' : ''}>Recibido</option><option value="Observado" ${status === 'Observado' ? 'selected' : ''}>Observado</option></select>`;
        tableHtml += `<tr data-original-index="${originalIndex}"><td><div class="executive-info"><div class="executive-avatar">${(ejecutivo || '').charAt(0)}</div><div><div class="executive-name">${ejecutivo}</div><div class="executive-role">${cargo || ''}</div></div></div></td><td><div class="date-label">Actividad: ${fechaActividadesFmt}</div><div class="executive-role">Envío: ${fechaEnvioFmt}</div></td><td>${statusSelectHtml}</td><td class="text-center"><button class="btn btn-sm btn-outline-secondary view-btn" data-index="${originalIndex}" title="Ver Detalles"><i class="fas fa-eye"></i></button></td></tr>`;
    });
    container.innerHTML = tableHtml + `</tbody></table>`;
    dataTableInstance = $('#dataTable').DataTable({ responsive: true, pageLength: 10, searching: false, info: true, lengthChange: false, order: [], language: { url: "//cdn.datatables.net/plug-ins/1.13.3/i18n/es-ES.json", info: "_START_ - _END_ de _TOTAL_ reportes" }, columnDefs: [ { targets: [1, 2, 3], orderable: false } ] });
}

function renderComplianceView() {
    const selectedDate = $('#compliance-date-filter').val();
    if (!selectedDate || executivesData.length === 0) return;
    const submittedNames = new Set(allReportsData.filter(report => report[4] && report[4].slice(0, 10) === selectedDate).map(report => report[2]));
    const fulfilledList = $('#compliance-fulfilled-list'), pendingList = $('#compliance-pending-list');
    fulfilledList.html(''); pendingList.html('');
    let fulfilledCount = 0, pendingCount = 0;
    executivesData.forEach(exec => {
        const cardHtml = `<div class="compliance-executive-card"><div class="executive-info"><div class="executive-avatar">${exec.name.charAt(0)}</div><div><div class="executive-name">${exec.name}</div><div class="executive-role">${exec.role}</div></div></div></div>`;
        if (submittedNames.has(exec.name)) { fulfilledList.append(cardHtml); fulfilledCount++; } else { pendingList.append(cardHtml); pendingCount++; }
    });
    $('#fulfilled-count').text(fulfilledCount); $('#pending-count').text(pendingCount);
    if (fulfilledCount === 0) fulfilledList.html('<p class="text-muted small p-2">Ningún reporte enviado para esta fecha.</p>');
    if (pendingCount === 0) pendingList.html('<p class="text-muted small p-2">¡Todo el equipo cumplió!</p>');
}

function applyFilters() {
    const execFilter = $('#filterExecutive').val(), startFilterStr = $('#filterStartDate').val(), endFilterStr = $('#filterEndDate').val();
    let filteredData = allReportsData.filter(row => {
        if (!row[4]) return false;
        const reportDateStr = row[4].slice(0, 10);
        const execMatch = !execFilter || row[2] === execFilter;
        const startMatch = !startFilterStr || reportDateStr >= startFilterStr;
        const endMatch = !endFilterStr || reportDateStr <= endFilterStr;
        return execMatch && startMatch && endMatch;
    });
    createTable(filteredData);
}

async function handleFormSubmit() {
    const form = document.getElementById('reportForm');
    if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
    if (uploadedFiles.length > MAX_IMAGES) { return Swal.fire('Límite excedido', `Solo puedes subir un máximo de ${MAX_IMAGES} imágenes.`, 'warning'); }
    const formData = { ejecutivo: $('#formExecutive').val(), cargo: $('#formCargo').val(), fechaReporte: $('#fechaReporte').val(), actividadesDetalladas: quill.root.innerHTML, images: [] };
    const promises = uploadedFiles.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = error => reject(error); reader.readAsDataURL(file); }));
    try {
        formData.images = await Promise.all(promises);
        const result = await appFetch("submitReport", formData);
        Swal.fire('¡Éxito!', result.message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('reportModal')).hide();
        await fetchInitialData();
    } catch (error) {}
}

function clearForm() {
    $('#reportForm').trigger('reset'); if (quill) quill.setText('');
    $('#formCargoDisplay').text(''); uploadedFiles = []; renderPreviews();
    $('#reportForm').removeClass('was-validated');
}

function handleFileSelection(newFiles) {
    const filesToAdd = Array.from(newFiles);
    if (uploadedFiles.length + filesToAdd.length > MAX_IMAGES) { return Swal.fire('Límite excedido', `Solo puedes subir un total de ${MAX_IMAGES} imágenes.`, 'warning'); }
    uploadedFiles.push(...filesToAdd); renderPreviews();
}

function renderPreviews() {
    const previewContainer = $('#image-preview'); previewContainer.html('');
    uploadedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = e => { previewContainer.append(`<div class="preview-image-container" data-full-src="${e.target.result}" style="cursor: pointer;" title="Ver más grande"><img src="${e.target.result}" class="preview-image"><button type="button" class="remove-btn" data-index="${index}">&times;</button></div>`); };
        reader.readAsDataURL(file);
    });
}

async function executeWithPasswordValidation(actionToExecute, params = {}) {
    const sessionPassword = sessionStorage.getItem('sessionPassword');
    if (sessionPassword) { await actionToExecute(sessionPassword, params); return; }
    const { value: password } = await Swal.fire({ title: 'Confirmación de Seguridad', input: 'password', inputLabel: 'Introduce la contraseña', inputPlaceholder: 'Contraseña', showCancelButton: true, confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar', preConfirm: async (pass) => { if (!pass) { Swal.showValidationMessage('La contraseña es obligatoria'); return; } try { const result = await appFetch('validatePassword', { password: pass }); if (!result.data.isValid) { Swal.showValidationMessage('Contraseña incorrecta'); return; } return pass; } catch (error) { Swal.showValidationMessage(`Error: ${error}`); } } });
    if (password) { sessionStorage.setItem('sessionPassword', password); await actionToExecute(password, params); }
}

document.addEventListener('DOMContentLoaded', () => {
    spinnerModal = new bootstrap.Modal(document.getElementById('spinnerModal'));
    detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
    imagePreviewModal = new bootstrap.Modal(document.getElementById('imagePreviewModal'));
    
    quill = new Quill('#editor-container', { theme: 'snow', placeholder: 'Escribe el detalle de tus actividades aquí...', modules: { toolbar: [[{ 'header': [1, 2, 3, false] }],['bold', 'italic', 'underline'],['blockquote'],[{ 'list': 'ordered'}, { 'list': 'bullet' }],[{ 'align': [] }],['clean']] } });
    
    fetchInitialData();

    $('#saveButton').on('click', handleFormSubmit);
    $('#reportModal').on('hidden.bs.modal', clearForm);
    
    const dropZone = document.getElementById('image-drop-zone'), fileInput = document.getElementById('imageUpload');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFileSelection(e.dataTransfer.files); });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFileSelection(e.target.files); });
    
    $('#image-preview').on('click', '.preview-image-container', function(e) {
        if ($(e.target).hasClass('remove-btn')) {
            const indexToRemove = parseInt($(e.target).data('index'));
            uploadedFiles.splice(indexToRemove, 1);
            renderPreviews();
            e.stopPropagation();
        } else {
            $('#previewModalImage').attr('src', $(this).data('full-src'));
            imagePreviewModal.show();
        }
    });

    document.getElementById('reportModal').addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        const imageFiles = Array.from(items).filter(item => item.type.indexOf('image') !== -1).map(item => item.getAsFile());
        if (imageFiles.length > 0) { event.preventDefault(); handleFileSelection(imageFiles); Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Imagen(es) pegada(s)', showConfirmButton: false, timer: 1500 }); }
    });

    $('#formExecutive').on('change', function() { const selectedOption = $(this).find('option:selected'), role = selectedOption.data('role') || ''; $('#formCargoDisplay').text(role); $('#formCargo').val(role); });
    $('#applyFilters').on('click', applyFilters);
    $('#clearFilters').on('click', () => { $('#filterExecutive, #filterStartDate, #filterEndDate').val(''); createTable(allReportsData); });
    $('#compliance-date-filter').on('change', renderComplianceView);

    $('#dataTableContainer').on('click', '.view-btn', function() {
        const rowData = allReportsData[$(this).data('index')]; if (!rowData) return;
        const [,,ejecutivo, cargo, fechaActividades, actividadesHtml, ...rest] = rowData;
        const imageUrls = rest.slice(0, 5), comentarios = rowData[12] || '';
        const fechaFormateada = new Date(fechaActividades).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
        $('#detailEjecutivo').text(ejecutivo); $('#detailCargo').text(cargo); $('#detailFecha').text(fechaFormateada);
        $('#detailSubject').text(`Reporte de Actividades del ${fechaFormateada}`);
        $('#detailBody .ql-editor').html(actividadesHtml || '<p><em>No se registraron detalles.</em></p>');
        $('#detailAttachments').html(imageUrls.map(url => url ? `<a href="${url}" target="_blank" title="Abrir"><iframe src="${url}" scrolling="no"></iframe></a>` : '').join('') || '<p><em>No hay adjuntos.</em></p>');
        $('#detailCommentSection').toggle(!!comentarios).find('#detailCommentText').text(comentarios);
        detailModal.show();
    });

    $('#dataTableContainer').on('change', '.status-select-badge', async function() {
        const selectElement = $(this), reportId = selectElement.data('id'), newStatus = selectElement.val(), currentStatus = selectElement.data('current-status');
        const updateAction = async (password, params) => {
            try {
                await appFetch('updateStatus', { reportId, newStatus, password, comment: params.comment || '' });
                selectElement.removeClass('status-Enviado status-Recibido status-Observado').addClass(`status-${newStatus}`);
                const reportIndex = allReportsData.findIndex(row => row[0] == reportId);
                if (reportIndex > -1) { allReportsData[reportIndex][11] = newStatus; allReportsData[reportIndex][12] = params.comment || ''; }
                selectElement.data('current-status', newStatus);
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Estado actualizado', showConfirmButton: false, timer: 1500 });
            } catch (error) { selectElement.val(currentStatus); }
        };
        if (newStatus === 'Observado') {
            const { value: comment } = await Swal.fire({ title: 'Añadir Comentario', input: 'textarea', inputLabel: 'Motivo de la observación', showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar' });
            if (comment !== undefined) { executeWithPasswordValidation(updateAction, { comment }).catch(() => selectElement.val(currentStatus)); } else { selectElement.val(currentStatus); }
        } else { executeWithPasswordValidation(updateAction).catch(() => selectElement.val(currentStatus)); }
    });

    $('#sendConsolidatedReportBtn').on('click', function() {
        if (!dataTableInstance) { Swal.fire('Acción no disponible', 'La tabla de reportes no está visible.', 'info'); return; }
        const filteredData = [];
        dataTableInstance.rows({ search: 'applied' }).nodes().each(function (node) { const index = $(node).data('original-index'); if (index !== undefined) filteredData.push(allReportsData[index]); });
        if (filteredData.length === 0) { Swal.fire('No hay datos', 'No hay reportes en la tabla para enviar.', 'info'); return; }
        const sendAction = async (password) => {
            const startDate = $('#filterStartDate').val(), endDate = $('#filterEndDate').val();
            try { const response = await appFetch('sendConsolidatedReport', { reports: filteredData, startDate, endDate, password }); Swal.fire('¡Enviado!', response.message, 'success'); } catch (error) {}
        };
        Swal.fire({ title: '¿Enviar Reporte Consolidado?', text: `Se enviará un correo con ${filteredData.length} reportes.`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, enviar', cancelButtonText: 'Cancelar' }).then((result) => { if (result.isConfirmed) { executeWithPasswordValidation(sendAction); } });
    });

});
