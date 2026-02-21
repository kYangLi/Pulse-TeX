from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pulse_tex.services.diagram_service import diagram_service

router = APIRouter(prefix="/diagram", tags=["diagram"])


class RefineSketchRequest(BaseModel):
    sketch_svg: str
    description: str
    style: str = "nature"
    context: str | None = None
    previous_iterations: list[str] | None = None


class GenerateFromTextRequest(BaseModel):
    description: str
    style: str = "nature"
    diagram_type: str = "flowchart"
    context: str | None = None


class IterateDesignRequest(BaseModel):
    current_svg: str
    feedback: str
    style: str = "nature"


class SvgToTikzRequest(BaseModel):
    svg: str
    description: str | None = None


class DiagramResponse(BaseModel):
    success: bool
    data: dict | None = None
    error: str | None = None


@router.get("/styles")
async def get_styles():
    return {
        "styles": diagram_service.get_available_styles(),
        "diagram_types": diagram_service.get_diagram_types(),
    }


@router.post("/refine", response_model=DiagramResponse)
async def refine_sketch(request: RefineSketchRequest):
    if not diagram_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await diagram_service.refine_sketch(
            sketch_svg=request.sketch_svg,
            description=request.description,
            style=request.style,
            context=request.context,
            previous_iterations=request.previous_iterations,
        )
        return DiagramResponse(success=True, data=result)
    except Exception as e:
        return DiagramResponse(success=False, error=str(e))


@router.post("/generate", response_model=DiagramResponse)
async def generate_from_text(request: GenerateFromTextRequest):
    if not diagram_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await diagram_service.generate_from_text(
            description=request.description,
            style=request.style,
            diagram_type=request.diagram_type,
            context=request.context,
        )
        return DiagramResponse(success=True, data=result)
    except Exception as e:
        return DiagramResponse(success=False, error=str(e))


@router.post("/iterate", response_model=DiagramResponse)
async def iterate_design(request: IterateDesignRequest):
    if not diagram_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await diagram_service.iterate_design(
            current_svg=request.current_svg,
            feedback=request.feedback,
            style=request.style,
        )
        return DiagramResponse(success=True, data=result)
    except Exception as e:
        return DiagramResponse(success=False, error=str(e))


@router.post("/svg-to-tikz", response_model=DiagramResponse)
async def svg_to_tikz(request: SvgToTikzRequest):
    if not diagram_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        tikz = await diagram_service.svg_to_tikz(
            svg=request.svg,
            description=request.description,
        )
        return DiagramResponse(success=True, data={"tikz": tikz})
    except Exception as e:
        return DiagramResponse(success=False, error=str(e))
