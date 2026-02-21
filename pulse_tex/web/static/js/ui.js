let toastContainer = null;
let promptResolve = null;
let confirmResolve = null;

function initUI() {
    if (!document.getElementById('toast-container')) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    } else {
        toastContainer = document.getElementById('toast-container');
    }
    
    if (!document.getElementById('prompt-dialog')) {
        const promptDialog = document.createElement('div');
        promptDialog.id = 'prompt-dialog';
        promptDialog.className = 'dialog-overlay';
        promptDialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-header">
                    <h3 class="dialog-title" id="prompt-title">Input</h3>
                </div>
                <div class="dialog-body">
                    <input type="text" class="dialog-input" id="prompt-input">
                </div>
                <div class="dialog-footer">
                    <button class="btn btn-ghost" onclick="closePromptDialog(false)" data-i18n="common.cancel">Cancel</button>
                    <button class="btn btn-primary" onclick="closePromptDialog(true)" data-i18n="common.confirm">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(promptDialog);
    }
    
    if (!document.getElementById('confirm-dialog')) {
        const confirmDialog = document.createElement('div');
        confirmDialog.id = 'confirm-dialog';
        confirmDialog.className = 'dialog-overlay';
        confirmDialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-body">
                    <p id="confirm-message" style="text-align:center;margin:0"></p>
                </div>
                <div class="dialog-footer" style="justify-content:center">
                    <button class="btn btn-ghost" onclick="closeConfirmDialog(false)" data-i18n="common.cancel">Cancel</button>
                    <button class="btn btn-primary" onclick="closeConfirmDialog(true)" data-i18n="common.confirm">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmDialog);
    }
}

function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) initUI();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: Icons.success,
        error: Icons.error,
        warning: Icons.warning,
        info: Icons.info
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-content">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">
            ${Icons.close}
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showPrompt(title, defaultValue = '') {
    initUI();
    
    return new Promise((resolve) => {
        promptResolve = resolve;
        document.getElementById('prompt-title').textContent = title;
        document.getElementById('prompt-input').value = defaultValue;
        document.getElementById('prompt-dialog').classList.add('visible');
        document.getElementById('prompt-input').focus();
    });
}

function closePromptDialog(confirmed) {
    const dialog = document.getElementById('prompt-dialog');
    if (dialog) dialog.classList.remove('visible');
    
    if (promptResolve) {
        promptResolve(confirmed ? document.getElementById('prompt-input').value : null);
        promptResolve = null;
    }
}

function showConfirm(message) {
    initUI();
    
    return new Promise((resolve) => {
        confirmResolve = resolve;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-dialog').classList.add('visible');
    });
}

function closeConfirmDialog(confirmed) {
    const dialog = document.getElementById('confirm-dialog');
    if (dialog) dialog.classList.remove('visible');
    
    if (confirmResolve) {
        confirmResolve(confirmed);
        confirmResolve = null;
    }
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('visible');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('visible');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('prompt-dialog')?.classList.contains('visible')) {
            closePromptDialog(true);
        }
        if (document.getElementById('confirm-dialog')?.classList.contains('visible')) {
            closeConfirmDialog(true);
        }
    }
    if (e.key === 'Escape') {
        if (document.getElementById('prompt-dialog')?.classList.contains('visible')) {
            closePromptDialog(false);
        }
        if (document.getElementById('confirm-dialog')?.classList.contains('visible')) {
            closeConfirmDialog(false);
        }
    }
});

window.showToast = showToast;
window.showPrompt = showPrompt;
window.closePromptDialog = closePromptDialog;
window.showConfirm = showConfirm;
window.closeConfirmDialog = closeConfirmDialog;
window.showModal = showModal;
window.closeModal = closeModal;
window.initUI = initUI;
