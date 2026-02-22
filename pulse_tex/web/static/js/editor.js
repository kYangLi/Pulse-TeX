let projectId = null;
let editor = null;
let currentFile = null;
let pdfDoc = null;
let currentPage = 1;
let zoom = 1;
let openPanel = null;
let aiMode = 'chat';
let autoSaveTimer = null;
let hasUnsavedChanges = false;
let lastSaveTime = null;
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

document.addEventListener('DOMContentLoaded', async function() {
    await initI18n();
    projectId = new URLSearchParams(window.location.search).get('id');
    if (!projectId) {
        window.location.href = '/';
        return;
    }
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdfjs/pdf.worker.min.js';
    
    initMonaco();
    initDiagramCanvas();
    loadSettings();
    initAutoSave();
});

function initAutoSave() {
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            const timeStr = lastSaveTime ? formatTimeAgo(lastSaveTime) : 'never';
            const msg = `${t('editor.unsavedChanges') || 'You have unsaved changes'}\n${t('editor.lastSaved') || 'Last saved'}: ${timeStr}\n\n${t('editor.confirmExit') || 'Are you sure you want to leave?'}`;
            e.preventDefault();
            e.returnValue = msg;
            return msg;
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentFile();
        }
    });
    
    setInterval(() => {
        if (hasUnsavedChanges && editor && currentFile) {
            saveCurrentFile();
        }
    }, AUTO_SAVE_INTERVAL);
}

function markUnsaved() {
    hasUnsavedChanges = true;
    updateSaveStatus('unsaved');
}

function formatTimeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return t('common.justNow') || 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} ${t('common.minutesAgo') || 'min ago'}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('common.hoursAgo') || 'hours ago'}`;
    return date.toLocaleTimeString();
}

function updateSaveStatus(status) {
    const statusEl = document.getElementById('save-status');
    if (!statusEl) return;
    
    const labels = {
        'saved': t('editor.saved') || 'Saved',
        'unsaved': t('editor.unsaved') || 'Unsaved',
        'saving': t('editor.saving') || 'Saving...',
        'error': t('editor.saveError') || 'Save failed'
    };
    
    statusEl.textContent = labels[status] || '';
    statusEl.className = 'save-status ' + status;
}

async function loadProject() {
    try {
        const res = await fetch(`/api/projects/${projectId}`);
        const project = await res.json();
        document.getElementById('project-name').textContent = project.name;
        document.title = `${project.name} - Pulse-TeX`;
        await loadFiles();
    } catch (e) {
        console.error('Failed to load project:', e);
    }
}

async function loadFiles() {
    try {
        const res = await fetch(`/api/files/${projectId}`);
        const files = await res.json();
        renderFileTree(files);
        if (files.length > 0) {
            const mainFile = files.find(f => f.path === 'main.tex') || files[0];
            openFile(mainFile.path);
        }
    } catch (e) {
        console.error('Failed to load files:', e);
    }
}

function renderFileTree(files) {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = files.map(f => `
        <li class="file-item ${f.path === currentFile ? 'active' : ''}" onclick="openFile('${escapeHtml(f.path)}')" data-file-path="${escapeHtml(f.path)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <path d="M14 2v6h6"/>
            </svg>
            <span class="file-name">${escapeHtml(f.path)}</span>
            <div class="file-actions">
                <button class="file-action-btn" onclick="event.stopPropagation();deleteFile('${escapeHtml(f.path)}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        </li>
    `).join('');
}

async function openFile(path) {
    if (editor && currentFile) {
        await saveCurrentFile();
    }
    
    try {
        const res = await fetch(`/api/files/${projectId}/${encodeURIComponent(path)}`);
        const file = await res.json();
        currentFile = path;
        
        document.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.filePath === path);
        });
        
        if (editor) {
            editor.setValue(file.content || '');
        }
    } catch (e) {
        console.error('Failed to open file:', e);
    }
}

function initMonaco() {
    require.config({ paths: { 'vs': '/libs/vs' }});
    require(['vs/editor/editor.main'], function() {
        editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '',
            language: 'latex',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            fontFamily: 'JetBrains Mono, Consolas, monospace',
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            tabSize: 2
        });
        
        editor.onDidChangeModelContent(() => {
            if (currentFile) {
                markUnsaved();
            }
        });
        
        editor.onDidChangeCursorPosition(e => {
            if (pdfDoc && currentFile) {
                syncToPDF(e.position.lineNumber);
            }
        });
        
        loadProject();
        lastSaveTime = new Date();
        updateSaveStatus('saved');
    });
}

async function saveCurrentFile() {
    if (!editor || !currentFile) return;
    
    const content = editor.getValue();
    updateSaveStatus('saving');
    
    try {
        const res = await fetch(`/api/files/${projectId}/${encodeURIComponent(currentFile)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        if (res.ok) {
            hasUnsavedChanges = false;
            lastSaveTime = new Date();
            updateSaveStatus('saved');
        } else {
            const err = await res.text();
            console.error('Save failed:', err);
            updateSaveStatus('error');
        }
    } catch (e) {
        console.error('Failed to save file:', e);
        updateSaveStatus('error');
    }
}

async function createNewFile() {
    const path = prompt(t('editor.newFileName') || 'File name:', 'untitled.tex');
    if (!path) return;
    
    try {
        const res = await fetch(`/api/files/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content: '' })
        });
        const file = await res.json();
        await loadFiles();
        openFile(file.path);
    } catch (e) {
        console.error('Failed to create file:', e);
    }
}

async function deleteFile(path) {
    if (!confirm(t('index.confirmDelete') || 'Are you sure?')) return;
    
    try {
        await fetch(`/api/files/${projectId}/${encodeURIComponent(path)}`, { method: 'DELETE' });
        await loadFiles();
    } catch (e) {
        console.error('Failed to delete file:', e);
    }
}

async function compileProject() {
    const btn = document.getElementById('compile-btn');
    const status = document.getElementById('compile-status');
    
    btn.disabled = true;
    status.className = 'compile-status loading';
    status.textContent = t('editor.compiling') || 'Compiling...';
    
    try {
        await saveCurrentFile();
        
        const res = await fetch(`/api/compile/${projectId}`, {
            method: 'POST'
        });
        const result = await res.json();
        
        if (result.success) {
            status.className = 'compile-status success';
            status.textContent = t('editor.compileSuccess') || 'Compiled successfully';
            loadPDF();
        } else {
            status.className = 'compile-status error';
            status.textContent = t('editor.compileError') || 'Compilation failed';
            showErrorLog(result.log);
        }
    } catch (e) {
        status.className = 'compile-status error';
        status.textContent = e.message;
    }
    
    btn.disabled = false;
}

function showErrorLog(log) {
    const panel = document.getElementById('error-panel');
    const logEl = document.getElementById('error-log');
    logEl.textContent = log || '';
    
    let explainBtn = document.getElementById('explain-error-btn');
    if (!explainBtn) {
        const header = panel.querySelector('.error-header');
        explainBtn = document.createElement('button');
        explainBtn.id = 'explain-error-btn';
        explainBtn.className = 'btn btn-secondary btn-sm';
        explainBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/></svg><span data-i18n="editor.explainError">Explain</span>`;
        explainBtn.onclick = explainErrorWithAI;
        header.insertBefore(explainBtn, header.querySelector('.icon-btn'));
    }
    
    panel.classList.add('visible');
}

async function explainErrorWithAI() {
    const logEl = document.getElementById('error-log');
    const log = logEl.textContent;
    const sourceCode = editor?.getValue() || '';
    
    const explainBtn = document.getElementById('explain-error-btn');
    explainBtn.disabled = true;
    explainBtn.innerHTML = '<span class="spinner"></span>';
    
    togglePanel('ai');
    const chat = document.getElementById('ai-chat');
    chat.innerHTML = `<div class="ai-message user">${t('editor.askingAI') || 'Asking AI to explain the error...'}</div>`;
    
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'ai-message assistant';
    assistantMsg.innerHTML = '<span class="typing-indicator">...</span>';
    chat.appendChild(assistantMsg);
    
    try {
        const res = await fetch('/api/ai/explain-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                log_content: log,
                source_code: sourceCode
            })
        });
        const data = await res.json();
        
        if (data.success && data.content) {
            assistantMsg.innerHTML = formatAIContent(data.content);
            const insertBtn = document.createElement('button');
            insertBtn.className = 'ai-insert-btn';
            insertBtn.textContent = t('ai.copy') || 'Copy';
            insertBtn.onclick = () => { navigator.clipboard.writeText(data.content); insertBtn.textContent = t('ai.copied') || 'Copied!'; };
            assistantMsg.appendChild(insertBtn);
        } else {
            assistantMsg.className = 'ai-message error';
            assistantMsg.textContent = data.error || 'Failed to explain error';
        }
    } catch (e) {
        assistantMsg.className = 'ai-message error';
        assistantMsg.textContent = e.message;
    }
    
    chat.scrollTop = chat.scrollHeight;
    explainBtn.disabled = false;
    explainBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/></svg><span data-i18n="editor.explainError">Explain</span>`;
}

function toggleErrorPanel() {
    document.getElementById('error-panel').classList.toggle('visible');
}

async function loadPDF() {
    try {
        const res = await fetch(`/api/compile/${projectId}/pdf`);
        if (!res.ok) return;
        
        const arrayBuffer = await res.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        document.getElementById('total-pages').textContent = pdfDoc.numPages;
        renderPage(1);
    } catch (e) {
    }
}

function renderPage(pageNum) {
    if (!pdfDoc) return;
    
    pdfDoc.getPage(pageNum).then(page => {
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');
        
        const viewport = page.getViewport({ scale: zoom * 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        page.render({ canvasContext: ctx, viewport });
        
        currentPage = pageNum;
        document.getElementById('current-page').textContent = pageNum;
    });
}

function prevPage() {
    if (currentPage > 1) renderPage(currentPage - 1);
}

function nextPage() {
    if (pdfDoc && currentPage < pdfDoc.numPages) renderPage(currentPage + 1);
}

function setZoom(value) {
    zoom = value / 100;
    if (pdfDoc) renderPage(currentPage);
}

function refreshPreview() {
    if (pdfDoc) renderPage(currentPage);
}

function downloadPdf() {
    window.location.href = `/api/compile/${projectId}/pdf`;
}

async function syncToPDF(line) {
    if (!currentFile) return;
    try {
        const res = await fetch(`/api/compile/${projectId}/synctex?line=${line}&file=${encodeURIComponent(currentFile)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.page) renderPage(data.page);
        }
    } catch (e) {}
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function togglePanel(name) {
    const panelMap = {
        'ai': { panel: 'ai-panel', toggle: 'ai-toggle' },
        'literature': { panel: 'literature-panel', toggle: 'lit-toggle' },
        'diagram': { panel: 'diagram-panel', toggle: 'diagram-toggle' }
    };
    
    Object.entries(panelMap).forEach(([key, ids]) => {
        const panel = document.getElementById(ids.panel);
        const toggle = document.getElementById(ids.toggle);
        
        if (!panel || !toggle) return;
        
        if (key === name) {
            panel.classList.toggle('visible');
            toggle.classList.toggle('active', panel.classList.contains('visible'));
            openPanel = panel.classList.contains('visible') ? name : null;
        } else {
            panel.classList.remove('visible');
            toggle.classList.remove('active');
        }
    });
}

function setAIMode(mode) {
    aiMode = mode;
    document.querySelectorAll('.ai-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.mode === mode);
    });
}

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const chat = document.getElementById('ai-chat');
    const message = input.value.trim();
    
    if (!message) return;
    
    chat.innerHTML += `<div class="ai-message user">${escapeHtml(message).replace(/\n/g, '<br>')}</div>`;
    input.value = '';
    chat.scrollTop = chat.scrollHeight;
    
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'ai-message assistant';
    assistantMsg.innerHTML = '<span class="typing-indicator">...</span>';
    chat.appendChild(assistantMsg);
    chat.scrollTop = chat.scrollHeight;
    
    let systemPrompt = null;
    if (aiMode === 'generate') {
        systemPrompt = `You are a LaTeX expert. Generate LaTeX code based on the user's request.
Rules:
- Return ONLY valid LaTeX code that can be directly inserted into a document
- Do NOT include \\documentclass, \\begin{document}, or \\end{document}
- Use standard packages (assume they are already imported)
- Keep the code clean and well-formatted
- Add brief comments if helpful`;
    }
    
    try {
        const res = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                context: editor?.getValue() || '',
                system_prompt: systemPrompt
            })
        });
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullContent += parsed.content;
                            assistantMsg.innerHTML = formatAIContent(fullContent);
                            chat.scrollTop = chat.scrollHeight;
                        } else if (parsed.error) {
                            assistantMsg.className = 'ai-message error';
                            assistantMsg.textContent = parsed.error;
                        }
                    } catch {}
                }
            }
        }
        
        if (fullContent) {
            const insertBtn = document.createElement('button');
            insertBtn.className = 'ai-insert-btn';
            insertBtn.textContent = t('ai.insertToEditor') || 'Insert to Editor';
            insertBtn.onclick = () => insertAIToEditor(fullContent);
            assistantMsg.appendChild(insertBtn);
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'ai-insert-btn';
            copyBtn.textContent = t('ai.copy') || 'Copy';
            copyBtn.style.marginLeft = '8px';
            copyBtn.onclick = () => { navigator.clipboard.writeText(fullContent); copyBtn.textContent = t('ai.copied') || 'Copied!'; };
            assistantMsg.appendChild(copyBtn);
        }
    } catch (e) {
        assistantMsg.className = 'ai-message error';
        assistantMsg.textContent = e.message;
    }
    chat.scrollTop = chat.scrollHeight;
}

function formatAIContent(content) {
    let html = escapeHtml(content).replace(/\n/g, '<br>');
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="ai-code-block"><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return html;
}

function insertAIToEditor(content) {
    if (!editor) return;
    const position = editor.getPosition();
    editor.executeEdits('', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: content
    }]);
    editor.focus();
}

let pendingDiff = null;

async function aiPolishSelection() {
    const selection = editor?.getModel().getValueInRange(editor.getSelection());
    if (!selection) {
        alert(t('ai.noSelection') || 'Please select some text first');
        return;
    }
    await aiModifyText(selection, 'polish', editor.getSelection());
}

async function aiRewriteSelection() {
    const selection = editor?.getModel().getValueInRange(editor.getSelection());
    if (!selection) {
        alert(t('ai.noSelection') || 'Please select some text first');
        return;
    }
    await aiModifyText(selection, 'rewrite', editor.getSelection());
}

async function aiTranslateSelection() {
    const selection = editor?.getModel().getValueInRange(editor.getSelection());
    if (!selection) {
        alert(t('ai.noSelection') || 'Please select some text first');
        return;
    }
    await aiModifyText(selection, 'translate', editor.getSelection());
}

async function aiPolishAll() {
    const allText = editor?.getValue();
    if (!allText) return;
    const fullRange = editor.getModel().getFullModelRange();
    await aiModifyText(allText, 'polish', fullRange);
}

async function aiModifyText(originalText, action, range) {
    const chat = document.getElementById('ai-chat');
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'ai-message assistant';
    assistantMsg.innerHTML = '<span class="typing-indicator">...</span>';
    chat.appendChild(assistantMsg);
    chat.scrollTop = chat.scrollHeight;
    
    const actionLabels = {
        'polish': t('ai.actions.polishing') || 'Polishing...',
        'rewrite': t('ai.actions.rewriting') || 'Rewriting...',
        'translate': t('ai.actions.translating') || 'Translating...'
    };
    
    const systemPrompts = {
        'polish': `You are an academic writing assistant. Polish the given LaTeX text.
Rules:
- Improve clarity, grammar, and academic style
- Preserve ALL LaTeX commands, environments, and mathematical notation exactly
- Return ONLY the polished text, no explanations
- Maintain the same structure and length approximately`,
        'rewrite': `You are an academic writing assistant. Rewrite the given LaTeX text to be clearer and more impactful.
Rules:
- Improve flow and readability
- Preserve ALL LaTeX commands, environments, and mathematical notation exactly
- Return ONLY the rewritten text, no explanations`,
        'translate': `You are a professional academic translator. Translate the given LaTeX text.
Rules:
- Translate to English if the text is in Chinese, or to Chinese if in English
- Preserve ALL LaTeX commands, environments, and mathematical notation exactly
- Return ONLY the translated text, no explanations`
    };
    
    try {
        const res = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: originalText,
                context: '',
                system_prompt: systemPrompts[action]
            })
        });
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullContent += parsed.content;
                        }
                    } catch {}
                }
            }
        }
        
        if (fullContent) {
            pendingDiff = { original: originalText, modified: fullContent, range: range };
            showDiffView(assistantMsg, originalText, fullContent);
        }
    } catch (e) {
        assistantMsg.className = 'ai-message error';
        assistantMsg.textContent = e.message;
    }
    chat.scrollTop = chat.scrollHeight;
}

function showDiffView(container, original, modified) {
    const diffHtml = computeDiffHtml(original, modified);
    
    container.innerHTML = `
        <div class="ai-diff-container">
            <div class="ai-diff-header">
                <span>${t('ai.diff.title') || 'Changes Preview'}</span>
                <div class="ai-diff-actions">
                    <button class="ai-diff-accept" onclick="acceptDiff()">${t('ai.diff.accept') || 'Accept'}</button>
                    <button class="ai-diff-reject" onclick="rejectDiff()">${t('ai.diff.reject') || 'Reject'}</button>
                </div>
            </div>
            <div class="ai-diff-content">${diffHtml}</div>
        </div>
    `;
}

function computeDiffHtml(original, modified) {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    
    let html = '';
    const maxLen = Math.max(origLines.length, modLines.length);
    
    for (let i = 0; i < maxLen; i++) {
        const origLine = origLines[i] || '';
        const modLine = modLines[i] || '';
        
        if (origLine === modLine) {
            html += `<div class="ai-diff-line unchanged">${escapeHtml(origLine) || ' '}</div>`;
        } else {
            if (origLine) {
                html += `<div class="ai-diff-line removed">- ${escapeHtml(origLine)}</div>`;
            }
            if (modLine) {
                html += `<div class="ai-diff-line added">+ ${escapeHtml(modLine)}</div>`;
            }
        }
    }
    
    return html || `<div class="ai-diff-line added">+ ${escapeHtml(modified)}</div>`;
}

function acceptDiff() {
    if (!pendingDiff || !editor) return;
    
    editor.executeEdits('', [{
        range: pendingDiff.range,
        text: pendingDiff.modified
    }]);
    
    const chat = document.getElementById('ai-chat');
    chat.innerHTML += `<div class="ai-message assistant" style="color:var(--accent-success)">${t('ai.diff.accepted') || 'Changes applied!'}</div>`;
    chat.scrollTop = chat.scrollHeight;
    
    pendingDiff = null;
    editor.focus();
}

function rejectDiff() {
    pendingDiff = null;
    const chat = document.getElementById('ai-chat');
    chat.innerHTML += `<div class="ai-message assistant" style="color:var(--text-muted)">${t('ai.diff.rejected') || 'Changes discarded'}</div>`;
    chat.scrollTop = chat.scrollHeight;
}

async function searchLiterature() {
    const input = document.getElementById('literature-search-input');
    const results = document.getElementById('literature-results');
    const query = input.value.trim();
    
    if (!query) return;
    
    results.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
    
    try {
        const res = await fetch(`/api/literature/search?q=${encodeURIComponent(query)}`);
        const papers = await res.json();
        
        results.innerHTML = papers.map(p => `
            <div class="lit-paper" onclick="viewPaper('${p.arxiv_id}')">
                <div class="lit-paper-title">${escapeHtml(p.title)}</div>
                <div class="lit-paper-authors">${escapeHtml(p.authors?.slice(0, 3).join(', ') || '')}${p.authors?.length > 3 ? ' et al.' : ''}</div>
                <div class="lit-paper-actions">
                    <button onclick="event.stopPropagation();insertCitation('${p.arxiv_id}')">${t('literature.insertCitation') || 'Cite'}</button>
                    <button onclick="event.stopPropagation();copyBibtex('${p.arxiv_id}')">${t('literature.copyBibtex') || 'BibTeX'}</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        results.innerHTML = `<div class="text-muted">${t('literature.noResults') || 'No results'}</div>`;
    }
}

async function insertCitation(arxivId) {
    const citation = `\\cite{${arxivId}}`;
    editor?.trigger('keyboard', 'type', { text: citation });
}

async function copyBibtex(arxivId) {
    try {
        const res = await fetch(`/api/literature/citation/${arxivId}`);
        const data = await res.json();
        navigator.clipboard.writeText(data.bibtex);
    } catch (e) {}
}

let diagramTool = 'pen';
let diagramCtx = null;
let isDrawing = false;
let startX, startY;

function initDiagramCanvas() {
    const canvas = document.getElementById('diagram-canvas');
    diagramCtx = canvas.getContext('2d');
    
    const resize = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        diagramCtx.fillStyle = '#fff';
        diagramCtx.fillRect(0, 0, canvas.width, canvas.height);
    };
    
    resize();
    window.addEventListener('resize', resize);
    
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
}

function setDiagramTool(tool) {
    diagramTool = tool;
    document.querySelectorAll('.diagram-tool').forEach(t => {
        t.classList.toggle('active', t.dataset.tool === tool);
    });
}

function startDraw(e) {
    isDrawing = true;
    const rect = e.target.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
}

function draw(e) {
    if (!isDrawing) return;
    
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const color = document.getElementById('diagram-color').value;
    const width = parseInt(document.getElementById('diagram-line-width').value);
    
    diagramCtx.strokeStyle = color;
    diagramCtx.lineWidth = width;
    diagramCtx.lineCap = 'round';
    
    if (diagramTool === 'pen') {
        diagramCtx.beginPath();
        diagramCtx.moveTo(startX, startY);
        diagramCtx.lineTo(x, y);
        diagramCtx.stroke();
        startX = x;
        startY = y;
    }
}

function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const color = document.getElementById('diagram-color').value;
    const width = parseInt(document.getElementById('diagram-line-width').value);
    
    diagramCtx.strokeStyle = color;
    diagramCtx.lineWidth = width;
    
    if (diagramTool === 'line') {
        diagramCtx.beginPath();
        diagramCtx.moveTo(startX, startY);
        diagramCtx.lineTo(x, y);
        diagramCtx.stroke();
    } else if (diagramTool === 'rect') {
        diagramCtx.strokeRect(startX, startY, x - startX, y - startY);
    } else if (diagramTool === 'circle') {
        const r = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        diagramCtx.beginPath();
        diagramCtx.arc(startX, startY, r, 0, 2 * Math.PI);
        diagramCtx.stroke();
    } else if (diagramTool === 'arrow') {
        diagramCtx.beginPath();
        diagramCtx.moveTo(startX, startY);
        diagramCtx.lineTo(x, y);
        diagramCtx.stroke();
    }
}

function clearDiagramCanvas() {
    const canvas = document.getElementById('diagram-canvas');
    diagramCtx.fillStyle = '#fff';
    diagramCtx.fillRect(0, 0, canvas.width, canvas.height);
}

async function generateDiagramFromText() {
    const prompt = document.getElementById('diagram-prompt').value;
    const style = document.getElementById('diagram-style').value;
    
    if (!prompt) return;
    
    try {
        const res = await fetch('/api/diagram/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, style })
        });
        const data = await res.json();
        if (data.svg) {
            document.getElementById('diagram-preview').innerHTML = data.svg;
            document.getElementById('diagram-preview').classList.add('visible');
        }
    } catch (e) {}
}

async function refineDiagramSketch() {
    const canvas = document.getElementById('diagram-canvas');
    const style = document.getElementById('diagram-style').value;
    const prompt = document.getElementById('diagram-prompt').value;
    const imageData = canvas.toDataURL();
    
    try {
        const res = await fetch('/api/diagram/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData, style, prompt })
        });
        const data = await res.json();
        if (data.svg) {
            document.getElementById('diagram-preview').innerHTML = data.svg;
            document.getElementById('diagram-preview').classList.add('visible');
        }
    } catch (e) {}
}

function exportDiagramSVG() {
    const svg = document.getElementById('diagram-preview').innerHTML;
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
}

async function exportDiagramTikZ() {
    const svg = document.getElementById('diagram-preview').innerHTML;
    if (!svg) return;
    
    try {
        const res = await fetch('/api/diagram/svg-to-tikz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ svg })
        });
        const data = await res.json();
        if (data.tikz) {
            navigator.clipboard.writeText(data.tikz);
        }
    } catch (e) {}
}

function insertDiagramToPaper() {
    const svg = document.getElementById('diagram-preview').querySelector('svg');
    if (!svg) return;
    
    const figure = `
\\begin{figure}[htbp]
\\centering
\\includegraphics[width=0.8\\textwidth]{diagram.pdf}
\\caption{Figure caption}
\\label{fig:diagram}
\\end{figure}`;
    editor?.trigger('keyboard', 'type', { text: figure });
}

document.addEventListener('contextmenu', e => {
    if (e.target.closest('.editor-container')) {
        e.preventDefault();
        const menu = document.getElementById('ai-context-menu');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.classList.add('visible');
    }
});

document.addEventListener('click', e => {
    if (!e.target.closest('.context-menu')) {
        document.getElementById('ai-context-menu').classList.remove('visible');
    }
});

async function aiAction(action) {
    const selection = editor?.getModel().getValueInRange(editor.getSelection());
    if (!selection) return;
    
    document.getElementById('ai-context-menu').classList.remove('visible');
    togglePanel('ai');
    
    const chat = document.getElementById('ai-chat');
    chat.innerHTML += `<div class="ai-message user">${t('ai.contextMenu.' + action.replace('-', '')) || action}: "${selection.slice(0, 50)}..."</div>`;
    
    try {
        const res = await fetch('/api/ai/' + (action.startsWith('translate') ? 'translate' : action), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: selection,
                target_lang: action === 'translate-en' ? 'en' : action === 'translate-zh' ? 'zh' : undefined
            })
        });
        const data = await res.json();
        
        if (action === 'polish' || action.startsWith('translate')) {
            editor?.executeEdits('', [{
                range: editor.getSelection(),
                text: data.result
            }]);
        }
        
        chat.innerHTML += `<div class="ai-message assistant">${escapeHtml(data.result || data.response)}</div>`;
        chat.scrollTop = chat.scrollHeight;
    } catch (e) {
        chat.innerHTML += `<div class="ai-message error">${e.message}</div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openSettingsFromEditor() {
    loadSettings();
    document.getElementById('settings-modal').classList.add('visible');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('visible');
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';
}

async function loadSettings() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        const langSelect = document.getElementById('setting-language');
        const themeSelect = document.getElementById('setting-theme');
        if (langSelect) langSelect.value = config.ui_language || 'en';
        if (themeSelect) themeSelect.value = config.theme || 'dark';
        
        document.getElementById('setting-ai-url').value = config.ai_base_url || '';
        document.getElementById('setting-ai-key').value = config.ai_api_key || '';
        document.getElementById('setting-ai-model').value = config.ai_model || '';
        document.getElementById('setting-latex-engine').value = config.latex_engine || 'tectonic';
        document.getElementById('setting-bibtex-engine').value = config.bibtex_engine || 'biber';
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

async function saveSettings() {
    const config = {
        ui_language: document.getElementById('setting-language').value,
        theme: document.getElementById('setting-theme').value,
        ai_base_url: document.getElementById('setting-ai-url').value,
        ai_api_key: document.getElementById('setting-ai-key').value,
        ai_model: document.getElementById('setting-ai-model').value,
        latex_engine: document.getElementById('setting-latex-engine').value,
        bibtex_engine: document.getElementById('setting-bibtex-engine').value
    };
    
    try {
        await fetch('/api/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        setLanguage(config.ui_language);
        setTheme(config.theme);
        updateLangLabel();
        updateThemeIcon();
        closeModal('settings-modal');
    } catch (e) {
        alert(t('common.error') || 'Error saving settings');
    }
}

function changeLanguage(lang) {
    setLanguage(lang);
}

function changeTheme(theme) {
    setTheme(theme);
    updateThemeIcon();
}

function toggleLanguage() {
    const current = getCurrentLanguage();
    const next = current === 'en' ? 'zh' : 'en';
    setLanguage(next);
    saveLanguageAndTheme(next, null);
    updateLangLabel();
}

function updateLangLabel() {
    const label = document.getElementById('lang-label');
    if (label) {
        label.textContent = getCurrentLanguage() === 'zh' ? '中' : 'EN';
    }
}

function toggleTheme() {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveLanguageAndTheme(null, next);
    updateThemeIcon();
}

async function saveLanguageAndTheme(lang, theme) {
    const config = {};
    if (lang) config.ui_language = lang;
    if (theme) config.theme = theme;
    
    try {
        await fetch('/api/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

function updateThemeIcon() {
    const theme = getCurrentTheme();
    const icon = document.getElementById('theme-icon');
    if (icon) {
        if (theme === 'dark') {
            icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
        } else {
            icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        }
    }
}

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        compileProject();
    }
});
