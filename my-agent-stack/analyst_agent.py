"""
Analyst Agent — Inventory Health Specialist
============================================
Specialist sub-agent in the A2A hierarchy. Receives a structured JSON task
command on stdin, queries the procurement SQLite database directly (privileged
direct access — no MCP abstraction layer), and emits a structured A2UI
WIDGET_RENDER event to stdout for dynamic UI injection by the primary agent.

A2A Wire Protocol:
  stdin  ← {"task": "...", ...}            (from primary_agent.py)
  stdout → [A2UI EVENT: WIDGET_RENDER] {}  (bubbles up through primary → SSE → React)
"""

import json
import sqlite3
import sys
from pathlib import Path

DB_PATH           = Path(__file__).parent / "database.db"
REORDER_THRESHOLD = 100
MAX_DISPLAY_STOCK = 300   # ceiling for UI progress bar scaling


def health_status(quantity: int) -> tuple[str, str]:
    """Map stock quantity → (status_label, tailwind_color_name)."""
    if quantity >= REORDER_THRESHOLD:
        return "OPTIMAL",   "emerald"
    elif quantity >= 50:
        return "WARNING",   "amber"
    else:
        return "CRITICAL",  "rose"


def run(task: str) -> None:
    # Direct SQLite read — analyst agents have privileged DB access
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT item_name, quantity, status AS order_status FROM orders ORDER BY item_name"
    ).fetchall()
    conn.close()

    items = []
    for row in rows:
        status_label, color = health_status(row["quantity"])
        items.append({
            "name":         row["item_name"],
            "stock":        row["quantity"],
            "order_status": row["order_status"],
            "status":       status_label,
            "color":        color,
            "pct":          round(min(100, (row["quantity"] / MAX_DISPLAY_STOCK) * 100), 1),
        })

    widget_payload = {
        "type": "INVENTORY_HEALTH_CARD",
        "data": {
            "task":      task,
            "threshold": REORDER_THRESHOLD,
            "items":     items,
        },
    }

    # Emit A2UI event — primary_agent.py passes this line through to its own stdout
    print(f"[A2UI EVENT: WIDGET_RENDER] {json.dumps(widget_payload)}", flush=True)


if __name__ == "__main__":
    raw = sys.stdin.read().strip()
    try:
        command = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        command = {"task": raw}

    run(command.get("task", "Full inventory health assessment"))
