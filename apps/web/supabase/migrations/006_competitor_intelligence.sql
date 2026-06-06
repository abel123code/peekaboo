create table if not exists competitor_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  location_name text not null default 'Singapore',
  language_name text not null default 'English',
  artifact_bucket text,
  artifact_prefix text,
  competitors jsonb not null default '[]'::jsonb,
  competitor_count integer not null default 0,
  keyword_count integer not null default 0,
  skipped_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists competitor_intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  snapshot_id uuid references competitor_intelligence_snapshots(id) on delete set null,
  mode text not null check (mode in ('fetch_and_analyze', 'analyze_only', 'fetch_only')),
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  current_stage text,
  trigger_run_id text,
  location_name text not null default 'Singapore',
  language_name text not null default 'English',
  artifact_bucket text,
  artifact_prefix text,
  summary jsonb not null default '{}'::jsonb,
  memory_path text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists competitor_recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references competitor_intelligence_runs(id) on delete cascade,
  snapshot_id uuid references competitor_intelligence_snapshots(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  keyword text not null,
  normalized_keyword text not null,
  recommendation_type text not null check (recommendation_type in ('gap', 'weak_overlap', 'existing_opportunity')),
  funnel_stage text not null check (funnel_stage in ('awareness', 'consideration', 'comparison', 'decision', 'retention')),
  intent text,
  search_volume integer not null default 0,
  cpc numeric not null default 0,
  competition text,
  keyword_difficulty numeric not null default 0,
  opportunity_score integer not null default 0,
  source_competitors jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  suggested_topic text not null,
  suggested_goal text not null,
  suggested_audience text,
  image_search_query text,
  reference_links jsonb not null default '[]'::jsonb,
  rationale text not null,
  status text not null default 'recommended' check (status in ('recommended', 'used_in_writer', 'dismissed')),
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  article_draft_id uuid references article_drafts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists published_content_coverage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  keyword text not null,
  normalized_keyword text not null,
  article_draft_id uuid references article_drafts(id) on delete set null,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  title text not null,
  slug text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table article_drafts
  add column if not exists approved_at timestamptz,
  add column if not exists published_at timestamptz;

create index if not exists idx_competitor_intelligence_snapshots_client_created
  on competitor_intelligence_snapshots(client_id, created_at desc);

create index if not exists idx_competitor_intelligence_runs_client_created
  on competitor_intelligence_runs(client_id, created_at desc);

create index if not exists idx_competitor_recommendations_run_score
  on competitor_recommendations(run_id, opportunity_score desc);

create index if not exists idx_competitor_recommendations_client_score
  on competitor_recommendations(client_id, opportunity_score desc);

create unique index if not exists idx_published_content_coverage_client_keyword
  on published_content_coverage(client_id, normalized_keyword);

drop trigger if exists set_competitor_intelligence_runs_updated_at on competitor_intelligence_runs;
create trigger set_competitor_intelligence_runs_updated_at
before update on competitor_intelligence_runs
for each row execute function set_updated_at();

drop trigger if exists set_published_content_coverage_updated_at on published_content_coverage;
create trigger set_published_content_coverage_updated_at
before update on published_content_coverage
for each row execute function set_updated_at();

notify pgrst, 'reload schema';
