# Pulse-TeX Design System

## Product Overview

**Pulse-TeX** is an AI-powered LaTeX paper writing tool for academic researchers.
- **Target Users**: Academic researchers, physicists, computer scientists
- **Core Value**: Local-first, AI-assisted LaTeX editing with arXiv integration
- **Tone**: Professional, efficient, focused

---

## Design Tokens

### Colors (Dark Theme Primary)

```css
:root {
  /* Background Layers */
  --bg-base: #0d1117;          /* Main background */
  --bg-surface: #161b22;       /* Cards, panels */
  --bg-elevated: #21262d;      /* Modals, dropdowns */
  --bg-overlay: rgba(0,0,0,0.6);
  
  /* Borders */
  --border-default: #30363d;
  --border-muted: #21262d;
  --border-accent: #58a6ff;
  
  /* Text */
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --text-link: #58a6ff;
  
  /* Accent Colors */
  --accent-primary: #58a6ff;   /* Blue - Primary actions */
  --accent-success: #3fb950;   /* Green - Literature */
  --accent-ai: #a371f7;        /* Purple - AI features */
  --accent-warning: #d29922;   /* Orange - Diagram */
  --accent-danger: #f85149;    /* Red - Errors */
  
  /* Brand Gradient */
  --gradient-brand: linear-gradient(135deg, #58a6ff 0%, #a371f7 100%);
}
```

### Typography

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Font Sizes */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 2rem;      /* 32px */
  
  /* Line Heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### Spacing

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
}
```

### Border Radius

```css
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;
}
```

### Shadows

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  --shadow-glow: 0 0 20px rgba(88, 166, 255, 0.15);
}
```

---

## Component Patterns

### 1. Navigation Bar (Global)

```
+------------------------------------------------------------------+
| [Logo]  [Projects]  [Templates]    [Search...]      [Settings] [Avatar] |
+------------------------------------------------------------------+
```

- Fixed top, floating style (top-4 left-4 right-4)
- Glass morphism background
- Height: 56px

### 2. Sidebar (Editor Page)

```
+--------+
| Files  |
|--------|
| > src/ |
|   main.tex
|   fig/
| > bib/ |
|--------|
| [+] New|
+--------+
```

- Collapsible
- Width: 240px (expanded) / 48px (collapsed)
- File tree with icons

### 3. Editor Layout

```
+--------+------------------+------------------+
|        |                  |                  |
| Sidebar|   Code Editor    |   PDF Preview    |
|        |   (Monaco)       |   (PDF.js)       |
|        |                  |                  |
+--------+------------------+------------------+
```

- Resizable panels
- SyncTeX sync indicator

### 4. AI Assistant Panel

```
+----------------------------------+
| AI Assistant            [x]     |
+----------------------------------+
| [Chat] [Polish] [Translate]     |
+----------------------------------+
|                                  |
|  Conversation area               |
|                                  |
+----------------------------------+
| [________________] [Send]        |
+----------------------------------+
```

- Right slide-in panel
- Width: 400px
- Tabs for different modes

### 5. Literature Panel

```
+----------------------------------+
| Literature Search        [x]    |
+----------------------------------+
| [________________] [Search]      |
+----------------------------------+
| Status: Connected to arXiv-Pulse |
+----------------------------------+
|                                  |
|  Paper cards                     |
|                                  |
+----------------------------------+
```

### 6. Settings Modal

```
+------------------------------------------+
| Settings                           [x]   |
+------------------------------------------+
| [General] [Editor] [AI] [LaTeX] [About] |
+------------------------------------------+
|                                          |
|  Language: [English ▼]                   |
|  Theme:    [Dark ▼]                      |
|                                          |
+------------------------------------------+
|                              [Save]      |
+------------------------------------------+
```

### 7. Project Card (Index Page)

```
+----------------------------------+
| [icon] Project Name              |
|        Last edited: 2 hours ago  |
|        [Open] [Export] [Delete]  |
+----------------------------------+
```

---

## Page Structures

### Index Page (Project List)

```
+------------------------------------------------------------------+
|                        Floating Navbar                            |
+------------------------------------------------------------------+
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  Welcome back, [User]                                     |   |
|  |  Ready to write your next paper?                          |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  Recent Projects                              [+ New Project]    |
|  +------------+  +------------+  +------------+                 |
|  | Project 1  |  | Project 2  |  | Project 3  |                 |
|  +------------+  +------------+  +------------+                 |
|                                                                  |
|  Quick Tools                                                     |
|  +------------+  +------------+  +------------+                 |
|  | Diagram    |  | Templates  |  | Settings   |                 |
|  +------------+  +------------+  +------------+                 |
|                                                                  |
+------------------------------------------------------------------+
```

### Editor Page

```
+------------------------------------------------------------------+
| [Logo] [Project Name ▼]  [Compile] [Save]  [AI][Lit][Draw] [⚙]  |
+------------------------------------------------------------------+
|        |                          |                              |
| Files  |   main.tex               |   PDF Preview                |
| [+]    |   1: \documentclass...   |   [Page 1/10]  [Zoom 100%]   |
|        |   2: \begin{document}    |                              |
| > src/ |   3: ...                 |   +------------------+       |
|   main |                          |   |                  |       |
|   fig/ |                          |   |    Rendered PDF  |       |
| > bib/ |                          |   |                  |       |
|        |                          |   +------------------+       |
|        |                          |   [<] [1/10] [>] [100%]      |
+--------+--------------------------+------------------------------+
```

---

## Icon System

Use **Lucide Icons** (SVG, 24x24 viewBox):

| Action | Icon |
|--------|------|
| New Project | `plus` |
| Open | `folder-open` |
| Save | `save` |
| Compile | `play` |
| AI | `sparkles` |
| Literature | `book-open` |
| Diagram | `pen-tool` |
| Settings | `settings` |
| Language | `globe` |
| Search | `search` |
| Export | `download` |
| Delete | `trash-2` |
| Close | `x` |
| Menu | `menu` |
| Collapse | `panel-left-close` |
| Expand | `panel-left-open` |

---

## Animation Guidelines

- **Duration**: 150-200ms for micro-interactions, 300ms for panels
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)
- **Properties**: Use `transform` and `opacity` only
- **Hover**: Subtle brightness change (filter: brightness(1.1))

---

## Accessibility Requirements

1. **Contrast Ratio**: Minimum 4.5:1 for text
2. **Focus States**: Visible ring (`outline: 2px solid var(--accent-primary)`)
3. **Keyboard Navigation**: Full keyboard support
4. **Alt Text**: All icons have aria-labels
5. **Reduced Motion**: Respect `prefers-reduced-motion`

---

## i18n Structure

```
pulse_tex/web/static/locales/
├── en.json
└── zh.json
```

Key structure:
```json
{
  "nav": {
    "projects": "Projects",
    "templates": "Templates",
    "settings": "Settings"
  },
  "editor": {
    "compile": "Compile",
    "save": "Save",
    "preview": "Preview"
  },
  "ai": {
    "title": "AI Assistant",
    "polish": "Polish",
    "translate": "Translate"
  }
}
```
