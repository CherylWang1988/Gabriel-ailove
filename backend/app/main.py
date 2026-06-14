import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings, setup_logging
from app.database import async_session, engine, Base
from app.routers import personas, conversations, messages, users, health, push

setup_logging()
logger = logging.getLogger(__name__)


async def seed_personas():
    """Load persona definitions from backend/personas/ and seed into DB."""
    from app.models.persona import Persona

    personas_dir = os.path.join(os.path.dirname(__file__), "..", "personas")
    if not os.path.isdir(personas_dir):
        logger.warning("Personas directory not found: %s", personas_dir)
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
                if line.startswith("#"):
                    name = line.strip("# ").strip()
                elif line.strip() and not line.startswith("##") and not line.startswith("- "):
                    if not description:
                        description = line.strip()

            # Full prompt extraction
            prompt_start = content.find("## System Prompt")
            if prompt_start != -1:
                prompt_text = content[prompt_start + len("## System Prompt"):].strip()
                if prompt_text:
                    system_prompt = prompt_text

            # Determine persona type
            persona_type = (
                "scenario"
                if name.lower() in ("cuddle", "抱抱贴贴", "emotional-aid", "情绪急救")
                else "companion"
            )

            result = await db.execute(select(Persona).where(Persona.name == name))
            existing = result.scalar_one_or_none()
            if not existing:
                persona = Persona(
                    name=name,
                    description=description,
                    persona_type=persona_type,
                    system_prompt=system_prompt,
                    personality_traits={
                        "tone": "warm",
                        "style": "casual",
                        "quirks": "remembers details",
                    },
                )
                db.add(persona)
                logger.info("Seeded persona: %s (%s)", name, persona_type)

        await db.commit()
        logger.info("Persona seeding complete")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Gabriel API v%s...", app.version)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    await seed_personas()

    # Start APScheduler for proactive messaging
    from app.services.proactive_service import run_proactive_check
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_proactive_check, "interval", minutes=90, id="proactive_check")
    scheduler.start()
    logger.info("Scheduler started: proactive check every 90 min")

    yield

    scheduler.shutdown(wait=False)
    logger.info("Gabriel API shut down")


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
app.include_router(users.router)
app.include_router(health.router)
app.include_router(push.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
