"""Parse LLM multi-message responses with layered fallbacks."""

import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

MIN_MESSAGE_LENGTH = 2
MAX_MESSAGES = 7


def parse_llm_response(raw: str) -> list[str]:
    """Parse an LLM response into a list of message strings.

    Layered strategy (in priority order):
    1. Direct JSON array parse
    2. Strip markdown code fence, then JSON parse
    3. Extract JSON array from mixed text
    4. Split by sentence-ending punctuation
    5. Return the raw text as a single message (last resort)

    Each strategy logs which level it used so operators can gauge prompt
    compliance over time.
    """
    raw = raw.strip()
    if not raw:
        return [raw]

    # ── Strategy 1: direct JSON parse ──
    messages = _try_json_parse(raw)
    if messages is not None:
        logger.debug("parse_llm_response: strategy=direct_json parts=%d", len(messages))
        return messages

    # ── Strategy 2: strip markdown fence, then retry JSON ──
    stripped = _strip_markdown_fence(raw)
    if stripped != raw:
        messages = _try_json_parse(stripped)
        if messages is not None:
            logger.debug("parse_llm_response: strategy=strip_fence parts=%d", len(messages))
            return messages

    # ── Strategy 3: find JSON array inside mixed text ──
    messages = _extract_json_array(raw)
    if messages is not None:
        logger.debug("parse_llm_response: strategy=extracted_json parts=%d", len(messages))
        return messages

    # ── Strategy 4: split by sentence-ending punctuation ──
    parts = [p.strip() for p in re.split(r'(?<=[。！？.!?\n])', raw) if p.strip() and len(p.strip()) >= MIN_MESSAGE_LENGTH]
    if parts:
        logger.debug("parse_llm_response: strategy=sentence_split parts=%d", len(parts))
        return parts[:MAX_MESSAGES]

    # ── Strategy 5: raw fallback ──
    logger.warning("parse_llm_response: strategy=raw_fallback raw_len=%d", len(raw))
    return [raw]


# ── internal helpers ────────────────────────────────────────────

def _try_json_parse(text: str) -> Optional[list[str]]:
    """Return a validated list if *text* is a JSON array of strings."""
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return _validate_parts(data)
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _strip_markdown_fence(text: str) -> str:
    """Remove a leading/trailing ```json / ``` block."""
    if not text.startswith("```"):
        return text
    lines = text.split("\n")
    # Find content between first and last fence lines
    start = next((i for i, line in enumerate(lines) if line.startswith("```")), None)
    end = next((i for i in range(len(lines) - 1, -1, -1) if lines[i].startswith("```")), None)
    if start is not None and end is not None and start < end:
        return "\n".join(lines[start + 1 : end]).strip()
    # Single fence line — strip first line only
    body = text.split("\n", 1)
    if len(body) > 1:
        inner = body[1]
        if inner.endswith("```"):
            inner = inner[:-3]
        return inner.strip()
    return text


def _extract_json_array(text: str) -> Optional[list[str]]:
    """Search for `[ ... ]` in *text* and parse it."""
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, list):
                return _validate_parts(data)
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def _validate_parts(items: list) -> Optional[list[str]]:
    """Filter and enforce limits on message parts."""
    valid = []
    for item in items[:MAX_MESSAGES]:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if len(text) >= MIN_MESSAGE_LENGTH:
            valid.append(text)
    return valid if valid else None
