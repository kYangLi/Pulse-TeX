const API_BASE = '/api';

let projectId = null;
let currentFile = null;
let editor = null;
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let zoom = 100;

pdfjsLib.GlobalWorkerOptions.workerSrc = '/libs/pdfjs/pdf.worker.min.js';

async function fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }
    return response.json();
}

function getProjectId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

async function loadProject() {
    projectId = getProjectId();
    if (!projectId) {
        alert('No project ID');
        return;
    }
    
    try {
        const project = await fetchAPI(`/projects/${projectId}`);
        document.getElementById('project-name').textContent = project.name;
        await loadFiles();
    } catch (error) {
        alert('Failed to load project: ' + error.message);
    }
}

async function loadFiles() {
    try {
        const files = await fetchAPI(`/files/${projectId}`);
        renderFileTree(files);
        
        if (files.length > 0) {
            const mainFile = files.find(f => f.path === 'main.tex') || files[0];
            await openFile(mainFile.path);
        }
    } catch (error) {
        console.error('Failed to load files:', error);
    }
}

function renderFileTree(files) {
    const tree = document.getElementById('file-tree');
    tree.innerHTML = files.map(f => `
        <li data-path="${f.path}" onclick="openFile('${f.path}')" class="${currentFile === f.path ? 'active' : ''}">
            <span class="file-icon">📄</span>
            <span>${f.path}</span>
            <span class="file-actions">
                <button onclick="event.stopPropagation(); deleteFile('${f.path}')" title="Delete">×</button>
            </span>
        </li>
    `).join('');
}

async function openFile(path) {
    try {
        const file = await fetchAPI(`/files/${projectId}/${encodeURIComponent(path)}`);
        currentFile = path;
        
        if (editor) {
            editor.setValue(file.content || '');
        }
        
        renderFileTree(await fetchAPI(`/files/${projectId}`));
    } catch (error) {
        console.error('Failed to open file:', error);
    }
}

async function saveCurrentFile() {
    if (!currentFile || !editor) return;
    
    try {
        await fetchAPI(`/files/${projectId}/${encodeURIComponent(currentFile)}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: editor.getValue() }),
        });
        setStatus('Saved', 'success');
    } catch (error) {
        setStatus('Save failed: ' + error.message, 'error');
    }
}

async function createNewFile() {
    const path = prompt('File name (e.g., chapter1.tex):');
    if (!path) return;
    
    try {
        await fetchAPI(`/files/${projectId}`, {
            method: 'POST',
            body: JSON.stringify({ path, content: '' }),
        });
        await loadFiles();
        await openFile(path);
    } catch (error) {
        alert('Failed to create file: ' + error.message);
    }
}

async function deleteFile(path) {
    if (!confirm(`Delete ${path}?`)) return;
    
    try {
        await fetchAPI(`/files/${projectId}/${encodeURIComponent(path)}`, {
            method: 'DELETE',
        });
        await loadFiles();
    } catch (error) {
        alert('Failed to delete file: ' + error.message);
    }
}

async function compileProject() {
    const btn = document.getElementById('btn-compile');
    btn.disabled = true;
    setStatus('Compiling...', 'loading');
    
    try {
        await saveCurrentFile();
        
        const result = await fetchAPI(`/compile/${projectId}`, { method: 'POST' });
        
        if (result.success) {
            setStatus('Compiled successfully', 'success');
            await loadPDF();
            hideErrorPanel();
        } else {
            setStatus('Compilation failed', 'error');
            showErrorLog(result.log || result.error_message);
        }
    } catch (error) {
        setStatus('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function loadPDF() {
    try {
        const pdfData = await fetch(`/api/compile/${projectId}/pdf`);
        if (!pdfData.ok) {
            throw new Error('PDF not available');
        }
        
        const arrayBuffer = await pdfData.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPages = pdfDoc.numPages;
        currentPage = 1;
        
        renderPage(currentPage);
        updatePageInfo();
    } catch (error) {
        console.error('Failed to load PDF:', error);
    }
}

async function renderPage(pageNum) {
    if (!pdfDoc) return;
    
    const page = await pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('pdf-canvas');
    const context = canvas.getContext('2d');
    
    const scale = zoom / 100;
    const viewport = page.getViewport({ scale });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
        canvasContext: context,
        viewport: viewport,
    }).promise;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
        updatePageInfo();
    }
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderPage(currentPage);
        updatePageInfo();
    }
}

function setZoom(value) {
    zoom = parseInt(value);
    if (pdfDoc) {
        renderPage(currentPage);
    }
}

function updatePageInfo() {
    document.getElementById('page-info').textContent = `${currentPage} / ${totalPages}`;
}

function refreshPreview() {
    if (pdfDoc) {
        renderPage(currentPage);
    }
}

function setStatus(message, type) {
    const status = document.getElementById('compile-status');
    status.textContent = message;
    status.className = `status-${type}`;
}

function showErrorLog(log) {
    document.getElementById('error-log').textContent = log;
    document.getElementById('error-panel').classList.add('visible');
}

function hideErrorPanel() {
    document.getElementById('error-panel').classList.remove('visible');
}

function toggleErrorPanel() {
    document.getElementById('error-panel').classList.toggle('visible');
}

function initMonaco() {
    require.config({
        paths: { vs: '/libs/vs' }
    });
    
    require(['vs/editor/editor.main'], function () {
        monaco.languages.register({ id: 'latex' });
        
        monaco.languages.setMonarchTokensProvider('latex', {
            tokenPostfix: '.latex',
            
            brackets: [
                ['{', '}', 'delimiter.curly'],
                ['[', ']', 'delimiter.square'],
                ['(', ')', 'delimiter.parenthesis'],
            ],
            
            tokenizer: {
                root: [
                    [/%.*$/, 'comment'],
                    [/\\[a-zA-Z]+/, 'keyword'],
                    [/[{}]/, 'delimiter.curly'],
                    [/\$\$/, 'string', '@math'],
                    [/\$/, 'string', '@mathinline'],
                    [/\\begin\{[^}]+\}/, 'tag'],
                    [/\\end\{[^}]+\}/, 'tag'],
                ],
                math: [
                    [/\$\$/, 'string', '@pop'],
                    [/./, 'string'],
                ],
                mathinline: [
                    [/\$/, 'string', '@pop'],
                    [/./, 'string'],
                ],
            },
        });
        
        editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '',
            language: 'latex',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: true },
            wordWrap: 'on',
        });
        
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveCurrentFile();
        });
        
        loadProject();
    });
}

document.addEventListener('DOMContentLoaded', initMonaco);

let aiChatHistory = [];

function toggleAIPanel() {
    document.getElementById('ai-panel').classList.toggle('visible');
}

function addAIMessage(role, content, isError = false) {
    const chat = document.getElementById('ai-chat');
    const msg = document.createElement('div');
    msg.className = `ai-message ${role}${isError ? ' error' : ''}`;
    msg.textContent = content;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();
    if (!message) return;
    
    addAIMessage('user', message);
    input.value = '';
    
    const context = editor ? editor.getValue().substring(0, 2000) : null;
    
    try {
        const response = await fetchAPI('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message, context }),
        });
        
        if (response.success) {
            addAIMessage('assistant', response.content);
        } else {
            addAIMessage('assistant', response.error || 'AI request failed', true);
        }
    } catch (error) {
        addAIMessage('assistant', error.message, true);
    }
}

function showAIContextMenu(x, y) {
    const menu = document.getElementById('ai-context-menu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('visible');
}

function hideAIContextMenu() {
    document.getElementById('ai-context-menu').classList.remove('visible');
}

async function aiPolish() {
    hideAIContextMenu();
    const selection = editor ? editor.getModel().getValueInRange(editor.getSelection()) : '';
    if (!selection) return;
    
    addAIMessage('user', `Polish: "${selection.substring(0, 50)}..."`);
    
    try {
        const response = await fetchAPI('/ai/polish', {
            method: 'POST',
            body: JSON.stringify({ text: selection }),
        });
        
        if (response.success) {
            addAIMessage('assistant', response.content);
        } else {
            addAIMessage('assistant', response.error || 'Polish failed', true);
        }
    } catch (error) {
        addAIMessage('assistant', error.message, true);
    }
}

async function aiTranslate(direction) {
    hideAIContextMenu();
    const selection = editor ? editor.getModel().getValueInRange(editor.getSelection()) : '';
    if (!selection) return;
    
    addAIMessage('user', `Translate to ${direction === 'en' ? 'English' : 'Chinese'}: "${selection.substring(0, 50)}..."`);
    
    try {
        const response = await fetchAPI('/ai/translate', {
            method: 'POST',
            body: JSON.stringify({ text: selection, direction }),
        });
        
        if (response.success) {
            addAIMessage('assistant', response.content);
        } else {
            addAIMessage('assistant', response.error || 'Translation failed', true);
        }
    } catch (error) {
        addAIMessage('assistant', error.message, true);
    }
}

async function aiExplain() {
    hideAIContextMenu();
    const selection = editor ? editor.getModel().getValueInRange(editor.getSelection()) : '';
    if (!selection) return;
    
    addAIMessage('user', `Explain: "${selection.substring(0, 50)}..."`);
    
    try {
        const response = await fetchAPI('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ 
                message: `Please explain this LaTeX code: ${selection}`,
                context: null 
            }),
        });
        
        if (response.success) {
            addAIMessage('assistant', response.content);
        } else {
            addAIMessage('assistant', response.error || 'Explain failed', true);
        }
    } catch (error) {
        addAIMessage('assistant', error.message, true);
    }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.ai-context-menu')) {
        hideAIContextMenu();
    }
});

document.addEventListener('contextmenu', (e) => {
    if (editor && e.target.closest('#editor-container')) {
        const selection = editor.getModel().getValueInRange(editor.getSelection());
        if (selection.trim()) {
            e.preventDefault();
            showAIContextMenu(e.pageX, e.pageY);
        }
    }
});

document.getElementById('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
    }
});

window.openFile = openFile;
window.createNewFile = createNewFile;
window.deleteFile = deleteFile;
window.compileProject = compileProject;
window.saveCurrentFile = saveCurrentFile;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.setZoom = setZoom;
window.refreshPreview = refreshPreview;
window.toggleErrorPanel = toggleErrorPanel;
window.toggleAIPanel = toggleAIPanel;
window.sendAIMessage = sendAIMessage;
window.aiPolish = aiPolish;
window.aiTranslate = aiTranslate;
window.aiExplain = aiExplain;
window.toggleLiteraturePanel = toggleLiteraturePanel;
window.searchLiterature = searchLiterature;
window.insertCitation = insertCitation;
window.copyBibtex = copyBibtex;

function toggleLiteraturePanel() {
    document.getElementById('literature-panel').classList.toggle('visible');
}

function setLiteratureStatus(message, type = 'info') {
    const status = document.getElementById('literature-status');
    status.textContent = message;
    status.style.color = type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#888';
}

async function searchLiterature() {
    const input = document.getElementById('literature-search-input');
    const query = input.value.trim();
    if (!query) return;
    
    const results = document.getElementById('literature-results');
    results.innerHTML = '';
    setLiteratureStatus('Searching...');
    
    try {
        const response = await fetchAPI(`/literature/search?q=${encodeURIComponent(query)}`);
        
        if (response.success && response.data) {
            const papers = response.data.papers || [];
            if (papers.length === 0) {
                setLiteratureStatus('No results found', 'info');
                return;
            }
            
            setLiteratureStatus(`Found ${papers.length} papers`, 'success');
            
            papers.forEach(paper => {
                const div = document.createElement('div');
                div.className = 'lit-paper';
                div.innerHTML = `
                    <div class="lit-paper-title">${paper.title || 'Untitled'}</div>
                    <div class="lit-paper-authors">${(paper.authors || []).slice(0, 3).join(', ')}${(paper.authors || []).length > 3 ? ' et al.' : ''}</div>
                    <div class="lit-paper-meta">
                        <span class="lit-paper-id">${paper.arxiv_id || ''}</span>
                        <div class="lit-paper-actions">
                            <button onclick="copyBibtex('${paper.arxiv_id}', '${(paper.title || '').replace(/'/g, "\\'")}', ${JSON.stringify(paper.authors || []).replace(/"/g, '&quot;')})">BibTeX</button>
                            <button class="primary" onclick="insertCitation('${paper.arxiv_id}')">\\cite</button>
                        </div>
                    </div>
                `;
                results.appendChild(div);
            });
        } else {
            setLiteratureStatus(response.error || 'Search failed', 'error');
        }
    } catch (error) {
        setLiteratureStatus(error.message, 'error');
    }
}

function insertCitation(arxivId) {
    if (!editor) return;
    
    const citeKey = arxivId.replace('.', '_');
    const citation = `\\cite{${citeKey}}`;
    
    const position = editor.getPosition();
    editor.executeEdits('', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: citation
    }]);
    
    editor.focus();
}

async function copyBibtex(arxivId, title, authors) {
    const citeKey = arxivId.replace('.', '_');
    
    let bibtex = `@article{${citeKey},\n`;
    if (title) bibtex += `  title={${title}},\n`;
    if (authors && authors.length > 0) {
        const authorsStr = authors.slice(0, 3).join(' and ');
        bibtex += `  author={${authorsStr}${authors.length > 3 ? ' and others' : ''}},\n`;
    }
    bibtex += `  eprint={${arxivId}},\n`;
    bibtex += `  archivePrefix={arXiv}\n}`;
    
    try {
        await navigator.clipboard.writeText(bibtex);
        setLiteratureStatus('BibTeX copied to clipboard', 'success');
    } catch (e) {
        console.error('Failed to copy:', e);
    }
}
