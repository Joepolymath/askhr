"""Split Sections into overlapping, token-bounded chunks.

Strategy:
1. Never merge across sections: a chunk belongs to exactly one heading (and,
   for PDFs, one page), so its citation is precise.
2. Inside a section, pack whole paragraphs; if a paragraph is too long, split
   it into sentences; if a sentence is still too long, split on tokens.
3. Each new chunk starts with ~OVERLAP tokens from the end of the previous one
   so facts that straddle a boundary are still retrievable.
"""
import re
from dataclasses import dataclass

import tiktoken

from app.ingestion.parse import Section

TARGET_TOKENS = 650
MAX_TOKENS = 800
OVERLAP_TOKENS = 100

_enc = tiktoken.get_encoding("cl100k_base")
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")


def count_tokens(text: str) -> int:
    return len(_enc.encode(text))


@dataclass
class ChunkData:
    index: int
    text: str
    section: str | None
    page: int | None
    token_count: int

    def embed_text(self, title: str) -> str:
        """Title and heading are prepended so an isolated chunk like
        "except during probation..." still carries what it is about."""
        header = f"{title} — {self.section}" if self.section else title
        return f"{header}\n\n{self.text}"


def _units(paragraph: str) -> list[str]:
    """Break a paragraph into pieces no longer than MAX_TOKENS."""
    if count_tokens(paragraph) <= MAX_TOKENS:
        return [paragraph]
    out: list[str] = []
    for sentence in _SENTENCE.split(paragraph):
        tokens = _enc.encode(sentence)
        if len(tokens) <= MAX_TOKENS:
            out.append(sentence)
        else:
            out.extend(_enc.decode(tokens[i : i + TARGET_TOKENS]) for i in range(0, len(tokens), TARGET_TOKENS))
    return out


def _overlap_tail(units: list[str]) -> list[str]:
    """Trailing units (or a token tail) totalling about OVERLAP_TOKENS."""
    tail: list[str] = []
    total = 0
    for unit in reversed(units):
        n = count_tokens(unit)
        if total + n > OVERLAP_TOKENS:
            break
        tail.insert(0, unit)
        total += n
    if not tail and units:
        tokens = _enc.encode(units[-1])
        tail = [_enc.decode(tokens[-OVERLAP_TOKENS:])]
    return tail


def chunk_section(section: Section) -> list[tuple[str, int]]:
    units = [u for p in section.paragraphs for u in _units(p)]
    chunks: list[tuple[str, int]] = []
    current: list[str] = []
    current_tokens = 0
    fresh = 0  # units in `current` that are new (not overlap)

    for unit in units:
        n = count_tokens(unit)
        if current and current_tokens + n > TARGET_TOKENS and fresh:
            text = "\n\n".join(current)
            chunks.append((text, count_tokens(text)))
            current = _overlap_tail(current)
            current_tokens = sum(count_tokens(u) for u in current)
            fresh = 0
        current.append(unit)
        current_tokens += n
        fresh += 1

    if current and fresh:
        text = "\n\n".join(current)
        chunks.append((text, count_tokens(text)))
    return chunks


def chunk_sections(sections: list[Section]) -> list[ChunkData]:
    out: list[ChunkData] = []
    for section in sections:
        for text, tokens in chunk_section(section):
            out.append(ChunkData(len(out), text, section.heading, section.page, tokens))
    return out
