from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pulse_tex.web.dependencies import get_database

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    main_file: str | None = None


@router.get("")
async def list_projects():
    db = get_database()
    projects = db.get_projects()
    return [p.to_dict() for p in projects]


@router.post("")
async def create_project(data: CreateProjectRequest):
    db = get_database()
    project = db.create_project(name=data.name, description=data.description)

    default_content = r"""\documentclass{article}
\usepackage{amsmath}
\usepackage{graphicx}

\title{Untitled Document}
\author{Author}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}

Your content here.

\end{document}
"""
    db.create_file(project.id, "main.tex", default_content)

    return project.to_dict()


@router.get("/{project_id}")
async def get_project(project_id: str):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.to_dict()


@router.patch("/{project_id}")
async def update_project(project_id: str, data: UpdateProjectRequest):
    db = get_database()
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    success = db.update_project(project_id, **updates)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")

    project = db.get_project(project_id)
    return project.to_dict()


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    db = get_database()
    success = db.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True}


@router.get("/{project_id}/export")
async def export_project(project_id: str):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files = db.get_files(project_id)
    if not files:
        raise HTTPException(status_code=400, detail="No files in project")

    zip_buffer = BytesIO()
    with ZipFile(zip_buffer, "w", ZIP_DEFLATED) as zf:
        for f in files:
            zf.writestr(f.path, f.content or "")

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{project.name}.zip"'},
    )
