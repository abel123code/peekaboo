create table if not exists aeo_asset_runs (
  id uuid primary key default gen_random_uuid(),
  codex_run_id uuid not null references codex_research_runs(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  current_stage text,
  trigger_run_id text,
  idea_index integer not null default 0,
  selected_idea jsonb not null default '{}'::jsonb,
  source_pack jsonb not null default '[]'::jsonb,
  generated_asset jsonb not null default '{}'::jsonb,
  review_trace jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aeo_asset_runs_codex_run_created
  on aeo_asset_runs(codex_run_id, created_at desc);

create index if not exists idx_aeo_asset_runs_created
  on aeo_asset_runs(created_at desc);

drop trigger if exists set_aeo_asset_runs_updated_at on aeo_asset_runs;
create trigger set_aeo_asset_runs_updated_at
before update on aeo_asset_runs
for each row execute function set_updated_at();

notify pgrst, 'reload schema';
