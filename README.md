# AskHR

An internal HR knowledge chatbot. HR uploads policies, handbooks and org documents; employees ask questions in plain language and get short answers **grounded only in those documents**, with clickable citations. When the answer isn't in the knowledge base, AskHR says so and points to HR instead of guessing.

> The sample data describes **Northwind Labs, a fictional company**. Replace it with your own documents before real use.

```
 Browser (React + Vite + Tailwind)
   │  /api/*  (Vite dev proxy → backend)
   ▼
 FastAPI ── upload ─► BackgroundTask: parse (thread) → chunk (thread) → embed (OpenAI) → store
   │
   └─ /api/chat ─► embed question → pgvector cosine search (active + ready docs only)
                   → prompt = rules + company info + people directory + top-k sources
                   → LLM (streamed via SSE) → citations + "I don't know" handling → chat_logs
   ▼
 PostgreSQL 16 + pgvector (documents, chunks[vector(1536), HNSW], people, company_info, chat_logs)
```

---

## Run it end to end (step by step)

**Prerequisites:** Docker Desktop (running), an OpenAI API key. Nothing else needs to be installed locally.

1. **Create your env file**
   ```bash
   cd askhr
   cp .env.example .env
   ```
   Edit `.env` and set at least:
   - `OPENAI_API_KEY=sk-...`
   - `ADMIN_PASSWORD=` a password for the HR admin login
   - `JWT_SECRET=` a long random string (`openssl rand -hex 32`)

   > `.env` is read when a container is **created**. If you edit it while the stack is running, apply it with `docker compose up -d backend` — `docker compose restart` does **not** pick up changes.

2. **Start the stack** (Postgres + backend + frontend)
   ```bash
   docker compose up --build
   ```
   Wait for `Uvicorn running on http://0.0.0.0:8000` and `VITE ... ready`. Database migrations run automatically when the backend starts.

3. **Check the backend is healthy** (new terminal)
   ```bash
   curl http://localhost:8000/api/health        # → {"status":"ok"}
   ```

4. **Load the sample data** (5 documents, 9 people with employee IDs, company info)
   ```bash
   docker compose exec backend python scripts/seed.py
   # --reset first wipes documents, people, chat history and company info (asks nothing, so be sure)
   ```
   You should see each document reported as `ready` with a chunk count.

5. **Use the employee chat** — open <http://localhost:5173>
   - Sign in with a work email + employee ID from the People directory. Sample employee: `chiamaka.obi@northwindlabs.example` / `NWL-0126`.
   - Click a starter question, e.g. *"What is the leave policy?"* — the answer streams in with numbered source chips; click a chip to see the document, section/page and snippet.
   - Try a question the docs don't cover, e.g. *"What is the office Wi-Fi password?"* — you get the standard "I don't know — please contact HR" reply.
   - Rate an answer with the thumbs up / down buttons.
   - Ask *"How many sick days do I get?"*: the sample Leave Policy (12 days) and older Employee Handbook (10 days) deliberately disagree, so the answer shows both sources side by side and flags it to HR.

6. **Use the admin dashboard** — open <http://localhost:5173/admin> and sign in with `ADMIN_PASSWORD`.
   - **Documents:** drag in a PDF/DOCX/TXT/MD file, set its title and category, click *Upload*. The status badge goes `processing` → `ready` (or `failed` with a reason). Upload a file with the title **Leave Policy** again to see the *"Replace the existing version?"* prompt; after confirming, the old version shows as inactive once the new one is ready. Toggle *Active* or *Delete* documents from the table.
   - **People:** the directory doubles as the sign-in list: employees sign in with their work email + employee ID. Add/edit people, remove access, or *Import CSV* (`name, role, email, employee_id[, department]`, matched by employee ID; try `backend/sample_docs/northwind-staff-oct-2026.csv`). "Who is the CTO?" is answered from this table.
   - **Company info:** company name, what it does, mission, and the HR contact shown when AskHR can't answer. Included with every question.
   - **Insights:** questions asked, answer rate and thumbs-up rate by period; knowledge-base gaps (unanswered questions grouped by wording, dismissable); documents that disagree; recent questions. Employee names are never stored with questions.

7. **Run the evaluation** (real providers, against the seeded data)
   ```bash
   docker compose exec backend python scripts/eval.py      # add -v to print every answer
   ```
   Prints a pass/fail table for `backend/eval/questions.yaml`; exits non-zero if anything fails.

8. **Run the automated tests** (fake LLM/embeddings, separate `askhr_test` database — no API key needed)
   ```bash
   docker compose exec backend pytest -q
   ```

9. **Stop / reset**
   ```bash
   docker compose down          # stop, keep data
   docker compose down -v       # stop and delete the database volume (full reset)
   ```

> If you change `db/init/` or need the test database recreated, run `docker compose down -v` first — Postgres only runs init scripts on an empty volume.

---

## Environment variables

All variables are documented in [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `askhr` | Database credentials used by compose |
| `DATABASE_URL` | derived in compose | Only needed when running the backend outside compose |
| `ADMIN_PASSWORD` | — (required) | HR admin login password |
| `JWT_SECRET` | — (required, ≥16 chars) | HS256 signing secret for admin tokens |
| `JWT_EXPIRE_HOURS` | `8` | Admin session length |
| `LLM_PROVIDER` | `openai` | `openai`, `anthropic` or `fake` |
| `LLM_MODEL` | `gpt-4.1-mini` | Chat model name for the chosen provider |
| `EMBEDDING_PROVIDER` | `openai` | `openai` or `fake` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `EMBEDDING_DIMENSIONS` | `1536` | Must match the `vector(1536)` column (checked at startup) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Provider keys. Never commit them. |
| `TOP_K` | `6` | Chunks retrieved per question |
| `SIMILARITY_THRESHOLD` | `0.30` | Minimum cosine similarity for a chunk to be used |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API |
| `HR_CONTACT` | `hr@northwindlabs.example` | Shown in the "I don't know" reply |

**Switching to Anthropic for chat:** set `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-sonnet-5-5` (or another Claude model) and `ANTHROPIC_API_KEY`. Embeddings stay on OpenAI.

---

## Data privacy

Document text (at upload time) and employee questions plus the retrieved document excerpts, people directory and company info (at chat time) are **sent to the configured LLM and embedding providers** (OpenAI by default). Do not upload documents you are not permitted to share with those providers. Questions, answers and employee names are stored in the `chat_logs` table for the Insights page.

---

## Design decisions

- **No RAG framework.** The pipeline is a few hundred lines in `backend/app/ingestion/` and `backend/app/rag/` so each step can be read and debugged.
- **Provider interface** (`app/providers/base.py`): two tiny protocols (`LLMProvider.stream`, `EmbeddingProvider.embed`) selected by env vars. A deterministic `fake` provider powers the tests.
- **Non-blocking ingestion:** upload returns `202 processing` immediately; a background task runs parsing/chunking in a worker thread (`asyncio.to_thread`) and embedding on the async client. Documents left in `processing` by a restart are marked `failed` on startup so nothing spins forever.
- **File validation by content:** magic bytes (`%PDF-`, DOCX zip with `word/document.xml`, valid UTF-8 for text), must agree with the extension; 20 MB limit enforced while reading.
- **Scanned PDFs:** fewer than ~20 extractable characters per page → `failed` with "No extractable text — scanned PDFs aren't supported yet."
- **Structure-aware chunking:** split on DOCX heading styles / Markdown headings / PDF pages + heuristic headings first; sub-split long sections to ~650 tokens (max 800) with ~100 tokens overlap. Sub-headings keep their parent path (`Annual Leave › Probation`). The embedded text is prefixed with `document title — section` so isolated chunks keep their context; the stored text is the raw chunk used for snippets.
- **Versioning:** one active version per title (case/space-insensitive). Uploading a duplicate title returns `409` and the UI asks to replace. The old version is deactivated **when the new one becomes ready**, not at upload time, so a failed replacement never leaves employees without the policy. Only `is_active AND status='ready'` documents are searched.
- **People directory & company info are structured context, not RAG:** they're always injected into the prompt, so role questions never depend on a name appearing in a retrieved chunk.
- **"I don't know" path:** the model must reply with an exact `NO_ANSWER` sentinel when the context doesn't answer the question; the server holds back the first few streamed characters to detect it and substitutes a standard reply (counted in Insights). If no chunk passes the similarity threshold, the LLM still runs but with only the directory and company info, so "Who is the CTO?" works while "What's the dental plan?" gets the standard reply. If there is no context at all, the LLM is skipped.
- **Citations:** sources are numbered `[1..k]` in the prompt; the response returns only the sources the answer actually cites.
- **Follow-ups:** the client sends the last 6 turns; retrieval embeds the previous user turn + the current question so "what about contractors?" still finds the right policy.
- **Auth is isolated** in `backend/app/auth/` (admin password → JWT; employee name from the browser) so SSO can replace it without touching the routers.
- **Prompt-injection hygiene:** context is wrapped in tags and the model is told it is reference data, not instructions.

---

## Project layout

```
backend/
  app/
    auth/        admin JWT + employee identity (swap for SSO here)
    providers/   OpenAI, Anthropic, fake
    ingestion/   validate → parse → chunk → pipeline (background)
    rag/         retrieval, prompt, chat orchestration (streaming)
    routers/     HTTP endpoints
  alembic/       migrations (pgvector extension, HNSW cosine index)
  sample_docs/   fictional Northwind Labs documents
  eval/          questions.yaml
  scripts/       seed.py, eval.py, make_sample_docs.py
  tests/         pytest
frontend/
  src/config.ts  product name + starter questions
  src/pages/     Chat, AdminLogin, admin/{Documents,People,Company,Insights}
```

To rename the product, change `PRODUCT_NAME` in `frontend/src/config.ts` and `backend/app/config.py`.

## Deployment

Not decided yet. What a production deployment will need:
- Managed PostgreSQL 16 with the `pgvector` extension (≥ 0.8).
- The backend container run with `alembic upgrade head` on release, with secrets (`ADMIN_PASSWORD`, `JWT_SECRET`, API keys) from a secrets manager, not files.
- The frontend built as static files (`npm run build`) and served behind the same domain as `/api` (or set `CORS_ORIGINS`).
- HTTPS, and ideally SSO in place of the shared admin password.
