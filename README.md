# Science Aggregator

A web dashboard for exploring Russian R&D projects (NIOKTR) from [gisnauka.ru](https://gisnauka.ru), covering 2020–2025.

**104,466 projects · 7,752 institutions**

---

# Science Aggregator

A web dashboard for exploring Russian R&D projects (NIOKTR) from [gisnauka.ru](https://gisnauka.ru), covering 2020–2025.

**104,466 projects · 7,752 institutions**  
**With AI-powered RAG agent + relationship graphs**

---

## Quick Start (Docker Only)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No npm, Python, or other installations needed! ✅

### 1. Clone & Enter

```bash
git clone https://github.com/Data-Wrangling-and-Visualisation-2026/Science-aggregator
cd Science-aggregator
```

### 2. Download Dataset (Manual step, one-time)

1. Open: https://drive.google.com/file/d/1OCCkSEJzn8w9xLHF0qSuVm3UtOVFOgbY/view?usp=sharing
2. Click "Download"
3. Extract to: `data/processed/clean_all_years.parquet`

### 3. Run These 4 Commands

```bash
# [1] Start database + Ollama
docker compose up -d db ollama

# [2] Wait ~60 seconds for health checks
sleep 60

# [3] Seed database (load 104k projects)
docker compose run --rm seeder

# [4] Generate embeddings (takes ~15 min, let it run)
docker compose run --rm embedder

# [5] Start everything
docker compose up -d
```

### 4. Open Dashboard

```
http://localhost:5173
```

✅ You should see:
- Dashboard with statistics
- Graph visualization (institutions & topics)
- Projects table
- Click any project → AI agent panel appears

---

## Architecture

```
🖥️ Your Browser (http://localhost:5173)
    ↓
🚀 Frontend (Node.js in Docker)
    ↓
📡 Backend API (FastAPI in Docker, port 8000)
    ↓
🤖 Ollama LLM (Local AI, port 11434)
    ↓
🗄️ PostgreSQL + pgvector (Database)
```

**All services containerized. No local installations needed.**

---

## Documentation

- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** — Complete step-by-step guide
- **[QUICK_COMMANDS.txt](QUICK_COMMANDS.txt)** — Copy-paste command reference  
- **[VISUAL_DEPLOYMENT_GUIDE.md](VISUAL_DEPLOYMENT_GUIDE.md)** — Verify each step
- **[CONTAINERIZATION_SUMMARY.md](CONTAINERIZATION_SUMMARY.md)** — For instructors/team

---

## Common Commands

```bash
docker compose up -d          # Start all services
docker compose down           # Stop all services
docker compose logs -f        # View all logs
docker compose ps             # Show running services

# Testing
curl http://localhost:8000/health
curl http://localhost:8000/api/stats
curl "http://localhost:8000/api/agent?q=machine%20learning"
```

This loads 104,466 records into PostgreSQL (~2 min).

### 5. Start all services

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |

### 6. Verify the backend

```bash
curl http://localhost:8000/health
# → {"status": "ok"}

curl http://localhost:8000/api/stats
# → {"total_projects": 104466, ...}
```

---

## Project Structure

```
Science-aggregator/
├── backend/
│   ├── main.py              # FastAPI — /api/stats, /api/projects, /api/map-data
│   ├── seed_db.py           # Loads parquet → PostgreSQL
│   ├── Dockerfile
│   └── requirements.txt
├── data/
│   ├── raw/                 # Raw JSON from gisnauka.ru (not in git)
│   └── processed/           # Cleaned parquet (not in git — too large)
├── docs/                    # Project documentation and proposals
├── frontend/
│   ├── public/
│   └── src/
│       ├── App.jsx          # Main React dashboard component
│       ├── main.jsx
│       ├── App.css
│       └── index.css
├── scripts/
│   └── process_data.py      # Raw JSON → cleaned Parquet pipeline
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/stats` | Aggregate statistics (filters: `year`, `nioktr_type`, `search`) |
| `GET /api/projects` | Paginated project list (filters + `page`, `limit`) |
| `GET /api/map-data` | Institution-level aggregates for map visualization |

**Search supports comma-separated terms** — `нейросети, климат` finds projects mentioning either term.

---

## Data Pipeline

Raw data was downloaded from [gisnauka.ru](https://gisnauka.ru) as JSON exports (2020–2025).

Processing steps in `scripts/process_data.py`:
1. Load and concatenate JSON files (~112,000 records)
2. Deduplicate by `registration_number`
3. Normalize budget fields and parse date columns
4. Export to `data/processed/clean_all_years.parquet`

Final dataset: **104,466 records, 34 columns**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Data processing | Python, pandas, pyarrow |
| Database | PostgreSQL 16 (Docker) |
| Backend | FastAPI, SQLAlchemy, uvicorn |
| Frontend | React 18, Vite, Recharts |
| Containerization | Docker, Docker Compose |

---

## Team

- **Marat Akhmetov** — data pipeline, backend API
- **Ekaterina Baeva** — frontend dashboard

