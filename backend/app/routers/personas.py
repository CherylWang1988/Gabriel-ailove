from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.persona import Persona
from app.schemas.persona import PersonaOut

router = APIRouter(prefix="/api/personas", tags=["personas"])


@router.get("", response_model=list[PersonaOut])
async def list_personas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Persona).order_by(Persona.created_at))
    return result.scalars().all()


@router.get("/{persona_id}", response_model=PersonaOut)
async def get_persona(persona_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Persona).where(Persona.id == persona_id))
    persona = result.scalar_one_or_none()
    if not persona:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona
