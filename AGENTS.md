开发一款深度融合AI、带有可视化界面且底层调用TeX编译的论文写作App，是一个非常具有潜力的方向（类似于“下一代基于本地化与AI的Overleaf”）。结合你之前在凝聚态物理、DFT计算、ArXiv自动化抓取（`arxiv-pulse`）以及本地Vault和SQLite FTS5全文搜索方面的经验，这套系统完全可以打造成一个**科研工作者的终极本地工作台**。

以下是关于如何实现以及功能框架、技术栈的全面建议：

### 一、 核心功能框架设计

建议采用**“模块化、本地优先 (Local-first)、多智能体协同 (Multi-agent)”**的设计理念。

#### 1. 编辑与可视化模块 (Editor & UI)
*   **双栏/所见即所得 (WYSIWYG)**：左侧为Markdown/LaTeX混合编辑器，右侧为实时PDF预览。
*   **块级编辑 (Block-based)**：借鉴Notion的设计，将段落、公式、图表视为独立的Block。这非常有利于AI针对单个Block进行重写或续写。
*   **指令面板 (Command Palette)**：通过快捷键（如 `Ctrl+K`）唤出全局指令，快速调用AI生成内容、插入文献或执行本地搜索。

#### 2. AI 深度融合模块 (AI Copilot)
*   **学术写作辅助**：选中文本，右键/快捷键触发“学术化润色 (Academic Polish)”、“语法检查”、“扩写/缩写”或“中英互译”。提供类似Git的Diff视图，让用户决定是否Accept/Reject AI的修改。
*   **上下文感知补全**：在输入时，AI读取前文内容及本地文献库（Vault）的上下文，预测下一句或自动补全公式。
*   **图表与作图生成 (Plotting & Diagrams)**：
    *   **TikZ/PGFPlots 生成器**：用自然语言描述物理模型（如：“画一个二维晶格结构，标出自旋方向”），AI自动生成 TikZ 代码并实时预览。
    *   **数据绘图代理**：上传包含DFT计算结果的 `csv/txt` 数据，AI自动生成 Python (Matplotlib) 脚本，生成高质量的矢量图（PDF/EPS）并自动插入到论文的特定位置。

#### 3. 文献与知识库模块 (Vault & RAG)
*   **本地文献库集成**：与你之前构思的 `arxiv-pulse` 深度结合。每日自动抓取的凝聚态物理文献直接存入本地 Vault。
*   **全文检索与语义搜索**：底层利用 **SQLite FTS5**（保留你提到的 `id UNINDEXED` 和向后兼容的 Rebuild 机制）进行极速的关键词检索，同时结合向量数据库（如 Chroma/FAISS）实现AI语义搜索 (RAG)。写论文时可以直接向AI提问：“总结一下最近关于DFT和机器学习结合的进展”，AI引用本地文献库生成综述并自动插入 `\cite{...}`。

#### 4. 编译与项目管理模块 (TeX Engine & Build)
*   **静默编译**：后台监听文件变动，增量编译，保持右侧PDF实时刷新。
*   **日志解析**：使用AI或正则过滤复杂的TeX报错日志，用人话告诉用户哪里出错了（例如：“第42行少了一个 `}`”）。

---

### 二、 技术栈选型建议

考虑到你需要调用本地命令（如 `xdg-open` 打开文件）、管理本地Vault，并且需要较强的跨平台或Linux支持，推荐以下技术栈组合：

#### 方案A：现代化轻量级架构（极力推荐）
*   **前端 UI**：**Tauri** (基于 Rust) + **Vue 3 / React** + **TailwindCSS**
    *   *优势*：相比 Electron 内存占用极小，启动快，非常适合作为常驻桌面的本地科研工具。
*   **编辑器组件**：**Monaco Editor** (VS Code的内核，支持LaTeX高亮和AI补全插件) 或 **Milkdown/ProseMirror** (如果你想做所见即所得的Markdown转LaTeX)。
*   **后端 / 逻辑层**：**Python (FastAPI)** 或直接通过 Tauri 的 Rust 后端调用 Python 脚本。
    *   因为涉及数据处理、AI调用（LangChain/LlamaIndex）和文献抓取（如 Joblib 多进程清理），保留 Python 后端最方便你复用之前的 OpenCode 逻辑。
*   **TeX 编译引擎**：**Tectonic** (基于 Rust 的现代化 TeX 引擎)
    *   *优势*：**无需用户提前安装庞大的 TeX Live**（动辄几个G）。它能在编译时自动从网上拉取缺失的 `.sty` 宏包，对独立App分发极其友好。
*   **数据库**：**SQLite + FTS5**（用于本地配置和文献元数据/全文检索）。

#### 方案B：全 Python 架构
*   **前端 UI**：**PyQt6 / PySide6** + QWebEngineView (用于显示编辑器和PDF)。
*   **优势**：一切都在 Python 生态内，不需要折腾 Node.js 和前端框架，能最直接地和你的 `arxiv-pulse`、数据分析脚本整合。
*   **劣势**：UI 的现代化美观度需要花较多时间调整，动画和交互不如 Web 技术栈丝滑。

---

### 三、 开发实现路径 (Roadmap)

建议分三个阶段进行，避免前期陷入泥潭：

#### Phase 1: 核心闭环 (MVP)
1.  **搭建界面**：左侧代码框（Monaco Editor），右侧PDF预览框（PDF.js）。
2.  **TeX编译通**：实现一个快捷键（如 `Ctrl+S`），后台调用 `tectonic main.tex`（或 `pdflatex`），编译完成后刷新右侧PDF预览。
3.  **基础 AI 对话框**：在侧边栏加一个 Chat 窗口，接入 OpenAI/DeepSeek/Gemini 的 API，用户可以将选中的 LaTeX 代码发送给 AI 询问修改意见。

#### Phase 2: AI 深度融合与快捷操作
1.  **AI 润色悬浮菜单**：选中文本后弹出快捷菜单（Polish, Summarize, Translate）。API返回结果后，解析返回的文本，直接替换选区内容。
2.  **错误捕获与 AI 解释**：当 TeX 编译失败（Exit Code != 0）时，将终端报错信息提取并传给 AI：“这篇LaTeX编译报错了，请帮我定位并给出修改建议”，将 AI 的建议显示在界面底部。
3.  **引入绘图代理 (Plot Agent)**：输入文字，AI生成 Python 代码 -> 本地执行（注意安全性，可在Docker或隔离环境中运行，或者仅针对本地信任环境） -> 生成 `figure.pdf` -> AI 自动在 LaTeX 中写入 `\includegraphics{figure.pdf}`。

#### Phase 3: 知识库与本地 Vault 融合
1.  **打通 arxiv-pulse**：App 启动时，调用你写的脚本，定时去拉取“Condensed Matter”领域的最新文献并解析。
2.  **FTS5 检索接入**：在 App 内部实现一个文献搜索框。输入关键词，利用 SQLite FTS5 瞬间查出本地 Vault 里的文献。
3.  **RAG 写作辅助**：AI 写作时，不仅依赖大模型自身的知识，还能通过向量检索调取你本地 Vault 中的 PDF 摘要，实现带真实引用的文本生成。通过你之前设计的“原子重命名(atomic rename)”来安全管理PDF文件的移动和归档。

### 四、 关键技术难点提示

1.  **光标与PDF的同步滚动 (SyncTeX)**：要实现“点击左侧代码，右侧PDF跳转到对应位置（反之亦然）”，需要在编译时加上 `-synctex=1` 参数，并解析生成的 `.synctex.gz` 文件。前端通过 PDF.js 与编辑器行号进行映射。
2.  **数学公式的 AI 渲染**：由于你在凝聚态物理领域（涉及大量哈密顿量、波函数等复杂公式），确保 AI 输出的回答能被正确渲染。如果前端用网页技术，务必配置好 `KaTeX` 或 `MathJax`（注意按照标准使用双美元符号 `$$` 作为定界符包裹公式）。
3.  **大文件与性能**：随着论文越来越长，每次改动都全量编译 TeX 会很慢。可以通过拆分文件 (`\input{}` 或 `\include{}`) 以及使用 `latexmk` 等工具进行增量编译优化。

你可以先从 **Tauri + Tectonic + Monaco Editor** 的组合开始写一个极简Demo，这绝对是一个对广大科研群体（特别是物理、计算机领域）极具吸引力的工具！

---

## 已完成功能

### Phase 1-5: 核心功能 ✅ (36 tests passing)
- 论文编辑器 (Monaco Editor + PDF.js 预览)
- Tectonic 编译 + SyncTeX 同步
- AI 写作助手 (润色、翻译、解释错误)
- arXiv 文献搜索集成
- 项目导出 ZIP
- TikZ/Plot 代码生成

### Phase 6: Diagram Workbench (示意图工作台) ✅ (8 tests, 44 total)

**新增文件：**
- `pulse_tex/services/diagram_service.py` - AI 示意图服务
- `pulse_tex/web/api/diagram.py` - 示意图 API 端点
- `pulse_tex/web/static/diagram.html` - 工作台页面
- `pulse_tex/web/static/css/diagram.css` - 样式
- `pulse_tex/web/static/js/diagram.js` - Excalidraw 集成

**功能：**
- Excalidraw 画布：用户手绘草图
- AI 润色：将手绘转为期刊级 SVG
- 期刊风格预设：Nature / Science / IEEE / Minimal
- 图表类型：Flowchart / Schematic / Architecture / Comparison / Timeline
- 多轮对话修改
- SVG 转 TikZ 代码
- 读取论文上下文

**API 端点：**
- `GET /api/diagram/styles` - 获取可用风格
- `POST /api/diagram/refine` - AI 润色手绘草图
- `POST /api/diagram/generate` - 纯文字生成示意图
- `POST /api/diagram/iterate` - 多轮修改
- `POST /api/diagram/svg-to-tikz` - SVG 转 TikZ

**访问方式：**
- 页面：`http://localhost:8001/diagram.html`
