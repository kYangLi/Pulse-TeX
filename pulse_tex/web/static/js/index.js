document.addEventListener('DOMContentLoaded', function() {
    initI18n();
    initUI();
    checkInitStatus();
    loadSettings();
});

async function checkInitStatus() {
    try {
        const res = await fetch('/api/config/status');
        const data = await res.json();
        if (!data.is_initialized) {
            window.location.href = '/setup.html';
        } else {
            loadProjects();
        }
    } catch (e) {
        console.error('Status check failed:', e);
        loadProjects();
    }
}

async function loadProjects() {
    try {
        const projects = await API.projects.list();
        renderProjects(projects);
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

function renderProjects(projects) {
    const container = document.getElementById('project-list');
    const emptyState = document.getElementById('empty-state');
    
    if (projects.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    container.style.display = 'grid';
    emptyState.style.display = 'none';
    
    container.innerHTML = projects.map(p => `
        <div class="project-card" onclick="openProject('${p.id}')">
            <div class="project-card-header">
                <div class="project-icon">
                    ${Icons.file}
                </div>
                <div class="project-info">
                    <div class="project-name">${escapeHtml(p.name)}</div>
                    <div class="project-meta">
                        <span data-i18n="index.lastEdited">Last edited</span>: ${formatDate(p.updated_at)}
                    </div>
                </div>
            </div>
            <div class="project-actions" onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-secondary" onclick="exportProject('${p.id}')" data-i18n="index.export">Export</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProject('${p.id}')" data-i18n="index.delete">Delete</button>
            </div>
        </div>
    `).join('');
}

async function createProject() {
    const name = await showPrompt(t('index.newProjectName') || 'Project name:', 'Untitled');
    if (!name) return;
    
    try {
        const project = await API.projects.create(name);
        window.location.href = `/editor.html?id=${project.id}`;
    } catch (e) {
        showToast(t('common.error') || 'Error creating project', 'error');
    }
}

function openProject(id) {
    window.location.href = `/editor.html?id=${id}`;
}

async function exportProject(id) {
    window.location.href = API.projects.export(id);
}

async function deleteProject(id) {
    const confirmed = await showConfirm(t('index.confirmDelete') || 'Are you sure you want to delete this project?');
    if (!confirmed) return;
    
    try {
        await API.projects.delete(id);
        showToast(t('common.success') || 'Project deleted', 'success');
        loadProjects();
    } catch (e) {
        showToast(t('common.error') || 'Error deleting project', 'error');
    }
}

function openSettings(e) {
    if (e) e.preventDefault();
    loadSettings();
    showModal('settings-modal');
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';
}

async function loadSettings() {
    try {
        const config = await API.config.get();
        
        document.getElementById('setting-language').value = config.ui_language || 'en';
        document.getElementById('setting-theme').value = config.theme || 'dark';
        document.getElementById('setting-ai-url').value = config.ai_base_url || '';
        document.getElementById('setting-ai-key').value = config.ai_api_key || '';
        document.getElementById('setting-ai-model').value = config.ai_model || '';
        document.getElementById('setting-latex-engine').value = config.latex_engine || 'tectonic';
        document.getElementById('setting-bibtex-engine').value = config.bibtex_engine || 'biber';
        
        if (config.ui_language) {
            setLanguage(config.ui_language);
        }
        if (config.theme) {
            setTheme(config.theme);
        }
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
        await API.config.update(config);
        setLanguage(config.ui_language);
        setTheme(config.theme);
        closeModal('settings-modal');
    } catch (e) {
        showToast(t('common.error') || 'Error saving settings', 'error');
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
    document.getElementById('setting-language').value = next;
    updateLangLabel();
    saveLanguageAndTheme(next, null);
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
    document.getElementById('setting-theme').value = next;
    updateThemeIcon();
    saveLanguageAndTheme(null, next);
}

async function saveLanguageAndTheme(lang, theme) {
    const config = {};
    if (lang) config.ui_language = lang;
    if (theme) config.theme = theme;
    
    try {
        await API.config.update(config);
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

function updateThemeIcon() {
    const theme = getCurrentTheme();
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.innerHTML = theme === 'dark' 
            ? '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
            : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
}

async function testAIConnection() {
    const result = document.getElementById('ai-test-result');
    result.innerHTML = '<span class="loading"><span class="spinner"></span> Testing...</span>';
    
    try {
        const res = await fetch('/api/config/test-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ai_api_key: document.getElementById('setting-ai-key').value,
                ai_base_url: document.getElementById('setting-ai-url').value,
                ai_model: document.getElementById('setting-ai-model').value
            })
        });
        
        const data = await res.json();
        if (res.ok) {
            result.innerHTML = `<span style="color:var(--accent-success)">✓ ${t('settings.ai.connectionSuccess') || 'Connection successful'}</span>`;
        } else {
            result.innerHTML = `<span style="color:var(--accent-danger)">✗ ${data.detail || t('settings.ai.connectionFailed') || 'Connection failed'}</span>`;
        }
    } catch (e) {
        result.innerHTML = `<span style="color:var(--accent-danger)">✗ ${e.message}</span>`;
    }
}

function openTemplates(e) {
    if (e) e.preventDefault();
    showModal('templates-modal');
}

const TEMPLATES = {
    nature: {
        name: 'Nature Article',
        content: `\\documentclass[twocolumn]{article}
\\usepackage{natbib}
\\usepackage{graphicx}
\\usepackage{amsmath}

\\begin{document}

\\title{Your Paper Title Here}
\\author{Author Name$^{1}$ \\\\
$^{1}$Institution Name}
\\maketitle

\\begin{abstract}
Your abstract here (150 words maximum).
\\end{abstract}

\\section{Introduction}
Your introduction here.

\\section{Methods}
Methods description.

\\section{Results}
Results description.

\\section{Discussion}
Discussion here.

\\bibliographystyle{naturemag}
\\bibliography{references}

\\end{document}`
    },
    science: {
        name: 'Science Article',
        content: `\\documentclass{article}
\\usepackage{science}
\\usepackage{graphicx}
\\usepackage{amsmath}

\\begin{document}

\\title{Your Paper Title}
\\author{Author Name$^{1,*}$, Co-Author$^{2}$ \\\\
$^{1}$Institution One \\\\
$^{2}$Institution Two \\\\
$^{*}$Corresponding author}

\\maketitle

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\section{Introduction}
Introduction text.

\\section{Materials and Methods}
Methods text.

\\section{Results}
Results text.

\\section{Discussion}
Discussion text.

\\end{document}`
    },
    prl: {
        name: 'Physical Review Letters',
        content: `\\documentclass[aps,prl,twocolumn,showpacs,superscriptaddress,amsmath,amssymb]{revtex4-2}

\\begin{document}

\\title{Your PRL Title Here}
\\author{First Author}
\\affiliation{Institution One}
\\author{Second Author}
\\affiliation{Institution Two}

\\date{\\today}

\\begin{abstract}
Abstract text (limit to 600 characters for PRL).
\\end{abstract}

\\pacs{Valid PACS numbers}

\\maketitle

\\section{Introduction}
Introduction text.

\\section{Model and Methods}
Model description.

\\section{Results}
Results description.

\\section{Conclusions}
Conclusions.

\\begin{acknowledgments}
Acknowledgments here.
\\end{acknowledgments}

\\bibliography{references}

\\end{document}`
    },
    ieee: {
        name: 'IEEE Transactions',
        content: `\\documentclass[journal]{IEEEtran}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\begin{document}

\\title{Your Paper Title}
\\author{First Author, Member, IEEE, Second Author}

\\maketitle

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\begin{IEEEkeywords}
Keyword1, Keyword2, Keyword3
\\end{IEEEkeywords}

\\section{Introduction}
Introduction text.

\\section{Related Work}
Related work summary.

\\section{Methodology}
Method description.

\\section{Experiments}
Experimental setup and results.

\\section{Conclusion}
Conclusion text.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}`
    },
    arxiv: {
        name: 'arXiv Preprint',
        content: `\\documentclass[11pt]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\begin{document}

\\title{Your Paper Title}
\\author{Author Name$^{1}$ \\\\
$^{1}$Institution \\\\
\\texttt{email@institution.edu}}

\\maketitle

\\begin{abstract}
Abstract text here.
\\end{abstract}

\\section{Introduction}
Introduction.

\\section{Background}
Background information.

\\section{Main Results}
Main results.

\\section{Conclusion}
Conclusion.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}`
    },
    minimal: {
        name: 'Minimal Article',
        content: `\\documentclass{article}
\\usepackage{amsmath}

\\begin{document}

\\title{Title}
\\author{Author}
\\date{\\today}
\\maketitle

\\begin{abstract}
Abstract
\\end{abstract}

\\section{Introduction}
Content here.

\\end{document}`
    }
};

async function createFromTemplate(templateId) {
    const template = TEMPLATES[templateId];
    if (!template) return;
    
    const name = await showPrompt(t('index.newProjectName') || 'Project name:', template.name);
    if (!name) return;
    
    try {
        const project = await API.projects.create(name);
        
        await API.files.update(project.id, 'main.tex', template.content);
        
        closeModal('templates-modal');
        window.location.href = `/editor.html?id=${project.id}`;
    } catch (e) {
        showToast(t('common.error') || 'Error creating project', 'error');
    }
}

window.createProject = createProject;
window.openProject = openProject;
window.exportProject = exportProject;
window.deleteProject = deleteProject;
window.openSettings = openSettings;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.saveSettings = saveSettings;
window.changeLanguage = changeLanguage;
window.changeTheme = changeTheme;
window.toggleLanguage = toggleLanguage;
window.toggleTheme = toggleTheme;
window.testAIConnection = testAIConnection;
window.openTemplates = openTemplates;
window.createFromTemplate = createFromTemplate;
