from app.config import Settings
from app.persistence.in_memory import InMemoryRepository
from app.persistence.postgres import PostgresRepository
from app.persistence.repository import SessionRepository

__all__ = ["SessionRepository", "get_repository"]


def get_repository(settings: Settings) -> SessionRepository:
    if settings.use_mock_providers or not settings.database_url:
        return InMemoryRepository()
    return PostgresRepository(settings.database_url)
