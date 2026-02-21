import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from pulse_tex.core import Config
from pulse_tex.utils.synctex import SyncTeXParser
from pulse_tex.web.dependencies import get_database

router = APIRouter()


class CompileResult(BaseModel):
    success: bool
    log: str
    pdf_path: str | None = None
    synctex_path: str | None = None
    error_message: str | None = None


class SyncTeXRequest(BaseModel):
    filename: str
    line: int


class SyncTeXResponse(BaseModel):
    page: int | None = None
    x: float | None = None
    y: float | None = None


class ReverseSyncTeXRequest(BaseModel):
    page: int
    x: float
    y: float


class ReverseSyncTeXResponse(BaseModel):
    line: int | None = None


def run_command(cmd: list[str], cwd: str, timeout: int = 120) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Command timeout"
    except FileNotFoundError:
        return False, f"Command not found: {cmd[0]}"


def compile_with_tectonic(main_file: str, tmpdir: str) -> tuple[bool, str]:
    return run_command(
        ["tectonic", main_file, "--synctex"],
        tmpdir,
        timeout=180,
    )


def compile_with_latex(engine: str, main_file: str, tmpdir: str, bibtex_engine: str) -> tuple[bool, str]:
    main_base = main_file.replace(".tex", "")
    full_log = ""

    cmd_map = {
        "pdflatex": ["pdflatex", "-interaction=nonstopmode", "-synctex=1", main_file],
        "xelatex": ["xelatex", "-interaction=nonstopmode", "-synctex=1", main_file],
        "lualatex": ["lualatex", "-interaction=nonstopmode", "-synctex=1", main_file],
    }

    aux_file = Path(tmpdir) / main_file.replace(".tex", ".aux")
    bib_file = Path(tmpdir) / main_file.replace(".tex", ".bib")
    bcf_file = Path(tmpdir) / main_file.replace(".tex", ".bcf")

    success, log = run_command(cmd_map[engine], tmpdir)
    full_log += f"=== First {engine} pass ===\n{log}\n\n"

    if not success:
        return False, full_log

    needs_bibtex = aux_file.exists() and _check_aux_for_citations(aux_file)
    needs_biber = bcf_file.exists()

    if needs_biber and bibtex_engine == "biber":
        success, log = run_command(["biber", main_base], tmpdir)
        full_log += f"=== Biber pass ===\n{log}\n\n"
    elif needs_bibtex:
        bibtex_cmd = "bibtex" if bibtex_engine == "bibtex" else "biber"
        if bibtex_cmd == "bibtex":
            success, log = run_command(["bibtex", main_base], tmpdir)
        else:
            success, log = run_command(["biber", main_base], tmpdir)
        full_log += f"=== {bibtex_cmd.capitalize()} pass ===\n{log}\n\n"

    if needs_bibtex or needs_biber:
        success, log = run_command(cmd_map[engine], tmpdir)
        full_log += f"=== Second {engine} pass ===\n{log}\n\n"

        if success:
            success, log = run_command(cmd_map[engine], tmpdir)
            full_log += f"=== Third {engine} pass ===\n{log}\n\n"

    return success, full_log


def _check_aux_for_citations(aux_file: Path) -> bool:
    try:
        content = aux_file.read_text()
        return "\\citation{" in content or "\\bibdata{" in content
    except:
        return False


@router.post("/{project_id}")
async def compile_project(project_id: str) -> CompileResult:
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files = db.get_files(project_id)
    if not files:
        raise HTTPException(status_code=400, detail="No files in project")

    main_file = project.main_file or "main.tex"
    main_content = None
    for f in files:
        if f.path == main_file:
            main_content = f.content
            break

    if not main_content:
        raise HTTPException(status_code=400, detail=f"Main file '{main_file}' not found")

    engine = db.get_config("latex_engine") or "tectonic"
    bibtex_engine = db.get_config("bibtex_engine") or "biber"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        for f in files:
            file_path = tmpdir_path / f.path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(f.content or "")

        try:
            if engine == "tectonic":
                success, log_output = compile_with_tectonic(main_file, tmpdir)
            else:
                success, log_output = compile_with_latex(engine, main_file, tmpdir, bibtex_engine)

            pdf_file = tmpdir_path / main_file.replace(".tex", ".pdf")
            synctex_file = tmpdir_path / main_file.replace(".tex", ".synctex.gz")

            if pdf_file.exists():
                output_dir = Path(Config.PROJECTS_DIR) / str(project_id)
                output_dir.mkdir(parents=True, exist_ok=True)
                output_pdf = output_dir / "output.pdf"
                output_synctex = output_dir / "output.synctex.gz"

                output_pdf.write_bytes(pdf_file.read_bytes())

                synctex_path = None
                if synctex_file.exists():
                    output_synctex.write_bytes(synctex_file.read_bytes())
                    synctex_path = str(output_synctex)

                return CompileResult(
                    success=True,
                    log=log_output,
                    pdf_path=str(output_pdf),
                    synctex_path=synctex_path,
                )
            else:
                return CompileResult(
                    success=False,
                    log=log_output,
                    error_message="PDF not generated",
                )

        except Exception as e:
            return CompileResult(
                success=False,
                log="",
                error_message=str(e),
            )


@router.post("/{project_id}/synctex/forward", response_model=SyncTeXResponse)
async def synctex_forward(project_id: str, request: SyncTeXRequest):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    synctex_path = Path(Config.PROJECTS_DIR) / str(project_id) / "output.synctex.gz"
    if not synctex_path.exists():
        raise HTTPException(status_code=404, detail="SyncTeX file not found. Compile with --synctex first.")

    parser = SyncTeXParser(synctex_path)
    if not parser.is_valid:
        raise HTTPException(status_code=500, detail="Failed to parse SyncTeX file")

    result = parser.get_position_for_line(request.filename, request.line)
    if result:
        return SyncTeXResponse(page=result[0], x=result[1], y=result[2])
    return SyncTeXResponse()


@router.get("/{project_id}/synctex", response_model=SyncTeXResponse)
async def synctex_forward_get(project_id: str, line: int, file: str = "main.tex"):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    synctex_path = Path(Config.PROJECTS_DIR) / str(project_id) / "output.synctex.gz"
    if not synctex_path.exists():
        raise HTTPException(status_code=404, detail="SyncTeX file not found. Compile the project first.")

    parser = SyncTeXParser(synctex_path)
    if not parser.is_valid:
        raise HTTPException(status_code=500, detail="Failed to parse SyncTeX file")

    result = parser.get_position_for_line(file, line)
    if result:
        return SyncTeXResponse(page=result[0], x=result[1], y=result[2])
    return SyncTeXResponse()


@router.post("/{project_id}/synctex/reverse", response_model=ReverseSyncTeXResponse)
async def synctex_reverse(project_id: str, request: ReverseSyncTeXRequest):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    synctex_path = Path(Config.PROJECTS_DIR) / str(project_id) / "output.synctex.gz"
    if not synctex_path.exists():
        raise HTTPException(status_code=404, detail="SyncTeX file not found. Compile with --synctex first.")

    parser = SyncTeXParser(synctex_path)
    if not parser.is_valid:
        raise HTTPException(status_code=500, detail="Failed to parse SyncTeX file")

    line = parser.get_line_for_position(request.page, request.x, request.y)
    return ReverseSyncTeXResponse(line=line)


@router.get("/{project_id}/pdf")
async def get_pdf(project_id: str):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    pdf_path = Path(Config.PROJECTS_DIR) / str(project_id) / "output.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found. Compile the project first.")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"{project.name}.pdf",
    )
