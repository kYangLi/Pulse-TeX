import subprocess

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pulse_tex.core import Config
from pulse_tex.web.dependencies import get_database

router = APIRouter()


LATEX_ENGINES = {
    "tectonic": {"name": "Tectonic", "desc": "现代化引擎，自动下载缺失包", "check": ["tectonic", "--version"]},
    "pdflatex": {"name": "pdfLaTeX", "desc": "传统引擎，需安装 TeX Live", "check": ["pdflatex", "--version"]},
    "xelatex": {"name": "XeLaTeX", "desc": "支持 Unicode 和系统字体", "check": ["xelatex", "--version"]},
    "lualatex": {"name": "LuaLaTeX", "desc": "内置 Lua 脚本支持", "check": ["lualatex", "--version"]},
}

BIBTEX_ENGINES = {
    "biber": {"name": "Biber", "desc": "现代参考文献处理工具 (biblatex 推荐)", "check": ["biber", "--version"]},
    "bibtex": {"name": "BibTeX", "desc": "传统参考文献处理工具", "check": ["bibtex", "--version"]},
}

DEFAULT_AI_BASE_URL = "https://llmapi.paratera.com"
DEFAULT_AI_MODEL = "DeepSeek-V3.2"


class UpdateConfigRequest(BaseModel):
    ai_api_key: str | None = None
    ai_model: str | None = None
    ai_base_url: str | None = None
    arxiv_pulse_url: str | None = None
    ui_language: str | None = None
    latex_engine: str | None = None
    bibtex_engine: str | None = None


class InitConfigRequest(BaseModel):
    ai_api_key: str = ""
    ai_model: str = DEFAULT_AI_MODEL
    ai_base_url: str = DEFAULT_AI_BASE_URL
    latex_engine: str = "tectonic"
    bibtex_engine: str = "biber"
    arxiv_pulse_url: str = "http://localhost:8000"
    ui_language: str = "zh"


class TestAIRequest(BaseModel):
    ai_api_key: str | None = None
    ai_base_url: str | None = None
    ai_model: str | None = None


def check_command(cmd: list[str]) -> bool:
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=5)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


@router.get("")
async def get_config():
    db = get_database()
    config = db.get_all_config()
    return {
        "ai_api_key": "***" if config.get("ai_api_key") else "",
        "ai_model": config.get("ai_model", DEFAULT_AI_MODEL),
        "ai_base_url": config.get("ai_base_url", DEFAULT_AI_BASE_URL),
        "arxiv_pulse_url": config.get("arxiv_pulse_url", "http://localhost:8000"),
        "latex_engine": config.get("latex_engine", "tectonic"),
        "bibtex_engine": config.get("bibtex_engine", "biber"),
        "ui_language": config.get("ui_language", "zh"),
        "is_initialized": db.is_initialized(),
    }


@router.get("/status")
async def get_status():
    db = get_database()
    available_engines = {}
    for engine_id, info in LATEX_ENGINES.items():
        available_engines[engine_id] = {
            "name": info["name"],
            "desc": info["desc"],
            "available": check_command(info["check"]),
        }

    available_bibtex = {}
    for engine_id, info in BIBTEX_ENGINES.items():
        available_bibtex[engine_id] = {
            "name": info["name"],
            "desc": info["desc"],
            "available": check_command(info["check"]),
        }

    return {
        "is_initialized": db.is_initialized(),
        "has_ai_key": bool(db.get_config("ai_api_key")),
        "latex_engines": available_engines,
        "bibtex_engines": available_bibtex,
    }


@router.post("/init")
async def initialize_system(data: InitConfigRequest):
    db = get_database()
    if db.is_initialized():
        raise HTTPException(status_code=400, detail="系统已初始化")

    db.set_config("ai_api_key", data.ai_api_key)
    db.set_config("ai_model", data.ai_model)
    db.set_config("ai_base_url", data.ai_base_url)
    db.set_config("latex_engine", data.latex_engine)
    db.set_config("bibtex_engine", data.bibtex_engine)
    db.set_config("arxiv_pulse_url", data.arxiv_pulse_url)
    db.set_config("ui_language", data.ui_language)

    db.set_initialized(True)
    return {"success": True, "message": "配置已保存"}


@router.post("/test-ai")
async def test_ai_connection(request: TestAIRequest):
    import openai

    db = get_database()
    api_key = request.ai_api_key or db.get_config("ai_api_key", "")
    base_url = request.ai_base_url or db.get_config("ai_base_url", DEFAULT_AI_BASE_URL)
    model = request.ai_model or db.get_config("ai_model", DEFAULT_AI_MODEL)

    if not api_key:
        raise HTTPException(status_code=400, detail="未设置 API Key")

    try:
        client = openai.OpenAI(api_key=api_key, base_url=base_url)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=10,
        )
        return {"success": True, "message": f"连接成功，模型: {model}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"连接失败: {str(e)[:100]}")


@router.patch("")
async def update_config(data: UpdateConfigRequest):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        return {"success": True, "message": "No updates provided"}

    db = get_database()
    for key, value in updates.items():
        if key == "ai_api_key" and value == "***":
            continue
        db.set_config(key, value)
    return {"success": True, "updated": list(updates.keys())}
