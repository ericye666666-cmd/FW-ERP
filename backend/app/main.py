from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Phase 1 retail operations backend for warehouse, transfer, store receiving, and sales.",
)


@app.middleware("http")
async def disable_cache_for_app(request: Request, call_next):
    response = await call_next(request)
    if (
        request.url.path.startswith("/app")
        or request.url.path.startswith("/admin")
        or request.url.path.startswith("/legacy-app")
        or request.url.path.startswith("/api/")
    ):
        response.headers["Cache-Control"] = "no-store"
    return response

app.include_router(router, prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/app/")


if settings.frontend_dir.exists():
    app.mount("/app", StaticFiles(directory=str(settings.frontend_dir), html=True), name="app")
    app.mount("/legacy-app", StaticFiles(directory=str(settings.frontend_dir), html=True), name="legacy-app")

if settings.react_frontend_dir.exists():
    @app.get("/admin", include_in_schema=False)
    @app.get("/admin/{full_path:path}", include_in_schema=False)
    def admin_spa(full_path: str = "") -> FileResponse:
        dist_dir = settings.react_frontend_dir.resolve()
        normalized_path = str(full_path or "").lstrip("/")
        candidate = (dist_dir / normalized_path).resolve() if normalized_path else dist_dir / "index.html"
        if normalized_path and candidate.is_file() and dist_dir in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(dist_dir / "index.html")
