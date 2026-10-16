FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# Install dependencies first (cached layer), using a stub package so the
# editable install succeeds before the real source is copied in.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install --no-cache-dir -e ".[dev]"
COPY . .

EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
