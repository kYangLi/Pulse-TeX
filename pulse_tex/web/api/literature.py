from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from pulse_tex.services.arxiv_client import arxiv_client

router = APIRouter(prefix="/literature", tags=["literature"])


class LiteratureResponse(BaseModel):
    success: bool
    data: dict | None = None
    error: str | None = None


@router.get("/status")
async def literature_status():
    try:
        is_healthy = await arxiv_client.health_check()
        return {
            "available": is_healthy,
            "arxiv_pulse_url": arxiv_client.base_url,
        }
    except Exception as e:
        return {
            "available": False,
            "arxiv_pulse_url": arxiv_client.base_url,
            "error": str(e),
        }


@router.get("/search", response_model=LiteratureResponse)
async def search_literature(
    q: str = Query(..., min_length=1, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    try:
        result = await arxiv_client.search_papers(query=q, page=page, page_size=page_size)
        return LiteratureResponse(success=True, data=result)
    except Exception as e:
        return LiteratureResponse(success=False, error=str(e))


@router.get("/recent", response_model=LiteratureResponse)
async def get_recent_literature(
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        result = await arxiv_client.get_recent_papers(days=days, limit=limit)
        return LiteratureResponse(success=True, data=result)
    except Exception as e:
        return LiteratureResponse(success=False, error=str(e))


@router.get("/paper/{arxiv_id}", response_model=LiteratureResponse)
async def get_paper_by_arxiv_id(arxiv_id: str):
    try:
        result = await arxiv_client.get_paper_by_arxiv_id(arxiv_id)
        return LiteratureResponse(success=True, data=result)
    except Exception as e:
        return LiteratureResponse(success=False, error=str(e))


class InsertCitationRequest(BaseModel):
    arxiv_id: str
    authors: list[str] | None = None
    title: str | None = None
    year: str | None = None


@router.post("/citation")
async def generate_citation(request: InsertCitationRequest):
    cite_key = request.arxiv_id.replace(".", "_")

    bibtex = f"@article{{{cite_key},\n"
    if request.title:
        bibtex += f"  title={{{request.title}}},\n"
    if request.authors and len(request.authors) > 0:
        authors_str = " and ".join(request.authors[:3])
        if len(request.authors) > 3:
            authors_str += " and others"
        bibtex += f"  author={{{authors_str}}},\n"
    if request.year:
        bibtex += f"  year={{{request.year}}},\n"
    bibtex += f"  eprint={{{request.arxiv_id}}},\n"
    bibtex += "  archivePrefix={arXiv}\n}"

    return {
        "cite_key": cite_key,
        "citation": f"\\cite{{{cite_key}}}",
        "bibtex": bibtex,
    }
