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
        throw new Error(`API Error: ${response.status}`);
    }
    return response.json();
}

async function loadProjects() {
    try {
        const projects = await fetchAPI('/projects');
        const list = document.getElementById('project-list');
        list.innerHTML = projects.map(p => `
            <li>
                <a href="/editor.html?id=${p.id}">${p.name}</a>
                <span>${p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ''}</span>
            </li>
        `).join('');
    } catch (error) {
        console.error('Failed to load projects:', error);
    }
}

async function createProject() {
    const name = prompt('Project name:');
    if (!name) return;
    
    try {
        await fetchAPI('/projects', {
            method: 'POST',
            body: JSON.stringify({ name }),
        });
        loadProjects();
    } catch (error) {
        alert('Failed to create project: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', loadProjects);
