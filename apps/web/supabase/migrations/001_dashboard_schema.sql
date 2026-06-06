create extension if not exists pgcrypto;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text not null,
  website_context text not null,
  default_audience text,
  brand_voice text,
  default_location_name text not null default 'Singapore',
  default_language_name text not null default 'English',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  run_name text not null,
  keyword text not null,
  topic text not null,
  goal text not null,
  audience text,
  image_search_query text,
  brand_voice_override text,
  backlinks jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'failed', 'completed')),
  current_stage text,
  local_run_dir text,
  final_post_path text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists article_drafts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references workflow_runs(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  title text not null,
  slug text not null,
  meta_description text not null,
  target_keyword text not null,
  excerpt text not null,
  summary_bullets jsonb not null default '[]'::jsonb,
  cta_banner jsonb not null default '{}'::jsonb,
  content text not null,
  seo_review jsonb,
  icp_pain_hypothesis jsonb,
  images jsonb not null default '[]'::jsonb,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflow_runs_client_id_created_at
  on workflow_runs(client_id, created_at desc);

create index if not exists idx_article_drafts_client_id_created_at
  on article_drafts(client_id, created_at desc);

alter table workflow_runs
  add column if not exists image_search_query text,
  add column if not exists brand_voice_override text,
  add column if not exists backlinks jsonb not null default '[]'::jsonb;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_clients_updated_at on clients;
create trigger set_clients_updated_at
before update on clients
for each row execute function set_updated_at();

drop trigger if exists set_workflow_runs_updated_at on workflow_runs;
create trigger set_workflow_runs_updated_at
before update on workflow_runs
for each row execute function set_updated_at();

drop trigger if exists set_article_drafts_updated_at on article_drafts;
create trigger set_article_drafts_updated_at
before update on article_drafts
for each row execute function set_updated_at();
