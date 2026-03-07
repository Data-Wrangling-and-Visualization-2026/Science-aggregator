"""
Science Aggregator — backend/seed_db.py

Loads the cleaned Parquet file into PostgreSQL.
Run this locally AFTER starting the db container.

Usage:
    python backend/seed_db.py
"""

import pandas as pd
from sqlalchemy import create_engine, text
from pathlib import Path
from dotenv import load_dotenv
import os

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Use DATABASE_URL_LOCAL — connects to localhost:5432 from your machine
DATABASE_URL = os.getenv("DATABASE_URL_LOCAL", "postgresql://user:password@localhost:5432/science")
PARQUET_FILE = Path(__file__).resolve().parent.parent / "data" / "processed" / "clean_all_years.parquet"


def seed():
    print("=" * 60)
    print("Science Aggregator — Database Seeder")
    print("=" * 60)
    print(f"Source : {PARQUET_FILE}")
    print(f"Target : {DATABASE_URL}")

    print("\n[1/3] Loading Parquet...")
    df = pd.read_parquet(PARQUET_FILE)
    print(f"  Rows    : {len(df):,}")
    print(f"  Columns : {len(df.columns)}")

    print("\n[2/3] Preparing data...")
    for col in df.select_dtypes("object").columns:
        df[col] = df[col].str.slice(0, 2000)
    df = df.where(pd.notna(df), None)

    print("\n[3/3] Writing to PostgreSQL...")
    engine = create_engine(DATABASE_URL)
    df.to_sql(
        name="projects",
        con=engine,
        if_exists="replace",
        index=False,
        chunksize=1000,
        method="multi",
    )

    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM projects")).scalar()

    print(f"\n Done! {count:,} records in database.")


if __name__ == "__main__":
    seed()