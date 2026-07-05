"""
Agent Runtime: Procurement Orchestrator
========================================
Framework-free agent loop that:
  1. Spawns mcp_server.py as a subprocess (MCP stdio transport)
  2. Dynamically registers MCP tools + one virtual A2A delegation tool
  3. Runs a vanilla Python tool-use loop until the LLM stops calling tools
  4. Emits structured AG-UI protocol events to stdout throughout
  5. When delegate_to_analyst is called, spawns analyst_agent.py (A2A),
     passes through any [A2UI EVENT] lines it emits, then resumes the loop

Provider selection: ANTHROPIC_API_KEY takes precedence over OPENAI_API_KEY.
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# ── Provider detection ────────────────────────────────────────────────────────

if "ANTHROPIC_API_KEY" in os.environ:
    import anthropic as _anthropic
    PROVIDER = "anthropic"
    MODEL    = "claude-sonnet-4-6"
elif "OPENAI_API_KEY" in os.environ:
    from openai import OpenAI as _OpenAI
    PROVIDER = "openai"
    MODEL    = "gpt-4o"
else:
    sys.exit("Set ANTHROPIC_API_KEY or OPENAI_API_KEY before running.")

ANALYST_PATH = Path(__file__).parent / "analyst_agent.py"

# ── AG-UI event emitter ───────────────────────────────────────────────────────

def emit(event_type: str, payload: dict[str, Any]) -> None:
    """Write one AG-UI protocol event line to stdout."""
    print(f"[AG-UI EVENT: {event_type}] {json.dumps(payload)}", flush=True)

# ── Virtual A2A delegation tool (not from MCP) ────────────────────────────────
#
# Injected alongside MCP tools so the LLM can choose to delegate complex
# multi-item assessments to the specialist analyst_agent.py sub-process.

_DELEGATE_DESC = (
    "Delegate a full inventory health assessment to the specialist Analyst Agent. "
    "Use when the user asks for an inventory overview, health report, or stock "
    "status across all items. Returns a structured visual report."
)
_DELEGATE_PARAMS = {
    "type": "object",
    "properties": {
        "task_description": {
            "type":        "string",
            "description": "The inventory analysis task to assign to the analyst.",
        }
    },
    "required": ["task_description"],
}

DELEGATE_TOOL_ANTHROPIC: dict = {
    "name":         "delegate_to_analyst",
    "description":  _DELEGATE_DESC,
    "input_schema": _DELEGATE_PARAMS,
}

DELEGATE_TOOL_OPENAI: dict = {
    "type": "function",
    "function": {
        "name":        "delegate_to_analyst",
        "description": _DELEGATE_DESC,
        "parameters":  _DELEGATE_PARAMS,
    },
}

# ── A2A: call the analyst sub-agent ──────────────────────────────────────────

async def call_analyst(task_description: str) -> str:
    """
    A2A protocol: spawn analyst_agent.py as a child process.
    Send a JSON task command on stdin; read structured output on stdout.
    Any [A2UI EVENT] or [AG-UI EVENT] lines are passed through to our own
    stdout immediately so they propagate up through the SSE bridge to React.
    Returns a plain-text summary for injection into the LLM's context window.
    """
    command_json = json.dumps({"task": task_description}).encode()

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(ANALYST_PATH),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout_bytes, _ = await asyncio.wait_for(
        proc.communicate(input=command_json),
        timeout=30,
    )

    summary_parts: list[str] = []

    for raw_line in stdout_bytes.decode().splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # Pass-through: bubble every event line up to primary agent's stdout
        if line.startswith("[A2UI EVENT:") or line.startswith("[AG-UI EVENT:"):
            print(line, flush=True)

        # Extract item summaries to feed back into LLM context
        if line.startswith("[A2UI EVENT: WIDGET_RENDER]"):
            try:
                payload = json.loads(line.split("] ", 1)[1])
                for item in payload.get("data", {}).get("items", []):
                    summary_parts.append(
                        f"{item['name']}: {item['stock']} units ({item['status']})"
                    )
            except (IndexError, KeyError, json.JSONDecodeError):
                pass

    if summary_parts:
        return "Analyst health report — " + "; ".join(summary_parts)
    return "Analyst completed inventory health assessment. Visual report injected."

# ── MCP → LLM tool format converters ─────────────────────────────────────────

def mcp_to_anthropic_tools(mcp_tools) -> list[dict]:
    return [
        {
            "name":         t.name,
            "description":  t.description or "",
            "input_schema": t.inputSchema,
        }
        for t in mcp_tools
    ]

def mcp_to_openai_tools(mcp_tools) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name":        t.name,
                "description": t.description or "",
                "parameters":  t.inputSchema,
            },
        }
        for t in mcp_tools
    ]

# ── LLM streaming turns ───────────────────────────────────────────────────────

def anthropic_stream_turn(
    client,
    messages: list[dict],
    tools: list[dict],
) -> tuple[str, list]:
    """Stream one Anthropic turn. Emits TOKEN_STREAM per chunk."""
    full_text = ""

    with client.messages.stream(
        model=MODEL,
        max_tokens=1024,
        tools=tools,
        messages=messages,
    ) as stream:
        for chunk in stream.text_stream:
            full_text += chunk
            emit("TOKEN_STREAM", {"token": chunk})
        final = stream.get_final_message()

    tool_uses = [b for b in final.content if b.type == "tool_use"]
    messages.append({"role": "assistant", "content": final.content})
    return full_text, tool_uses


def openai_stream_turn(
    client,
    messages: list[dict],
    tools: list[dict],
) -> tuple[str, list]:
    """Stream one OpenAI turn. Emits TOKEN_STREAM per delta chunk."""
    full_text    = ""
    tool_call_acc: dict[int, dict] = {}

    stream = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=tools or None,
        tool_choice="auto" if tools else None,
        stream=True,
    )

    for chunk in stream:
        choice = chunk.choices[0]
        delta  = choice.delta

        if delta.content:
            full_text += delta.content
            emit("TOKEN_STREAM", {"token": delta.content})

        if delta.tool_calls:
            for tc_delta in delta.tool_calls:
                idx = tc_delta.index
                if idx not in tool_call_acc:
                    tool_call_acc[idx] = {"id": "", "name": "", "arguments_str": ""}
                if tc_delta.id:
                    tool_call_acc[idx]["id"] = tc_delta.id
                if tc_delta.function.name:
                    tool_call_acc[idx]["name"] = tc_delta.function.name
                if tc_delta.function.arguments:
                    tool_call_acc[idx]["arguments_str"] += tc_delta.function.arguments

    tool_calls = []
    for entry in tool_call_acc.values():
        entry["input"] = json.loads(entry["arguments_str"] or "{}")
        tool_calls.append(entry)

    assistant_msg: dict[str, Any] = {"role": "assistant", "content": full_text or None}
    if tool_calls:
        assistant_msg["tool_calls"] = [
            {
                "id":       tc["id"],
                "type":     "function",
                "function": {"name": tc["name"], "arguments": tc["arguments_str"]},
            }
            for tc in tool_calls
        ]
    messages.append(assistant_msg)
    return full_text, tool_calls

# ── Main agent loop ───────────────────────────────────────────────────────────

async def run(user_prompt: str) -> None:
    server_path = Path(__file__).parent / "mcp_server.py"
    # Use sys.executable so MCP server inherits the active conda environment
    params = StdioServerParameters(command=sys.executable, args=[str(server_path)])

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools_result = await session.list_tools()

            # Build LLM tool list: MCP tools + virtual A2A delegation tool
            if PROVIDER == "anthropic":
                llm_tools  = mcp_to_anthropic_tools(tools_result.tools) + [DELEGATE_TOOL_ANTHROPIC]
                llm_client = _anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            else:
                llm_tools  = mcp_to_openai_tools(tools_result.tools) + [DELEGATE_TOOL_OPENAI]
                llm_client = _OpenAI(api_key=os.environ["OPENAI_API_KEY"])

            tool_names = [t.name for t in tools_result.tools] + ["delegate_to_analyst"]

            emit("RUN_STARTED", {
                "prompt":   user_prompt,
                "provider": PROVIDER,
                "model":    MODEL,
                "tools":    tool_names,
            })

            messages:   list[dict] = [{"role": "user", "content": user_prompt}]
            final_text: str        = ""

            # ── Framework-free tool-use loop ──────────────────────────────────
            while True:
                if PROVIDER == "anthropic":
                    text, tool_calls = anthropic_stream_turn(llm_client, messages, llm_tools)
                else:
                    text, tool_calls = openai_stream_turn(llm_client, messages, llm_tools)

                if text:
                    final_text = text

                if not tool_calls:
                    break

                tool_results_for_history = []

                for tc in tool_calls:
                    name  = tc.name  if PROVIDER == "anthropic" else tc["name"]
                    args  = tc.input if PROVIDER == "anthropic" else tc["input"]
                    tc_id = tc.id    if PROVIDER == "anthropic" else tc["id"]

                    emit("TOOL_START", {"tool": name, "args": args})

                    if name == "delegate_to_analyst":
                        # ── A2A: hand off to specialist sub-agent ─────────────
                        result_text = await call_analyst(
                            args.get("task_description", "inventory health assessment")
                        )
                    else:
                        # ── MCP: execute via local data server ────────────────
                        mcp_result  = await session.call_tool(name, arguments=args)
                        result_text = mcp_result.content[0].text if mcp_result.content else ""

                    emit("TOOL_COMPLETE", {"tool": name, "result": result_text})

                    if PROVIDER == "anthropic":
                        tool_results_for_history.append({
                            "type":        "tool_result",
                            "tool_use_id": tc_id,
                            "content":     result_text,
                        })
                    else:
                        tool_results_for_history.append({
                            "role":         "tool",
                            "tool_call_id": tc_id,
                            "content":      result_text,
                        })

                if PROVIDER == "anthropic":
                    messages.append({"role": "user", "content": tool_results_for_history})
                else:
                    messages.extend(tool_results_for_history)

            emit("RUN_FINISHED", {"final_text": final_text[:200]})

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    prompt = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Give me a full inventory health report across all items."
    )
    asyncio.run(run(prompt))
