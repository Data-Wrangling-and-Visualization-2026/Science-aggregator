# Science Aggregator

A web dashboard for exploring Russian R&D projects (NIOKTR) from [gisnauka.ru](https://gisnauka.ru), covering 2020–2025.

**104,466 projects · 7,752 institutions**

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Node.js](https://nodejs.org/) v18+
- Python 3.10+

### 1. Clone the repository

```bash
git clone https://github.com/Data-Wrangling-and-Visualisation-2026/Science-aggregator
cd Science-aggregator
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and replace `your_user` and `your_password` with any values, for example:

POSTGRES_USER=user
POSTGRES_PASSWORD=password

### 3. Start the database

```bash
docker compose up -d db
```

### 4. Download the processed dataset

Download the file and place it at `data/processed/clean_all_years.parquet`:

> 📦 **[Download clean_all_years.parquet](https://drive.google.com/file/d/1OCCkSEJzn8w9xLHF0qSuVm3UtOVFOgbY/view?usp=sharing)** (~180 MB)

Then seed the database (takes ~2 min):

```bash
pip install pandas pyarrow sqlalchemy psycopg2-binary python-dotenv
python backend/seed_db.py
```

### 5. Start the backend

```bash
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv
uvicorn backend.main:app --reload
```

Backend runs at **http://localhost:8000**

Verify:
```bash
curl http://localhost:8000/health
# → {"status": "ok"}
```

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

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


