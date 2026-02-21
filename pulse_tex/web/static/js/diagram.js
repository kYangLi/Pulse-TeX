let canvas = null;
let ctx = null;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#333333';
let lineWidth = 2;
let startX = 0;
let startY = 0;
let paths = [];
let currentPath = null;

let currentSVG = null;
let currentTikZ = null;
let paperContext = null;
let chatHistory = [];

function initCanvas() {
    const container = document.getElementById('canvas-container');
    
    canvas = document.createElement('canvas');
    canvas.id = 'drawing-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.background = '#ffffff';
    canvas.style.cursor = 'crosshair';
    
    container.appendChild(canvas);
    
    ctx = canvas.getContext('2d');
    resizeCanvas();
    
    window.addEventListener('resize', resizeCanvas);
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', stopDrawing);
    
    initToolbar();
}

function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
    
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    ctx.drawImage(tempCanvas, 0, 0);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

function initToolbar() {
    const container = document.getElementById('canvas-container');
    
    const toolbar = document.createElement('div');
    toolbar.className = 'canvas-toolbar';
    toolbar.innerHTML = `
        <button class="tool-btn active" data-tool="pen" title="Pen">✏️</button>
        <button class="tool-btn" data-tool="line" title="Line">📏</button>
        <button class="tool-btn" data-tool="rect" title="Rectangle">⬜</button>
        <button class="tool-btn" data-tool="circle" title="Circle">⭕</button>
        <button class="tool-btn" data-tool="arrow" title="Arrow">➡️</button>
        <button class="tool-btn" data-tool="text" title="Text">📝</button>
        <span class="tool-divider"></span>
        <input type="color" id="color-picker" value="#333333" title="Color">
        <select id="line-width" title="Line Width">
            <option value="1">Thin</option>
            <option value="2" selected>Normal</option>
            <option value="4">Thick</option>
            <option value="8">Bold</option>
        </select>
    `;
    
    toolbar.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        display: flex;
        gap: 5px;
        padding: 8px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 10;
    `;
    
    container.style.position = 'relative';
    container.appendChild(toolbar);
    
    toolbar.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.dataset.tool;
        });
    });
    
    document.getElementById('color-picker').addEventListener('input', (e) => {
        currentColor = e.target.value;
    });
    
    document.getElementById('line-width').addEventListener('change', (e) => {
        lineWidth = parseInt(e.target.value);
    });
    
    const style = document.createElement('style');
    style.textContent = `
        .tool-btn {
            width: 32px;
            height: 32px;
            border: none;
            background: #f0f0f0;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .tool-btn:hover {
            background: #e0e0e0;
        }
        .tool-btn.active {
            background: #3498db;
            color: #fff;
        }
        .tool-divider {
            width: 1px;
            background: #ddd;
            margin: 0 5px;
        }
        #color-picker {
            width: 32px;
            height: 32px;
            border: none;
            padding: 0;
            cursor: pointer;
        }
        #line-width {
            padding: 4px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
    `;
    document.head.appendChild(style);
}

function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    
    if (currentTool === 'pen') {
        currentPath = {
            tool: 'pen',
            color: currentColor,
            width: lineWidth,
            points: [{x: startX, y: startY}]
        };
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = lineWidth;
    } else if (currentTool === 'text') {
        const text = prompt('Enter text:');
        if (text) {
            ctx.font = `${lineWidth * 8}px Arial`;
            ctx.fillStyle = currentColor;
            ctx.fillText(text, startX, startY);
            paths.push({
                tool: 'text',
                color: currentColor,
                size: lineWidth * 8,
                text: text,
                x: startX,
                y: startY
            });
        }
        isDrawing = false;
    }
}

function draw(e) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (currentTool === 'pen') {
        ctx.lineTo(x, y);
        ctx.stroke();
        currentPath.points.push({x, y});
    } else {
        redrawCanvas();
        drawShape(startX, startY, x, y);
    }
}

function drawShape(x1, y1, x2, y2) {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = lineWidth;
    
    switch (currentTool) {
        case 'line':
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            break;
        case 'rect':
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            break;
        case 'circle':
            const rx = (x2 - x1) / 2;
            const ry = (y2 - y1) / 2;
            const cx = x1 + rx;
            const cy = y1 + ry;
            ctx.beginPath();
            ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
            ctx.stroke();
            break;
        case 'arrow':
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 15;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
            break;
    }
}

function stopDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentTool === 'pen' && currentPath) {
        paths.push(currentPath);
        currentPath = null;
    } else if (['line', 'rect', 'circle', 'arrow'].includes(currentTool)) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        paths.push({
            tool: currentTool,
            color: currentColor,
            width: lineWidth,
            x1: startX,
            y1: startY,
            x2: x,
            y2: y
        });
    }
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (const path of paths) {
        ctx.strokeStyle = path.color;
        ctx.fillStyle = path.color;
        ctx.lineWidth = path.width;
        
        switch (path.tool) {
            case 'pen':
                ctx.beginPath();
                ctx.moveTo(path.points[0].x, path.points[0].y);
                for (const point of path.points) {
                    ctx.lineTo(point.x, point.y);
                }
                ctx.stroke();
                break;
            case 'text':
                ctx.font = `${path.size}px Arial`;
                ctx.fillText(path.text, path.x, path.y);
                break;
            case 'line':
                ctx.beginPath();
                ctx.moveTo(path.x1, path.y1);
                ctx.lineTo(path.x2, path.y2);
                ctx.stroke();
                break;
            case 'rect':
                ctx.strokeRect(path.x1, path.y1, path.x2 - path.x1, path.y2 - path.y1);
                break;
            case 'circle':
                const rx = (path.x2 - path.x1) / 2;
                const ry = (path.y2 - path.y1) / 2;
                ctx.beginPath();
                ctx.ellipse(path.x1 + rx, path.y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            case 'arrow':
                const angle = Math.atan2(path.y2 - path.y1, path.x2 - path.x1);
                const headLen = 15;
                ctx.beginPath();
                ctx.moveTo(path.x1, path.y1);
                ctx.lineTo(path.x2, path.y2);
                ctx.lineTo(path.x2 - headLen * Math.cos(angle - Math.PI / 6), path.y2 - headLen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(path.x2, path.y2);
                ctx.lineTo(path.x2 - headLen * Math.cos(angle + Math.PI / 6), path.y2 - headLen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
                break;
        }
    }
}

function clearCanvas() {
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    paths = [];
    currentSVG = null;
    currentTikZ = null;
    document.getElementById('preview-container').innerHTML = `
        <div class="preview-placeholder">
            <p>Your refined diagram will appear here</p>
            <p class="hint">Draw a sketch and click "Refine Sketch" or describe what you want and click "Generate from Text"</p>
        </div>
    `;
    document.getElementById('tikz-output').classList.remove('visible');
    chatHistory = [];
    document.getElementById('ai-chat').innerHTML = `
        <div class="ai-welcome">
            <p>Welcome to Diagram Workbench!</p>
            <p>Draw a rough sketch on the left, then describe what you want. AI will create a publication-ready diagram.</p>
        </div>
    `;
}

function getSketchSVG() {
    if (!canvas || paths.length === 0) return null;
    return canvasToSVG();
}

function canvasToSVG() {
    const width = canvas.width;
    const height = canvas.height;
    
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svgContent += `<rect width="${width}" height="${height}" fill="white"/>`;
    
    for (const path of paths) {
        switch (path.tool) {
            case 'pen':
                if (path.points.length > 0) {
                    let d = `M ${path.points[0].x} ${path.points[0].y}`;
                    for (let i = 1; i < path.points.length; i++) {
                        d += ` L ${path.points[i].x} ${path.points[i].y}`;
                    }
                    svgContent += `<path d="${d}" stroke="${path.color}" stroke-width="${path.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
                }
                break;
            case 'text':
                svgContent += `<text x="${path.x}" y="${path.y}" fill="${path.color}" font-size="${path.size}" font-family="Arial">${escapeXml(path.text)}</text>`;
                break;
            case 'line':
                svgContent += `<line x1="${path.x1}" y1="${path.y1}" x2="${path.x2}" y2="${path.y2}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                break;
            case 'rect':
                svgContent += `<rect x="${Math.min(path.x1, path.x2)}" y="${Math.min(path.y1, path.y2)}" width="${Math.abs(path.x2 - path.x1)}" height="${Math.abs(path.y2 - path.y1)}" stroke="${path.color}" stroke-width="${path.width}" fill="none"/>`;
                break;
            case 'circle':
                const rx = Math.abs(path.x2 - path.x1) / 2;
                const ry = Math.abs(path.y2 - path.y1) / 2;
                const cx = Math.min(path.x1, path.x2) + rx;
                const cy = Math.min(path.y1, path.y2) + ry;
                svgContent += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${path.color}" stroke-width="${path.width}" fill="none"/>`;
                break;
            case 'arrow':
                const angle = Math.atan2(path.y2 - path.y1, path.x2 - path.x1);
                const headLen = 15;
                const p1x = path.x2 - headLen * Math.cos(angle - Math.PI / 6);
                const p1y = path.y2 - headLen * Math.sin(angle - Math.PI / 6);
                const p2x = path.x2 - headLen * Math.cos(angle + Math.PI / 6);
                const p2y = path.y2 - headLen * Math.sin(angle + Math.PI / 6);
                svgContent += `<line x1="${path.x1}" y1="${path.y1}" x2="${path.x2}" y2="${path.y2}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                svgContent += `<line x1="${path.x2}" y1="${path.y2}" x2="${p1x}" y2="${p1y}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                svgContent += `<line x1="${path.x2}" y1="${path.y2}" x2="${p2x}" y2="${p2y}" stroke="${path.color}" stroke-width="${path.width}"/>`;
                break;
        }
    }
    
    svgContent += '</svg>';
    return svgContent;
}

function escapeXml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function showLoading() {
    document.getElementById('loading-overlay').classList.add('visible');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('visible');
}

async function refineSketch() {
    const input = document.getElementById('ai-input');
    const description = input.value.trim();
    if (!description) {
        alert('Please describe what you want for the diagram.');
        return;
    }

    const sketchSVG = getSketchSVG();
    if (!sketchSVG) {
        alert('Please draw something on the canvas first.');
        return;
    }

    const style = document.getElementById('style-select').value;
    
    addChatMessage(description, 'user');
    input.value = '';
    showLoading();

    try {
        const response = await fetch('/api/diagram/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sketch_svg: sketchSVG,
                description: description,
                style: style,
                context: paperContext,
                previous_iterations: chatHistory.slice(-4),
            }),
        });

        const result = await response.json();
        
        if (result.success && result.data) {
            currentSVG = result.data.refined_svg;
            displaySVG(currentSVG);
            addChatMessage(`Diagram refined using ${result.data.style_name} style. You can ask for modifications.`, 'assistant');
            chatHistory.push(`User: ${description}\nAI: Refined diagram in ${result.data.style_name} style`);
        } else {
            throw new Error(result.error || 'Failed to refine sketch');
        }
    } catch (error) {
        addChatMessage(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function generateFromText() {
    const input = document.getElementById('ai-input');
    const description = input.value.trim();
    if (!description) {
        alert('Please describe the diagram you want.');
        return;
    }

    const style = document.getElementById('style-select').value;
    const diagramType = document.getElementById('type-select').value;
    
    addChatMessage(description, 'user');
    input.value = '';
    showLoading();

    try {
        const response = await fetch('/api/diagram/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: description,
                style: style,
                diagram_type: diagramType,
                context: paperContext,
            }),
        });

        const result = await response.json();
        
        if (result.success && result.data) {
            currentSVG = result.data.svg;
            displaySVG(currentSVG);
            addChatMessage(`Generated ${result.data.diagram_type} diagram in ${result.data.style_name} style. Ask for modifications if needed.`, 'assistant');
            chatHistory.push(`User: ${description}\nAI: Generated ${diagramType} diagram`);
        } else {
            throw new Error(result.error || 'Failed to generate diagram');
        }
    } catch (error) {
        addChatMessage(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function displaySVG(svg) {
    const container = document.getElementById('preview-container');
    container.innerHTML = svg;
    
    const svgEl = container.querySelector('svg');
    if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.maxHeight = '100%';
        svgEl.style.height = 'auto';
    }
}

async function iterateDesign(feedback) {
    if (!currentSVG) {
        alert('No diagram to modify. Please create one first.');
        return;
    }

    const style = document.getElementById('style-select').value;
    
    addChatMessage(feedback, 'user');
    showLoading();

    try {
        const response = await fetch('/api/diagram/iterate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_svg: currentSVG,
                feedback: feedback,
                style: style,
            }),
        });

        const result = await response.json();
        
        if (result.success && result.data) {
            currentSVG = result.data.svg;
            displaySVG(currentSVG);
            addChatMessage('Diagram updated successfully.', 'assistant');
            chatHistory.push(`User: ${feedback}\nAI: Updated diagram`);
        } else {
            throw new Error(result.error || 'Failed to modify diagram');
        }
    } catch (error) {
        addChatMessage(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function exportSVG() {
    if (!currentSVG) {
        alert('No diagram to export. Please create one first.');
        return;
    }
    downloadSVG();
}

function downloadSVG() {
    if (!currentSVG) return;
    
    const blob = new Blob([currentSVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
}

function copySVG() {
    if (!currentSVG) return;
    navigator.clipboard.writeText(currentSVG);
    alert('SVG code copied to clipboard!');
}

async function exportTikZ() {
    if (!currentSVG) {
        alert('No diagram to convert. Please create one first.');
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/diagram/svg-to-tikz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                svg: currentSVG,
                description: document.getElementById('ai-input').value || undefined,
            }),
        });

        const result = await response.json();
        
        if (result.success && result.data) {
            currentTikZ = result.data.tikz;
            const tikzOutput = document.getElementById('tikz-output');
            const tikzCode = document.getElementById('tikz-code');
            tikzCode.textContent = currentTikZ;
            tikzOutput.classList.add('visible');
            addChatMessage('TikZ code generated. You can copy it from the preview section.', 'assistant');
        } else {
            throw new Error(result.error || 'Failed to convert to TikZ');
        }
    } catch (error) {
        addChatMessage(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function copyTikZ() {
    if (!currentTikZ) return;
    navigator.clipboard.writeText(currentTikZ);
    alert('TikZ code copied to clipboard!');
}

function togglePreviewFullscreen() {
    const section = document.getElementById('preview-section');
    section.classList.toggle('fullscreen');
}

async function loadContext() {
    const modal = document.getElementById('context-modal');
    const projectSelect = document.getElementById('context-project-select');
    
    try {
        const response = await fetch('/api/projects');
        const projects = await response.json();
        
        projectSelect.innerHTML = projects.map(p => 
            `<option value="${p.id}">${p.name}</option>`
        ).join('');
        
        if (projects.length > 0) {
            await loadProjectFiles(projects[0].id);
        }
        
        modal.classList.add('visible');
    } catch (error) {
        alert('Failed to load projects: ' + error.message);
    }
}

async function loadProjectFiles(projectId) {
    const fileSelect = document.getElementById('context-file-select');
    
    try {
        const response = await fetch(`/api/files/${projectId}`);
        const files = await response.json();
        
        const texFiles = files.filter(f => f.name.endsWith('.tex'));
        fileSelect.innerHTML = texFiles.map(f => 
            `<option value="${f.path}">${f.name}</option>`
        ).join('');
    } catch (error) {
        fileSelect.innerHTML = '<option value="">No .tex files found</option>';
    }
}

document.getElementById('context-project-select')?.addEventListener('change', (e) => {
    loadProjectFiles(e.target.value);
});

function closeContextModal() {
    document.getElementById('context-modal').classList.remove('visible');
}

async function confirmLoadContext() {
    const projectId = document.getElementById('context-project-select').value;
    const filePath = document.getElementById('context-file-select').value;
    
    if (!projectId || !filePath) {
        alert('Please select a project and file.');
        return;
    }

    try {
        const response = await fetch(`/api/files/${projectId}?path=${encodeURIComponent(filePath)}`);
        const data = await response.json();
        
        if (data.content) {
            paperContext = data.content.substring(0, 5000);
            addChatMessage(`Loaded context from ${filePath}`, 'assistant');
        }
    } catch (error) {
        alert('Failed to load file: ' + error.message);
    }
    
    closeContextModal();
}

document.getElementById('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const input = e.target;
        const value = input.value.trim();
        
        if (currentSVG && value.toLowerCase().startsWith('modify ') || 
            value.toLowerCase().startsWith('change ') ||
            value.toLowerCase().startsWith('update ') ||
            value.toLowerCase().startsWith('make ')) {
            iterateDesign(value);
        }
    }
});

document.addEventListener('DOMContentLoaded', initCanvas);
