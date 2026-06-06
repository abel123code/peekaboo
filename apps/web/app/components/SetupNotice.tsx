export function SetupNotice({ error }: { error: string }) {
  return (
    <div className="notice">
      <strong>Supabase is not ready.</strong>
      <p>
        Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in{" "}
        <code>apps/web/.env.local</code>, then run the migration in{" "}
        <code>apps/web/supabase/migrations/001_dashboard_schema.sql</code>.
      </p>
      <p>{error}</p>
    </div>
  );
}
