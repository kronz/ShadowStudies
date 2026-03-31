#!/usr/bin/env python3
"""
Build Reference/colleagues.json and content/org/colleagues.json from AutodeskTotal.csv.
Run from repo root: python scripts/build_colleagues_json.py
"""
import csv
import json
import os
import re
from collections import defaultdict

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "AutodeskTotal.csv")
REFERENCE_PATH = os.path.join(os.path.dirname(__file__), "..", "Reference", "colleagues.json")
CONTENT_ORG_PATH = os.path.join(os.path.dirname(__file__), "..", "content", "org", "colleagues.json")

def parse_name_cell(cell):
    """Extract display name and id from 'First Last (12345)' or 'First Last (On Leave) (12345)'."""
    if not cell or not cell.strip():
        return None, None
    cell = cell.strip()
    # Match trailing (id) or (On Leave) (id)
    m = re.match(r"^(.+?)\s*\((?:On Leave\)\s*)?(\d+)\)\s*$", cell)
    if m:
        return m.group(1).strip(), m.group(2)
    # No id
    return cell, None

def main():
    if not os.path.exists(CSV_PATH):
        print(f"CSV not found: {CSV_PATH}")
        return

    by_id = {}
    rows = []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            uid = row.get("Unique Identifier", "").strip()
            name_cell = row.get("Name", "")
            display_name, pid = parse_name_cell(name_cell)
            if not display_name:
                continue
            title = (row.get("Line Detail 1") or "").strip()
            org = (row.get("Organization Name") or "").strip()
            reports_to_uid = (row.get("Reports To") or "").strip()
            rows.append({
                "uid": uid,
                "name": display_name,
                "id": pid,
                "title": title,
                "org": org,
                "reports_to_uid": reports_to_uid,
            })
            by_id[uid] = rows[-1]

    # Resolve manager names
    for r in rows:
        if r["reports_to_uid"] and r["reports_to_uid"] in by_id:
            r["reports_to"] = by_id[r["reports_to_uid"]]["name"]
        else:
            r["reports_to"] = None

    # Dedupe by (name, id): keep one row per person. Prefer row with most specific org (Forma, then AEC).
    by_person = {}
    for r in rows:
        key = (r["name"], r["id"] or "")
        if key not in by_person:
            by_person[key] = r
        else:
            existing = by_person[key]
            # Prefer AEC Forma Design, then other AEC, then keep first
            def rank(o):
                if not o: return 0
                if "Forma Design" in o: return 3
                if "AEC " in o or o.startswith("AEC "): return 2
                if "AEC" in o: return 1
                return 0
            if rank(r["org"]) > rank(existing["org"]):
                by_person[key] = r

    people = list(by_person.values())

    # Build colleagues list (schema from ADVANCED.md + org)
    colleagues = []
    first_name_to_full = defaultdict(list)
    for p in people:
        full = p["name"]
        first = full.split()[0] if full else ""
        if first:
            first_name_to_full[first].append(full)
        colleagues.append({
            "name": full,
            "role": p["title"] or "",
            "team": p["org"] or "",
            "reportsTo": p["reports_to"],
            "aliases": [first] if first else [],
        })

    # commonAliases: first name -> full name when unique; else "First Last" -> "First Last" for disambiguation
    common_aliases = {}
    for first, full_list in first_name_to_full.items():
        uniq = sorted(set(full_list))
        if len(uniq) == 1:
            common_aliases[first] = uniq[0]
        else:
            for full in uniq:
                common_aliases[full] = full

    # userContext (current user from CLAUDE.local)
    user_context = {
        "name": "Zach Kron",
        "role": "Sr. Principal Product Manager",
        "team": "AEC Forma Design",
        "manager": "Hallvard Nydal",
        "division": "Forma Design (AEC Solutions)",
    }

    payload = {
        "lookup": {
            "commonAliases": common_aliases,
            "userContext": user_context,
        },
        "colleagues": colleagues,
    }

    # Ensure dirs exist and write
    for path in [REFERENCE_PATH, CONTENT_ORG_PATH]:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print(f"Wrote {path} ({len(colleagues)} colleagues)")

if __name__ == "__main__":
    main()
