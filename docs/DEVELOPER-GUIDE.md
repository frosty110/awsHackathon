# Developer Guide

## Prerequisites

- **Node.js 22+** (LTS recommended)
- **npm 10+**
- **AWS Account** with Bedrock Claude model access enabled in your target region

Optional:
- **Neo4j AuraDB** instance for knowledge graph RAG (chat works without it)
- **MiniMax API key** for TTS voice narration (text-only mode without it)
- **Datadog API key** for LLM observability (tracing disabled without it)

---

## Initial Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd awsHackathon
npm install
```

This is a monorepo with workspaces (`client/` and `server/`). `npm install` at the root installs all dependencies.

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your credentials. The minimum required for basic chat:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
PORT=3001
NODE_ENV=development
```

### Full Environment Variable Reference

#### AWS Bedrock (required for chat)

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key | -- |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | -- |
| `AWS_SESSION_TOKEN` | AWS session token (if using STS) | -- |
| `BEDROCK_MODEL_ID` | Claude model ID | `anthropic.claude-3-haiku-20240307-v1:0` |

#### Neo4j (optional -- graceful degradation)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j connection URI (`neo4j+s://...`) | -- |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | -- |
| `SKIP_NEO4J_CONNECTIVITY_CHECK` | Skip Neo4j connection on startup | `0` |

#### Datadog (optional -- tracing disabled without)

| Variable | Description | Default |
|----------|-------------|---------|
| `DD_API_KEY` | Datadog API key | -- |
| `DD_APP_KEY` | Datadog app key (for dashboard API) | -- |
| `DD_SITE` | Datadog site | `datadoghq.com` |
| `DD_SERVICE` | Service name in Datadog | `ai-dungeon-master` |
| `DD_ENV` | Environment tag | `hackathon` |
| `DD_LLMOBS_ENABLED` | Enable LLM Observability | `1` |
| `DD_LLMOBS_ML_APP` | ML app name | `ai-dm` |
| `DD_LLMOBS_AGENTLESS_ENABLED` | Agentless mode (no local agent) | `1` |
| `DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED` | Trace Bedrock calls | `true` |

#### MiniMax (optional -- text-only without)

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | MiniMax TTS API key | -- |
| `MINIMAX_GROUP_ID` | MiniMax group ID | -- |
| `MINIMAX_MUSIC_API_KEY` | MiniMax music generation API key | -- |

#### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |

### 3. Verify Bedrock Access

Before running the app, verify your AWS credentials and model access:

```bash
npm run test:bedrock -w server
```

If you get `AccessDeniedException`, you need to enable model access in the AWS Console:
1. Go to Amazon Bedrock > Model Catalog
2. Find the Claude model
3. Click "Request access" and complete the use case form
4. Access is typically granted immediately

### 4. Seed the Knowledge Graph (optional)

If you have Neo4j configured:

```bash
npm run seed
```

This idempotently seeds ~20 nodes (characters, locations, items, quests, factions) with relationships for the demo scenario.

---

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts both the client and server concurrently:
- **Client** (Vite): http://localhost:5173 with HMR
- **Server** (tsx watch): http://localhost:3001 with file watching

The Vite dev server proxies `/api/*` and `/socket.io` requests to the backend.

### Production Build

```bash
npm run build
```

Builds both client (Vite) and server (tsc). Production start:

```bash
npm run start -w server
```

---

## Development Workflow

### Project Structure

```
awsHackathon/
  package.json              # Root monorepo config (workspaces)
  tsconfig.base.json        # Shared TypeScript config
  .env                      # Environment variables (gitignored)
  .env.example              # Template for env vars
  client/
    src/
      App.tsx               # Main app state machine
      components/           # React components
      hooks/                # Custom hooks (useSSEChat, useMultiplayerRoom)
      services/             # Client services (audio, music, socket)
      types/                # TypeScript types
    vite.config.ts          # Vite config with backend proxy
  server/
    src/
      index.ts              # Server entry point
      app.ts                # Express app setup
      routes/               # REST API endpoints
      services/             # Core backend services
      sockets/              # Socket.IO handlers
```

### Key Conventions

- **TypeScript everywhere** -- Both client and server are TypeScript with strict mode
- **ESM modules** -- Server uses `"type": "module"` in package.json
- **Tailwind v4** -- CSS-only `@theme` configuration (no `tailwind.config.js`)
- **React 19** -- Latest React with concurrent features
- **Zod validation** -- Environment config validated with Zod schemas
- **dd-trace bootstrap** -- Loaded via `NODE_OPTIONS` before any application code

### Making Changes

#### Adding a New API Endpoint

1. Create route file in `server/src/routes/`
2. Register in `server/src/app.ts`
3. Add types if needed

#### Adding a New Socket Event

1. Define types in `server/src/sockets/types.ts` (both `ClientToServerEvents` and `ServerToClientEvents`)
2. Add handler in appropriate file (`roomHandlers.ts`, `turnHandlers.ts`, or `chatHandlers.ts`)
3. Update client hook (`useMultiplayerRoom.ts`) to emit/listen

#### Adding a New UI Component

1. Create component in `client/src/components/`
2. Use Tailwind v4 classes for styling
3. Follow existing patterns (dark fantasy theme, class-colored accents)

### Testing

#### Bedrock Connectivity

```bash
npm run test:bedrock -w server
```

#### Manual Testing

The default scenario provides a reliable test path:

1. Start the app (`npm run dev`)
2. Choose Single Player
3. Select a character class
4. Listen to opening monologue
5. Type: "I look around the tavern and approach the barkeep."
6. Type: "I ask the barkeep about the ring."
7. Type: "A goblin bursts through the door! I draw my sword and attack!"
8. Click the dice roller

For multiplayer: Open two browser tabs, create a room in one, join with the code in the other.

---

## Debugging

### Common Issues

#### "Bedrock streaming failed" / AccessDeniedException

- Verify AWS credentials in `.env`
- Confirm model access is enabled in your region (AWS Console > Bedrock > Model Catalog)
- Run `npm run test:bedrock -w server` to isolate

#### No Datadog traces appearing

- Ensure all 5 DD env vars are set (especially `DD_LLMOBS_AGENTLESS_ENABLED=1`)
- Verify `DD_SITE` matches your Datadog region
- dd-trace must load before other modules (the `NODE_OPTIONS` in package.json handles this)
- Wait 2-3 minutes for traces to appear in the dashboard
- Check server logs for dd-trace initialization messages

#### Neo4j connection failures

- Verify URI uses `neo4j+s://` scheme (TLS required for AuraDB)
- Check credentials
- Set `SKIP_NEO4J_CONNECTIVITY_CHECK=1` to start without Neo4j

#### TTS audio not playing

- Check `MINIMAX_API_KEY` and `MINIMAX_GROUP_ID` are set
- Browser autoplay policies may require user interaction before audio plays
- Check browser console for audio playback errors

#### Socket.IO connection issues

- Verify Vite proxy is configured (check `vite.config.ts`)
- Ensure server is running on the expected port
- Check browser console for WebSocket connection errors

### Logging

Server logs are structured JSON. Key log events:
- Bedrock request/response with token counts
- Neo4j query results
- TTS generation timing
- Socket.IO connection/disconnection events
- Room state transitions

---

## Scripts Reference

### Root (monorepo)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start client + server concurrently |
| `npm run build` | Build client + server for production |
| `npm run seed` | Seed Neo4j with demo lore data |
| `npm run generate-audio` | Pre-generate opening audio files |
| `npm run create-dashboard` | Create Datadog dashboard via API |

### Server

| Script | Description |
|--------|-------------|
| `npm run dev -w server` | Start server with hot reload |
| `npm run build -w server` | Compile TypeScript |
| `npm run start -w server` | Run compiled server |
| `npm run test:bedrock -w server` | Test Bedrock API connectivity |

### Client

| Script | Description |
|--------|-------------|
| `npm run dev -w client` | Start Vite dev server |
| `npm run build -w client` | Build for production |
| `npm run preview -w client` | Preview production build |

---

## Operator Skill Guides

For detailed operational guidance, see the skill files in `/skills/`:

| Skill | File | Purpose |
|-------|------|---------|
| Bedrock Runtime | `skills/bedrock-runtime-operator/SKILL.md` | Bedrock API patterns, streaming, error handling |
| Datadog LLMObs | `skills/datadog-llmobs-operator/SKILL.md` | LLMObs setup, span annotation, dashboard creation |
| Neo4j RAG | `skills/neo4j-rag-operator/SKILL.md` | Cypher query patterns, entity extraction |
| Datadog Dashboard | `skills/datadog-dashboard-operator/SKILL.md` | Dashboard widget creation, metric configuration |
| D&D Game UX | `skills/dnd-game-ux/SKILL.md` | Narrative best practices, scene pacing |
