create table if not exists reddit_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  profile_slug text not null default 'mr-plumber-sg',
  profile_name text,
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  current_stage text,
  trigger_run_id text,
  company_profile_snapshot jsonb not null default '{}'::jsonb,
  investigation_trace jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reddit_threads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references reddit_intelligence_runs(id) on delete cascade,
  reddit_id text not null,
  subreddit text not null,
  title text not null,
  url text not null,
  reddit_score integer not null default 0,
  comment_count integer not null default 0,
  created_utc timestamptz,
  relevance_score integer not null default 0,
  urgency_score integer not null default 0,
  commercial_intent_score integer not null default 0,
  why_relevant text not null,
  thread_content text not null default '',
  matched_services jsonb not null default '[]'::jsonb,
  matched_icps jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reddit_intelligence_runs_created
  on reddit_intelligence_runs(created_at desc);

create index if not exists idx_reddit_threads_run_score
  on reddit_threads(run_id, relevance_score desc);

create unique index if not exists idx_reddit_threads_run_reddit_id
  on reddit_threads(run_id, reddit_id);

drop trigger if exists set_reddit_intelligence_runs_updated_at on reddit_intelligence_runs;
create trigger set_reddit_intelligence_runs_updated_at
before update on reddit_intelligence_runs
for each row execute function set_updated_at();

notify pgrst, 'reload schema';
