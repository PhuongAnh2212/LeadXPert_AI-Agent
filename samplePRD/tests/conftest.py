from pathlib import Path
import pytest
from app.artifacts import EncryptedArtifactStore
from app.audit import AuditService
from app.db import Database
from app.emailer import EmailService
from app.generation import ReportGenerator
from app.search import MemorySearchProvider
from app.templates import TemplateService
from app.worker import ReportWorker


@pytest.fixture
def stack(tmp_path):
    db = Database(tmp_path / "test.db"); audit = AuditService(db); templates = TemplateService(db, audit)
    store = EncryptedArtifactStore(tmp_path / "artifacts", b"x" * 32); email = EmailService(); search = MemorySearchProvider([])
    generator = ReportGenerator(db, templates, search, store, email, audit, "https://reports.test", b"signing-key")
    worker = ReportWorker(db, templates, generator, audit, workers=2, tenant_limit=5, sleeper=lambda _: None)
    return {"db": db, "audit": audit, "templates": templates, "store": store, "email": email, "search": search, "generator": generator, "worker": worker}

