# syntax=docker/dockerfile:1

# Builds the FastAPI backend into a small runtime image using `uv` (the
# project's own dependency manager, see pyproject.toml/uv.lock) so the image
# resolves the exact same locked versions as local dev.
#
# Two stages: `builder` resolves/installs dependencies into a venv using the
# lockfile (cached separately from the app source so `uv sync` isn't re-run
# on every code change); `runtime` copies just the venv + app into a slim,
# non-root final image. No dev dependencies (pytest/ruff) ship in the image.

FROM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.9.6 /uv /uvx /usr/local/bin/

WORKDIR /app

# Install dependencies first, from the lockfile only, so this layer stays
# cached across changes to application code (only pyproject.toml/uv.lock
# invalidate it).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Now add the application code and install it (no-op for deps, already done).
COPY app ./app
RUN uv sync --frozen --no-dev


FROM python:3.11-slim AS runtime

RUN useradd --create-home --uid 1000 appuser
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/app /app/app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

USER appuser

# Matches BACKEND_PORT default in app/config.py; override the published
# port via docker-compose/host mapping if BACKEND_PORT is changed.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
