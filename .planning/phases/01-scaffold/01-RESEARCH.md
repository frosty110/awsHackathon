# Phase 1: Scaffold - Research

**Researched:** 2026-02-20
**Domain:** npm workspaces monorepo, Express 5 + TypeScript, Vite + React, env validation with Zod
**Confidence:** HIGH (core stack), MEDIUM (version specifics cross-verified)

## Summary

Phase 1 establishes a two-package npm workspaces monorepo: `client/` (Vite + React + TypeScript) and `server/` (Express 5 + TypeScript). The root `package.json` coordinates both via `concurrently`, so a single `npm run dev` starts both dev servers. The server validates all required environment variables at startup using Zod, exports a typed `config` object, and exposes a `/health` route.

The stack is standard and well-understood. npm workspaces handle package hoisting and cross-workspace references. `tsx watch` replaces the old `ts-node + nodemon` combo for Express — it handles ES modules cleanly and restarts on file change with no config overhead. Vite proxies `/api` requests to the Express server during development, eliminating CORS friction.

The critical decision already locked is `@aws-sdk/client-bedrock-runtime` (not `@anthropic-ai/bedrock-sdk`). This means the server-side `config.ts` must validate `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` (or allow credential chain fallback). The Zod schema must also cover `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `DATADOG_API_KEY`, and `MINIMAX_API_KEY` / `MINIMAX_GROUP_ID`.

**Primary recommendation:** Use npm workspaces + concurrently + tsx watch + Zod v4 for env validation. Do not reach for Turborepo or pnpm — the project is two packages, npm workspaces is sufficient.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `concurrently` | 9.2.1 | Run client + server dev scripts in parallel from root | Zero config, readable output with --names, industry standard for monorepo dev scripts |
| `vite` | 7.3.1 | Client dev server + bundler | Fastest HMR, official React TypeScript template, no-config proxy for backend |
| `react` | 19.x | UI framework | Latest stable, bundled by create-vite react-ts template |
| `express` | 5.x | HTTP server | Latest stable as of 2025; better async error handling than v4 |
| `tsx` | latest | TypeScript execution for server dev | Replaces ts-node + nodemon; handles ESM cleanly; `tsx watch` does file watching built-in |
| `zod` | 4.x | Runtime env validation | TypeScript-first, parse-on-import pattern, typed config output |
| `dotenv` | 17.x | Load .env into process.env | Standard; v16+ supports multiline values and expand syntax |
| `neo4j-driver` | 6.x | Neo4j connection + verifyConnectivity | Official driver; verifyConnectivity() used for boot health check |
| `@aws-sdk/client-bedrock-runtime` | 3.x | AWS Bedrock inference (LOCKED DECISION) | Only SDK dd-trace auto-instruments; required for Datadog observability |

### Supporting (Dev Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | 5.x | Type checking | Root tsconfig.base.json + per-package tsconfig extending it |
| `@types/node` | latest | Node.js type definitions | Required for `process.env`, `path`, etc. in server |
| `@types/express` | latest | Express type definitions | Request/Response types in handlers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `concurrently` | `npm run dev -ws` with `&` | Native npm approach works but lacks colored output, named prefixes, and clean process management on Windows |
| `tsx` | `ts-node + nodemon` | ts-node has ESM config complexity; tsx is simpler, faster startup |
| `zod` v4 | `zod` v3 | v4 is 14x faster, published on `zod` package; import from `"zod/v4"` during transition window to be safe, or just `"zod"` which resolves to v4 |
| npm workspaces | pnpm / Turborepo | Overkill for 2-package hackathon; npm workspaces is sufficient |
| `dotenv` | Node.js `--env-file` flag (v20.6+) | Native flag does not support all dotenv features; dotenv remains the standard library |

**Installation (root):**
```bash
npm install -D concurrently typescript
```

**Installation (server):**
```bash
npm install express zod dotenv neo4j-driver @aws-sdk/client-bedrock-runtime
npm install -D tsx @types/node @types/express typescript
```

**Installation (client):**
```bash
npm create vite@latest client -- --template react-ts
```

---

## Architecture Patterns

### Recommended Project Structure
```
awsHackathon/
├── package.json              # root: workspaces, "dev" script using concurrently
├── tsconfig.base.json        # shared compiler options (strict, target ES2023)
├── .env                      # secrets — gitignored
├── .env.example              # documents all required keys
├── .gitignore
├── client/
│   ├── package.json          # name: "client", extends root tsconfig
│   ├── tsconfig.json         # extends ../tsconfig.base.json
│   ├── vite.config.ts        # proxy /api -> http://localhost:3001
│   └── src/
│       ├── main.tsx
│       └── App.tsx
└── server/
    ├── package.json          # name: "server", "dev": "tsx watch src/index.ts"
    ├── tsconfig.json         # extends ../tsconfig.base.json, module: NodeNext
    └── src/
        ├── index.ts          # entry: load dotenv, validate config, start server
        ├── app.ts            # Express app factory (separates app from server)
        ├── routes/
        │   └── health.ts     # GET /health
        └── services/
            └── config.ts     # Zod schema, parse process.env, export typed config
```

### Pattern 1: Fail-Fast Env Validation on Import
**What:** Import `config.ts` as the first thing in `index.ts`. Zod parses `process.env` and either throws a descriptive error (listing all missing vars) or returns a typed object. The process never reaches server startup with invalid config.
**When to use:** Every Express server that has required env vars.
**Example:**
```typescript
// server/src/services/config.ts
// Source: verified against zod.dev/api and Zod v4 release notes
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  // AWS (locked: must use @aws-sdk/client-bedrock-runtime)
  AWS_REGION: z.string().min(1),
  // AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY may be omitted if using
  // instance role / credential chain — validate presence loosely or skip
  // to allow IAM role-based auth in production

  // Neo4j
  NEO4J_URI: z.string().url(),
  NEO4J_USERNAME: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),

  // Datadog
  DATADOG_API_KEY: z.string().min(1),

  // MiniMax (TTS — scoped to opening monologue only)
  MINIMAX_API_KEY: z.string().min(1),
  MINIMAX_GROUP_ID: z.string().min(1),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Environment validation failed:");
  console.error(result.error.format());
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
```

### Pattern 2: Server Entry Point (index.ts)
**What:** Entry loads dotenv first, then imports config (which triggers validation), then starts the HTTP server. Express app is defined in `app.ts` to keep entry thin.
**Example:**
```typescript
// server/src/index.ts
// Source: pattern from reactsquad.io Express 5 guide (verified 2025)
import "dotenv/config"; // must be first — populates process.env before config import
import { config } from "./services/config.js"; // .js extension required with NodeNext module
import neo4j from "neo4j-driver";
import { createApp } from "./app.js";
import { createServer } from "http";

async function main() {
  // Neo4j connectivity check on boot (requirement from phase plan)
  const driver = neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
  );

  try {
    await driver.verifyConnectivity();
    console.log("Neo4j connection established");
  } catch (err) {
    console.error("Neo4j connection failed:", err);
    await driver.close();
    process.exit(1);
  }

  const app = createApp({ driver });
  const server = createServer(app);
  server.listen(config.PORT, () => {
    console.log(`Server running on port ${config.PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
```

### Pattern 3: Root dev Script via concurrently
**What:** Root `package.json` uses `concurrently` to run both dev servers in one terminal with labeled, colored output.
**Example:**
```json
// package.json (root)
{
  "name": "aws-hackathon",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently --names CLIENT,SERVER --prefix-colors cyan,yellow \"npm run dev -w client\" \"npm run dev -w server\"",
    "build": "npm run build -w client && npm run build -w server"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "typescript": "^5.0.0"
  }
}
```

### Pattern 4: Vite Proxy to Express
**What:** Vite dev server proxies `/api` requests to Express, eliminating CORS issues during development.
**Example:**
```typescript
// client/vite.config.ts
// Source: vite.dev/config/server-options (verified 2025)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
```

### Pattern 5: Health Endpoint
**What:** Simple GET /health returns 200 JSON. Used as liveness probe and to verify the server started correctly.
**Example:**
```typescript
// server/src/routes/health.ts
import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
```

### Anti-Patterns to Avoid
- **Reading `process.env` in service files directly:** Always import from `config.ts` so you get TypeScript types and the guarantee that validation already ran.
- **Putting `dotenv.config()` anywhere other than the entry point:** If config.ts or another module calls dotenv.config(), order-of-import bugs cause intermittent failures. Load dotenv in index.ts before anything else.
- **Forgetting `.js` extensions in imports:** With `"module": "NodeNext"` in tsconfig, TypeScript requires explicit `.js` extensions even when importing `.ts` files. This trips up nearly every engineer on first setup.
- **Checking both `client/` and `server/` into root node_modules conflicts:** npm workspaces hoists shared deps; don't install the same package at both workspace and root level with different versions.
- **Using `npm run dev -ws` for parallel execution:** Without concurrently, the two processes interleave output without labels, and killing the terminal may orphan one process.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env validation with error messages | Custom if-else checks on process.env | `zod` with `safeParse` | Missing vars produce structured errors listing every violation at once; hand-rolled checks exit on first failure, require individual null checks, and lose TypeScript inference |
| Running two dev servers simultaneously | Shell `&` operator or Makefile | `concurrently` | Shell `&` has no process group management — Ctrl+C may orphan the server process; concurrently handles signals cleanly and labels output |
| TypeScript watching/execution in server | `tsc --watch` + `node dist/` | `tsx watch` | tsc compile loop has 1-2s delay; tsx uses esbuild for near-instant restarts |
| Connectivity health check | Ping or raw TCP test | `driver.verifyConnectivity()` | Official Neo4j method validates auth, protocol compatibility, and connection pool |
| CORS handling in dev | Express cors() middleware with wildcard | Vite `server.proxy` | Proxy approach means frontend code uses relative paths (`/api/...`), same as production |

**Key insight:** This phase is plumbing. Every "clever custom solution" here adds surface area to debug on hackathon day. Use the boring, documented tools.

---

## Common Pitfalls

### Pitfall 1: NodeNext Module Resolution and `.js` Extensions
**What goes wrong:** TypeScript compiles fine but Node.js throws `ERR_MODULE_NOT_FOUND` at runtime because imports like `"./config"` don't have extensions.
**Why it happens:** With `"module": "NodeNext"` (required for modern ESM Node.js), TypeScript follows Node.js resolution: `.js` must be explicit even when the source file is `.ts`.
**How to avoid:** Always write `import { config } from "./services/config.js"` — the `.js` extension, even though the source file is `config.ts`.
**Warning signs:** Works in ts-node (which is lenient) but fails with `tsx` or compiled output.

### Pitfall 2: dotenv Load Order
**What goes wrong:** `config.ts` runs its Zod parse before `dotenv` has populated `process.env`, causing all env vars to fail validation even when `.env` exists.
**Why it happens:** ES module static imports are hoisted; if config.ts imports before `dotenv/config` is executed, `process.env` is empty.
**How to avoid:** In `index.ts`, use `import "dotenv/config"` as the very first line before all other imports. Do NOT put `dotenv.config()` inside config.ts.
**Warning signs:** All env vars fail on startup locally but you can see the vars are defined in `.env`.

### Pitfall 3: Neo4j verifyConnectivity Return Value Changed
**What goes wrong:** Code that tries to use the return value of `verifyConnectivity()` (e.g., to log server info) gets `undefined` or a type error.
**Why it happens:** Neo4j JavaScript driver 6.x changed `verifyConnectivity()` return type from `ServerInfo` to `void`. It now only throws on failure.
**How to avoid:** Do not use the return value. Use try/catch pattern: no return value means success, exception means failure.
**Warning signs:** TypeScript error on the return value type, or runtime `Cannot read property of undefined`.

### Pitfall 4: AWS Credential Chain in Local Dev
**What goes wrong:** Zod validates `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as required strings, causing startup failure when developers use AWS SSO or instance roles.
**Why it happens:** The AWS SDK supports multiple credential sources (env vars, `~/.aws/credentials`, instance metadata). Requiring them as env vars blocks non-key-based auth flows.
**How to avoid:** Mark AWS key env vars as optional in the Zod schema (`z.string().optional()`), or validate only `AWS_REGION` as required. The SDK credential chain handles the rest.
**Warning signs:** Server fails to start on a machine using AWS SSO even though `aws sts get-caller-identity` succeeds.

### Pitfall 5: Zod v4 Breaking Changes
**What goes wrong:** Code copied from blog posts or AI tools uses Zod v3 syntax that is invalid in v4 (e.g., `z.string().email()` still works but `z.string({ message: "..." })` → `z.string({ error: "..." })`).
**Why it happens:** Zod v4 ships on the same `zod` npm package; the version bump is silent unless you check `package.json`.
**How to avoid:** Use `z.string()`, `z.object()`, `z.coerce.number()`, `z.safeParse()` — all unchanged. Avoid custom `message` params in schema definitions (use `error` instead in v4).
**Warning signs:** TypeScript type errors on schema options, especially around custom error messages.

### Pitfall 6: MINIMAX_GROUP_ID Location Unknown
**What goes wrong:** The MiniMax API requires a `GROUP_ID` parameter that is account-specific and not documented in the standard API key flow.
**Why it happens:** MiniMax uses a two-token auth system (API key + group ID). The group ID is found in the MiniMax platform dashboard, not auto-generated with an API key.
**How to avoid:** Treat `MINIMAX_GROUP_ID` as a required env var in the schema. Document in `.env.example` that it must be fetched from the MiniMax dashboard. Flag as a pre-hackathon blocker.
**Warning signs:** TTS requests return 401 or 403 even with a valid API key.

---

## Code Examples

Verified patterns from official sources:

### Root package.json with Workspaces
```json
{
  "name": "aws-hackathon",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently --names CLIENT,SERVER --prefix-colors cyan,yellow \"npm run dev -w client\" \"npm run dev -w server\""
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "typescript": "^5.0.0"
  }
}
```

### Shared tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### server/tsconfig.json
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "moduleDetection": "force",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### server/package.json
```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^5.0.0",
    "zod": "^4.0.0",
    "dotenv": "^17.0.0",
    "neo4j-driver": "^6.0.0",
    "@aws-sdk/client-bedrock-runtime": "^3.0.0"
  },
  "devDependencies": {
    "tsx": "latest",
    "@types/node": "latest",
    "@types/express": "latest",
    "typescript": "^5.0.0"
  }
}
```

### Neo4j verifyConnectivity Pattern
```typescript
// Source: neo4j.com/docs/javascript-manual/current/connect/ (verified 2026-02-20)
import neo4j from "neo4j-driver";
import { config } from "./services/config.js";

const driver = neo4j.driver(
  config.NEO4J_URI,
  neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
);

try {
  await driver.verifyConnectivity(); // returns void in v6; throws on failure
  console.log("Neo4j connection established");
} catch (err) {
  console.error(`Neo4j connection error\n${err}`);
  await driver.close();
  process.exit(1);
}
```

### .env.example
```bash
# AWS (required — use @aws-sdk/client-bedrock-runtime ONLY, not @anthropic-ai/bedrock-sdk)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=           # optional if using instance role / AWS SSO
AWS_SECRET_ACCESS_KEY=       # optional if using instance role / AWS SSO

# Neo4j
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=

# Datadog
DATADOG_API_KEY=

# MiniMax TTS (opening monologue only — requires Group ID from MiniMax dashboard)
MINIMAX_API_KEY=
MINIMAX_GROUP_ID=

# Server
PORT=3001
NODE_ENV=development
```

### .gitignore additions
```
.env
.env.local
node_modules/
dist/
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ts-node + nodemon` | `tsx watch` | 2023-2024 | tsx handles ESM natively, no extra config |
| `ts-node` alone | `tsx` | 2023 | tsx is 5-10x faster startup |
| Manual env checks (`if (!process.env.X)`) | `zod.safeParse(process.env)` | ~2022, matured | Typed config object, all errors at once, IDE autocomplete |
| CRA (Create React App) | `create-vite` react-ts template | 2022-2023 | CRA is officially deprecated; Vite is the standard |
| `yarn workspaces` | npm workspaces (npm 7+) | 2021 | npm now has built-in workspace support |
| Zod v3 | Zod v4 | 2025 | Published on same `zod` package; 14x faster; `z.string({ error: ... })` replaces `message` |
| `neo4j-driver` v5 `verifyConnectivity()` returns `ServerInfo` | v6 returns `void` | 2024-2025 | Don't use return value |

**Deprecated/outdated:**
- Create React App: No longer maintained; do not use.
- `@anthropic-ai/bedrock-sdk`: Do not use — dd-trace cannot auto-instrument it. Use `@aws-sdk/client-bedrock-runtime`.
- `ts-node` as primary dev runner: Replaced by `tsx` for simpler ESM support.

---

## Open Questions

1. **MINIMAX_GROUP_ID Location**
   - What we know: MiniMax uses two-token auth (API key + group ID). Group ID is specific to a MiniMax account.
   - What's unclear: Exact location in the MiniMax dashboard to find it. This was flagged as a pre-hackathon blocker in the project state.
   - Recommendation: Document in `.env.example` with a comment to find it in the MiniMax platform dashboard. Do not block Phase 1 scaffolding on this; scaffold the var, leave value empty.

2. **AWS Credential Strategy for Dev**
   - What we know: `@aws-sdk/client-bedrock-runtime` supports credential chain (env vars, `~/.aws/credentials`, SSO).
   - What's unclear: Whether all hackathon team members will use static key pairs or SSO.
   - Recommendation: Make `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` optional in Zod schema (`z.string().optional()`). Require only `AWS_REGION`. This keeps flexibility without blocking startup for SSO users.

3. **Bedrock Inference Profile IDs vs. Model IDs**
   - What we know: Flagged as a pre-hackathon blocker. Bedrock requires knowing whether the target region uses inference profile IDs or model IDs.
   - What's unclear: The specific model string to put in `.env.example`.
   - Recommendation: Add a `BEDROCK_MODEL_ID` env var to the schema and `.env.example` with a placeholder comment. Don't hardcode the model string in Phase 1; resolve it pre-hackathon.

---

## Sources

### Primary (HIGH confidence)
- vite.dev/guide/ — Vite v7.3.1 confirmed, create-vite command verified
- neo4j.com/docs/javascript-manual/current/connect/ — verifyConnectivity pattern and return type void (v6)
- reactsquad.io/blog/how-to-set-up-express-5-in-2025 — Express 5 + tsx + tsconfig NodeNext setup
- zod.dev/v4 — Breaking changes confirmed: `error` replaces `message`, core parse/safeParse API stable
- docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock-runtime/ — BedrockRuntimeClient constructor and import pattern

### Secondary (MEDIUM confidence)
- betterstack.com/community/guides — tsx vs ts-node comparison, tsx recommended for new projects 2025
- npmjs.com/package/concurrently — version 9.2.1 confirmed, --names and --prefix-colors flags

### Tertiary (LOW confidence)
- npm workspaces parallel execution patterns: searched multiple sources, consistent findings but npm does not natively support parallel workspace script execution; concurrently fills this gap

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries verified against official docs or npm; versions cross-checked
- Architecture: HIGH — npm workspaces + concurrently pattern is industry standard and confirmed working; tsx and Zod patterns from current official docs
- Pitfalls: HIGH (NodeNext extensions, dotenv order, Neo4j v6 return type) / MEDIUM (Zod v4 message→error, MiniMax GROUP_ID)

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable libraries; Zod and Neo4j driver are the most likely to change)
