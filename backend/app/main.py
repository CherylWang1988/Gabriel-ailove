import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.config import settings
from app.database import async_session, engine, Base
from app.routers import personas, conversations, messages


async def seed_personas():
    """Load persona definitions from backend/personas/ and seed into DB."""
    from app.models.persona import Persona

    personas_dir = os.path.join(os.path.dirname(__file__), "..", "personas")
    if not os.path.isdir(personas_dir):
        return

    async with async_session() as db:
        for filename in os.listdir(personas_dir):
            if not filename.endswith(".md"):
                continue
            filepath = os.path.join(personas_dir, filename)

            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            name = filename.replace(".md", "").capitalize()
            description = ""
            system_prompt = ""

            # Simple markdown parser
            for line in content.split("\n"):
                if line.startswith("## Description"):
                    continue
                if line.startswith("## System Prompt"):
                    continue
                if line.startswith("## Personality Traits"):
                    continue
                if line.startswith("#"):
                    name = line.strip("# ").strip()
                elif line.startswith("- "):
                    continue
                elif line.strip() and not line.startswith("##"):
                    if not description and not line.startswith("**"):
                        description = line.strip()
                    elif "你是" in line or "你" in line:
                        if not system_prompt:
                            system_prompt = line.strip()
                        else:
                            system_prompt += "\n" + line.strip()

            # Full prompt extraction
            prompt_start = content.find("## System Prompt")
            if prompt_start != -1:
                prompt_text = content[prompt_start + len("## System Prompt"):].strip()
                if prompt_text:
                    system_prompt = prompt_text

            # Check if persona exists
            result = await db.execute(select(Persona).where(Persona.name == name))
            existing = result.scalar_one_or_none()
            if not existing:
                persona = Persona(
                    name=name,
                    description=description,
                    system_prompt=system_prompt,
                    personality_traits={
                        "tone": "warm",
                        "style": "casual",
                        "quirks": "remembers details",
                    },
                )
                db.add(persona)

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure pgvector extension + tables + seed
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    await seed_personas()
    yield


app = FastAPI(title="Gabriel API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(personas.router)
app.include_router(conversations.router)
app.include_router(messages.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
