# Science Aggregator

An interactive web dashboard for exploring Russian R&D projects (NIOKTR) sourced from [gisnauka.ru](https://gisnauka.ru), covering 2020–2025.

**104,466 projects · 7,752 institutions · 6 Docker services**

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Overview** | Filter by year, R&D type, full-text search with OR logic across name, annotation, and keywords |
| **Relationship Graph** | Force-directed graph of institutions or keyword topics — nodes are draggable |
| **Science Map** | Bubble map of cities using real Russia boundaries (world-atlas TopoJSON) |
| **Trends 2020–2025** | Bump chart of keyword rank changes + streamgraph of budget flow, with year-by-year animation |
| **RAG Agent** | Ask any question about a project — Llama 3.2 answers using semantically retrieved context via pgvector |

---

## Quick Start

### Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — nothing else needed

### 1. Clone

```bash
git clone https://github.com/Data-Wrangling-and-Visualisation-2026/Science-aggregator
cd Science-aggregator
```

### 2. Download the Dataset

The dataset is not stored in the repository (1.2 GB parquet file):

1. Open: [clean_all_years.parquet on Google Drive](https://drive.google.com/file/d/1OCCkSEJzn8w9xLHF0qSuVm3UtOVFOgbY/)
2. Download and place at: `data/processed/clean_all_years.parquet`

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env if you want to change DB credentials (defaults work fine)
```

### 4. Run

```bash
# Step 1 — Start the database and Ollama
docker compose up -d db ollama

# Step 2 — Wait ~30 seconds for health checks, then seed the database
docker compose run --rm seeder

# Step 3 — Generate vector embeddings (~15 min, runs in background)
docker compose run --rm embedder

# Step 4 — Download the language model (~2 GB, one-time)
bash pull_model.sh

# Step 5 — Start everything
docker compose up -d
```

Open **http://localhost:5173**

### Verify

```bash
curl http://localhost:8000/health
# → {"status": "ok"}

curl http://localhost:8000/api/stats
# → {"total_projects": 104466, ...}
```

---

## Architecture

```
Browser
  └── React 18 + Vite          (port 5173)
        └── FastAPI + SQLAlchemy  (port 8000)
              ├── PostgreSQL 16 + pgvector  (port 5432)
              └── Ollama / Llama 3.2        (port 11434)
```

### Docker Services

| Service | Image | Purpose |
|---------|-------|---------|
| `db` | `pgvector/pgvector:pg16` | Project storage + vector embeddings |
| `seeder` | `./backend` | Loads parquet → PostgreSQL (runs once) |
| `embedder` | `./backend` | Generates embeddings via fastembed (runs once) |
| `backend` | `./backend` | FastAPI REST API |
| `frontend` | `node:20-alpine` | React dev server |
| `ollama` | `ollama/ollama` | Local LLM inference |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/stats` | Aggregated statistics (filters: `year`, `nioktr_type`, `search`) |
| `GET` | `/api/projects` | Paginated project list |
| `GET` | `/api/projects/{reg}` | Single project card |
| `GET` | `/api/budget/stats` | Budget analytics by year, type, and institution |
| `GET` | `/api/trends` | Keyword trend data for bump chart (2020–2025) |
| `GET` | `/api/graph` | Relationship graph (`mode=topics\|institutions`) |
| `GET` | `/api/map-data` | City-level aggregates for the bubble map |
| `GET` | `/api/search/semantic` | Semantic search via pgvector cosine similarity |
| `GET` | `/api/agent` | RAG agent — Ollama + pgvector retrieval |

---

## Data Pipeline

```
gisnauka.ru  →  raw JSON (2020–2025)
                    ↓  scripts/process_data.py
             clean_all_years.parquet
             104,466 records · 34 columns
                    ↓  backend/seed_db.py
             PostgreSQL: table projects
                    ↓  backend/embed.py
             PostgreSQL: table project_embeddings
             vector(384) — paraphrase-multilingual-MiniLM-L12-v2
```

Key data quality notes:
- Deduplicated by `registration_number` (keep last)
- Budget stored in thousands of RUB
- ~43% of projects are geo-located (city name present in institution name)
- One anomalous record with year 1920 retained as-is

See `docs/eda.ipynb` for the full exploratory analysis.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Data collection | Python, requests |
| Data processing | pandas, pyarrow |
| Database | PostgreSQL 16, pgvector extension |
| Embeddings | fastembed (ONNX, no GPU required) |
| Embedding model | `paraphrase-multilingual-MiniLM-L12-v2` (384-dim, multilingual) |
| Backend | FastAPI, SQLAlchemy, uvicorn |
| LLM | Ollama, Llama 3.2:3b (local, no API key needed) |
| Frontend | React 18, Vite, Recharts |
| Infrastructure | Docker, Docker Compose |

---

## Project Structure

```
Science-aggregator/
├── backend/
│   ├── main.py           # FastAPI — all API endpoints
│   ├── seed_db.py        # Parquet → PostgreSQL loader
│   ├── embed.py          # Embedding pipeline (fastembed)
│   ├── Dockerfile
│   └── requirements.txt
├── data/
│   └── processed/        # Not tracked in git (too large)
├── docs/
│   └── eda.ipynb         # Exploratory data analysis
├── frontend/
│   └── src/
│       ├── App.jsx        # Main dashboard
│       ├── GraphPanel.jsx # Force-directed graph
│       ├── RegionMap.jsx  # Russia bubble map
│       ├── TrendsPanel.jsx# Bump chart + streamgraph
│       └── AgentPanel.jsx # RAG agent UI
├── scripts/
│   └── process_data.py   # Raw JSON → cleaned parquet
├── docker-compose.yml
├── pull_model.sh         # Downloads Llama model into Ollama
├── .env.example
└── README.md
```

---

## Team

- **Marat Akhmetov** — data pipeline, backend API, pgvector, Docker infrastructure
- **Ekaterina Baeva** — frontend, visualizations

