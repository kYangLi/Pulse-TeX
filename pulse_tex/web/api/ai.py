from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pulse_tex.services.ai_assistant import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    context: str | None = None
    system_prompt: str | None = None


class PolishRequest(BaseModel):
    text: str
    style: str = "academic"


class TranslateRequest(BaseModel):
    text: str
    direction: str = "en"


class ExplainErrorRequest(BaseModel):
    log_content: str
    source_code: str | None = None


class GenerateTikZRequest(BaseModel):
    description: str


class GeneratePlotRequest(BaseModel):
    description: str
    data: str | None = None


class AIResponse(BaseModel):
    success: bool
    content: str
    error: str | None = None


@router.post("/chat", response_model=AIResponse)
async def chat(request: ChatRequest):
    if not ai_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await ai_service.chat(
            message=request.message,
            context=request.context,
            system_prompt=request.system_prompt,
        )
        return AIResponse(success=True, content=result)
    except Exception as e:
        return AIResponse(success=False, content="", error=str(e))


@router.post("/polish", response_model=AIResponse)
async def polish(request: PolishRequest):
    if not ai_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await ai_service.polish(text=request.text, style=request.style)
        return AIResponse(success=True, content=result)
    except Exception as e:
        return AIResponse(success=False, content="", error=str(e))


@router.post("/translate", response_model=AIResponse)
async def translate(request: TranslateRequest):
    if not ai_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await ai_service.translate(text=request.text, direction=request.direction)
        return AIResponse(success=True, content=result)
    except Exception as e:
        return AIResponse(success=False, content="", error=str(e))


@router.post("/explain-error", response_model=AIResponse)
async def explain_error(request: ExplainErrorRequest):
    if not ai_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await ai_service.explain_error(
            log_content=request.log_content,
            source_code=request.source_code,
        )
        return AIResponse(success=True, content=result)
    except Exception as e:
        return AIResponse(success=False, content="", error=str(e))


@router.post("/generate-tikz", response_model=AIResponse)
async def generate_tikz(request: GenerateTikZRequest):
    if not ai_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await ai_service.generate_tikz(description=request.description)
        return AIResponse(success=True, content=result)
    except Exception as e:
        return AIResponse(success=False, content="", error=str(e))


@router.post("/generate-plot", response_model=AIResponse)
async def generate_plot(request: GeneratePlotRequest):
    if not ai_service.is_configured:
        raise HTTPException(status_code=503, detail="AI service not configured")
    try:
        result = await ai_service.generate_plot(
            description=request.description,
            data=request.data,
        )
        return AIResponse(success=True, content=result)
    except Exception as e:
        return AIResponse(success=False, content="", error=str(e))


@router.get("/status")
async def ai_status():
    return {
        "configured": ai_service.is_configured,
        "model": ai_service.model if ai_service.is_configured else None,
    }
