const API_BASE = '/api';

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

async function fetchStream(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.body.getReader();
}

const API = {
    projects: {
        list: () => fetchAPI('/projects'),
        get: (id) => fetchAPI(`/projects/${id}`),
        create: (name, description = '') => fetchAPI('/projects', {
            method: 'POST',
            body: JSON.stringify({ name, description }),
        }),
        update: (id, data) => fetchAPI(`/projects/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),
        delete: (id) => fetchAPI(`/projects/${id}`, { method: 'DELETE' }),
        export: (id) => `${API_BASE}/projects/${id}/export`,
    },
    
    files: {
        list: (projectId) => fetchAPI(`/files/${projectId}`),
        get: (projectId, path) => fetchAPI(`/files/${projectId}/${encodeURIComponent(path)}`),
        create: (projectId, path, content = '') => fetchAPI(`/files/${projectId}`, {
            method: 'POST',
            body: JSON.stringify({ path, content }),
        }),
        update: (projectId, path, content) => fetchAPI(`/files/${projectId}/${encodeURIComponent(path)}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
        }),
        delete: (projectId, path) => fetchAPI(`/files/${projectId}/${encodeURIComponent(path)}`, {
            method: 'DELETE',
        }),
    },
    
    compile: {
        run: (projectId) => fetchAPI(`/compile/${projectId}`, { method: 'POST' }),
        getPdf: (projectId) => `${API_BASE}/compile/${projectId}/pdf`,
        syncTex: (projectId, line, file) => fetchAPI(`/compile/${projectId}/synctex?line=${line}&file=${encodeURIComponent(file)}`),
    },
    
    config: {
        get: () => fetchAPI('/config'),
        update: (data) => fetchAPI('/config', {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),
    },
    
    ai: {
        chat: (message, context = null, systemPrompt = null) => fetchAPI('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message, context, system_prompt: systemPrompt }),
        }),
        chatStream: (message, context = null, systemPrompt = null) => fetchStream('/ai/chat/stream', {
            method: 'POST',
            body: JSON.stringify({ message, context, system_prompt: systemPrompt }),
        }),
        polish: (text, style = 'academic') => fetchAPI('/ai/polish', {
            method: 'POST',
            body: JSON.stringify({ text, style }),
        }),
        translate: (text, direction = 'en') => fetchAPI('/ai/translate', {
            method: 'POST',
            body: JSON.stringify({ text, direction }),
        }),
        explainError: (logContent, sourceCode = null) => fetchAPI('/ai/explain-error', {
            method: 'POST',
            body: JSON.stringify({ log_content: logContent, source_code: sourceCode }),
        }),
    },
    
    literature: {
        status: () => fetchAPI('/literature/status'),
        search: (query) => fetchAPI(`/literature/search?q=${encodeURIComponent(query)}`),
        citation: (arxivId, title, authors) => fetchAPI('/literature/citation', {
            method: 'POST',
            body: JSON.stringify({ arxiv_id: arxivId, title, authors }),
        }),
    },
    
    diagram: {
        getStyles: () => fetchAPI('/diagram/styles'),
        refine: (sketchSvg, description, style) => fetchAPI('/diagram/refine', {
            method: 'POST',
            body: JSON.stringify({ sketch_svg: sketchSvg, description, style }),
        }),
        generate: (description, style, diagramType) => fetchAPI('/diagram/generate', {
            method: 'POST',
            body: JSON.stringify({ description, style, diagram_type: diagramType }),
        }),
        iterate: (svg, instruction) => fetchAPI('/diagram/iterate', {
            method: 'POST',
            body: JSON.stringify({ svg, instruction }),
        }),
        svgToTikz: (svg) => fetchAPI('/diagram/svg-to-tikz', {
            method: 'POST',
            body: JSON.stringify({ svg }),
        }),
    },
};

window.API = API;
window.fetchAPI = fetchAPI;
window.fetchStream = fetchStream;
