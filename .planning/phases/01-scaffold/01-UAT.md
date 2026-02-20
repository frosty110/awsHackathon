---
status: testing
phase: 01-scaffold
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md
started: 2026-02-20T12:00:00Z
updated: 2026-02-20T22:28:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 6
name: .env.example documents all keys
expected: |
  `.env.example` exists at the project root and lists keys for AWS (region, access key, secret key), Datadog LLMObs (DD_LLMOBS_ENABLED, DD_LLMOBS_ML_APP, DD_API_KEY, DD_LLMOBS_AGENTLESS_ENABLED, DD_SITE), Neo4j (URI, user, password), and MiniMax (API key, group ID).
awaiting: user response

## Tests

### 1. npm run dev starts both servers
expected: Run `npm run dev` from the project root. Both the Vite dev server (client, port 5173) and the Express server (port 3001) start via concurrently. You see output from both processes in the terminal.
result: pass

### 2. /health returns JSON status
expected: `curl http://localhost:3001/health` returns HTTP 200 with a JSON body containing a status field (e.g., `{"status":"ok"}`).
result: pass

### 3. /api/health matches /health
expected: `curl http://localhost:3001/api/health` returns the same JSON response as `/health`.
result: pass

### 4. Server boots without integration keys
expected: With only `PORT` and `NODE_ENV` set (and `SKIP_NEO4J_CONNECTIVITY_CHECK=1`), the server starts without crashing. No Zod parse errors or "Illegal host" crashes.
result: pass

### 5. Startup warnings for blank config keys
expected: When integration keys (AWS, Datadog, Neo4j, MiniMax) are blank/unset, the server logs clear warning messages identifying which key groups are missing — but does not exit.
result: pass

### 6. .env.example documents all keys
expected: `.env.example` exists at the project root and lists keys for AWS (region, access key, secret key), Datadog LLMObs (DD_LLMOBS_ENABLED, DD_LLMOBS_ML_APP, DD_API_KEY, DD_LLMOBS_AGENTLESS_ENABLED, DD_SITE), Neo4j (URI, user, password), and MiniMax (API key, group ID).
result: [pending]

### 7. dd-trace in server scripts
expected: `server/package.json` scripts for `dev` and `start` include `NODE_OPTIONS='--import dd-trace/initialize.mjs'` so dd-trace bootstraps before app code.
result: [pending]

### 8. .gitignore covers secrets and build artifacts
expected: Root `.gitignore` includes entries for `.env`, `.env.local`, `node_modules/`, and `dist/` — no secrets or deps committed.
result: [pending]

## Summary

total: 8
passed: 5
issues: 0
pending: 3
skipped: 0

## Gaps

[none yet]
