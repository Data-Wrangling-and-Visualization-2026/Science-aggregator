"""
Science Aggregator — backend/embed.py

ИСПРАВЛЕНИЯ в этой версии:
1. null registration_number → строки с null reg_num теперь пропускаются (строка ~57)
2. Resume: при продолжении пропускаем уже загруженные записи по индексу, а не по reg_num
3. Пустые строки source_text также пропускаются в батче
"""

import pandas as pd
from sqlalchemy import create_engine, text
from pathlib import Path
from dotenv import load_dotenv
import os
import time

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL_LOCAL",
    "postgresql://user:password@localhost:5432/science"
)
PARQUET_FILE = (
    Path(__file__).resolve().parent.parent
    / "data" / "processed" / "clean_all_years.parquet"
)
BATCH_SIZE = 64


def load_texts() -> pd.DataFrame:
    """
    Загружает тексты для эмбеддинга.

    ИСПРАВЛЕНО: Фильтруем строки с null/пустым registration_number.
    Причина ошибки: в parquet есть ~20 «демо» строк с registration_number=None
    (тестовые записи типа "Демо-тематика для проверки УГТ").
    Они попадали в INSERT и падали на NOT NULL constraint.
    """
    print(f"Loading: {PARQUET_FILE}")
    df = pd.read_parquet(PARQUET_FILE)
    print(f"  Rows: {len(df):,}  Columns: {df.shape[1]}")

    # ── FIX: убираем строки без registration_number ──────────────────────────
    null_regs = df["registration_number"].isna().sum()
    if null_regs > 0:
        print(f"  Skipping {null_regs} rows with null registration_number")
        df = df[df["registration_number"].notna()].copy()

    # Также убираем пустые строки registration_number
    df = df[df["registration_number"].astype(str).str.strip() != ""].copy()
    # ──────────────────────────────────────────────────────────────────────────

    if "scientific_groundwork" in df.columns:
        filled = df["scientific_groundwork"].notna().sum()
        print(f"  scientific_groundwork: {filled:,} filled ({filled/len(df)*100:.0f}%)")
        annotation = df["annotation"] if "annotation" in df.columns else pd.Series("", index=df.index)
        df["source_text"] = df["scientific_groundwork"].fillna(annotation)
    else:
        print("  scientific_groundwork not in parquet — using annotation")
        df["source_text"] = df["annotation"] if "annotation" in df.columns else ""

    df = df[df["source_text"].notna() & (df["source_text"].str.strip() != "")].copy()
    df["source_text"] = df["source_text"].str.slice(0, 2000)
    print(f"  Records with text: {len(df):,}")
    return df[["registration_number", "source_text"]].reset_index(drop=True)


def setup_pgvector(engine):
    """Создаёт расширение vector, таблицу и индекс."""
    print("Setting up pgvector...")
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS project_embeddings (
                registration_number TEXT    PRIMARY KEY,
                embedding           vector(384),
                source_text         TEXT
            )
        """))
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_embeddings_ivfflat'
                ) THEN
                    CREATE INDEX idx_embeddings_ivfflat
                    ON project_embeddings
                    USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100);
                END IF;
            END $$;
        """))
        conn.commit()
    print("✅ pgvector: table and index ready")


def get_already_embedded(engine) -> set:
    """Возвращает множество reg_num уже загруженных в БД."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT registration_number FROM project_embeddings")
        ).fetchall()
    return {r[0] for r in rows}


def embed_and_store(df: pd.DataFrame, engine, already_done: set):
    """
    Генерирует эмбеддинги батчами и пишет в PostgreSQL.
    Пропускает уже загруженные записи по reg_num (не просто по индексу).
    """
    from sentence_transformers import SentenceTransformer

    print("\nLoading model: paraphrase-multilingual-MiniLM-L12-v2")
    print("  (~400MB, поддерживает русский язык, CPU inference)")
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    print("  ✅ Model ready\n")

    # Фильтруем уже загруженные
    if already_done:
        df_todo = df[~df["registration_number"].isin(already_done)].copy().reset_index(drop=True)
        print(f"Skipping {len(already_done):,} already embedded. Remaining: {len(df_todo):,}")
    else:
        df_todo = df

    texts    = df_todo["source_text"].tolist()
    reg_nums = df_todo["registration_number"].tolist()
    total    = len(texts)

    if total == 0:
        print("✅ Nothing to embed.")
        return

    t_start = time.time()
    print(f"Generating embeddings for {total:,} records (batch_size={BATCH_SIZE})...")

    with engine.connect() as conn:
        for start in range(0, total, BATCH_SIZE):
            end = min(start + BATCH_SIZE, total)

            batch_texts   = texts[start:end]
            batch_regs    = reg_nums[start:end]
            embeddings    = model.encode(batch_texts, show_progress_bar=False)

            for reg, emb, src in zip(batch_regs, embeddings, batch_texts):
                # ── FIX: дополнительная проверка на None внутри батча ────────
                if reg is None or str(reg).strip() == "":
                    print(f"  WARNING: skipping row with null/empty reg_num, src={src[:40]!r}")
                    continue
                # ──────────────────────────────────────────────────────────────
                conn.execute(text("""
                    INSERT INTO project_embeddings (registration_number, embedding, source_text)
                    VALUES (:reg, CAST(:emb AS vector), :src)
                    ON CONFLICT (registration_number) DO UPDATE
                        SET embedding   = EXCLUDED.embedding,
                            source_text = EXCLUDED.source_text
                """), {
                    "reg": str(reg),
                    "emb": str(emb.tolist()),
                    "src": src,
                })

            conn.commit()

            if (start // BATCH_SIZE) % 10 == 0:
                done    = end
                elapsed = time.time() - t_start
                pct     = done / total * 100
                eta     = (elapsed / pct * (100 - pct)) if pct > 0 else 0
                print(
                    f"  {done:>7,} / {total:,}"
                    f"  ({pct:.1f}%)"
                    f"  elapsed: {elapsed/60:.1f}m"
                    f"  eta: {eta/60:.1f}m"
                )

    print(f"\n✅ Done in {(time.time() - t_start)/60:.1f} minutes")


def main():
    print("=" * 60)
    print("Science Aggregator — Embedding Pipeline")
    print("=" * 60)
    print(f"Parquet : {PARQUET_FILE}")
    print(f"Target  : {DATABASE_URL}\n")

    if not PARQUET_FILE.exists():
        print(f"ERROR: Parquet not found: {PARQUET_FILE}")
        print("Download from Google Drive → data/processed/clean_all_years.parquet")
        return

    engine = create_engine(DATABASE_URL)

    try:
        setup_pgvector(engine)
    except Exception as e:
        print(f"\nERROR setting up pgvector: {e}")
        print("Убедись что docker-compose.yml использует: image: pgvector/pgvector:pg16")
        return

    df = load_texts()

    already_done = get_already_embedded(engine)
    print(f"\nAlready in DB: {len(already_done):,} embeddings")

    remaining = len(df) - len(df[df["registration_number"].isin(already_done)])
    if remaining == 0:
        print("✅ All embeddings ready. Nothing to do.")
        print("(Для пересоздания: DROP TABLE project_embeddings; затем перезапусти)")
        return

    print(f"To embed: {remaining:,} records")

    embed_and_store(df, engine, already_done)

    with engine.connect() as conn:
        final = conn.execute(text("SELECT COUNT(*) FROM project_embeddings")).scalar()

    print(f"\n✅ Final count: {final:,} embeddings in DB")
    print("Готово! Работают эндпоинты: /api/search/semantic  /api/agent")


if __name__ == "__main__":
    main()
