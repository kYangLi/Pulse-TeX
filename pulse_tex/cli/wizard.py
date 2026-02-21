import os
import shutil
import subprocess
from pathlib import Path

import click


LATEX_ENGINES = {
    "tectonic": {
        "name": "Tectonic",
        "desc": "现代化 TeX 引擎，自动下载缺失包 (推荐)",
        "check": "tectonic --version",
    },
    "pdflatex": {
        "name": "pdfLaTeX (TeX Live)",
        "desc": "传统 LaTeX 引擎，需预装 TeX Live",
        "check": "pdflatex --version",
    },
    "xelatex": {
        "name": "XeLaTeX (TeX Live)",
        "desc": "支持 Unicode 和系统字体，中文友好",
        "check": "xelatex --version",
    },
    "lualatex": {
        "name": "LuaLaTeX (TeX Live)",
        "desc": "内置 Lua 脚本支持，功能强大",
        "check": "lualatex --version",
    },
}

AI_PROVIDERS = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": ["DeepSeek-V3", "deepseek-chat", "deepseek-coder"],
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    "anthropic": {
        "name": "Anthropic (Claude)",
        "base_url": "https://api.anthropic.com",
        "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
    },
    "moonshot": {
        "name": "Moonshot (Kimi)",
        "base_url": "https://api.moonshot.cn",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    },
    "zhipu": {
        "name": "智谱 AI (GLM)",
        "base_url": "https://open.bigmodel.cn",
        "models": ["glm-4", "glm-4-flash", "glm-3-turbo"],
    },
    "custom": {
        "name": "自定义",
        "base_url": "",
        "models": [],
    },
}


def check_command(cmd: str) -> bool:
    try:
        result = subprocess.run(
            cmd.split(),
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def detect_available_engines() -> dict[str, bool]:
    available = {}
    for engine_id, info in LATEX_ENGINES.items():
        available[engine_id] = check_command(info["check"])
    return available


def run_wizard() -> dict:
    click.echo("\n" + "=" * 60)
    click.secho("  Pulse-TeX 配置向导 / Configuration Wizard", fg="cyan", bold=True)
    click.echo("=" * 60 + "\n")

    config = {}

    config["latex_engine"] = select_latex_engine()
    config.update(select_ai_provider())
    config["arxiv_pulse_url"] = select_arxiv_pulse()
    config["projects_dir"] = select_projects_dir()

    click.echo("\n" + "-" * 60)
    click.secho("  配置摘要 / Configuration Summary", fg="green", bold=True)
    click.echo("-" * 60)
    click.echo(f"  编译引擎: {LATEX_ENGINES[config['latex_engine']]['name']}")
    click.echo(f"  AI 服务: {config.get('ai_provider_name', 'N/A')}")
    click.echo(f"  AI 模型: {config.get('ai_model', 'N/A')}")
    click.echo(f"  arXiv-Pulse: {config['arxiv_pulse_url']}")
    click.echo(f"  项目目录: {config['projects_dir']}")
    click.echo("-" * 60)

    if click.confirm("\n确认保存配置？ / Save configuration?", default=True):
        return config
    return {}


def select_latex_engine() -> str:
    click.secho("\n[1/4] LaTeX 编译引擎 / LaTeX Engine", fg="yellow", bold=True)

    available = detect_available_engines()

    click.echo("\n检测到的可用引擎 / Detected available engines:\n")
    for i, (engine_id, info) in enumerate(LATEX_ENGINES.items(), 1):
        status = "✓" if available.get(engine_id) else "✗"
        status_color = "green" if available.get(engine_id) else "red"
        click.echo(f"  {i}. ", nl=False)
        click.secho(f"[{status}] ", fg=status_color, nl=False)
        click.echo(f"{info['name']} - {info['desc']}")

    click.echo("\n  提示: [✓] = 已安装, [✗] = 未检测到")

    default_choice = "tectonic"
    for engine_id, is_available in available.items():
        if is_available:
            default_choice = engine_id
            break

    choice = click.prompt(
        "\n选择编译引擎 / Select engine",
        type=click.Choice(["1", "2", "3", "4"]),
        default="1",
    )

    engine_ids = list(LATEX_ENGINES.keys())
    selected = engine_ids[int(choice) - 1]

    if not available.get(selected):
        click.secho(f"\n  ⚠️  警告: {LATEX_ENGINES[selected]['name']} 未检测到！", fg="yellow")
        if selected == "tectonic":
            click.echo(
                "  安装方法: curl -LO https://github.com/tectonic-typesetting/tectonic/releases/latest/download/tectonic-x86_64-unknown-linux-gnu.tar.gz"
            )
            click.echo("           tar -xzf tectonic-*.tar.gz && sudo mv tectonic /usr/local/bin/")
        else:
            click.echo("  请安装 TeX Live: https://tug.org/texlive/")

        if not click.confirm("  仍然选择此引擎？ / Still select this engine?", default=False):
            return select_latex_engine()

    return selected


def select_ai_provider() -> dict:
    click.secho("\n[2/4] AI 服务配置 / AI Service Configuration", fg="yellow", bold=True)

    click.echo("\n支持的 AI 服务商 / Supported AI providers:\n")
    for i, (provider_id, info) in enumerate(AI_PROVIDERS.items(), 1):
        click.echo(f"  {i}. {info['name']}")

    choice = click.prompt(
        "\n选择 AI 服务商 / Select AI provider",
        type=click.Choice([str(i) for i in range(1, len(AI_PROVIDERS) + 1)]),
        default="1",
    )

    provider_ids = list(AI_PROVIDERS.keys())
    provider_id = provider_ids[int(choice) - 1]
    provider = AI_PROVIDERS[provider_id]

    config = {
        "ai_provider_name": provider["name"],
        "ai_base_url": provider["base_url"],
    }

    if provider_id == "custom":
        config["ai_base_url"] = click.prompt(
            "  输入 API Base URL",
            default="https://api.example.com",
        )

    api_key = click.prompt(
        f"  输入 {provider['name']} API Key",
        default="",
        hide_input=True,
        show_default=False,
    )
    config["ai_api_key"] = api_key

    if provider["models"]:
        click.echo(f"\n  {provider['name']} 可用模型 / Available models:")
        for i, model in enumerate(provider["models"], 1):
            click.echo(f"    {i}. {model}")

        model_choice = click.prompt(
            "  选择模型 / Select model",
            type=click.Choice([str(i) for i in range(1, len(provider["models"]) + 1)]),
            default="1",
        )
        config["ai_model"] = provider["models"][int(model_choice) - 1]
    else:
        config["ai_model"] = click.prompt(
            "  输入模型名称 / Enter model name",
            default="gpt-4o",
        )

    if not api_key:
        click.secho("\n  ⚠️  未设置 API Key，AI 功能将不可用", fg="yellow")

    return config


def select_arxiv_pulse() -> str:
    click.secho("\n[3/4] arXiv-Pulse 集成 / arXiv-Pulse Integration", fg="yellow", bold=True)

    click.echo("\n  arXiv-Pulse 是文献管理服务，可自动抓取 arXiv 论文")
    click.echo("  留空则跳过此配置\n")

    url = click.prompt(
        "  arXiv-Pulse 服务地址 / Service URL",
        default="http://localhost:8000",
    )

    if url and not url.startswith("http"):
        url = f"http://{url}"

    return url


def select_projects_dir() -> str:
    click.secho("\n[4/4] 项目存储目录 / Projects Directory", fg="yellow", bold=True)

    default_dir = "./projects"
    click.echo(f"\n  默认目录: {default_dir}")

    custom = click.prompt(
        "  自定义目录 (留空使用默认) / Custom directory",
        default="",
    )

    if custom:
        dir_path = Path(custom).expanduser().resolve()
        try:
            dir_path.mkdir(parents=True, exist_ok=True)
            return str(dir_path)
        except Exception as e:
            click.secho(f"  ⚠️  无法创建目录: {e}", fg="red")
            return default_dir

    Path(default_dir).mkdir(parents=True, exist_ok=True)
    return default_dir


def quick_setup() -> dict:
    click.secho("\n快速配置模式 / Quick Setup Mode\n", fg="cyan")

    config = {}

    available = detect_available_engines()
    for engine_id in ["tectonic", "pdflatex", "xelatex"]:
        if available.get(engine_id):
            config["latex_engine"] = engine_id
            break
    else:
        config["latex_engine"] = "tectonic"

    click.echo(f"  编译引擎: {LATEX_ENGINES[config['latex_engine']]['name']} (自动检测)")

    config["ai_api_key"] = ""
    config["ai_model"] = "DeepSeek-V3"
    config["ai_base_url"] = "https://api.deepseek.com"
    config["ai_provider_name"] = "DeepSeek"
    click.echo("  AI 服务: DeepSeek (稍后配置 API Key)")

    config["arxiv_pulse_url"] = "http://localhost:8000"
    click.echo("  arXiv-Pulse: http://localhost:8000")

    config["projects_dir"] = "./projects"
    Path("./projects").mkdir(exist_ok=True)
    click.echo("  项目目录: ./projects")

    click.echo("\n  提示: 使用 'tex-serve config' 命令修改配置")
    return config
