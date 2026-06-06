create table if not exists codex_research_runs (
  id uuid primary key default gen_random_uuid(),
  reddit_thread_id uuid references reddit_threads(id) on delete set null,
  profile_slug text not null default 'mr-plumber-sg',
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  execution_mode text not null default 'real_codex' check (execution_mode in ('real_codex', 'virtual_fallback')),
  current_stage text,
  trigger_run_id text,
  selected_reddit_thread jsonb not null default '{}'::jsonb,
  company_profile_snapshot jsonb not null default '{}'::jsonb,
  normalized_trace jsonb not null default '{}'::jsonb,
  content_brief jsonb not null default '{}'::jsonb,
  proposed_skill_diff text not null default '',
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists codex_subagent_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references codex_research_runs(id) on delete cascade,
  agent_id text not null,
  agent_label text not null,
  angle text not null,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  raw_jsonl text not null default '',
  normalized_events jsonb not null default '[]'::jsonb,
  final_answer text not null default '',
  trusted_sources jsonb not null default '[]'::jsonb,
  ignored_sources jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_codex_research_runs_created
  on codex_research_runs(created_at desc);

create index if not exists idx_codex_research_runs_reddit_thread
  on codex_research_runs(reddit_thread_id, created_at desc);

create index if not exists idx_codex_subagent_runs_run
  on codex_subagent_runs(run_id, agent_label);

create unique index if not exists idx_codex_subagent_runs_run_agent
  on codex_subagent_runs(run_id, agent_id);

drop trigger if exists set_codex_research_runs_updated_at on codex_research_runs;
create trigger set_codex_research_runs_updated_at
before update on codex_research_runs
for each row execute function set_updated_at();

drop trigger if exists set_codex_subagent_runs_updated_at on codex_subagent_runs;
create trigger set_codex_subagent_runs_updated_at
before update on codex_subagent_runs
for each row execute function set_updated_at();

notify pgrst, 'reload schema';

