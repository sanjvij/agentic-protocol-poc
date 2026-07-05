/**
 * AG-UI SSE Bridge
 * ─────────────────
 * Spawns primary_agent.py as a subprocess, parses its [AG-UI EVENT] stdout
 * lines, and re-emits them as named Server-Sent Events over HTTP.
 *
 * GET /api/stream?prompt=<text>
 */

import 'dotenv/config'
import express from 'express'
import { spawn }  from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_PATH  = path.resolve(__dirname, '../my-agent-stack/primary_agent.py')
const PYTHON      = '/opt/miniconda3/envs/agentic-stack/bin/python3'
const PORT = 3001

const app = express()

// Matches both [AG-UI EVENT: ...] and [A2UI EVENT: ...] lines
const EVENT_LINE_RE = /^\[(AG-UI|A2UI) EVENT: ([A-Z_]+)\] (.+)$/

function parseAgUiLine(line) {
  const m = line.match(EVENT_LINE_RE)
  if (!m) return null
  try {
    return { type: m[2], payload: JSON.parse(m[3]) }
  } catch {
    return null
  }
}

app.get('/api/stream', (req, res) => {
  const prompt = req.query.prompt || 'What is the status of order ORD-002? Also check if we need to reorder Laptops.'

  // SSE handshake
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  const agent = spawn(PYTHON, [AGENT_PATH, prompt], {
    env: { ...process.env },
  })

  // Line buffer — chunks may not align with newlines
  let buffer = ''

  agent.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete trailing line

    for (const line of lines) {
      const event = parseAgUiLine(line.trim())
      if (event) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`)
      }
    }
  })

  agent.stderr.on('data', (chunk) => {
    // MCP diagnostic output — keep server-side only
    process.stderr.write(`[agent] ${chunk}`)
  })

  agent.on('close', () => {
    res.write('event: STREAM_END\ndata: {}\n\n')
    res.end()
  })

  // Kill subprocess if the browser tab closes
  req.on('close', () => agent.kill())
})

app.listen(PORT, () => {
  console.log(`AG-UI SSE bridge → http://localhost:${PORT}`)
})
