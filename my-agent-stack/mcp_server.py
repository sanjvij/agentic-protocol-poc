"""
MCP Data Server: Procurement Data Hub
======================================
Exposes procurement order data over the Model Context Protocol using FastMCP.
Runs over stdio transport — drop this behind any MCP-compatible LLM host.
"""

import sqlite3
from contextlib import asynccontextmanager
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Database lifecycle
# ---------------------------------------------------------------------------

_db: sqlite3.Connection | None = None

REORDER_THRESHOLD = 100

SEED_ORDERS: list[tuple[str, str, str, int]] = [
    ("ORD-001", "Laptop",   "DELIVERED", 50),
    ("ORD-002", "Keyboard", "DELAYED",   200),
    ("ORD-003", "Monitor",  "PENDING",   75),
]


@asynccontextmanager
async def lifespan(server: FastMCP):
    """Open the SQLite connection, bootstrap schema, seed data, then clean up."""
    global _db
    _db = sqlite3.connect("database.db", check_same_thread=False)
    _db.row_factory = sqlite3.Row

    _db.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            order_id  TEXT PRIMARY KEY,
            item_name TEXT    NOT NULL,
            status    TEXT    NOT NULL,
            quantity  INTEGER NOT NULL
        )
    """)
    _db.executemany(
        "INSERT OR IGNORE INTO orders VALUES (?, ?, ?, ?)",
        SEED_ORDERS,
    )
    _db.commit()

    yield  # server runs here

    _db.close()


# ---------------------------------------------------------------------------
# Server initialisation
# ---------------------------------------------------------------------------

mcp = FastMCP("Procurement Data Hub", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def get_order_status(order_id: str) -> str:
    """Return the current status and quantity for a single procurement order.

    Args:
        order_id: The unique order identifier (e.g. 'ORD-001').

    Returns:
        A pipe-delimited summary string, or a not-found message.
    """
    assert _db is not None, "Database not initialised"
    row = _db.execute(
        "SELECT order_id, item_name, status, quantity FROM orders WHERE order_id = ?",
        (order_id,),
    ).fetchone()

    if row is None:
        return f"Order {order_id} not found."

    return (
        f"Order {row['order_id']} | "
        f"Item: {row['item_name']} | "
        f"Status: {row['status']} | "
        f"Qty: {row['quantity']}"
    )


@mcp.tool()
def query_inventory_db(item_name: str) -> str:
    """Check available stock for an item and flag whether a reorder is required.

    Reorder is triggered when quantity falls below the REORDER_THRESHOLD (100 units).

    Args:
        item_name: The item to look up (e.g. 'Keyboard'). Case-insensitive.

    Returns:
        A plain-English stock summary with reorder guidance.
    """
    assert _db is not None, "Database not initialised"
    row = _db.execute(
        "SELECT item_name, quantity FROM orders WHERE item_name = ? COLLATE NOCASE",
        (item_name,),
    ).fetchone()

    if row is None:
        return f"'{item_name}' not found in inventory."

    qty = row["quantity"]
    reorder_flag = (
        f" REORDER REQUIRED (threshold: {REORDER_THRESHOLD} units)."
        if qty < REORDER_THRESHOLD
        else " No reorder needed."
    )
    return f"{row['item_name']}: {qty} units in stock.{reorder_flag}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="stdio")
