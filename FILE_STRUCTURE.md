# File Structure

This project is split into two main areas:

```txt
apps/web        Product app: UI, API routes, Trigger jobs, database schema
tools/seo-agent AEO engine: pipelines, LLM agents, integrations, schemas
```

## Root

```txt
README.md          Project overview and architecture diagrams
FILE_STRUCTURE.md  Folder ownership map
docs/              Supporting documentation
apps/              Deployable applications
tools/             Shared engines and workflow tooling
```

## `apps/web`

The Next.js product application. This folder owns the user-facing dashboard and app-specific server routes.

```txt
apps/web
  app/                  Next.js App Router pages and API routes
  app/components/       App-specific React components
  components/ui/        shadcn UI primitives
  lib/                  Web-only helpers and controllers
  supabase/migrations/  Database migrations
  trigger/              Thin Trigger.dev job entrypoints
  worker/               Local worker scripts
```

Important rule:

```txt
apps/web should not contain pipeline business logic.
It should call the AEO engine in tools/seo-agent.
```

Current web-specific logic that remains here:

```txt
apps/web/lib/seo-agent-chat.ts
```

This stays in `apps/web` because it manages chat conversations, app actions, and Trigger dispatch for the UI.

## `tools/seo-agent`

The shared AEO engine. This folder owns the core pipeline logic and reusable agent/integration code.

```txt
tools/seo-agent
  src/agents/        Individual LLM agent steps
  src/pipelines/     End-to-end AEO pipelines
  src/integrations/  Shared integration helpers
  src/lib/           DataForSEO, LLM clients, file stores, utilities
  src/schemas.ts     Shared Zod schemas
```

Pipeline layout:

```txt
tools/seo-agent/src/pipelines
  content/
    workflow.ts      Pure article generation workflow
    execute.ts       Supabase-backed content workflow executor

  keyword-research/
    execute.ts       Supabase-backed keyword research executor

  competitor-intel/
    execute.ts       Supabase-backed competitor intelligence executor
```

Important rule:

```txt
New AEO pipeline logic should go under tools/seo-agent/src/pipelines.
New reusable LLM steps should go under tools/seo-agent/src/agents.
New external-service helpers should go under tools/seo-agent/src/lib or src/integrations.
```

## Runtime Flow

```txt
User clicks in UI
  -> apps/web API route
  -> apps/web/trigger job
  -> tools/seo-agent pipeline executor
  -> agents/integrations
  -> Supabase tables + Supabase Storage artifacts
  -> apps/web displays result
```

## Trigger Jobs

Trigger jobs live in `apps/web/trigger` because they are app deployment entrypoints.

They should stay thin:

```txt
apps/web/trigger/seo-content-workflow.ts
apps/web/trigger/keyword-opportunity-research.ts
apps/web/trigger/competitor-intelligence.ts
```

Each Trigger job imports and runs the matching executor from `tools/seo-agent/src/pipelines`.

## Database And Artifacts

Database schema is owned by the web app:

```txt
apps/web/supabase/migrations/
apps/web/lib/database.types.ts
```

Workflow artifacts are written to Supabase Storage using:

```txt
tools/seo-agent/src/integrations/supabase-artifacts.ts
```

The shared artifact bucket is:

```txt
seo-workflow-artifacts
```

## Mental Model

```txt
apps/web        = product shell
tools/seo-agent = AEO engine
Supabase        = database + artifact storage
Trigger.dev     = background job runner
DataForSEO      = search and competitor data source
Gemini/LLM      = reasoning and writing layer
```
