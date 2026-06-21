from __future__ import annotations
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from .config import settings
from .date_ranges import resolve_date_range
from .dependencies import Container, get_container
from .schemas import DateRangeConfig, ScheduleCreate, TemplateCreate, TemplateUpdate
from .scheduling import ScheduleService
from .security import verify_download_token


class Actor:
    def __init__(self, tenant_id: str, user_id: str, role: str): self.tenant_id, self.user_id, self.role = tenant_id, user_id, role


def actor(x_tenant_id: str = Header(...), x_user_id: str = Header(...), x_user_role: str = Header("compliance")) -> Actor:
    if x_user_role.lower() not in {"compliance", "admin"}: raise HTTPException(403, "Compliance or Admin role required")
    return Actor(x_tenant_id, x_user_id, x_user_role)


_stop = threading.Event()
def _scheduler_loop(container: Container):
    while not _stop.wait(settings.scheduler_poll_seconds):
        try: container.worker.tick()
        except Exception: pass  # production adapter should emit structured operational telemetry


@asynccontextmanager
async def lifespan(app: FastAPI):
    container = get_container(); thread = threading.Thread(target=_scheduler_loop, args=(container,), daemon=True); thread.start()
    yield
    _stop.set()


app = FastAPI(title="Scheduled Compliance Reports", version="0.1.0", lifespan=lifespan)
static = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static), name="static")


@app.get("/", response_class=HTMLResponse)
def index(): return (static / "index.html").read_text()


@app.post("/api/report-templates", status_code=201)
def create_template(payload: TemplateCreate, who: Actor = Depends(actor), c: Container = Depends(get_container)):
    return c.templates.create(who.tenant_id, who.user_id, payload)


@app.get("/api/report-templates")
def list_templates(who: Actor = Depends(actor), c: Container = Depends(get_container)): return c.templates.list(who.tenant_id)


@app.get("/api/report-templates/{template_id}")
def get_template(template_id: str, who: Actor = Depends(actor), c: Container = Depends(get_container)): return c.templates.get(who.tenant_id, template_id)


@app.patch("/api/report-templates/{template_id}")
def update_template(template_id: str, payload: TemplateUpdate, who: Actor = Depends(actor), c: Container = Depends(get_container)): return c.templates.update(who.tenant_id, who.user_id, template_id, payload)


@app.delete("/api/report-templates/{template_id}", status_code=204)
def delete_template(template_id: str, who: Actor = Depends(actor), c: Container = Depends(get_container)):
    c.templates.delete(who.tenant_id, who.user_id, template_id); return Response(status_code=204)


@app.put("/api/report-templates/{template_id}/schedule")
def save_schedule(template_id: str, payload: ScheduleCreate, who: Actor = Depends(actor), c: Container = Depends(get_container)):
    return ScheduleService(c.db, c.audit).upsert(who.tenant_id, who.user_id, template_id, payload)


@app.post("/api/report-templates/{template_id}/run", status_code=202)
def run_template(template_id: str, timezone_name: str, who: Actor = Depends(actor), c: Container = Depends(get_container)):
    template = c.templates.get(who.tenant_id, template_id)
    resolved = resolve_date_range(DateRangeConfig.model_validate(template["date_range"]), timezone_name)
    report_id, created = c.generator.reserve(who.tenant_id, template_id, f"{resolved['start']}:{resolved['end']}")
    if created: c.worker.submit(who.tenant_id, template_id, report_id, timezone_name)
    return {"report_id": report_id, "enqueued": created}


@app.get("/api/reports/{report_id}")
def report_details(report_id: str, who: Actor = Depends(actor), c: Container = Depends(get_container)):
    run = c.db.query_one("SELECT * FROM report_runs WHERE id=? AND tenant_id=?", (report_id, who.tenant_id))
    if not run: raise HTTPException(404, "report not found")
    run["artifacts"] = c.db.query_all("SELECT id,format,row_count,file_size,sha256,generated_at,duration_ms,delivery_status_json,retain_until FROM report_artifacts WHERE report_id=?", (report_id,))
    return run


@app.get("/api/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: str, token: str = Query(...), who: Actor = Depends(actor), c: Container = Depends(get_container)):
    artifact = c.db.query_one("SELECT * FROM report_artifacts WHERE id=? AND tenant_id=?", (artifact_id, who.tenant_id))
    if not artifact: raise HTTPException(404, "artifact not found")
    if not verify_download_token(token, artifact_id, settings.signing_key): raise HTTPException(403, "download link is invalid or expired")
    content = c.store.get(artifact["storage_key"])
    c.audit.log(who.tenant_id, who.user_id, "report.download", report_id=artifact["report_id"], template_id=artifact["template_id"], parameters={"artifact_id": artifact_id})
    media = "application/pdf" if artifact["format"] == "pdf" else "text/csv; charset=utf-8"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="report.{artifact["format"]}"'})


@app.get("/api/reports/{report_id}/download.csv")
def download_report_csv(report_id: str, token: str = Query(...), who: Actor = Depends(actor), c: Container = Depends(get_container)):
    if not verify_download_token(token, report_id, settings.signing_key): raise HTTPException(403, "download link is invalid or expired")
    artifact = c.db.query_one("SELECT * FROM report_artifacts WHERE report_id=? AND tenant_id=? AND format='csv'", (report_id, who.tenant_id))
    if not artifact: raise HTTPException(404, "CSV artifact not found")
    content = c.store.get(artifact["storage_key"])
    c.audit.log(who.tenant_id, who.user_id, "report.download", report_id=report_id, template_id=artifact["template_id"], parameters={"artifact_id": artifact["id"], "format": "csv"})
    return Response(content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="report.csv"'})


@app.get("/api/audit")
def audit_log(who: Actor = Depends(actor), c: Container = Depends(get_container)): return c.audit.list(who.tenant_id)


@app.get("/api/notifications")
def notifications(who: Actor = Depends(actor), c: Container = Depends(get_container)):
    return c.db.query_all("SELECT * FROM notifications WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC", (who.tenant_id, who.user_id))


@app.get("/health")
def health(): return {"status": "ok"}
