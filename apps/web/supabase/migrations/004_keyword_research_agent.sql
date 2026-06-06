create table if not exists client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists keyword_research_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  current_stage text,
  trigger_run_id text,
  location_name text not null default 'Singapore',
  language_name text not null default 'English',
  seed_terms jsonb not null default '[]'::jsonb,
  dataforseo_payload jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists keyword_opportunities (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references keyword_research_runs(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  keyword text not null,
  funnel_stage text not null check (funnel_stage in ('awareness', 'consideration', 'comparison', 'decision', 'retention')),
  intent text,
  search_volume integer not null default 0,
  cpc numeric not null default 0,
  competition text,
  keyword_difficulty numeric not null default 0,
  trend jsonb not null default '[]'::jsonb,
  relevance_score integer not null default 0,
  business_value_score integer not null default 0,
  opportunity_score integer not null default 0,
  suggested_topic text not null,
  suggested_goal text not null,
  suggested_audience text,
  image_search_query text,
  reference_links jsonb not null default '[]'::jsonb,
  rationale text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_profiles_client_id
  on client_profiles(client_id);

create index if not exists idx_keyword_research_runs_client_created
  on keyword_research_runs(client_id, created_at desc);

create index if not exists idx_keyword_opportunities_run_score
  on keyword_opportunities(research_run_id, opportunity_score desc);

drop trigger if exists set_client_profiles_updated_at on client_profiles;
create trigger set_client_profiles_updated_at
before update on client_profiles
for each row execute function set_updated_at();

drop trigger if exists set_keyword_research_runs_updated_at on keyword_research_runs;
create trigger set_keyword_research_runs_updated_at
before update on keyword_research_runs
for each row execute function set_updated_at();

notify pgrst, 'reload schema';
