"""
Science Aggregator — backend/main.py

FastAPI application with 3 endpoints:
  GET /api/stats      — dashboard summary statistics
  GET /api/projects   — paginated project list with filters
  GET /api/map-data   — aggregated data per institution for the map
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

# Load .env — works both locally and inside Docker
load_dotenv()

app = FastAPI(title="Science Aggregator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inside Docker: DATABASE_URL uses 'db' as host (docker service name)
# Locally: use DATABASE_URL_LOCAL with 'localhost'
DATABASE_URL = os.getenv("DATABASE_URL_LOCAL") or os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/science")
engine = create_engine(DATABASE_URL)


@app.get("/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────
# GET /api/stats
# ─────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    with engine.connect() as conn:

        total = conn.execute(text(
            "SELECT COUNT(*) FROM projects"
        )).scalar()

        total_budget = conn.execute(text(
            "SELECT SUM(budget_total_thousands) / 1000000.0 FROM projects"
        )).scalar()

        institutions = conn.execute(text(
            'SELECT COUNT(DISTINCT "executor.name") FROM projects'
        )).scalar()

        by_year = conn.execute(text("""
            SELECT year, COUNT(*) as count
            FROM projects
            WHERE year BETWEEN 2019 AND 2027
            GROUP BY year
            ORDER BY year
        """)).fetchall()

        top_institutions = conn.execute(text("""
            SELECT "executor.name" as name, COUNT(*) as projects
            FROM projects
            WHERE "executor.name" IS NOT NULL
            GROUP BY "executor.name"
            ORDER BY projects DESC
            LIMIT 10
        """)).fetchall()

        by_type = conn.execute(text("""
            SELECT nioktr_types, COUNT(*) as count
            FROM projects
            WHERE nioktr_types IS NOT NULL
            GROUP BY nioktr_types
            ORDER BY count DESC
            LIMIT 10
        """)).fetchall()

    return {
        "total_projects": total,
        "total_budget_billions": round(float(total_budget or 0), 1),
        "total_institutions": institutions,
        "by_year": [{"year": int(r[0]), "count": int(r[1])} for r in by_year],
        "top_institutions": [{"name": r[0], "projects": int(r[1])} for r in top_institutions],
        "by_type": [{"type": r[0], "count": int(r[1])} for r in by_type],
    }


# ─────────────────────────────────────────────
# GET /api/projects
# ─────────────────────────────────────────────
@app.get("/api/projects")
def get_projects(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    year: int = None,
    nioktr_type: str = None,
    institution: str = None,
    search: str = None,
):
    offset = (page - 1) * limit
    conditions = []
    params = {}

    if year:
        conditions.append("year = :year")
        params["year"] = year
    if nioktr_type:
        conditions.append("nioktr_types ILIKE :nioktr_type")
        params["nioktr_type"] = f"%{nioktr_type}%"
    if institution:
        conditions.append('"executor.name" ILIKE :institution')
        params["institution"] = f"%{institution}%"
    if search:
        conditions.append(
            "(name ILIKE :search OR annotation ILIKE :search OR keyword_list ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM projects {where}"), params
        ).scalar()

        rows = conn.execute(text(f"""
            SELECT
                registration_number,
                name,
                "executor.name"        as institution,
                year,
                nioktr_types,
                budget_total_thousands,
                supervisor_full_name,
                keyword_list
            FROM projects
            {where}
            ORDER BY year DESC, registration_number
            LIMIT :limit OFFSET :offset
        """), {**params, "limit": limit, "offset": offset}).fetchall()

    return {
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
        "results": [dict(r._mapping) for r in rows],
    }


# ─────────────────────────────────────────────
# GET /api/map-data
# ─────────────────────────────────────────────
@app.get("/api/map-data")
def get_map_data():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                "executor.name"  as institution,
                "executor.ogrn"  as ogrn,
                "executor.okogu" as ministry,
                COUNT(*)         as projects,
                SUM(budget_total_thousands) as total_budget
            FROM projects
            WHERE "executor.name" IS NOT NULL
            GROUP BY "executor.name", "executor.ogrn", "executor.okogu"
            ORDER BY projects DESC
        """)).fetchall()

    return [dict(r._mapping) for r in rows]