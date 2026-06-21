from dataclasses import dataclass
import base64
import hashlib
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_path: Path = Path(os.getenv("REPORT_DATABASE_PATH", "data/reports.db"))
    artifact_path: Path = Path(os.getenv("REPORT_ARTIFACT_PATH", "data/artifacts"))
    platform_name: str = os.getenv("REPORT_PLATFORM_NAME", "Compliance Platform")
    base_url: str = os.getenv("REPORT_BASE_URL", "http://localhost:8000")
    worker_count: int = int(os.getenv("REPORT_WORKER_COUNT", "8"))
    max_tenant_jobs: int = int(os.getenv("REPORT_MAX_TENANT_JOBS", "5"))
    scheduler_poll_seconds: int = int(os.getenv("REPORT_SCHEDULER_POLL_SECONDS", "30"))

    @property
    def encryption_key(self) -> bytes:
        value = os.getenv("REPORT_ENCRYPTION_KEY")
        if value:
            key = base64.urlsafe_b64decode(value)
            if len(key) != 32:
                raise ValueError("REPORT_ENCRYPTION_KEY must decode to 32 bytes")
            return key
        # Development-only stable key. Production startup validation is documented.
        return hashlib.sha256(b"scheduled-reports-development-key").digest()

    @property
    def signing_key(self) -> bytes:
        return os.getenv("REPORT_SIGNING_KEY", "development-signing-key-change-me").encode()


settings = Settings()

