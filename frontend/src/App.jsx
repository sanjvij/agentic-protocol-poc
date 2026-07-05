/**
 * AG-UI / A2UI Architectural Ledger
 * ────────────────────────────────────
 * Four-track visual timeline exposing the full protocol stack:
 *
 *   Track A — LLM (Cognitive Model Layer)      → blue    → TOKEN_STREAM
 *   Track B — Agent Runtime (Execution Layer)  → amber/emerald → TOOL_CALL
 *   Track C — A2UI Widget Injection            → violet  → WIDGET_RENDER
 *   Track D — Session bookends                 → slate/teal
 */

import { useState, useRef, useEffect, useCallback } from 'react'

const DEFAULT_PROMPT =
  'Give me a full inventory health report across all items.'

// ── Micro utilities ───────────────────────────────────────────────────────────

function Spinner({ color = 'amber' }) {
  const borders = {
    amber: 'border-amber-400',
    blue:  'border-blue-400',
    white: 'border-white',
  }
  return (
    <span className={`inline-block w-3.5 h-3.5 border-2 ${borders[color] ?? 'border-gray-400'} border-t-transparent rounded-full animate-spin`} />
  )
}

function LayerPill({ label, icon, color }) {
  const palette = {
    blue:   'bg-blue-900/60    text-blue-300    border-blue-700/50',
    amber:  'bg-amber-900/60   text-amber-300   border-amber-700/50',
    emerald:'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
    violet: 'bg-violet-900/60  text-violet-300  border-violet-700/50',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-widest uppercase px-2 py-0.5 rounded border ${palette[color]}`}>
      {icon} {label}
    </span>
  )
}

// ── Track D: Session bookend cards ────────────────────────────────────────────

function RunStartedCard({ payload }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
        <span className="text-slate-300 text-xs font-mono font-semibold tracking-widest uppercase">
          Session Initialised
        </span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono border border-slate-700">
          {payload.provider} · {payload.model}
        </span>
      </div>
      <p className="text-white text-sm font-mono mb-3 leading-relaxed">{payload.prompt}</p>
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">tools registered:</span>
        {payload.tools?.map((t) => (
          <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono border border-slate-700">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function RunFinishedCard() {
  return (
    <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 px-5 py-3 flex items-center gap-3">
      <span className="text-teal-400">⬡</span>
      <div>
        <p className="text-teal-300 text-xs font-mono font-semibold tracking-widest uppercase">Run Complete</p>
        <p className="text-teal-400/50 text-[10px] font-mono mt-0.5">
          Agent loop exited · no further tool calls requested by LLM
        </p>
      </div>
    </div>
  )
}

// ── Track A: LLM cognitive block ──────────────────────────────────────────────

function LLMBlock({ text, done }) {
  return (
    <div className="rounded-xl border border-blue-500/25 bg-blue-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-500/20 bg-blue-950/30">
        <LayerPill label="LLM · Cognitive Model Layer" icon="🧠" color="blue" />
        <span className="ml-auto text-[10px] font-mono text-blue-400/60">TOKEN_STREAM</span>
      </div>
      <div className="px-4 py-3 font-mono text-sm text-blue-100/90 leading-relaxed whitespace-pre-wrap">
        {text}
        {!done && (
          <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse align-middle rounded-sm" />
        )}
      </div>
      <div className="px-4 py-1.5 border-t border-blue-500/10 flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[10px] font-mono text-blue-400/50">
          Generating natural language · reasoning over tool results
        </span>
      </div>
    </div>
  )
}

// ── Track B: Agent Runtime execution block ────────────────────────────────────

function AgentRuntimeBlock({ name, args, status, result }) {
  const isRunning   = status === 'running'
  const isDelegation = name === 'delegate_to_analyst'

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors duration-500 ${
      isRunning ? 'border-amber-500/30 bg-amber-950/20' : 'border-emerald-500/30 bg-emerald-950/15'
    }`}>
      <div className={`flex items-center gap-2 px-4 py-2 border-b ${
        isRunning ? 'border-amber-500/20 bg-amber-950/30' : 'border-emerald-500/20 bg-emerald-950/25'
      }`}>
        <LayerPill
          label="Agent Runtime · Execution Layer"
          icon="⚙️"
          color={isRunning ? 'amber' : 'emerald'}
        />
        {isDelegation && (
          <span className="text-[10px] px-2 py-0.5 rounded border bg-violet-900/40 border-violet-700/40 text-violet-300 font-mono">
            A2A
          </span>
        )}
        <span className={`ml-auto text-[10px] font-mono ${isRunning ? 'text-amber-400/60' : 'text-emerald-400/60'}`}>
          {isRunning ? 'TOOL_START' : 'TOOL_COMPLETE'}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {isRunning
              ? <Spinner color="amber" />
              : <span className="text-emerald-400 text-sm">✓</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-gray-400 mb-1">
              {isRunning
                ? isDelegation
                  ? 'Intercepted LLM intent → dispatching to Analyst Agent via A2A'
                  : 'Intercepted LLM intent → dispatching to MCP server'
                : isDelegation
                  ? 'Analyst Agent responded → result returned to LLM context'
                  : 'MCP server responded → result returned to LLM context'
              }
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-mono font-semibold ${isRunning ? 'text-amber-200' : 'text-emerald-200'}`}>
                {name}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
                isRunning ? 'bg-amber-900/40 border-amber-700/40 text-amber-300' : 'bg-emerald-900/40 border-emerald-700/40 text-emerald-300'
              }`}>
                {isDelegation ? 'A2A SUB-AGENT' : 'MCP TOOL'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-700/50 bg-gray-950/60 px-3 py-2.5 font-mono text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            <span className="uppercase tracking-wider text-[10px]">
              {isDelegation ? 'analyst_agent.py · A2A stdio exchange' : 'MCP Data Server Subprocess · SQLite'}
            </span>
          </div>
          <div><span className="text-gray-500">fn   → </span><span className="text-sky-300">{name}()</span></div>
          <div><span className="text-gray-500">args → </span><span className="text-violet-300">{JSON.stringify(args)}</span></div>
          {result && (
            <div className="pt-1.5 mt-1 border-t border-gray-700/50">
              <span className="text-gray-500">res  → </span><span className="text-emerald-300">{result}</span>
            </div>
          )}
          {isRunning && (
            <div className="pt-1.5 mt-1 border-t border-gray-700/50 flex items-center gap-1.5 text-amber-400/60">
              <Spinner color="amber" />
              <span>{isDelegation ? 'awaiting analyst sub-agent…' : 'awaiting database response…'}</span>
            </div>
          )}
        </div>
      </div>

      <div className={`px-4 py-1.5 border-t flex items-center gap-1.5 ${
        isRunning ? 'border-amber-500/10' : 'border-emerald-500/10'
      }`}>
        <span className={`w-1 h-1 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span className={`text-[10px] font-mono ${isRunning ? 'text-amber-400/50' : 'text-emerald-400/50'}`}>
          {isRunning
            ? 'Agent Runtime owns this turn · LLM is paused'
            : 'Control returns to LLM · tool result injected into context'
          }
        </span>
      </div>
    </div>
  )
}

// ── Track C: A2UI dynamic widget — Inventory Health Card ─────────────────────

const HEALTH = {
  emerald: {
    bar:   'bg-emerald-500',
    badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40',
    text:  'text-emerald-300',
    glow:  'shadow-emerald-900/30',
  },
  amber: {
    bar:   'bg-amber-500',
    badge: 'bg-amber-900/50  text-amber-300  border-amber-700/40',
    text:  'text-amber-300',
    glow:  'shadow-amber-900/30',
  },
  rose: {
    bar:   'bg-rose-500',
    badge: 'bg-rose-900/50   text-rose-300   border-rose-700/40',
    text:  'text-rose-300',
    glow:  'shadow-rose-900/30',
  },
}

function InventoryHealthCard({ widget }) {
  const { items = [], threshold = 100 } = widget.data

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/15 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-violet-500/20 bg-violet-950/25">
        <LayerPill label="A2UI · Dynamic Widget Injection" icon="📊" color="violet" />
        <span className="ml-auto text-[10px] font-mono text-violet-400/60">WIDGET_RENDER</span>
      </div>

      {/* Widget body */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-white text-sm font-semibold tracking-tight">Inventory Health Matrix</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-violet-900/40 border border-violet-700/40 text-violet-300 font-mono">
            analyst_agent · A2A
          </span>
        </div>

        <div className="space-y-4">
          {items.map((item) => {
            const c = HEALTH[item.color] ?? HEALTH.amber
            return (
              <div key={item.name} className="space-y-2">
                {/* Label row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-white">{item.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-semibold ${c.badge}`}>
                      {item.status}
                    </span>
                    <span className="text-[10px] font-mono text-gray-600 border border-gray-800 px-1.5 py-0.5 rounded">
                      {item.order_status}
                    </span>
                  </div>
                  <span className={`text-sm font-mono font-bold tabular-nums ${c.text}`}>
                    {item.stock}
                    <span className="text-gray-600 font-normal text-[10px] ml-1">units</span>
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-gray-800/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${c.bar}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Threshold legend */}
        <div className="mt-5 pt-3 border-t border-violet-800/20 flex flex-wrap gap-4 text-[10px] font-mono text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded bg-emerald-500" /> OPTIMAL ≥{threshold}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded bg-amber-500" /> WARNING 50–{threshold - 1}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded bg-rose-500" /> CRITICAL &lt;50
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-violet-500/10 flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-violet-500" />
        <span className="text-[10px] font-mono text-violet-400/50">
          analyst_agent.py → A2A stdout → primary_agent.py → SSE → React · A2UI WIDGET_RENDER
        </span>
      </div>
    </div>
  )
}

// ── Timeline row with left-gutter protocol label ──────────────────────────────

const GUTTER = {
  RUN_STARTED:  { label: 'INIT',    color: 'text-slate-500'  },
  TEXT_BLOCK:   { label: 'LLM',     color: 'text-blue-500'   },
  TOOL_CALL:    { label: 'RUNTIME', color: 'text-amber-500'  },
  WIDGET:       { label: 'A2UI',    color: 'text-violet-500' },
  RUN_FINISHED: { label: 'DONE',    color: 'text-teal-500'   },
}

function TimelineRow({ event }) {
  const g = GUTTER[event.type]
  if (!g) return null

  const gutterLabel =
    event.type === 'TOOL_CALL' && event.status === 'done' ? 'RUNTIME' : g.label

  let content = null
  if (event.type === 'RUN_STARTED')  content = <RunStartedCard payload={event.payload} />
  if (event.type === 'TEXT_BLOCK')   content = <LLMBlock text={event.text} done={event.done} />
  if (event.type === 'TOOL_CALL')    content = <AgentRuntimeBlock {...event} />
  if (event.type === 'WIDGET')       content = <InventoryHealthCard widget={event.widget} />
  if (event.type === 'RUN_FINISHED') content = <RunFinishedCard />

  return (
    <div className="flex gap-3 items-start">
      <div className={`w-16 shrink-0 pt-3.5 text-right text-[10px] font-mono font-semibold tracking-wider ${g.color} opacity-60`}>
        {gutterLabel}
      </div>
      <div className="w-px self-stretch bg-gray-800 shrink-0" />
      <div className="flex-1 py-1.5">{content}</div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [events, setEvents]     = useState([])
  const [inputPrompt, setInput] = useState(DEFAULT_PROMPT)
  const [running, setRunning]   = useState(false)
  const esRef     = useRef(null)
  const bottomRef = useRef(null)
  const idCounter = useRef(0)
  const nextId    = () => ++idCounter.current

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const startRun = useCallback((prompt) => {
    esRef.current?.close()
    setEvents([])
    setRunning(true)

    const es = new EventSource(`/api/stream?prompt=${encodeURIComponent(prompt)}`)
    esRef.current = es

    es.addEventListener('RUN_STARTED', (e) => {
      setEvents((prev) => [...prev, { id: nextId(), type: 'RUN_STARTED', payload: JSON.parse(e.data) }])
    })

    es.addEventListener('TOKEN_STREAM', (e) => {
      const { token } = JSON.parse(e.data)
      setEvents((prev) => {
        const last = prev[prev.length - 1]
        if (last?.type === 'TEXT_BLOCK' && !last.done) {
          return [...prev.slice(0, -1), { ...last, text: last.text + token }]
        }
        return [...prev, { id: nextId(), type: 'TEXT_BLOCK', text: token, done: false }]
      })
    })

    es.addEventListener('TOOL_START', (e) => {
      const { tool, args } = JSON.parse(e.data)
      setEvents((prev) => {
        const sealed = prev.map((ev) =>
          ev.type === 'TEXT_BLOCK' && !ev.done ? { ...ev, done: true } : ev
        )
        return [...sealed, { id: nextId(), type: 'TOOL_CALL', name: tool, args, status: 'running' }]
      })
    })

    es.addEventListener('TOOL_COMPLETE', (e) => {
      const { tool, result } = JSON.parse(e.data)
      setEvents((prev) => {
        const idx = [...prev].reverse().findIndex(
          (ev) => ev.type === 'TOOL_CALL' && ev.name === tool && ev.status === 'running'
        )
        if (idx === -1) return prev
        const i = prev.length - 1 - idx
        return [...prev.slice(0, i), { ...prev[i], status: 'done', result }, ...prev.slice(i + 1)]
      })
    })

    // A2UI: dynamic widget injected by analyst_agent.py via A2A pass-through
    es.addEventListener('WIDGET_RENDER', (e) => {
      const widget = JSON.parse(e.data)
      setEvents((prev) => {
        const sealed = prev.map((ev) =>
          ev.type === 'TEXT_BLOCK' && !ev.done ? { ...ev, done: true } : ev
        )
        return [...sealed, { id: nextId(), type: 'WIDGET', widget }]
      })
    })

    es.addEventListener('RUN_FINISHED', () => {
      setEvents((prev) => {
        const sealed = prev.map((ev) =>
          ev.type === 'TEXT_BLOCK' ? { ...ev, done: true } : ev
        )
        return [...sealed, { id: nextId(), type: 'RUN_FINISHED' }]
      })
    })

    es.addEventListener('STREAM_END', () => { es.close(); setRunning(false) })
    es.onerror = () => { es.close(); setRunning(false) }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (inputPrompt.trim()) startRun(inputPrompt.trim())
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <header className="border-b border-gray-800/80 px-6 py-4 flex items-center gap-3">
        <span className="text-xl text-gray-400">⬡</span>
        <h1 className="text-white font-semibold tracking-tight text-sm">AG-UI Protocol Dashboard</h1>
        <span className="text-gray-600 text-sm font-mono">/ procurement-agent</span>
        <div className="ml-auto flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />LLM Layer</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Agent Runtime</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />A2UI Widgets</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />SSE · MCP · A2A</span>
        </div>
      </header>

      {/* Prompt bar */}
      <div className="border-b border-gray-800/80 px-6 py-3 bg-gray-900/40">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInput(e.target.value)}
            disabled={running}
            placeholder="Enter a procurement query…"
            className="flex-1 bg-gray-950 border border-gray-700/70 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={running || !inputPrompt.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
          >
            {running
              ? <span className="flex items-center gap-2"><Spinner color="white" /> Running…</span>
              : 'Run Agent'
            }
          </button>
        </form>
      </div>

      {/* Protocol ledger */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        {events.length === 0 && !running && (
          <div className="text-center mt-20 space-y-3">
            <p className="text-gray-600 font-mono text-sm">Submit a prompt to trace the full protocol stack</p>
            <div className="flex justify-center flex-wrap gap-4 text-[10px] font-mono text-gray-700">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-blue-900   border border-blue-700"   /> LLM · Cognitive Layer</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-amber-900  border border-amber-700"  /> Agent Runtime · Execution Layer</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-violet-900 border border-violet-700" /> A2UI · Dynamic Widget Injection</span>
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto space-y-2">
          {events.map((ev) => (
            <TimelineRow key={ev.id} event={ev} />
          ))}
          <div ref={bottomRef} />
        </div>
      </main>
    </div>
  )
}
