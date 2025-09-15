// --- CONFIGURACIÓN GLOBAL Y VARIABLES ---
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbztRER8mua_Ycihts4PRFJB89Ehfs_p7r8sdoScqA84lFPtqZvF-o_bIShirhlMTMao/exec";
const MAX_IMAGES = 5;
let allReportsData = [], executivesData = [], uploadedFiles = [], quill, dataTableInstance;

let spinnerModal, detailModal;

// --- FUNCIONES DE AYUDA Y COMUNICACIÓN ---
function showSpinner(show) {
    show ? spinnerModal.show() : setTimeout(() => spinnerModal.hide(), 250);
}

async function appFetch(action, data = {}) {
    showSpinner(true);
    try {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, data })
        });
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

// --- FUNCIONES DE LÓGICA PRINCIPAL DE LA APP ---
async function fetchInitialData() {
    try {
        const [reportsResult, executivesResult] = await Promise.all([appFetch("getAllReports"), appFetch("getExecutives")]);
        allReportsData = reportsResult.data || [];
        executivesData = executivesResult.data || [];
        
        populateExecutiveDropdowns();
        updateDashboard(allReportsData);
        createTable(allReportsData);
    } catch (error) {
        document.getElementById("dataTableContainer").innerHTML = `<div class='alert alert-danger'>No se pudieron cargar los datos iniciales: ${error.message}</div>`;
    }
}

function populateExecutiveDropdowns() {
    const filterSelect = $('#filterExecutive');
    const formSelect = $('#formExecutive');
    filterSelect.html('<option value="">Todos</option>');
    formSelect.html('<option value="" selected disabled>Seleccione...</option>');
    executivesData.forEach(exec => {
        filterSelect.append(`<option value="${exec.name}">${exec.name}</option>`);
        formSelect.append(`<option value="${exec.name}" data-role="${exec.role}">${exec.name}</option>`);
    });
}

function updateDashboard(data) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayReports = data.filter(row => row[4] && row[4].slice(0, 10) === todayStr).length;
    $('#totalReports').text(data.length);
    $('#todayReports').text(todayReports);
    $('#executivesCount').text(executivesData.length);
}

function getExecutiveColorClass(executiveName) {
    let hash = 0;
    for (let i = 0; i < executiveName.length; i++) {
        hash = executiveName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % 7) + 1;
    return `color-${index}`;
}

function createTable(data) {
    const container = document.getElementById('dataTableContainer');
    if (dataTableInstance) {
        dataTableInstance.destroy();
    }
    if (!data || data.length === 0) {
        container.innerHTML = "<p class='text-center text-muted'>No hay reportes para mostrar.</p>";
        dataTableInstance = null;
        return;
    }

    let tableHtml = `<table id="dataTable" class="table table-hover align-middle w-100"><thead><tr><th>Ejecutivo</th><th>Cargo</th><th>Fecha de Actividades</th><th>Fecha de Envío</th><th>Hora de Envío</th><th class="text-center">Estado</th><th>Observaciones</th><th class="text-center">Acciones</th></tr></thead><tbody>`;
    
    data.forEach((row) => {
        const reportId = row[0];
        const timestamp = row[1] ? new Date(row[1]) : null;
        const ejecutivo = row[2] || '';
        const estado = row[11] || 'Enviado';
        const observaciones = row[12] || '';
        
        const originalIndex = allReportsData.findIndex(originalRow => originalRow[0] === reportId);
        
        const fechaActividades = row[4] ? new Date(row[4]).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
        const fechaEnvio = timestamp ? timestamp.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
        const horaEnvio = timestamp ? timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

        const statusSelectHtml = `
            <select class="form-select form-select-sm status-select status-${estado}" data-id="${reportId}" data-current-status="${estado}">
                <option value="Enviado" ${estado === 'Enviado' ? 'selected' : ''}>📧 Enviado</option>
                <option value="Recibido" ${estado === 'Recibido' ? 'selected' : ''}>✔️ Recibido</option>
                <option value="Observado" ${estado === 'Observado' ? 'selected' : ''}>⚠️ Observado</option>
            </select>
        `;

        const executiveColorClass = getExecutiveColorClass(ejecutivo);
        const executiveHtml = `<span class="executive-badge ${executiveColorClass}">${ejecutivo}</span>`;

        tableHtml += `<tr data-original-index="${originalIndex}">
            <td>${executiveHtml}</td>
            <td>${row[3] || ''}</td>
            <td>${fechaActividades}</td>
            <td>${fechaEnvio}</td>
            <td>${horaEnvio}</td>
            <td class="text-center">${statusSelectHtml}</td>
            <td>${observaciones}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-secondary view-btn" data-index="${originalIndex}" title="Ver Detalles">
                    <i class="fas fa-envelope-open"></i>
                </button>
            </td>
        </tr>`;
    });
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
    dataTableInstance = $('#dataTable').DataTable({
        responsive: true,
        order: [[3, 'desc'], [4, 'desc']], // Ordenar por Fecha y luego Hora de Envío
        language: { url: "//cdn.datatables.net/plug-ins/1.13.3/i18n/es-ES.json" }
    });
}
        
function applyFilters() {
    const execFilter = $('#filterExecutive').val();
    const startFilterStr = $('#filterStartDate').val();
    const endFilterStr = $('#filterEndDate').val();
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
    const formData = {
        ejecutivo: $('#formExecutive').val(),
        cargo: $('#formCargo').val(),
        fechaReporte: $('#fechaReporte').val(),
        actividadesDetalladas: quill.root.innerHTML,
        images: []
    };
    const promises = uploadedFiles.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = error => reject(error); reader.readAsDataURL(file); }));
    try {
        showSpinner(true);
        formData.images = await Promise.all(promises);
        const result = await appFetch("submitReport", formData);
        Swal.fire('¡Éxito!', result.message, 'success');
        bootstrap.Modal.getInstance(document.getElementById('reportModal')).hide();
        await fetchInitialData();
    } catch (error) {} 
    finally { showSpinner(false); }
}
        
function clearForm() {
    $('#reportForm').trigger('reset');
    if (quill) quill.setText('');
    $('#formCargoDisplay').text('');
    uploadedFiles = [];
    renderPreviews();
    $('#reportForm').removeClass('was-validated');
}

function handleFileSelection(newFiles) {
    const filesToAdd = Array.from(newFiles);
    if (uploadedFiles.length + filesToAdd.length > MAX_IMAGES) { Swal.fire('Límite excedido', `Solo puedes subir un total de ${MAX_IMAGES} imágenes.`, 'warning'); return; }
    uploadedFiles.push(...filesToAdd);
    renderPreviews();
}

function renderPreviews() {
    const previewContainer = $('#image-preview');
    previewContainer.html('');
    uploadedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = e => { previewContainer.append(`<div class="preview-image-container"><img src="${e.target.result}" class="preview-image"><button type="button" class="remove-btn" data-index="${index}">&times;</button></div>`); };
        reader.readAsDataURL(file);
    });
}

async function executeWithPasswordValidation(actionToExecute, params = {}) {
    const sessionPassword = sessionStorage.getItem('sessionPassword');
    if (sessionPassword) {
        await actionToExecute(sessionPassword, params);
        return;
    }
    const { value: password } = await Swal.fire({
        title: 'Confirmación de seguridad',
        input: 'password',
        inputLabel: 'Introduce la contraseña para realizar esta acción',
        inputPlaceholder: 'Contraseña',
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        preConfirm: async (pass) => {
            if (!pass) { Swal.showValidationMessage('La contraseña es obligatoria'); return; }
            try {
                const result = await appFetch('validatePassword', { password: pass });
                if (!result.data.isValid) { Swal.showValidationMessage('Contraseña incorrecta'); return; }
                return pass;
            } catch (error) { Swal.showValidationMessage(`Error de validación: ${error}`); }
        }
    });
    if (password) {
        sessionStorage.setItem('sessionPassword', password);
        await actionToExecute(password, params);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    spinnerModal = new bootstrap.Modal(document.getElementById('spinnerModal'));
    detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
    
    const toolbarOptions = [[{ 'header': [1, 2, 3, false] }],['bold', 'italic', 'underline', 'strike'],['blockquote'],[{ 'list': 'ordered'}, { 'list': 'bullet' }],[{ 'indent': '-1'}, { 'indent': '+1' }],[{ 'color': [] }, { 'background': [] }],[{ 'align': [] }],['clean']];
    quill = new Quill('#editor-container', { modules: { toolbar: toolbarOptions }, theme: 'snow', placeholder: 'Escribe el detalle de tus actividades aquí...' });
    
    fetchInitialData();

    $('#saveButton').on('click', handleFormSubmit);
    $('#reportModal').on('hidden.bs.modal', clearForm);
    
    const dropZone = document.getElementById('image-drop-zone');
    const fileInput = document.getElementById('imageUpload');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) { handleFileSelection(e.dataTransfer.files); } });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) { handleFileSelection(e.target.files); } });
    $('#image-preview').on('click', '.remove-btn', function() { const indexToRemove = parseInt($(this).data('index')); uploadedFiles.splice(indexToRemove, 1); renderPreviews(); });

    document.getElementById('reportModal').addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        let foundImage = false;
        const imageFiles = [];
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                imageFiles.push(file);
                foundImage = true;
            }
        }
        if (foundImage) {
            event.preventDefault();
            handleFileSelection(imageFiles);
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Imagen(es) pegada(s)', showConfirmButton: false, timer: 1500 });
        }
    });

    $('#formExecutive').on('change', function() {
        const selectedOption = $(this).find('option:selected');
        const role = selectedOption.data('role') || '';
        $('#formCargoDisplay').text(role);
        $('#formCargo').val(role);
    });

    $('#applyFilters').on('click', applyFilters);
    $('#clearFilters').on('click', () => {
        $('#filterExecutive, #filterStartDate, #filterEndDate').val('');
        createTable(allReportsData);
    });

    $('#dataTableContainer').on('click', '.view-btn', function() {
        const index = $(this).data('index');
        const rowData = allReportsData[index];
        if (!rowData) return;
        
        const ejecutivo = rowData[2], cargo = rowData[3], fecha = new Date(rowData[4]);
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
        const actividadesHtml = rowData[5], imageUrls = rowData.slice(6, 11), comentarios = rowData[12] || '';
        
        $('#detailEjecutivo').text(ejecutivo);
        $('#detailCargo').text(cargo);
        $('#detailFecha').text(fechaFormateada);
        $('#detailSubject').text(`Reporte de Actividades del ${fechaFormateada}`);
        $('#detailBody .ql-editor').html(actividadesHtml || '<p><em>No se registraron detalles.</em></p>');
        const attachmentsHtml = imageUrls.map(previewUrl => {
            if (!previewUrl) return '';
            return `<a href="${previewUrl}" target="_blank" title="Haz clic para abrir"><iframe src="${previewUrl}" scrolling="no"></iframe></a>`;
        }).join('');
        $('#detailAttachments').html(attachmentsHtml || '<p class="text-muted"><em>No hay archivos adjuntos.</em></p>');
        
        // Lógica para mostrar comentarios en el modal de detalles
        if (comentarios) {
            $('#detailCommentSection').show();
            $('#detailCommentText').text(comentarios);
        } else {
            $('#detailCommentSection').hide();
        }

        detailModal.show();
    });

    $('#dataTableContainer').on('change', '.status-select', async function() {
        const selectElement = $(this);
        const reportId = selectElement.data('id');
        const newStatus = selectElement.val();
        const currentStatus = selectElement.data('current-status');

        const updateAction = async (password, params) => {
            try {
                await appFetch('updateStatus', { reportId, newStatus, password, comment: params.comment || '' });
                selectElement.removeClass('status-Enviado status-Recibido status-Observado').addClass(`status-${newStatus}`);
                selectElement.data('current-status', newStatus);
                const reportIndex = allReportsData.findIndex(row => row[0] == reportId);
                if (reportIndex > -1) {
                    allReportsData[reportIndex][11] = newStatus;
                    allReportsData[reportIndex][12] = params.comment || '';
                }
                createTable(allReportsData); // Redibujar para mostrar comentario
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Estado actualizado', showConfirmButton: false, timer: 1500 });
            } catch (error) {
                selectElement.val(currentStatus);
            }
        };
        
        if (newStatus === 'Observado') {
            const { value: comment } = await Swal.fire({
                title: 'Añadir Comentario',
                input: 'textarea',
                inputLabel: 'Por favor, introduce el motivo de la observación.',
                inputPlaceholder: 'Escribe tu comentario aquí...',
                showCancelButton: true,
                confirmButtonText: 'Guardar y Cambiar Estado',
                cancelButtonText: 'Cancelar'
            });

            if (comment !== undefined) { // Si el usuario no cancela (incluso si está vacío)
                executeWithPasswordValidation(updateAction, { comment: comment }).catch(() => selectElement.val(currentStatus));
            } else {
                selectElement.val(currentStatus);
            }
        } else {
            executeWithPasswordValidation(updateAction).catch(() => selectElement.val(currentStatus));
        }
    });

    $('#sendConsolidatedReportBtn').on('click', function() {
        if (!dataTableInstance) return;
        const filteredData = [];
        dataTableInstance.rows({ filter: 'applied' }).nodes().each(function (node) {
            const index = $(node).data('original-index');
            if (index !== undefined) filteredData.push(allReportsData[index]);
        });

        if (filteredData.length === 0) {
            Swal.fire('No hay datos', 'No hay reportes en la tabla para enviar.', 'info');
            return;
        }

        const sendAction = async (password) => {
            try {
                const startDate = $('#filterStartDate').val();
                const endDate = $('#filterEndDate').val();
                const response = await appFetch('sendConsolidatedReport', {
                    reports: filteredData,
                    startDate: startDate,
                    endDate: endDate,
                    password: password
                });
                Swal.fire('¡Enviado!', response.message, 'success');
            } catch (error) {}
        };

        Swal.fire({
            title: '¿Enviar Reporte Consolidado?',
            text: `Se enviará un correo con los ${filteredData.length} reportes que se muestran actualmente.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, enviar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                executeWithPasswordValidation(sendAction);
            }
        });
    });
});
