# CLAUDE.md — Agentic Protocol Stack POC

## Project Purpose
Production-ready proof-of-concept demonstrating a layered **Agentic Protocol Stack** (MCP → AG-UI → A2A → A2UI) in Python. Directly supports a 4-part technical article series. Every architectural layer must remain visible and readable in the source — no magic, no heavy frameworks.

## Architecture Map

```
my-agent-stack/
  mcp_server.py       Layer 1 — MCP Data Server (FastMCP, SQLite)
  primary_agent.py    Layer 2 — Agent Runtime + AG-UI event emitter
  analyst_agent.py    Layer 3 — A2A specialist sub-agent (A2UI widget emitter)
  evaluate_agent.py   Layer 4 — Evaluation harness (benchmark + guardrail tests)

frontend/
  server.js           SSE bridge: spawns Python agent, forwards events over HTTP
  src/App.jsx         React dashboard: renders AG-UI + A2UI events as visual timeline
```

## Protocol Vocabulary

### AG-UI events (stdout of `primary_agent.py`)
```
[AG-UI EVENT: RUN_STARTED]   {"prompt", "provider", "model", "tools"}
[AG-UI EVENT: TOKEN_STREAM]  {"token"}
[AG-UI EVENT: TOOL_START]    {"tool", "args"}
[AG-UI EVENT: TOOL_COMPLETE] {"tool", "result"}
[AG-UI EVENT: RUN_FINISHED]  {"final_text"}
```

### A2UI events (stdout of `analyst_agent.py`, passed through by primary agent)
```
[A2UI EVENT: WIDGET_RENDER]  {"type": "INVENTORY_HEALTH_CARD", "data": {...}}
```

## Key Constraints (enforce in all changes)
- **No LangChain, CrewAI, LangGraph** — vanilla Python loop only
- **Token-minimal** — every LLM call carries only what is needed
- **Framework-free execution layer** — the `while True:` loop in `primary_agent.py` must stay visible and readable
- **No heavy state-management libraries in React** — `useState` + native `EventSource` only
- Python 3.10+ type syntax (`X | Y`, `list[dict]`) throughout

## Environment Setup

```bash
# Python (conda)
conda create -n agentic-stack python=3.11 -y
conda activate agentic-stack
pip install "mcp[cli]>=1.5.0" anthropic   # or: openai

# Node (frontend)
cd frontend
npm install
```

## Required Environment Variables

```bash
# One of these must be set before running any Python agent script:
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...

# For the frontend SSE bridge, put the key in frontend/.env:
echo "ANTHROPIC_API_KEY=sk-ant-..." > frontend/.env
```

`frontend/.env` is gitignored. Never commit it.

## How to Run

```bash
# MCP server standalone (stdio — for MCP Inspector)
cd my-agent-stack
mcp dev mcp_server.py

# Agent CLI (fires one prompt, prints AG-UI event stream)
ANTHROPIC_API_KEY=... python my-agent-stack/primary_agent.py "What is the status of ORD-002?"

# Full dashboard (Express SSE + Vite React, both on one command)
cd frontend
npm run dev          # → http://localhost:5173

# Evaluation suite (runs 3 benchmark test cases)
cd my-agent-stack
ANTHROPIC_API_KEY=... python evaluate_agent.py
```

## MCP Tools Registered

| Tool | Args | Returns |
|------|------|---------|
| `get_order_status` | `order_id: str` | Pipe-delimited order summary |
| `query_inventory_db` | `item_name: str` | Stock count + reorder flag |
| `delegate_to_analyst` | `task_description: str` | Spawns `analyst_agent.py` via A2A; triggers A2UI widget |

`delegate_to_analyst` is a virtual tool injected by `primary_agent.py` — it is not registered in the MCP server.

## SQLite Seed Data (`database.db`)

| order_id | item_name | status    | quantity |
|----------|-----------|-----------|----------|
| ORD-001  | Laptop    | DELIVERED | 50       |
| ORD-002  | Keyboard  | DELAYED   | 200      |
| ORD-003  | Monitor   | PENDING   | 75       |

`database.db` is created at runtime by `mcp_server.py`'s lifespan handler. It is gitignored.

## Gitignored Files (never commit)
- `frontend/.env` — API keys
- `*.db` — runtime SQLite databases
- `frontend/node_modules/` — npm dependencies
- `__pycache__/`, `*.pyc`
- `a2a-samples-base/` — read-only reference repo submodule

## Security Rules for Claude Code
- **Never read `*.env` files or any file whose name contains `.env`** — they contain live API keys
- **Never print, log, or include `.env` file contents** in any response or agent report
- To check whether a key is set, use `echo $ANTHROPIC_API_KEY | cut -c1-10` (shows only the prefix) — never read the file directly
- If an explore/research agent needs to audit secrets hygiene, only check `git check-ignore` status — do not read the file contents
