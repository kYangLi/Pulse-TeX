# Pulse-TeX 开发计划

## 项目定位

Pulse-TeX 是一款基于服务器的 LaTeX 论文写作工具，支持多用户访问，深度融合 AI 辅助写作，底层调用 Tectonic 编译引擎。

## 技术栈决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 前端框架 | 原生 HTML/JS + Monaco Editor | 与 arXiv-Pulse 一致，无构建步骤 |
| TeX 引擎 | Tectonic | 自动依赖管理，分发友好 |
| 用户系统 | 简单 Session | 服务器场景，可选登录 |
| 数据存储 | 项目目录 + SQLite | 项目文件在文件系统，元数据在 DB |
| arXiv 集成 | HTTP API 调用 arXiv-Pulse | 独立部署，松耦合 |

## 项目结构

```
pulse_tex/
├── __init__.py
├── __version__.py
├── cli/                     # CLI 入口 (仿 arXiv-Pulse)
│   └── __init__.py
├── core/                    # 核心模块
│   ├── config.py           # 配置管理
│   ├── database.py         # SQLite + FTS5
│   └── lock.py             # 服务锁
├── models/                  # SQLAlchemy 模型
│   ├── __init__.py
│   ├── project.py          # 项目/论文
│   ├── file.py             # 文件管理
│   └── user.py             # 用户/会话
├── services/                # 业务服务
│   ├── tex_compiler.py     # Tectonic 编译
│   ├── ai_assistant.py     # AI 写作辅助
│   ├── project_service.py  # 项目管理
│   └── arxiv_client.py     # arXiv-Pulse API 客户端
├── web/                     # FastAPI Web 层
│   ├── app.py
│   ├── dependencies.py
│   ├── api/
│   │   ├── projects.py     # 项目 CRUD
│   │   ├── files.py        # 文件操作
│   │   ├── compile.py      # 编译接口
│   │   ├── ai.py           # AI 对话/润色
│   │   └── literature.py   # 文献检索(调用 arXiv-Pulse)
│   └── static/             # 前端资源
│       ├── index.html
│       ├── css/
│       ├── js/
│       └── libs/           # Monaco Editor, PDF.js
└── utils/
    └── synctex.py          # SyncTeX 解析
```

## 开发阶段

### Phase 1: 基础框架搭建 (Week 1-2) ✅ COMPLETED

#### 1.1 项目初始化
- [x] 创建 `pyproject.toml` (仿 arXiv-Pulse 结构)
- [x] 配置 setuptools、依赖项、CLI 入口点
- [x] 实现基础 CLI: `tex-serve serve/start/stop/status`

#### 1.2 核心模块
- [x] **Database**: SQLite + FTS5 全文检索 (项目内容、文献)
- [x] **Config**: 用户配置、AI API 密钥、arXiv-Pulse 服务地址
- [x] **ServiceLock**: 后台服务管理

#### 1.3 基础 Web 框架
- [x] FastAPI 应用骨架
- [x] 健康检查 `/api/health`
- [x] 基础前端框架

**交付物**: `pip install pulse-tex && tex-serve serve .` 可启动服务 ✅

---

### Phase 2: 编辑器与编译核心 (Week 3-4) ✅ COMPLETED

#### 2.1 项目与文件管理 API ✅
```
POST   /api/projects              # 创建项目
GET    /api/projects              # 项目列表
GET    /api/projects/{id}         # 项目详情
POST   /api/projects/{id}/files   # 上传/创建文件
GET    /api/projects/{id}/files   # 文件树
PATCH  /api/projects/{id}/files/{path}  # 更新文件内容
DELETE /api/projects/{id}/files/{path}  # 删除文件
```

#### 2.2 Tectonic 编译服务 ✅
- [x] 封装 Tectonic 命令行调用
- 编译日志解析 (AI/正则提取关键错误)
- 输出 PDF 缓存

#### 2.3 前端编辑器
- Monaco Editor 集成 (LaTeX 语法高亮)
- 文件树组件
- PDF.js 预览面板
- 基础双栏布局

**交付物**: 可创建项目、编辑 .tex 文件、编译并预览 PDF

---

### Phase 3: AI 深度融合 (Week 5-6) ✅ COMPLETED

#### 3.1 AI 对话接口 ✅
```
POST /api/ai/chat           # 对话 (SSE 流式)
POST /api/ai/polish         # 学术润色
POST /api/ai/translate      # 中英互译
POST /api/ai/explain-error  # 解释编译错误
GET  /api/ai/status         # AI 配置状态
```

#### 3.2 AI 辅助功能 ✅
- 选中文本悬浮菜单 (右键菜单)
- AI 聊天面板
- 上下文感知 (发送编辑器内容作为上下文)

#### 3.3 编译错误 AI 解析 ✅
- 失败时可调用 AI 解析日志
- 返回人类可读的错误描述和修复建议

**交付物**: 完整的 AI 写作辅助功能 ✅

---

### Phase 4: 文献集成 (Week 7-8) ✅ COMPLETED

#### 4.1 arXiv-Pulse API 客户端 ✅
```python
class ArxivPulseClient:
    async def search_papers(query: str) -> dict
    async def get_paper_by_arxiv_id(arxiv_id: str) -> dict
    async def get_recent_papers(days: int) -> dict
    async def health_check() -> bool
```

#### 4.2 文献检索接口 ✅
```
GET  /api/literature/status        # 检查 arXiv-Pulse 连接状态
GET  /api/literature/search        # 搜索文献
GET  /api/literature/recent        # 获取最近文献
GET  /api/literature/paper/{id}    # 获取单篇论文
POST /api/literature/citation      # 生成引用 (cite key + BibTeX)
```

#### 4.3 前端文献面板 ✅
- 文献搜索面板 (Lit 按钮)
- 搜索结果展示
- 一键插入 `\cite{...}`
- 复制 BibTeX 到剪贴板

**交付物**: 可检索 arXiv 文献并插入引用 ✅

---

### Phase 5: 高级功能 (Week 9-10)

#### 5.1 SyncTeX 同步
- 编译时生成 `.synctex.gz`
- 代码↔PDF 双向跳转

#### 5.2 TikZ/绘图生成
```
POST /api/ai/generate-tikz   # 自然语言生成 TikZ 代码
POST /api/ai/generate-plot   # 数据绘图 (Python -> Matplotlib)
```

#### 5.3 协作功能
- 项目分享
- 导出 (ZIP)

---

## 依赖清单

```toml
[project]
name = "pulse-tex"
version = "0.1.0"
requires-python = ">=3.12"

dependencies = [
    "fastapi>=0.109.0",
    "uvicorn>=0.27.0",
    "sqlalchemy>=2.0.36",
    "openai>=1.70.0",
    "httpx>=0.27.0",
    "click>=8.1.0",
    "python-multipart>=0.0.6",
    "aiofiles>=23.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "ruff>=0.4.0",
    "mypy>=1.10.0",
]

[project.scripts]
tex-serve = "pulse_tex.cli:cli"
```

## 测试策略

所有测试文件放置在 `./tests` 目录中，测试内容包括：
- 服务启动/停止测试
- API 端点测试
- 编译功能测试
- AI 功能测试

### 本地开发环境

项目使用 `uv` 管理虚拟环境，测试在 `.venv` 中进行：

```bash
# 创建虚拟环境
uv venv .venv

# 激活环境
source .venv/bin/activate

# 安装依赖
uv pip install -e ".[dev]"

# 运行测试
python -m pytest tests/ -v

# 快捷启动服务 (tests目录下)
cd tests && make up    # 启动服务
cd tests && make dn    # 停止服务
cd tests && make logs  # 查看日志
```

服务地址: http://192.168.219.3:44044

## 与 arXiv-Pulse 的关系

- **独立部署**: Pulse-TeX 和 arXiv-Pulse 可以独立运行
- **API 调用**: Pulse-TeX 通过 HTTP 调用 arXiv-Pulse 的文献检索接口
- **配置项**: 用户在 Pulse-TeX 设置中配置 arXiv-Pulse 服务地址
