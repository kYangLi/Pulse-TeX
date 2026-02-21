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

// ========== Diagram Workshop ==========

let diagramCanvas = null;
let diagramCtx = null;
let diagramDrawing = false;
let diagramTool = 'pen';
let diagramColor = '#333333';
let diagramLineWidth = 2;
let diagramStartX = 0;
let diagramStartY = 0;
let diagramPaths = [];
let diagramCurrentPath = null;
let diagramCurrentSVG = null;

function toggleDiagramPanel() {
    const panel = document.getElementById('diagram-panel');
    panel.classList.toggle('visible');
    
    if (panel.classList.contains('visible') && !diagramCanvas) {
        initDiagramCanvas();
    }
}

function initDiagramCanvas() {
    const wrapper = document.getElementById('diagram-canvas').parentElement;
    diagramCanvas = document.getElementById('diagram-canvas');
    
    const rect = wrapper.getBoundingClientRect();
    diagramCanvas.width = rect.width;
    diagramCanvas.height = rect.height;
    
    diagramCtx = diagramCanvas.getContext('2d');
    diagramCtx.fillStyle = '#ffffff';
    diagramCtx.fillRect(0, 0, diagramCanvas.width, diagramCanvas.height);
    
    diagramCanvas.addEventListener('mousedown', startDiagramDrawing);
    diagramCanvas.addEventListener('mousemove', drawDiagram);
    diagramCanvas.addEventListener('mouseup', stopDiagramDrawing);
    diagramCanvas.addEventListener('mouseleave', stopDiagramDrawing);
    
    document.getElementById('diagram-color').addEventListener('input', (e) => {
        diagramColor = e.target.value;
    });
    
    document.getElementById('diagram-line-width').addEventListener('change', (e) => {
        diagramLineWidth = parseInt(e.target.value);
    });
}

function setDiagramTool(tool) {
    diagramTool = tool;
    document.querySelectorAll('.diagram-toolbar .tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
}

function getDiagramCoords(e) {
    const rect = diagramCanvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function startDiagramDrawing(e) {
    diagramDrawing = true;
    const coords = getDiagramCoords(e);
    diagramStartX = coords.x;
    diagramStartY = coords.y;
    
    if (diagramTool === 'pen') {
        diagramCurrentPath = {
            tool: 'pen',
            color: diagramColor,
            width: diagramLineWidth,
            points: [{x: coords.x, y: coords.y}]
        };
        diagramCtx.beginPath();
        diagramCtx.moveTo(coords.x, coords.y);
        diagramCtx.strokeStyle = diagramColor;
        diagramCtx.lineWidth = diagramLineWidth;
        diagramCtx.lineCap = 'round';
    } else if (diagramTool === 'text') {
        const text = prompt('Enter text:');
        if (text) {
            diagramCtx.font = `${diagramLineWidth * 6}px Arial`;
            diagramCtx.fillStyle = diagramColor;
            diagramCtx.fillText(text, coords.x, coords.y);
            diagramPaths.push({
                tool: 'text',
                color: diagramColor,
                size: diagramLineWidth * 6,
                text: text,
                x: coords.x,
                y: coords.y
            });
        }
        diagramDrawing = false;
    }
}

function drawDiagram(e) {
    if (!diagramDrawing) return;
    
    const coords = getDiagramCoords(e);
    
    if (diagramTool === 'pen') {
        diagramCtx.lineTo(coords.x, coords.y);
        diagramCtx.stroke();
        diagramCurrentPath.points.push({x: coords.x, y: coords.y});
    } else {
        redrawDiagramCanvas();
        drawDiagramShape(diagramStartX, diagramStartY, coords.x, coords.y);
    }
}

function drawDiagramShape(x1, y1, x2, y2) {
    diagramCtx.strokeStyle = diagramColor;
    diagramCtx.lineWidth = diagramLineWidth;
    diagramCtx.lineCap = 'round';
    
    switch (diagramTool) {
        case 'line':
            diagramCtx.beginPath();
            diagramCtx.moveTo(x1, y1);
            diagramCtx.lineTo(x2, y2);
            diagramCtx.stroke();
            break;
        case 'rect':
            diagramCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            break;
        case 'circle':
            const rx = (x2 - x1) / 2;
            const ry = (y2 - y1) / 2;
            diagramCtx.beginPath();
            diagramCtx.ellipse(x1 + rx, y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
            diagramCtx.stroke();
            break;
        case 'arrow':
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 12;
            diagramCtx.beginPath();
            diagramCtx.moveTo(x1, y1);
            diagramCtx.lineTo(x2, y2);
            diagramCtx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            diagramCtx.moveTo(x2, y2);
            diagramCtx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            diagramCtx.stroke();
            break;
    }
}

function stopDiagramDrawing(e) {
    if (!diagramDrawing) return;
    diagramDrawing = false;
    
    if (diagramTool === 'pen' && diagramCurrentPath) {
        diagramPaths.push(diagramCurrentPath);
        diagramCurrentPath = null;
    } else if (['line', 'rect', 'circle', 'arrow'].includes(diagramTool)) {
        const coords = getDiagramCoords(e);
        diagramPaths.push({
            tool: diagramTool,
            color: diagramColor,
            width: diagramLineWidth,
            x1: diagramStartX,
            y1: diagramStartY,
            x2: coords.x,
            y2: coords.y
        });
    }
}

function redrawDiagramCanvas() {
    diagramCtx.fillStyle = '#ffffff';
    diagramCtx.fillRect(0, 0, diagramCanvas.width, diagramCanvas.height);
    
    for (const path of diagramPaths) {
        diagramCtx.strokeStyle = path.color;
        diagramCtx.fillStyle = path.color;
        diagramCtx.lineWidth = path.width;
        
        switch (path.tool) {
            case 'pen':
                diagramCtx.beginPath();
                diagramCtx.moveTo(path.points[0].x, path.points[0].y);
                for (const pt of path.points) {
                    diagramCtx.lineTo(pt.x, pt.y);
                }
                diagramCtx.stroke();
                break;
            case 'text':
                diagramCtx.font = `${path.size}px Arial`;
                diagramCtx.fillText(path.text, path.x, path.y);
                break;
            case 'line':
                diagramCtx.beginPath();
                diagramCtx.moveTo(path.x1, path.y1);
                diagramCtx.lineTo(path.x2, path.y2);
                diagramCtx.stroke();
                break;
            case 'rect':
                diagramCtx.strokeRect(path.x1, path.y1, path.x2 - path.x1, path.y2 - path.y1);
                break;
            case 'circle':
                const rx = (path.x2 - path.x1) / 2;
                const ry = (path.y2 - path.y1) / 2;
                diagramCtx.beginPath();
                diagramCtx.ellipse(path.x1 + rx, path.y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
                diagramCtx.stroke();
                break;
            case 'arrow':
                const angle = Math.atan2(path.y2 - path.y1, path.x2 - path.x1);
                const headLen = 12;
                diagramCtx.beginPath();
                diagramCtx.moveTo(path.x1, path.y1);
                diagramCtx.lineTo(path.x2, path.y2);
                diagramCtx.lineTo(path.x2 - headLen * Math.cos(angle - Math.PI / 6), path.y2 - headLen * Math.sin(angle - Math.PI / 6));
                diagramCtx.moveTo(path.x2, path.y2);
                diagramCtx.lineTo(path.x2 - headLen * Math.cos(angle + Math.PI / 6), path.y2 - headLen * Math.sin(angle + Math.PI / 6));
                diagramCtx.stroke();
                break;
        }
    }
}

function clearDiagramCanvas() {
    if (diagramCtx) {
        diagramCtx.fillStyle = '#ffffff';
        diagramCtx.fillRect(0, 0, diagramCanvas.width, diagramCanvas.height);
    }
    diagramPaths = [];
    diagramCurrentSVG = null;
    document.getElementById('diagram-preview').classList.remove('visible');
}

function getDiagramSVG() {
    if (!diagramCanvas || diagramPaths.length === 0) return null;
    
    const w = diagramCanvas.width;
    const h = diagramCanvas.height;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="${w}" height="${h}" fill="white"/>`;
    
    for (const path of diagramPaths) {
        switch (path.tool) {
            case 'pen':
                if (path.points.length > 0) {
                    let d = `M ${path.points[0].x} ${path.points[0].y}`;
                    for (let i = 1; i < path.points.length; i++) {
                        d += ` L ${path.points[i].x} ${path.points[i].y}`;
                    }
                    svg += `<path d="${d}" stroke="${path.color}" stroke-width="${path.width}" fill="none" stroke-linecap="round"/>`;
                }
                break;
            case 'text':
                svg += `<text x="${path.x}" y="${path.y}" fill="${path.color}" font-size="${path.size}">${path.text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>`;
                break;
            case 'line':
                svg += `<line x1="${path.x1}" y1="${path.y1}" x2="${path.x2}" y2="${path.y2}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                break;
            case 'rect':
                svg += `<rect x="${Math.min(path.x1,path.x2)}" y="${Math.min(path.y1,path.y2)}" width="${Math.abs(path.x2-path.x1)}" height="${Math.abs(path.y2-path.y1)}" stroke="${path.color}" stroke-width="${path.width}" fill="none"/>`;
                break;
            case 'circle':
                const rx = Math.abs(path.x2 - path.x1) / 2;
                const ry = Math.abs(path.y2 - path.y1) / 2;
                svg += `<ellipse cx="${Math.min(path.x1,path.x2)+rx}" cy="${Math.min(path.y1,path.y2)+ry}" rx="${rx}" ry="${ry}" stroke="${path.color}" stroke-width="${path.width}" fill="none"/>`;
                break;
            case 'arrow':
                const a = Math.atan2(path.y2 - path.y1, path.x2 - path.x1);
                const hl = 12;
                svg += `<line x1="${path.x1}" y1="${path.y1}" x2="${path.x2}" y2="${path.y2}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                svg += `<line x1="${path.x2}" y1="${path.y2}" x2="${path.x2-hl*Math.cos(a-Math.PI/6)}" y2="${path.y2-hl*Math.sin(a-Math.PI/6)}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                svg += `<line x1="${path.x2}" y1="${path.y2}" x2="${path.x2-hl*Math.cos(a+Math.PI/6)}" y2="${path.y2-hl*Math.sin(a+Math.PI/6)}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                break;
        }
    }
    
    svg += '</svg>';
    return svg;
}

function displayDiagramPreview(svg) {
    const preview = document.getElementById('diagram-preview');
    preview.innerHTML = svg;
    preview.classList.add('visible');
    diagramCurrentSVG = svg;
}

async function generateDiagramFromText() {
    const prompt = document.getElementById('diagram-prompt').value.trim();
    if (!prompt) {
        alert('Please describe the diagram');
        return;
    }
    
    const style = document.getElementById('diagram-style').value;
    
    try {
        const res = await fetch('/api/diagram/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                description: prompt,
                style: style,
                diagram_type: 'flowchart'
            })
        });
        
        const result = await res.json();
        if (result.success && result.data) {
            displayDiagramPreview(result.data.svg);
        } else {
            alert('Failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function refineDiagramSketch() {
    const prompt = document.getElementById('diagram-prompt').value.trim();
    if (!prompt) {
        alert('Please describe the diagram');
        return;
    }
    
    const sketchSVG = getDiagramSVG();
    if (!sketchSVG) {
        alert('Please draw something first');
        return;
    }
    
    const style = document.getElementById('diagram-style').value;
    
    try {
        const res = await fetch('/api/diagram/refine', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                sketch_svg: sketchSVG,
                description: prompt,
                style: style
            })
        });
        
        const result = await res.json();
        if (result.success && result.data) {
            displayDiagramPreview(result.data.refined_svg);
        } else {
            alert('Failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function exportDiagramSVG() {
    if (!diagramCurrentSVG) {
        alert('No diagram to export');
        return;
    }
    
    const blob = new Blob([diagramCurrentSVG], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
}

async function exportDiagramTikZ() {
    if (!diagramCurrentSVG) {
        alert('No diagram to export');
        return;
    }
    
    try {
        const res = await fetch('/api/diagram/svg-to-tikz', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({svg: diagramCurrentSVG})
        });
        
        const result = await res.json();
        if (result.success && result.data) {
            await navigator.clipboard.writeText(result.data.tikz);
            alert('TikZ code copied to clipboard!');
        } else {
            alert('Failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function insertDiagramToPaper() {
    if (!diagramCurrentSVG) {
        alert('No diagram to insert');
        return;
    }
    
    const fileName = `figure_${Date.now()}.svg`;
    
    try {
        // Save SVG to project
        const res = await fetch(`/api/files/${projectId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                path: `figures/${fileName}`,
                content: diagramCurrentSVG
            })
        });
        
        if (res.ok) {
            // Insert LaTeX code
            const latex = `\n\\begin{figure}[htbp]\n\\centering\n\\includesvg[width=0.8\\textwidth]{figures/${fileName.replace('.svg','')}}\n\\caption{Figure caption}\n\\label{fig:${fileName.replace('.svg','')}}\n\\end{figure}\n`;
            
            const position = editor.getPosition();
            editor.executeEdits('', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: latex
            }]);
            
            alert('Diagram inserted! Remember to add \\usepackage{svg} in preamble.');
            toggleDiagramPanel();
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}
