from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="Science Aggregator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL_LOCAL") or os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/science")
engine = create_engine(DATABASE_URL)


def build_where(year=None, nioktr_type=None, search=None):
    """
    Build WHERE clause. Search supports comma-separated terms — each term
    is matched with OR across name, annotation, keyword_list.
    Example: "климат, нейросети" → finds projects mentioning климат OR нейросети.
    """
    conditions = []
    params = {}

    if year:
        conditions.append("year = :year")
        params["year"] = year

    if nioktr_type:
        conditions.append("nioktr_types ILIKE :nioktr_type")
        params["nioktr_type"] = f"%{nioktr_type}%"

    if search:
        terms = [t.strip() for t in search.split(",") if t.strip()]
        if terms:
            term_conds = []
            for idx, term in enumerate(terms):
                key = f"search_{idx}"
                term_conds.append(
                    f"(name ILIKE :{key} OR annotation ILIKE :{key} OR keyword_list ILIKE :{key})"
                )
                params[key] = f"%{term}%"
            # Join multiple terms with OR
            conditions.append("(" + " OR ".join(term_conds) + ")")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params


def add_year_range(where: str, params: dict):
    if where:
        return where + " AND year BETWEEN 2019 AND 2027", params
    return "WHERE year BETWEEN 2019 AND 2027", params


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/stats")
def get_stats(
    year: int = None,
    nioktr_type: str = None,
    search: str = None,
):
    where, params = build_where(year, nioktr_type, search)
    where_no_year, params_no_year = build_where(None, nioktr_type, search)
    where_year, params_year = add_year_range(where_no_year, dict(params_no_year))

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM projects {where}"), params
        ).scalar()

        total_budget = conn.execute(
            text(f"SELECT COALESCE(SUM(budget_total_thousands), 0) / 1000000.0 FROM projects {where}"),
            params
        ).scalar()

        institutions = conn.execute(
            text(f'SELECT COUNT(DISTINCT "executor.name") FROM projects {where}'),
            params
        ).scalar()

        by_year = conn.execute(text(f"""
            SELECT year, COUNT(*) as count
            FROM projects {where_year}
            GROUP BY year ORDER BY year
        """), params_year).fetchall()

        inst_filter = 'AND "executor.name" IS NOT NULL' if where else 'WHERE "executor.name" IS NOT NULL'
        type_filter = "AND nioktr_types IS NOT NULL" if where else "WHERE nioktr_types IS NOT NULL"

        top_institutions = conn.execute(text(f"""
            SELECT "executor.name" as name, COUNT(*) as projects
            FROM projects {where}
            {inst_filter}
            GROUP BY "executor.name"
            ORDER BY projects DESC LIMIT 10
        """), params).fetchall()

        by_type = conn.execute(text(f"""
            SELECT nioktr_types, COUNT(*) as count
            FROM projects {where}
            {type_filter}
            GROUP BY nioktr_types ORDER BY count DESC LIMIT 8
        """), params).fetchall()

    return {
        "total_projects": total,
        "total_budget_billions": round(float(total_budget or 0), 1),
        "total_institutions": institutions,
        "by_year": [{"year": int(r[0]), "count": int(r[1])} for r in by_year],
        "top_institutions": [{"name": r[0], "projects": int(r[1])} for r in top_institutions],
        "by_type": [{"type": r[0], "count": int(r[1])} for r in by_type],
    }


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
    where, params = build_where(year, nioktr_type, search)

    if institution:
        inst_cond = '"executor.name" ILIKE :institution'
        params["institution"] = f"%{institution}%"
        where = (where + f" AND {inst_cond}") if where else f"WHERE {inst_cond}"

    with engine.connect() as conn:
        total = conn.execute(text(f"SELECT COUNT(*) FROM projects {where}"), params).scalar()
        rows = conn.execute(text(f"""
            SELECT
                registration_number, name, annotation,
                "executor.name"  AS institution,
                "executor.okogu" AS ministry,
                year, start_date, end_date,
                nioktr_types, budget_total_thousands,
                supervisor_full_name, keyword_list,
                rubrics, stages_count, reports_number
            FROM projects {where}
            ORDER BY year DESC NULLS LAST, registration_number
            LIMIT :limit OFFSET :offset
        """), {**params, "limit": limit, "offset": offset}).fetchall()

    return {
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
        "results": [dict(r._mapping) for r in rows],
    }


@app.get("/api/map-data")
def get_map_data():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                "executor.name"  AS institution,
                "executor.ogrn"  AS ogrn,
                "executor.okogu" AS ministry,
                COUNT(*)         AS projects,
                SUM(budget_total_thousands) AS total_budget
            FROM projects
            WHERE "executor.name" IS NOT NULL
            GROUP BY "executor.name", "executor.ogrn", "executor.okogu"
            ORDER BY projects DESC
        """)).fetchall()
    return [dict(r._mapping) for r in rows]
