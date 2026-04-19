"""
Science Aggregator — backend/main.py

Эндпоинты:
  GET    /health
  GET    /api/stats
  GET    /api/projects                         — список с пагинацией
  GET    /api/projects/{registration_number}   — детальная карточка (/info)
  POST   /api/projects                         — добавить проект (/add)
  PUT    /api/projects/{registration_number}   — обновить проект
  DELETE /api/projects/{registration_number}   — удалить проект
  GET    /api/budget/stats                     — аналитика бюджетов
  GET    /api/search/semantic                  — поиск через pgvector
  GET    /api/agent                            — RAG агент (Ollama)
  GET    /api/graph                            — граф связей
  GET    /api/map-data                         — агрегация по организациям
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os
import httpx
import re as _re

load_dotenv()

app = FastAPI(title="Science Aggregator API")

# Убирает типовые юридические префиксы из названий российских организаций.
# "ФГБОУ ВО «МГУ имени Ломоносова»" → "МГУ имени Ломоносова"
_ORG_STRIP = _re.compile(
    r'^\s*(?:'
    r'(?:фг[абвк](?:оу|ун|бун|уп)?\s+(?:во|дпо|нпо|впо|спо|ниц)?\s*)|'
    r'(?:(?:федерал[ьн]+ое|муниципальн[оеый]+)\s+)?'
    r'государственн[оеый]+\s+'
    r'(?:(?:бюджетн[оеый]+|автономн[оеый]+|казённ[оеый]+|казенн[оеый]+)\s+)?'
    r'(?:образовательн[оеый]+\s+)?'
    r'(?:научн[оеый]+\s+)?'
    r'(?:(?:учреждение|предприятие|учебн[оеый]+\s+заведение)\s+)?'
    r'(?:высшего\s+(?:профессионального\s+)?образования\s+)?'
    r'(?:дополнительного\s+(?:профессионального\s+)?образования\s+)?'
    r')'
    r'[«"\'«\u201c\u201e]?\s*',
    _re.IGNORECASE,
)

def _clean_org_label(name: str) -> str:
    """Strip boilerplate legal prefix, return meaningful short name."""
    if not name:
        return ""
    cleaned = _ORG_STRIP.sub("", name).strip().strip('«»"\'«»\u201c\u201d\u201e\u201f').strip()
    return cleaned if len(cleaned) > 4 else name




app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv(
    "DATABASE_URL_LOCAL", "postgresql://user:password@localhost:5432/science"
)
OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

engine = create_engine(DATABASE_URL)

# fastembed грузится лениво при первом запросе к /search/semantic или /agent.
# Тот же checkpoint что в embed.py → эмбеддинги совместимы.
# fastembed использует ONNX Runtime (~100MB) вместо torch (~2GB).
_embed_model = None

def get_embed_model():
    global _embed_model
    if _embed_model is None:
        from fastembed import TextEmbedding
        _embed_model = TextEmbedding(
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
    return _embed_model


def _encode(model, text: str) -> list:
    """Совместимый хелпер: fastembed.embed возвращает генератор numpy-векторов."""
    return list(model.embed([text]))[0].tolist()


# ── Pydantic схема для POST / PUT ──────────────────────────────────────────────

class ProjectCreate(BaseModel):
    registration_number: str
    name: str
    annotation: Optional[str]              = None
    year: Optional[int]                    = None
    nioktr_types: Optional[str]            = None
    budget_total_thousands: Optional[float] = None
    executor_name: Optional[str]           = None
    supervisor_full_name: Optional[str]    = None
    keyword_list: Optional[str]            = None


# ── Вспомогательные функции ────────────────────────────────────────────────────

def build_where(year=None, nioktr_type=None, search=None):
    """
    Строит WHERE clause.
    search поддерживает OR через запятую:
      "нейросети, климат" → находит проекты где в name/annotation/keyword_list
      упоминается нейросети ИЛИ климат.
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
            conditions.append("(" + " OR ".join(term_conds) + ")")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params


def add_year_range(where: str, params: dict):
    """Добавляет ограничение по диапазону лет для графика by_year."""
    if where:
        return where + " AND year BETWEEN 2019 AND 2027", params
    return "WHERE year BETWEEN 2019 AND 2027", params


def embeddings_ready(conn) -> bool:
    """Проверяет что таблица эмбеддингов существует и заполнена."""
    exists = conn.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'project_embeddings'
        )
    """)).scalar()
    if not exists:
        return False
    return conn.execute(text("SELECT COUNT(*) FROM project_embeddings")).scalar() > 0


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Stats ──────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(
    year: int = None,
    nioktr_type: str = None,
    search: str = None,
):
    """
    Агрегированная статистика.
    by_year всегда возвращает все годы — нужно для графика на дашборде
    (чтобы подсвечивать выбранный год, не скрывая остальные).
    """
    where, params = build_where(year, nioktr_type, search)
    # Для by_year убираем фильтр по году — всегда показываем все годы
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
            SELECT year, COUNT(*) AS count
            FROM projects {where_year}
            GROUP BY year ORDER BY year
        """), params_year).fetchall()

        # inst_filter и type_filter — добавляем IS NOT NULL корректно (WHERE или AND)
        inst_filter = 'AND "executor.name" IS NOT NULL' if where else 'WHERE "executor.name" IS NOT NULL'
        type_filter = "AND nioktr_types IS NOT NULL"     if where else "WHERE nioktr_types IS NOT NULL"

        top_institutions = conn.execute(text(f"""
            SELECT "executor.name" AS name, COUNT(*) AS projects
            FROM projects {where}
            {inst_filter}
            GROUP BY "executor.name"
            ORDER BY projects DESC LIMIT 10
        """), params).fetchall()

        by_type = conn.execute(text(f"""
            SELECT nioktr_types, COUNT(*) AS count
            FROM projects {where}
            {type_filter}
            GROUP BY nioktr_types ORDER BY count DESC LIMIT 8
        """), params).fetchall()

    return {
        "total_projects":        total,
        "total_budget_billions": round(float(total_budget or 0), 1),
        "total_institutions":    institutions,
        "by_year":          [{"year": int(r[0]),  "count": int(r[1])} for r in by_year],
        "top_institutions": [{"name": r[0], "projects": int(r[1])} for r in top_institutions],
        "by_type":          [{"type": r[0],  "count": int(r[1])} for r in by_type],
    }


# ── Projects list (paginated) ──────────────────────────────────────────────────

@app.get("/api/projects")
def get_projects(
    page: int        = Query(1,  ge=1),
    limit: int       = Query(20, ge=1, le=100),
    year: int        = None,
    nioktr_type: str = None,
    institution: str = None,
    search: str      = None,
):
    offset = (page - 1) * limit
    where, params = build_where(year, nioktr_type, search)

    if institution:
        params["institution"] = f"%{institution}%"
        inst_cond = '"executor.name" ILIKE :institution'
        where = (where + f" AND {inst_cond}") if where else f"WHERE {inst_cond}"

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM projects {where}"), params
        ).scalar()

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
        "total":   total,
        "page":    page,
        "pages":   (total + limit - 1) // limit,
        "results": [dict(r._mapping) for r in rows],
    }


# ── /info — детальная карточка проекта ────────────────────────────────────────

@app.get("/api/projects/{registration_number}")
def get_project_info(registration_number: str):
    """
    Возвращает все поля по одному проекту.
    404 если проект не найден.
    """
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT * FROM projects
            WHERE registration_number = :reg
        """), {"reg": registration_number}).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{registration_number}' not found"
        )

    return dict(row._mapping)


# ── /add — добавить проект ─────────────────────────────────────────────────────

@app.post("/api/projects", status_code=201)
def add_project(project: ProjectCreate):
    """
    Добавляет новый проект.
    FastAPI автоматически валидирует тело по схеме ProjectCreate.
    409 если registration_number уже существует.
    """
    with engine.connect() as conn:
        exists = conn.execute(text("""
            SELECT 1 FROM projects WHERE registration_number = :reg
        """), {"reg": project.registration_number}).fetchone()

        if exists:
            raise HTTPException(
                status_code=409,
                detail=f"Project '{project.registration_number}' already exists. Use PUT to update."
            )

        conn.execute(text("""
            INSERT INTO projects (
                registration_number, name, annotation, year,
                nioktr_types, budget_total_thousands,
                "executor.name", supervisor_full_name, keyword_list
            ) VALUES (
                :reg, :name, :annotation, :year,
                :types, :budget, :executor, :supervisor, :keywords
            )
        """), {
            "reg":        project.registration_number,
            "name":       project.name,
            "annotation": project.annotation,
            "year":       project.year,
            "types":      project.nioktr_types,
            "budget":     project.budget_total_thousands,
            "executor":   project.executor_name,
            "supervisor": project.supervisor_full_name,
            "keywords":   project.keyword_list,
        })
        conn.commit()

    return {
        "status":              "created",
        "registration_number": project.registration_number,
    }


# ── /update — обновить проект ──────────────────────────────────────────────────

@app.put("/api/projects/{registration_number}")
def update_project(registration_number: str, project: ProjectCreate):
    """Обновляет существующий проект. 404 если не найден."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            UPDATE projects SET
                name                   = :name,
                annotation             = :annotation,
                year                   = :year,
                nioktr_types           = :types,
                budget_total_thousands = :budget,
                "executor.name"        = :executor,
                supervisor_full_name   = :supervisor,
                keyword_list           = :keywords
            WHERE registration_number  = :reg
        """), {
            "reg":        registration_number,
            "name":       project.name,
            "annotation": project.annotation,
            "year":       project.year,
            "types":      project.nioktr_types,
            "budget":     project.budget_total_thousands,
            "executor":   project.executor_name,
            "supervisor": project.supervisor_full_name,
            "keywords":   project.keyword_list,
        })
        conn.commit()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{registration_number}' not found"
        )

    return {"status": "updated", "registration_number": registration_number}


# ── /delete — удалить проект ───────────────────────────────────────────────────

@app.delete("/api/projects/{registration_number}")
def delete_project(registration_number: str):
    """Удаляет проект. 404 если не найден."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            DELETE FROM projects WHERE registration_number = :reg
        """), {"reg": registration_number})
        conn.commit()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{registration_number}' not found"
        )

    return {"status": "deleted", "registration_number": registration_number}


# ── Budget stats ───────────────────────────────────────────────────────────────

@app.get("/api/budget/stats")
def get_budget_stats(
    year: int        = None,
    nioktr_type: str = None,
):
    """
    Аналитика бюджетов для вкладки Бюджет на дашборде.
    by_year всегда 2020-2025 (без внешних фильтров).
    top_orgs и by_type учитывают фильтры.
    """
    where, params = build_where(year, nioktr_type)
    # Префикс AND/WHERE для добавления budget IS NOT NULL
    aow = "AND" if where else "WHERE"

    with engine.connect() as conn:

        # Финансирование по годам — всегда все годы, без внешних фильтров
        by_year = conn.execute(text("""
            SELECT
                year,
                ROUND(CAST(SUM(budget_total_thousands) / 1000000.0 AS numeric), 1) AS total_billions,
                ROUND(CAST(AVG(budget_total_thousands) / 1000.0 AS numeric), 1)     AS avg_millions,
                COUNT(*)                                            AS projects
            FROM projects
            WHERE budget_total_thousands IS NOT NULL
              AND year BETWEEN 2020 AND 2025
            GROUP BY year
            ORDER BY year
        """)).fetchall()

        # Топ организаций по суммарному бюджету
        top_orgs = conn.execute(text(f"""
            SELECT
                "executor.name"                                        AS name,
                ROUND(CAST(SUM(budget_total_thousands) / 1000000.0 AS numeric), 1) AS total_billions,
                COUNT(*)                                               AS projects
            FROM projects
            {where}
            {aow} budget_total_thousands IS NOT NULL
            AND "executor.name" IS NOT NULL
            GROUP BY "executor.name"
            ORDER BY total_billions DESC
            LIMIT 10
        """), params).fetchall()

        # Бюджет по типам НИР
        by_type = conn.execute(text(f"""
            SELECT
                nioktr_types                                           AS type,
                ROUND(CAST(SUM(budget_total_thousands) / 1000000.0 AS numeric), 1) AS total_billions,
                ROUND(CAST(AVG(budget_total_thousands) / 1000.0 AS numeric), 1)     AS avg_millions,
                COUNT(*)                                               AS projects
            FROM projects
            {where}
            {aow} budget_total_thousands IS NOT NULL
            AND nioktr_types IS NOT NULL
            GROUP BY nioktr_types
            ORDER BY total_billions DESC
            LIMIT 8
        """), params).fetchall()

        # Распределение проектов по размеру бюджета
        dist = conn.execute(text(f"""
            SELECT
                COUNT(*) FILTER (WHERE budget_total_thousands < 1000)                    AS under_1m,
                COUNT(*) FILTER (WHERE budget_total_thousands BETWEEN 1000  AND 10000)   AS to_10m,
                COUNT(*) FILTER (WHERE budget_total_thousands BETWEEN 10000 AND 100000)  AS to_100m,
                COUNT(*) FILTER (WHERE budget_total_thousands > 100000)                  AS over_100m
            FROM projects
            {where}
            {aow} budget_total_thousands IS NOT NULL
        """), params).fetchone()

    return {
        "by_year": [
            {
                "year":           int(r[0]),
                "total_billions": float(r[1]),
                "avg_millions":   float(r[2]),
                "projects":       int(r[3]),
            }
            for r in by_year
        ],
        "top_orgs_by_budget": [
            {"name": r[0], "total_billions": float(r[1]), "projects": int(r[2])}
            for r in top_orgs
        ],
        "by_type": [
            {
                "type":           r[0],
                "total_billions": float(r[1]),
                "avg_millions":   float(r[2]),
                "projects":       int(r[3]),
            }
            for r in by_type
        ],
        "distribution": {
            "under_1m":  int(dist[0] or 0),
            "to_10m":    int(dist[1] or 0),
            "to_100m":   int(dist[2] or 0),
            "over_100m": int(dist[3] or 0),
        },
    }



# ── Keyword trends over years ─────────────────────────────────────────────────

@app.get("/api/trends")
def get_trends(top: int = Query(12, ge=5, le=30)):
    """
    Эволюция научных тем по годам (2020-2025).
    Топ-N ключевых слов: количество проектов и бюджет (млрд руб) по каждому году.
    Используется для Бамп-чарта и Стримграфа (вкладка Тренды).
    UNNEST разворачивает полуколонный keyword_list в строки прямо в SQL.
    """
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                year,
                LOWER(TRIM(kw))                                       AS keyword,
                COUNT(*)                                               AS projects,
                COALESCE(SUM(budget_total_thousands), 0) / 1000000.0  AS budget_billions
            FROM projects
            CROSS JOIN UNNEST(string_to_array(keyword_list, ';')) AS kw
            WHERE year BETWEEN 2020 AND 2025
              AND keyword_list IS NOT NULL
              AND TRIM(kw) != ''
              AND LENGTH(TRIM(kw)) BETWEEN 3 AND 60
            GROUP BY year, LOWER(TRIM(kw))
            HAVING COUNT(*) >= 2
        """)).fetchall()

    from collections import defaultdict
    totals: dict = defaultdict(int)
    data: dict = {}
    for r in rows:
        yr, kw, cnt, bud = int(r[0]), r[1], int(r[2]), float(r[3])
        totals[kw] += cnt
        data[(yr, kw)] = (cnt, round(bud, 2))

    top_keywords = [kw for kw, _ in sorted(totals.items(), key=lambda x: -x[1])[:top]]
    years = list(range(2020, 2026))

    topics = []
    for kw in top_keywords:
        by_year = []
        for yr in years:
            cnt, bud = data.get((yr, kw), (0, 0.0))
            by_year.append({"year": yr, "projects": cnt, "budget": bud})
        topics.append({"keyword": kw, "total": totals[kw], "by_year": by_year})

    return {"years": years, "topics": topics}

# ── Semantic search ────────────────────────────────────────────────────────────

@app.get("/api/search/semantic")
def semantic_search(
    q: str,
    limit: int = Query(10, ge=1, le=50),
):
    """
    Семантический поиск через pgvector.
    Находит проекты близкие по смыслу, не только по точному совпадению слов.
    Требует предварительного запуска: python backend/embed.py
    """
    with engine.connect() as conn:
        if not embeddings_ready(conn):
            raise HTTPException(
                status_code=503,
                detail="Embeddings not ready. Run: python backend/embed.py"
            )

    model = get_embed_model()
    query_vector = _encode(model, q)

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                p.registration_number,
                p.name,
                p.annotation,
                p.year,
                p."executor.name"          AS institution,
                p.nioktr_types,
                p.budget_total_thousands,
                p.keyword_list,
                e.source_text,
                ROUND(CAST(1 - (e.embedding <=> CAST(:vec AS vector)) AS numeric), 3) AS similarity
            FROM project_embeddings e
            JOIN projects p USING (registration_number)
            ORDER BY e.embedding <=> CAST(:vec AS vector)
            LIMIT :limit
        """), {"vec": str(query_vector), "limit": limit}).fetchall()

    return {
        "query":   q,
        "results": [dict(r._mapping) for r in rows],
    }


# ── RAG agent ──────────────────────────────────────────────────────────────────

@app.get("/api/agent")
def rag_agent(q: str):
    """
    RAG агент на базе Ollama (локально, бесплатно).

    Схема работы:
    1. Кодируем вопрос в вектор через sentence-transformers
    2. Находим топ-5 похожих проектов через pgvector
    3. Формируем prompt с текстами этих проектов как контекстом
    4. Отправляем в Ollama, получаем ответ
    5. Возвращаем ответ + ссылки на источники
    """
    with engine.connect() as conn:
        if not embeddings_ready(conn):
            raise HTTPException(
                status_code=503,
                detail="Embeddings not ready. Run: python backend/embed.py"
            )

    # Шаг 1-2: векторный поиск
    model = get_embed_model()
    query_vector = _encode(model, q)

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                p.registration_number,
                p.name,
                p.year,
                p."executor.name" AS institution,
                e.source_text,
                ROUND(CAST(1 - (e.embedding <=> CAST(:vec AS vector)) AS numeric), 3) AS similarity
            FROM project_embeddings e
            JOIN projects p USING (registration_number)
            ORDER BY e.embedding <=> CAST(:vec AS vector)
            LIMIT 5
        """), {"vec": str(query_vector)}).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No relevant projects found")

    # Шаг 3: формируем контекст
    context_parts = []
    for r in rows:
        snippet = (r.source_text or "")[:600]
        context_parts.append(
            f"Проект: {r.name}\n"
            f"Год: {r.year} | Организация: {r.institution}\n"
            f"Описание: {snippet}"
        )
    context = "\n\n---\n\n".join(context_parts)

    prompt = (
        "Ты — опытный научный аналитик и гид по российским НИОКР-проектам. "
        "Отвечай уверенно, как эксперт: никогда не говори 'из контекста', 'из предоставленных данных', 'согласно контексту'. "
        "Излагай так, как будто ты лично разбираешься в этой теме. "
        "Выдели самое интересное и значимое: уникальные методы, масштаб, неожиданный угол или особый бюджет. "
        "Если проект примечателен — скажи об этом прямо. "
        "Отвечай строго на русском языке. Будь конкретным и живым, без сухих канцеляризмов.\n\n"
        f"Запрос: {q}\n\n"
        f"Данные о проектах:\n\n{context}\n\n"
        "Анализ:"
    )

    # Шаг 4: запрос к Ollama
    try:
        response = httpx.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model":  OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,   # низкая температура = точные ответы
                    "num_predict": 512,
                },
            },
            timeout=90.0,
        )
        response.raise_for_status()
        answer = response.json().get("response", "").strip()

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Ollama не отвечает по адресу {OLLAMA_URL}. "
                "Проверь: docker compose ps | grep ollama"
            )
        )
    except httpx.ReadTimeout:
        raise HTTPException(
            status_code=504,
            detail="Ollama не ответила за 90 секунд. Попробуй ещё раз."
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e}")

    return {
        "question": q,
        "answer":   answer,
        "model":    OLLAMA_MODEL,
        "sources": [
            {
                "registration_number": r.registration_number,
                "name":                r.name,
                "year":                r.year,
                "institution":         r.institution,
                "similarity":          float(r.similarity),
            }
            for r in rows
        ],
    }


# ── Graph ──────────────────────────────────────────────────────────────────────

@app.get("/api/graph")
def get_graph(
    mode:         str = Query("institutions", pattern="^(institutions|topics)$"),
    min_projects: int = Query(10, ge=1),
    limit:        int = Query(100, ge=10, le=300),
):
    """
    Данные для графа связей в формате {nodes, edges}.

    mode=institutions:
        Узлы — организации (мин. min_projects)
        Рёбра — один руководитель вёл проекты в обеих организациях

    mode=topics:
        Узлы — топ ключевых слов
        Рёбра — слова часто встречаются в одном проекте
    """
    with engine.connect() as conn:

        if mode == "institutions":
            nodes_rows = conn.execute(text("""
                SELECT
                    COALESCE("executor.ogrn", "executor.name")              AS id,
                    "executor.name"                                         AS label,
                    COUNT(*)                                                AS projects,
                    ROUND(CAST(COALESCE(SUM(budget_total_thousands), 0) / 1000000.0 AS numeric), 1) AS budget_billions
                FROM projects
                WHERE "executor.name" IS NOT NULL
                GROUP BY "executor.ogrn", "executor.name"
                HAVING COUNT(*) >= :min_projects
                ORDER BY projects DESC
                LIMIT :limit
            """), {"min_projects": min_projects, "limit": limit}).fetchall()

            node_ids = {r[0] for r in nodes_rows}

            if len(node_ids) < 2:
                return {
                    "mode": mode, "nodes": [], "edges": [],
                    "node_count": 0, "edge_count": 0,
                    "hint": f"No orgs with >= {min_projects} projects. Try lower min_projects."
                }

            # Рёбра: общий руководитель работал в двух разных организациях.
            # Чтобы self-join не тормозил — сначала агрегируем по руководителю,
            # потом джоиним уже маленькую таблицу (~уникальных руководителей).
            edges_rows = conn.execute(text("""
                WITH supervisor_orgs AS (
                    -- Для каждого руководителя собираем список его организаций
                    SELECT
                        supervisor_full_name,
                        COALESCE("executor.ogrn", "executor.name") AS org_id
                    FROM projects
                    WHERE supervisor_full_name IS NOT NULL
                      AND "executor.name"      IS NOT NULL
                    GROUP BY supervisor_full_name, org_id
                )
                SELECT
                    a.org_id                          AS source,
                    b.org_id                          AS target,
                    COUNT(DISTINCT a.supervisor_full_name) AS weight
                FROM supervisor_orgs a
                JOIN supervisor_orgs b
                  ON  a.supervisor_full_name = b.supervisor_full_name
                  AND a.org_id < b.org_id
                GROUP BY source, target
                HAVING COUNT(DISTINCT a.supervisor_full_name) >= 2
                ORDER BY weight DESC
                LIMIT 500
            """)).fetchall()

            nodes = [
                {
                    "id":              r[0],
                    "label":           _clean_org_label(r[1]) if r[1] else "",
                    "projects":        int(r[2]),
                    "budget_billions": float(r[3]),
                }
                for r in nodes_rows
            ]
            edges = [
                {"source": r[0], "target": r[1], "weight": int(r[2])}
                for r in edges_rows
                if r[0] in node_ids and r[1] in node_ids
            ]

        else:  # topics
            from collections import Counter

            kw_rows = conn.execute(text("""
                SELECT keyword_list FROM projects
                WHERE keyword_list IS NOT NULL
                LIMIT 20000
            """)).fetchall()

            word_count: Counter = Counter()
            co_count:   Counter = Counter()

            for row in kw_rows:
                words = [w.strip().lower() for w in row[0].split(";") if w.strip()][:10]
                for w in words:
                    word_count[w] += 1
                for i, w1 in enumerate(words):
                    for w2 in words[i + 1:]:
                        co_count[tuple(sorted([w1, w2]))] += 1

            top_words = {w for w, _ in word_count.most_common(limit)}

            nodes = [
                {"id": w, "label": w, "count": word_count[w]}
                for w in top_words
            ]
            edges = [
                {"source": p[0], "target": p[1], "weight": cnt}
                for p, cnt in co_count.most_common(500)
                if p[0] in top_words and p[1] in top_words and cnt >= 5
            ]

    return {
        "mode":       mode,
        "nodes":      nodes,
        "edges":      edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


# ── Map data ───────────────────────────────────────────────────────────────────

@app.get("/api/map-data")
def get_map_data():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                "executor.name"  AS institution,
                "executor.ogrn"  AS ogrn,
                "executor.okogu" AS ministry,
                COUNT(*)         AS projects,
                COALESCE(SUM(budget_total_thousands), 0) AS total_budget
            FROM projects
            WHERE "executor.name" IS NOT NULL
            GROUP BY "executor.name", "executor.ogrn", "executor.okogu"
            ORDER BY projects DESC
        """)).fetchall()
    return [dict(r._mapping) for r in rows]
