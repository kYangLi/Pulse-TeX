let excalidrawAPI = null;
let currentSVG = null;
let currentTikZ = null;
let paperContext = null;
let chatHistory = [];

async function initExcalidraw() {
    const container = document.getElementById('excalidraw-wrapper');
    
    const excalidrawWrapper = document.createElement('div');
    excalidrawWrapper.style.width = '100%';
    excalidrawWrapper.style.height = '100%';
    container.appendChild(excalidrawWrapper);

    const root = ReactDOM.createRoot(excalidrawWrapper);
    
    const App = () => {
        const [excalidrawState, setExcalidrawState] = React.useState({
            elements: [],
            appState: { viewBackgroundColor: '#ffffff' },
        });

        const handleChange = React.useCallback((elements, appState) => {
            setExcalidrawState({ elements, appState });
        }, []);

        React.useEffect(() => {
            window.excalidrawGetElements = () => excalidrawState.elements;
        }, [excalidrawState]);

        return React.createElement(
            window.Excalidraw.Excalidraw,
            {
                initialData: excalidrawState,
                onChange: handleChange,
                excalidrawAPI: (api) => {
                    excalidrawAPI = api;
                    window.excalidrawAPI = api;
                },
                UIOptions: {
                    canvasActions: {
                        loadScene: true,
                        saveToActiveFile: false,
                        export: { saveFileToDisk: false },
                    },
                },
                langCode: 'en',
            }
        );
    };

    root.render(React.createElement(App));
}

async function getSketchSVG() {
    if (!excalidrawAPI) return null;
    
    const elements = excalidrawAPI.getSceneElements();
    if (!elements || elements.length === 0) return null;
    
    const appState = excalidrawAPI.getAppState();
    
    const svg = await excalidrawAPI.exportToSvg({
        elements: elements,
        appState: {
            ...appState,
            exportBackground: true,
            viewBackgroundColor: '#ffffff',
        },
        files: excalidrawAPI.getFiles(),
    });
    
    return new XMLSerializer().serializeToString(svg);
}

function clearCanvas() {
    if (excalidrawAPI) {
        excalidrawAPI.updateScene({ elements: [] });
        excalidrawAPI.getAppState().viewBackgroundColor = '#ffffff';
    }
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

function showLoading() {
    document.getElementById('loading-overlay').classList.add('visible');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('visible');
}

function addChatMessage(content, type = 'user') {
    const chat = document.getElementById('ai-chat');
    const welcome = chat.querySelector('.ai-welcome');
    if (welcome) welcome.remove();
    
    const msg = document.createElement('div');
    msg.className = `ai-message ${type}`;
    msg.textContent = content;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

async function refineSketch() {
    const input = document.getElementById('ai-input');
    const description = input.value.trim();
    if (!description) {
        alert('Please describe what you want for the diagram.');
        return;
    }

    const sketchSVG = await getSketchSVG();
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

document.addEventListener('DOMContentLoaded', initExcalidraw);
