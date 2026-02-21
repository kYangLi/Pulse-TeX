#!/usr/bin/env python3
"""
Pulse-TeX CLI - Web 界面启动器
"""

import atexit
import json
import os
import signal
import socket
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import click

from pulse_tex.__version__ import __version__


def _is_port_in_use(host: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            result = s.connect_ex((host, port))
            return result == 0
    except Exception:
        return False


def _is_localhost(host: str) -> bool:
    localhost_aliases = {"localhost", "127.0.0.1", "::1"}
    if host in localhost_aliases:
        return True
    if host.startswith("127."):
        return True
    return False


def _show_security_warning_and_confirm() -> bool:
    click.echo(f"\n{'=' * 60}")
    click.secho("  ⚠️  安全警告: 您正在开放非本地访问！", fg="red", bold=True)
    click.secho("  ⚠️  Security Warning: Opening non-localhost access!", fg="red", bold=True)
    click.echo("=" * 60)
    click.echo("""
    这意味着 / This means:
    • 所有数据（包括 AI API Key）将以明文传输
      All data (including AI API Key) will be transmitted in plaintext
    • 同一网络中的任何人都可以访问您的服务（无需认证）
      Anyone on the same network can access your service (no authentication)
    • 请勿在不信任的网络中使用
      Do not use on untrusted networks

    ═══════════════════════════════════════════════════════════
    💡 推荐方式 / Recommended Approach:
    ═══════════════════════════════════════════════════════════

    在服务器上绑定 127.0.0.1，然后通过 SSH 隧道访问：
    Bind to 127.0.0.1 on server, then access via SSH tunnel:

      # 服务器上 / On server:
      tex-serve serve .

      # 你的电脑上 / On your computer:
      ssh -L 8000:localhost:8000 user@server

      # 然后访问 / Then visit:
      http://localhost:8000

    这样既安全又方便，无需使用本选项！
    This is both secure and convenient, no need for this option!
    """)
    click.echo("=" * 60)

    response = click.prompt("是否继续 / Continue? [y/N]", default="n", show_default=False)
    return response.lower() in ("y", "yes")


class ServiceLock:
    def __init__(self, directory: Path):
        self.directory = directory
        self.lock_file = directory / ".pulse_tex.lock"

    def is_locked(self) -> tuple[bool, dict | None]:
        if not self.lock_file.exists():
            return False, None
        try:
            with open(self.lock_file) as f:
                info = json.load(f)
            pid = info.get("pid")
            if pid:
                try:
                    os.kill(pid, 0)
                    return True, info
                except ProcessLookupError:
                    self.release()
                    return False, None
            return True, info
        except (json.JSONDecodeError, KeyError):
            return False, None

    def acquire(self, host: str, port: int, pid: int | None = None) -> bool:
        try:
            info = {
                "pid": pid or os.getpid(),
                "host": host,
                "port": port,
                "started_at": datetime.now(UTC).isoformat(),
            }
            with open(self.lock_file, "w") as f:
                json.dump(info, f, indent=2)
            return True
        except Exception:
            return False

    def release(self) -> None:
        if self.lock_file.exists():
            self.lock_file.unlink()

    def get_status_message(self, info: dict | None) -> str:
        if not info:
            return ""
        host = info.get("host", "unknown")
        port = info.get("port", "unknown")
        started = info.get("started_at", "unknown")
        pid = info.get("pid", "unknown")
        return f"Host: {host}:{port}\nPID: {pid}\nStarted: {started}"


_lock_instance: ServiceLock | None = None


def _cleanup_lock():
    global _lock_instance
    if _lock_instance:
        _lock_instance.release()
        _lock_instance = None


def _signal_handler(signum, frame):
    _cleanup_lock()
    click.echo("\n服务已停止 / Service stopped")
    sys.exit(0)


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(version=__version__, prog_name="Pulse-TeX")
def cli():
    """Pulse-TeX - AI-powered LaTeX paper writing tool

    Commands:
        init           Initialize configuration (first-time setup)
        config         View or modify configuration
        serve/start    Start web service
        stop           Stop background service
        restart        Restart service
        status         View service status

    After starting, visit http://localhost:8001

    Examples:
        tex-serve init .               # First-time setup
        tex-serve config . --show      # Show current config
        tex-serve serve .              # Start in background
        tex-serve serve . -f           # Run in foreground
        tex-serve stop .               # Stop service
        tex-serve status .             # View status
    """
    pass


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
@click.option("--quick", "-q", is_flag=True, help="Quick setup with defaults")
def init(directory, quick):
    """Initialize Pulse-TeX configuration (first-time setup)"""
    from pathlib import Path

    from pulse_tex.cli.wizard import quick_setup, run_wizard
    from pulse_tex.core.config import Config

    directory = Path(directory).resolve()
    data_dir = directory / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    db_path = data_dir / "pulse_tex.db"
    os.environ["PULSE_TEX_DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["PULSE_TEX_PROJECTS_DIR"] = str(directory / "projects")

    click.echo(f"\n初始化目录: {directory}")

    if Config.is_initialized():
        click.secho("\n  ⚠️  配置已存在，将进行更新", fg="yellow")
        if not click.confirm("是否继续？ / Continue?", default=True):
            return

    if quick:
        config = quick_setup()
    else:
        config = run_wizard()

    if config:
        Config.update_config(config)
        Config.set_initialized(True)
        click.secho("\n✓ 配置已保存 / Configuration saved!", fg="green", bold=True)
        click.echo(f"\n运行 'tex-serve serve {directory}' 启动服务")
    else:
        click.secho("\n配置已取消 / Configuration cancelled", fg="yellow")


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
@click.option("--show", "show_config", is_flag=True, help="Show current configuration")
@click.option("--set", "set_values", multiple=True, help="Set config value (key=value)")
@click.option("--ai-key", help="Set AI API key")
@click.option("--ai-model", help="Set AI model")
@click.option("--engine", type=click.Choice(["tectonic", "pdflatex", "xelatex", "lualatex"]), help="Set LaTeX engine")
def config(directory, show_config, set_values, ai_key, ai_model, engine):
    """View or modify configuration"""
    from pathlib import Path

    from pulse_tex.cli.wizard import LATEX_ENGINES, detect_available_engines
    from pulse_tex.core.config import Config

    directory = Path(directory).resolve()
    data_dir = directory / "data"

    if not data_dir.exists():
        click.secho("未初始化，请先运行 'tex-serve init'", fg="red")
        return

    db_path = data_dir / "pulse_tex.db"
    os.environ["PULSE_TEX_DATABASE_URL"] = f"sqlite:///{db_path}"

    if show_config or (not set_values and not ai_key and not ai_model and not engine):
        click.echo("\n当前配置 / Current Configuration:")
        click.echo("-" * 40)

        all_config = Config.get_all_config()
        sensitive_keys = {"ai_api_key"}

        for key, value in sorted(all_config.items()):
            if key in sensitive_keys and value:
                display_value = value[:8] + "..." if len(value) > 8 else "***"
            else:
                display_value = value or "(未设置)"
            click.echo(f"  {key}: {display_value}")

        click.echo("-" * 40)

        available = detect_available_engines()
        click.echo("\n可用编译引擎 / Available LaTeX engines:")
        for eng_id, is_avail in available.items():
            status = "✓" if is_avail else "✗"
            click.echo(f"  [{status}] {LATEX_ENGINES[eng_id]['name']}")
        return

    updates = {}

    if ai_key:
        updates["ai_api_key"] = ai_key
        click.echo(f"AI API Key: {ai_key[:8]}...")

    if ai_model:
        updates["ai_model"] = ai_model
        click.echo(f"AI Model: {ai_model}")

    if engine:
        updates["latex_engine"] = engine
        click.echo(f"LaTeX Engine: {LATEX_ENGINES[engine]['name']}")

    for set_value in set_values:
        if "=" in set_value:
            key, value = set_value.split("=", 1)
            updates[key.strip()] = value.strip()

    if updates:
        Config.update_config(updates)
        click.secho("\n✓ 配置已更新 / Configuration updated!", fg="green")
    else:
        click.echo("无更新 / No changes")


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
@click.option("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
@click.option("--port", default=8001, type=int, help="Port to bind (default: 8001)")
@click.option("--foreground", "-f", is_flag=True, help="Run in foreground")
@click.option("--force", is_flag=True, help="Force start (ignore existing lock)")
@click.option(
    "--allow-non-localhost-access-with-plaintext-transmission-risk",
    is_flag=True,
    help="Allow binding to non-localhost address (shows security warning)",
)
@click.option("-y", "--yes", is_flag=True, help="Skip confirmation prompts")
def start(directory, host, port, foreground, force, allow_non_localhost_access_with_plaintext_transmission_risk, yes):
    """Start web service (same as serve)"""
    _do_serve(
        directory, host, port, foreground, force, allow_non_localhost_access_with_plaintext_transmission_risk, yes
    )


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
@click.option("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
@click.option("--port", default=8001, type=int, help="Port to bind (default: 8001)")
@click.option("--foreground", "-f", is_flag=True, help="Run in foreground")
@click.option("--force", is_flag=True, help="Force start (ignore existing lock)")
@click.option(
    "--allow-non-localhost-access-with-plaintext-transmission-risk",
    is_flag=True,
    help="Allow binding to non-localhost address (shows security warning)",
)
@click.option("-y", "--yes", is_flag=True, help="Skip confirmation prompts")
def serve(directory, host, port, foreground, force, allow_non_localhost_access_with_plaintext_transmission_risk, yes):
    """Start web service"""
    _do_serve(
        directory, host, port, foreground, force, allow_non_localhost_access_with_plaintext_transmission_risk, yes
    )


def _do_serve(directory, host, port, foreground, force, allow_non_localhost=False, skip_confirmation=False):
    global _lock_instance

    directory = Path(directory).resolve()
    data_dir = directory / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    projects_dir = directory / "projects"
    projects_dir.mkdir(parents=True, exist_ok=True)

    db_path = data_dir / "pulse_tex.db"
    os.environ["PULSE_TEX_DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["PULSE_TEX_PROJECTS_DIR"] = str(projects_dir)

    if not _is_localhost(host):
        if not allow_non_localhost:
            click.echo(f"\n{'=' * 60}")
            click.secho("  ❌ 错误: 非本地访问需要明确授权", fg="red", bold=True)
            click.secho("  ❌ Error: Non-localhost access requires explicit authorization", fg="red", bold=True)
            click.echo("=" * 60)
            click.echo(f"""
    您正在尝试绑定地址: {host}
    You are trying to bind to address: {host}

    默认情况下，服务仅允许本地访问以确保安全。
    By default, the service only allows localhost access for security.

    ═══════════════════════════════════════════════════════════
    💡 推荐远程访问方式 / Recommended Remote Access Method:
    ═══════════════════════════════════════════════════════════

    在服务器上绑定 127.0.0.1，然后通过 SSH 隧道访问：
    Bind to 127.0.0.1 on server, then access via SSH tunnel:

      # 服务器上 / On server:
      tex-serve serve .

      # 你的电脑上 / On your computer:
      ssh -L 8000:localhost:8000 user@server

      # 然后访问 / Then visit:
      http://localhost:8000

    这样既安全又方便！
    This is both secure and convenient!

    ═══════════════════════════════════════════════════════════
    如果您确定要开放非本地访问，请添加以下参数：
    If you are sure to open non-localhost access, add this flag:
    ═══════════════════════════════════════════════════════════

      --allow-non-localhost-access-with-plaintext-transmission-risk -y
""")
            click.echo("=" * 60)
            sys.exit(1)

        if not skip_confirmation:
            if not _show_security_warning_and_confirm():
                click.echo("\n已取消 / Cancelled")
                sys.exit(0)

    lock = ServiceLock(directory)
    is_locked, lock_info = lock.is_locked()

    if is_locked and not force:
        click.echo(f"\n{'=' * 50}")
        click.secho("  Service already running", fg="yellow", bold=True)
        click.echo(f"{'=' * 50}\n")
        click.echo(lock.get_status_message(lock_info))
        click.echo(f"\nUse --force to start a new instance")
        sys.exit(1)

    if force and is_locked:
        click.secho("\nWarning: Force mode, will overwrite lock file", fg="yellow")
        lock.release()

    if _is_port_in_use(host, port):
        click.echo(f"\n{'=' * 50}")
        click.secho(f"  Port {port} is in use", fg="red", bold=True)
        click.echo(f"{'=' * 50}\n")
        click.echo(f"Use --port to specify another port")
        sys.exit(1)

    acquired = lock.acquire(host, port)
    if not acquired:
        click.secho("Failed to acquire service lock", fg="red")
        sys.exit(1)

    _lock_instance = lock

    atexit.register(_cleanup_lock)
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    click.echo(f"\n{'=' * 50}")
    click.echo("  Pulse-TeX - AI-powered LaTeX Writing Tool")
    click.echo(f"{'=' * 50}")
    click.echo(f"\nData directory: {directory}")
    click.echo(f"Projects directory: {projects_dir}")
    click.echo(f"Web interface: http://{host}:{port}")
    click.echo(f"API docs: http://{host}:{port}/docs")
    click.echo(f"Mode: {'Foreground' if foreground else 'Background'}")

    if foreground:
        import uvicorn

        click.echo("\nPress Ctrl+C to stop\n")
        try:
            uvicorn.run(
                "pulse_tex.web.app:app",
                host=host,
                port=port,
                log_level="info",
            )
        finally:
            _cleanup_lock()
    else:
        log_file = directory / "web.log"

        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "pulse_tex.web.app:app",
            "--host",
            host,
            "--port",
            str(port),
            "--log-level",
            "info",
        ]

        env = {
            **os.environ,
            "PULSE_TEX_DATABASE_URL": f"sqlite:///{db_path}",
            "PULSE_TEX_PROJECTS_DIR": str(projects_dir),
        }

        with open(log_file, "w") as log:
            process = subprocess.Popen(
                cmd,
                stdout=log,
                stderr=log,
                start_new_session=True,
                env=env,
            )

        lock.release()
        lock.acquire(host, port, pid=process.pid)
        _lock_instance = None

        click.echo(f"\nService started in background (PID: {process.pid})")
        click.echo(f"Log file: {log_file}")
        click.echo(f"\nStop: tex-serve stop")
        click.echo(f"Status: tex-serve status")


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
def status(directory):
    """View service status"""
    directory = Path(directory).resolve()
    lock = ServiceLock(directory)

    is_locked, info = lock.is_locked()

    click.echo(f"\n{'=' * 50}")
    click.echo("  Pulse-TeX - Service Status")
    click.echo(f"{'=' * 50}\n")
    click.echo(f"Data directory: {directory}")
    click.echo(f"Database: {directory}/data/pulse_tex.db\n")

    if is_locked:
        click.secho("Service running", fg="green", bold=True)
        click.echo(lock.get_status_message(info))
    else:
        click.secho("Service not running", fg="yellow")


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
@click.option("--force", is_flag=True, help="Force stop (SIGKILL)")
def stop(directory, force):
    """Stop background service"""
    import time

    directory = Path(directory).resolve()
    lock = ServiceLock(directory)

    is_locked, info = lock.is_locked()

    click.echo(f"\n{'=' * 50}")
    click.echo("  Pulse-TeX - Stop Service")
    click.echo(f"{'=' * 50}\n")
    click.echo(f"Data directory: {directory}")

    if not is_locked:
        click.secho("\nNo service running", fg="yellow")
        return

    if info:
        pid = info.get("pid")
        host = info.get("host", "unknown")
        port = info.get("port", "unknown")

        click.echo(f"Found running service: http://{host}:{port} (PID: {pid})")

        try:
            sig = signal.SIGKILL if force else signal.SIGTERM
            sig_name = "SIGKILL" if force else "SIGTERM"
            os.kill(pid, sig)
            click.echo(f"Sent {sig_name} signal...")

            for _ in range(10):
                try:
                    os.kill(pid, 0)
                    time.sleep(0.5)
                except ProcessLookupError:
                    break

            try:
                os.kill(pid, 0)
                if not force:
                    click.secho("\nProcess not responding, forcing stop...", fg="yellow")
                    os.kill(pid, signal.SIGKILL)
                    time.sleep(1)
            except ProcessLookupError:
                pass

            lock.release()
            click.secho("\nService stopped", fg="green", bold=True)
        except ProcessLookupError:
            lock.release()
            click.secho("\nProcess gone, lock file cleaned", fg="green")
        except PermissionError:
            click.secho("\nNo permission to stop, try sudo", fg="red")
        except Exception as e:
            click.secho(f"\nStop failed: {e}", fg="red")
    else:
        lock.release()
        click.secho("\nLock file cleaned", fg="green")


@cli.command()
@click.argument("directory", type=click.Path(exists=False, file_okay=False), default=".")
@click.option("--foreground", "-f", is_flag=True, help="Run in foreground")
@click.option("--force", is_flag=True, help="Force restart")
def restart(directory, foreground, force):
    """Restart service"""
    import time

    directory = Path(directory).resolve()
    lock = ServiceLock(directory)

    is_locked, info = lock.is_locked()

    click.echo(f"\n{'=' * 50}")
    click.echo("  Pulse-TeX - Restart Service")
    click.echo(f"{'=' * 50}\n")
    click.echo(f"Data directory: {directory}")

    prev_host = info.get("host", "127.0.0.1") if info else "127.0.0.1"
    prev_port = info.get("port", 8001) if info else 8001

    if is_locked and info:
        pid = info.get("pid")
        click.echo(f"Found running service: http://{prev_host}:{prev_port} (PID: {pid})")

        try:
            sig = signal.SIGKILL if force else signal.SIGTERM
            click.echo("Stopping service...")
            os.kill(pid, sig)

            for _ in range(10):
                try:
                    os.kill(pid, 0)
                    time.sleep(0.5)
                except ProcessLookupError:
                    break

            try:
                os.kill(pid, 0)
                if not force:
                    os.kill(pid, signal.SIGKILL)
                    time.sleep(1)
            except ProcessLookupError:
                pass

            lock.release()
            click.echo("Old service stopped")
        except ProcessLookupError:
            lock.release()
            click.echo("Old process gone")
        except PermissionError:
            click.secho("No permission, try sudo", fg="red")
            sys.exit(1)
        except Exception as e:
            click.secho(f"Stop failed: {e}", fg="red")
            sys.exit(1)
    else:
        click.echo("Service not running")

    click.echo("\nStarting new service...")
    _do_serve(str(directory), prev_host, prev_port, foreground, False)


if __name__ == "__main__":
    cli()
