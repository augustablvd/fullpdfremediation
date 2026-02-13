// PDF Accessibility Tagger - Frontend JavaScript

let selectedFiles = [];
let currentSessionId = null;
let processedFiles = [];

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const actionButtons = document.getElementById('actionButtons');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const resultsSummary = document.getElementById('resultsSummary');
const resultsList = document.getElementById('resultsList');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const newBatchBtn = document.getElementById('newBatchBtn');

// Event Listeners
uploadArea.addEventListener('click', (e) => {
    // Don't open a second dialog when the click came from the Browse button
    if (e.target.closest('#browseBtn')) return;
    fileInput.click();
});
document.getElementById('browseBtn').addEventListener('click', (e) => {
    e.stopPropagation(); // prevent the click bubbling up to uploadArea
    fileInput.click();
});
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
uploadBtn.addEventListener('click', uploadFiles);
clearBtn.addEventListener('click', clearFiles);
downloadAllBtn.addEventListener('click', downloadAllFiles);
newBatchBtn.addEventListener('click', resetApp);

// Drag and Drop Handlers
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files).filter(file =>
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );

    addFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

// File Management
function addFiles(files) {
    if (files.length === 0) return;

    // Check batch limit
    if (selectedFiles.length + files.length > 50) {
        showError('Maximum 50 files allowed per batch');
        return;
    }

    selectedFiles.push(...files);
    updateFileList();
    actionButtons.classList.remove('hidden');
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();

    if (selectedFiles.length === 0) {
        actionButtons.classList.add('hidden');
    }
}

function clearFiles() {
    selectedFiles = [];
    fileInput.value = '';
    updateFileList();
    actionButtons.classList.add('hidden');
}

function updateFileList() {
    if (selectedFiles.length === 0) {
        fileList.classList.add('hidden');
        fileList.innerHTML = '';
        return;
    }

    fileList.classList.remove('hidden');
    fileList.innerHTML = selectedFiles.map((file, index) => `
        <div class="file-item">
            <div class="file-info">
                <span class="file-icon">📄</span>
                <div>
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button class="file-remove" onclick="removeFile(${index})" title="Remove file">
                ✕
            </button>
        </div>
    `).join('');
}

// Upload and Processing
async function uploadFiles() {
    if (selectedFiles.length === 0) return;

    // Show progress
    progressSection.classList.remove('hidden');
    uploadBtn.disabled = true;
    clearBtn.disabled = true;
    progressFill.style.width = '10%';
    progressText.textContent = 'Uploading files...';

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        progressFill.style.width = '30%';

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        progressFill.style.width = '60%';
        progressText.textContent = 'Processing PDFs...';

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        const results = await response.json();

        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';

        setTimeout(() => {
            showResults(results);
        }, 500);

    } catch (error) {
        console.error('Upload error:', error);
        showError(error.message || 'Upload failed. Please try again.');
        resetUploadState();
    }
}

// Results Display
function showResults(results) {
    currentSessionId = results.session_id;
    processedFiles = results.files.filter(f => f.success);

    // Hide progress
    progressSection.classList.add('hidden');

    // Show results
    resultsSection.classList.remove('hidden');

    // Update summary
    resultsSummary.innerHTML = `
        <div class="summary-stat">
            <div class="number">${results.successful}</div>
            <div class="label">Successful</div>
        </div>
        ${results.failed > 0 ? `
        <div class="summary-stat">
            <div class="number" style="color: var(--error-color)">${results.failed}</div>
            <div class="label">Failed</div>
        </div>
        ` : ''}
        <div class="summary-stat">
            <div class="number">${results.total}</div>
            <div class="label">Total</div>
        </div>
    `;

    // Update results list
    resultsList.innerHTML = results.files.map(file => `
        <div class="result-item ${file.success ? 'success' : 'failed'}">
            <div class="result-info">
                <span class="result-status">${file.success ? '✓' : '✗'}</span>
                <span class="result-name">${escapeHtml(file.input)}</span>
            </div>
            ${file.success ? `
                <button class="download-btn" onclick="downloadFile('${escapeHtml(file.output)}')">
                    Download
                </button>
            ` : '<span style="color: var(--error-color)">Failed</span>'}
        </div>
    `).join('');

    // Show/hide download all button
    if (processedFiles.length === 0) {
        downloadAllBtn.style.display = 'none';
    }
}

// Download Functions
async function downloadFile(filename) {
    try {
        const response = await fetch(`/api/download/${filename}`);

        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace('tagged_', '');
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Download error:', error);
        showError('Download failed. Please try again.');
    }
}

async function downloadAllFiles() {
    if (processedFiles.length === 0) return;

    try {
        const filenames = processedFiles.map(f => f.output);

        const response = await fetch('/api/download-batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: filenames })
        });

        if (!response.ok) {
            throw new Error('Batch download failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'accessible_pdfs.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Batch download error:', error);
        showError('Batch download failed. Please try again.');
    }
}

// Reset and Cleanup
function resetApp() {
    // Clean up processed files on server
    if (currentSessionId) {
        fetch(`/api/cleanup/${currentSessionId}`, { method: 'DELETE' })
            .catch(err => console.error('Cleanup error:', err));
    }

    // Reset UI
    clearFiles();
    resultsSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    resetUploadState();

    currentSessionId = null;
    processedFiles = [];
}

function resetUploadState() {
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
    progressFill.style.width = '0%';
    progressSection.classList.add('hidden');
}

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;

    const main = document.querySelector('main');
    main.insertBefore(errorDiv, main.firstChild);

    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Make functions globally accessible
window.removeFile = removeFile;
window.downloadFile = downloadFile;
