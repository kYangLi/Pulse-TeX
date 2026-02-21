from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pulse_tex.web.dependencies import get_database

router = APIRouter()


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


class UpdateFileRequest(BaseModel):
    content: str


@router.get("/{project_id}")
async def list_files(project_id: int):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files = db.get_files(project_id)
    return [f.to_dict() for f in files]


@router.post("/{project_id}")
async def create_file(project_id: int, data: CreateFileRequest):
    db = get_database()
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = db.get_file(project_id, data.path)
    if existing:
        raise HTTPException(status_code=400, detail="File already exists")

    file = db.create_file(project_id, data.path, data.content)
    return file.to_dict()


@router.get("/{project_id}/{path:path}")
async def get_file(project_id: int, path: str):
    db = get_database()
    file = db.get_file(project_id, path)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file.to_dict()


@router.patch("/{project_id}/{path:path}")
async def update_file(project_id: int, path: str, data: UpdateFileRequest):
    db = get_database()
    success = db.update_file(project_id, path, data.content)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")

    file = db.get_file(project_id, path)
    return file.to_dict()


@router.delete("/{project_id}/{path:path}")
async def delete_file(project_id: int, path: str):
    db = get_database()
    success = db.delete_file(project_id, path)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"success": True}
