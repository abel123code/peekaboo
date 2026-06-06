export function SetupNotice({ error }: { error: string }) {
  const missingRedditTables = error.includes("reddit_intelligence_runs") || error.includes("reddit_threads");
  const missingCodexTables = error.includes("codex_research_runs") || error.includes("codex_subagent_runs");

  return (
    <div className="notice">
      <strong>Supabase is not ready.</strong>
      {missingCodexTables ? (
        <p>
          Run <code>apps/web/supabase/migrations/010_codex_research.sql</code> in Supabase, then refresh the schema cache.
        </p>
      ) : missingRedditTables ? (
        <p>
          Run <code>apps/web/supabase/migrations/009_reddit_intelligence.sql</code> in Supabase, then refresh the schema cache.
        </p>
      ) : (
        <p>
          Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>apps/web/.env</code> or{" "}
          <code>apps/web/.env.local</code>, then run the migrations in <code>apps/web/supabase/migrations</code>.
        </p>
      )}
      <p>{error}</p>
    </div>
  );
}
