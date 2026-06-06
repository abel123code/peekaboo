import Link from "next/link";
import type { ArticleDraft, Client, WorkflowRun } from "../../../lib/database.types";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import { AutoRefresh } from "../../components/AutoRefresh";
import { StatusBadge } from "../../components/StatusBadge";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: run, error: runError } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", id)
    .single();
  if (runError || !run) throw new Error(runError?.message || "Run not found.");

  const typedRun = run as WorkflowRun;
  const [{ data: client }, { data: draft }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", typedRun.client_id).single(),
    supabase.from("article_drafts").select("*").eq("run_id", typedRun.id).maybeSingle()
  ]);

  const isActive = typedRun.status === "queued" || typedRun.status === "running";

  return (
    <>
      <AutoRefresh enabled={isActive} />
      <div className="page-header">
        <div>
          <h1>{typedRun.keyword}</h1>
          <p className="muted">{typedRun.topic}</p>
        </div>
        <div className="row">
          {draft ? (
            <Link className="button" href={`/drafts/${(draft as ArticleDraft).id}`}>
              Open Draft
            </Link>
          ) : null}
          <Link className="button secondary" href={`/clients/${typedRun.client_id}/runs`}>
            Client
          </Link>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Run Status</h2>
          <div className="stack">
            <div className="row">
              <span>Status</span>
              <StatusBadge status={typedRun.status} />
            </div>
            <div className="row">
              <span>Current stage</span>
              <strong>{typedRun.current_stage || "-"}</strong>
            </div>
            <div>
              <strong>Goal</strong>
              <p>{typedRun.goal}</p>
            </div>
            <div>
              <strong>Audience</strong>
              <p>{typedRun.audience || (client as Client | null)?.default_audience || "Not specified"}</p>
            </div>
            {typedRun.error ? (
              <div className="notice">
                <strong>Error</strong>
                <p>{typedRun.error}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <h2>Execution</h2>
          <div className="stack">
            <div>
              <strong>Trigger run</strong>
              <p className="muted">{typedRun.trigger_run_id || "Not triggered yet"}</p>
            </div>
            <div>
              <strong>Artifact bucket</strong>
              <p className="muted">{typedRun.artifact_bucket || "Not created yet"}</p>
            </div>
            <div>
              <strong>Artifact prefix</strong>
              <p className="muted">{typedRun.artifact_prefix || "Not created yet"}</p>
            </div>
            <div>
              <strong>Run folder</strong>
              <p className="muted">{typedRun.local_run_dir || "Not created yet"}</p>
            </div>
            <div>
              <strong>Final post</strong>
              <p className="muted">{typedRun.final_post_path || "Not created yet"}</p>
            </div>
            <div>
              <strong>Created</strong>
              <p className="muted">{new Date(typedRun.created_at).toLocaleString()}</p>
            </div>
            <div>
              <strong>Completed</strong>
              <p className="muted">{typedRun.completed_at ? new Date(typedRun.completed_at).toLocaleString() : "-"}</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
