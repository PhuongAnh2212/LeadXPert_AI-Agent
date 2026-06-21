from __future__ import annotations
from functools import lru_cache
from .artifacts import EncryptedArtifactStore
from .audit import AuditService
from .config import settings
from .db import Database
from .emailer import EmailService
from .generation import ReportGenerator
from .search import EmptySearchProvider
from .templates import TemplateService
from .worker import ReportWorker


class Container:
    def __init__(self):
        self.db = Database(settings.database_path)
        self.audit = AuditService(self.db)
        self.templates = TemplateService(self.db, self.audit)
        self.store = EncryptedArtifactStore(settings.artifact_path, settings.encryption_key)
        self.email = EmailService()
        self.search = EmptySearchProvider()
        self.generator = ReportGenerator(self.db, self.templates, self.search, self.store, self.email, self.audit, settings.base_url, settings.signing_key)
        self.worker = ReportWorker(self.db, self.templates, self.generator, self.audit, settings.worker_count, settings.max_tenant_jobs)


@lru_cache
def get_container() -> Container: return Container()
