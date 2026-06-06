alter table workflow_runs
  add column if not exists image_search_query text,
  add column if not exists brand_voice_override text,
  add column if not exists backlinks jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
