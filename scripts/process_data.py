"""
Science Aggregator — scripts/process_data.py

Loads all raw JSON files from data/raw/, cleans them,
and saves a single Parquet file to data/processed/.

Usage:
    python scripts/process_data.py
"""

import json
import pandas as pd
from pathlib import Path

# ─────────────────────────────────────────────
# PATHS
# Path(__file__) always points to this script file,
# so paths work correctly no matter where you run the script from.
# ─────────────────────────────────────────────
BASE_DIR      = Path(__file__).resolve().parent.parent  # Science-aggregator/
RAW_DIR       = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
OUTPUT_FILE   = PROCESSED_DIR / "clean_all_years.parquet"

# Columns with fill rate below this threshold will be dropped
FILL_THRESHOLD = 0.30

# ─────────────────────────────────────────────
# COLUMNS TO ALWAYS DROP
# These are dropped regardless of fill rate:
# - giant text blobs useless for a dashboard
# - purely administrative fields
# - duplicates of other columns
# ─────────────────────────────────────────────
ALWAYS_DROP = [
    # Giant text blobs — useless for dashboard/RAG
    "international_scientific_collaboration",
    "scientific_groundwork",
    "scientific_technology_priorities",

    # Administrative junk
    "personal_data_agreement",
    "ptni",
    "identify_executor_method",
    "grnti_oecd_description",
    "interstate_target_program",
    "full_innovation_cycle_scientific_technical_program",
    "federal_scientific_technical_program",

    # Customer supervisor — not needed for aggregation
    "customer.supervisor_name",
    "customer.supervisor_surname",
    "customer.supervisor_patronymic",

    # Executor duplicates / low value
    "executor.short_name",
    "executor.okopf",
    "executor.original_name",
    "executor.original_short_name",
    "executor.supervisor_name",       # rector name — not useful
    "executor.supervisor_surname",
    "executor.supervisor_patronymic",

    # Customer duplicates
    "customer.okopf",
    "customer.original_name",
    "customer.original_short_name",

    # work_supervisor broken into parts — we keep supervisor_full_name instead
    "work_supervisor.name",
    "work_supervisor.surname",
    "work_supervisor.patronymic",
    "work_supervisor.territory",
    "work_supervisor.position",
    "work_supervisor.rank",           # 28% fill — almost empty
    "work_supervisor.orcid",          # 29% fill — almost empty

    # organization_supervisor — second supervisor, not needed for dashboard
    "organization_supervisor.name",
    "organization_supervisor.surname",
    "organization_supervisor.patronymic",
    "organization_supervisor.territory",
    "organization_supervisor.position",
    
    
    "source_file",
    "customer.short_name",
    "udk",
]


# ─────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────

def join_string_list(val) -> str:
    """Converts a list of strings into a single semicolon-separated string.
    Example: ["machine learning", "AI"] -> "machine learning; AI"
    """
    if not isinstance(val, list) or len(val) == 0:
        return None
    return "; ".join(str(x) for x in val if x)


def extract_names_from_list_of_dicts(val, key="name") -> str:
    """Extracts a specific field from a list of dicts and joins them.
    Example: [{"code": "10.27", "name": "Civil Law"}, ...] -> "Civil Law; ..."
    """
    if not isinstance(val, list) or len(val) == 0:
        return None
    parts = [
        str(item[key]) for item in val
        if isinstance(item, dict) and key in item
    ]
    return "; ".join(parts) if parts else None


def extract_total_budget(budgets_val) -> float:
    """Sums all 'funds' values from a list of budget dicts (in thousands RUB).
    Example: [{"funds": "18978.6", ...}, {"funds": "5000.0", ...}] -> 23978.6
    """
    if not isinstance(budgets_val, list) or len(budgets_val) == 0:
        return None
    total = 0.0
    for b in budgets_val:
        if isinstance(b, dict):
            try:
                total += float(b.get("funds", 0) or 0)
            except (ValueError, TypeError):
                pass
    return total if total > 0 else None


def extract_coexecutors_names(val) -> str:
    """Extracts co-executor organization names from a list of dicts."""
    if not isinstance(val, list) or len(val) == 0:
        return None
    names = [
        co.get("name") or co.get("short_name")
        for co in val
        if isinstance(co, dict) and (co.get("name") or co.get("short_name"))
    ]
    return "; ".join(names) if names else None


# ─────────────────────────────────────────────
# STEP 1 — LOAD ALL JSON FILES
# ─────────────────────────────────────────────

def load_all_files(raw_dir: Path) -> pd.DataFrame:
    """Loads all JSON files from raw_dir and concatenates them into one DataFrame."""
    files = sorted(raw_dir.glob("*.json"))
    if not files:
        raise FileNotFoundError(f"No JSON files found in {raw_dir}")

    print(f"Found {len(files)} files:")
    dfs = []
    for file in files:
        with open(file, "r", encoding="utf-8") as f:
            data = json.load(f)
        cards = data.get("cards", data) if isinstance(data, dict) else data
        df = pd.json_normalize(cards)
        df["source_file"] = file.name
        dfs.append(df)
        print(f"  {file.name}: {len(df)} records")

    full_df = pd.concat(dfs, ignore_index=True)
    print(f"  Combined shape: {full_df.shape}")
    return full_df


# ─────────────────────────────────────────────
# STEP 2 — PROCESS LIST COLUMNS
# There are 4 types of list columns in this dataset:
#   1. List of strings -> join with '; '
#   2. List of dicts   -> extract 'name' field, join with '; '
#   3. budgets list    -> sum all 'funds' values into one number
#   4. stages list     -> count number of stages
# ─────────────────────────────────────────────

def process_list_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Flattens all list/dict columns into simple scalar values."""

    # Type 1: list of strings -> joined string
    str_list_cols = [
        "keyword_list",
        "nioktr_types",
        "priority_directions",
        "critical_technologies",
        "scientific_technology_priorities",
        "scientific_educational_centers",
        "scientific_centers",
        "national_technology_initiatives",
        "nioktr_bases",
    ]
    for col in str_list_cols:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: join_string_list(x) if isinstance(x, list) else x
            )

    # Type 2: list of dicts -> extract 'name' field
    for col in ["rubrics", "oecds", "oesrs"]:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: extract_names_from_list_of_dicts(x)
                if isinstance(x, list) else x
            )
            df[col] = df[col].replace("", None)

    # Type 3: budgets -> total funding in thousands RUB
    if "budgets" in df.columns:
        df["budget_total_thousands"] = df["budgets"].apply(extract_total_budget)
        df.drop(columns=["budgets"], inplace=True)

    # Type 4: stages -> number of project stages
    if "stages" in df.columns:
        df["stages_count"] = df["stages"].apply(
            lambda x: len(x) if isinstance(x, list) else 0
        )
        df.drop(columns=["stages"], inplace=True)

    # co-executors -> organization names as string
    if "coexecutors" in df.columns:
        df["coexecutors_names"] = df["coexecutors"].apply(extract_coexecutors_names)
        df.drop(columns=["coexecutors"], inplace=True)

    return df


# ─────────────────────────────────────────────
# STEP 3 — BUILD SUPERVISOR FULL NAME
# ─────────────────────────────────────────────

def create_supervisor_full_name(df: pd.DataFrame) -> pd.DataFrame:
    """Combines surname + name + patronymic into one column, then drops the parts."""
    cols = [
        "work_supervisor.surname",
        "work_supervisor.name",
        "work_supervisor.patronymic"
    ]
    if all(c in df.columns for c in cols):
        df["supervisor_full_name"] = (
            df["work_supervisor.surname"].fillna("") + " " +
            df["work_supervisor.name"].fillna("") + " " +
            df["work_supervisor.patronymic"].fillna("")
        ).str.strip().replace("", None)
    return df


# ─────────────────────────────────────────────
# STEP 4 — DROP USELESS COLUMNS
# Order matters here:
#   1. First process lists (step 2) so empty lists become None
#   2. Then drop by fill rate — otherwise empty lists count as "filled"
# ─────────────────────────────────────────────

def drop_useless_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Drops junk columns, low-fill columns, and fully empty columns."""

    # Drop hardcoded junk columns
    to_drop = [c for c in ALWAYS_DROP if c in df.columns]
    df.drop(columns=to_drop, inplace=True)
    print(f"  Dropped {len(to_drop)} junk columns")

    # Drop columns where less than 30% of rows have a value
    fill_rate = df.notna().mean()
    low_fill = fill_rate[fill_rate < FILL_THRESHOLD].index.tolist()
    df.drop(columns=low_fill, inplace=True)
    print(f"  Dropped {len(low_fill)} low-fill columns (<30%): {low_fill}")

    # Drop columns that are completely empty after list processing
    # (e.g. executor.territory was a list of Nones -> now all None)
    empty = df.columns[df.notna().mean() == 0].tolist()
    if empty:
        df.drop(columns=empty, inplace=True)
        print(f"  Dropped {len(empty)} fully empty columns: {empty}")

    return df


# ─────────────────────────────────────────────
# STEP 5 — CLEAN TYPES AND DEDUPLICATE
# ─────────────────────────────────────────────

def clean_and_cast(df: pd.DataFrame) -> pd.DataFrame:
    """Casts columns to correct types, cleans garbage strings, deduplicates."""

    # Parse date strings into proper datetime objects
    for col in ["created_date", "start_date", "end_date", "contract_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Add year column — convenient for dashboard year filter
    if "start_date" in df.columns:
        df["year"] = df["start_date"].dt.year.astype("Int64")

    # Cast numeric columns
    for col in ["budget_total_thousands", "reports_number"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "stages_count" in df.columns:
        df["stages_count"] = df["stages_count"].fillna(0).astype(int)

    # Replace meaningless string values with None
    junk_values = {"", "Отсутствует", "Нет", "-", "None", "null"}
    for col in df.select_dtypes("object").columns:
        df[col] = df[col].apply(
            lambda x: None if str(x).strip() in junk_values else x
        )

    # Deduplicate by registration_number.
    # The same project can appear in multiple yearly JSON files.
    # keep='last' gives us the most recently downloaded version.
    before = len(df)
    df = df.drop_duplicates(subset=["registration_number"], keep="last")
    removed = before - len(df)
    if removed:
        print(f"  Removed {removed} duplicate records")

    return df


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Science Aggregator — Data Processing Pipeline")
    print("=" * 60)
    print(f"Input  : {RAW_DIR}")
    print(f"Output : {OUTPUT_FILE}")

    print("\n[1/5] Loading raw JSON files...")
    df = load_all_files(RAW_DIR)

    print("\n[2/5] Processing list/dict columns...")
    df = process_list_columns(df)

    print("\n[3/5] Building supervisor full name...")
    df = create_supervisor_full_name(df)

    print("\n[4/5] Dropping useless columns...")
    df = drop_useless_columns(df)
    print(f"  Remaining: {len(df.columns)} columns")
    print(f"  {list(df.columns)}")

    print("\n[5/5] Cleaning types and deduplicating...")
    df = clean_and_cast(df)

    # Save
    df.to_parquet(OUTPUT_FILE, index=False, engine="pyarrow")

    print(f"\n Done!")
    print(f"   Records : {len(df):,}")
    print(f"   Columns : {len(df.columns)}")
    print(f"   File    : {OUTPUT_FILE}")
    print(f"   Size    : {OUTPUT_FILE.stat().st_size / 1024 / 1024:.1f} MB")

    print("\n Quick stats:")
    if "year" in df.columns:
        print(f"   Years   : {int(df['year'].min())} – {int(df['year'].max())}")
    if "budget_total_thousands" in df.columns:
        total = df["budget_total_thousands"].sum()
        print(f"   Budget  : {total / 1_000_000:.1f} billion RUB")
    if "executor.name" in df.columns:
        print(f"   Institutions : {df['executor.name'].nunique():,}")
    if "nioktr_types" in df.columns:
        print("   Top research types:")
        for val, cnt in df["nioktr_types"].value_counts().head(5).items():
            print(f"     {val}: {cnt:,}")

    return df


if __name__ == "__main__":
    df = main()