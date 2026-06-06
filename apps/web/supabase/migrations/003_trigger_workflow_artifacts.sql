alter table workflow_runs
  add column if not exists trigger_run_id text,
  add column if not exists artifact_bucket text,
  add column if not exists artifact_prefix text;

insert into storage.buckets (id, name, public)
values ('seo-workflow-artifacts', 'seo-workflow-artifacts', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
