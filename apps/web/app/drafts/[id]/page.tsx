import Link from "next/link";
import type { ArticleDraft, WorkflowRun } from "../../../lib/database.types";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import { DraftEditor } from "../../components/DraftEditor";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: draft, error } = await supabase
    .from("article_drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !draft) throw new Error(error?.message || "Draft not found.");

  const typedDraft = draft as ArticleDraft;
  const { data: run } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", typedDraft.run_id)
    .single();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Review Draft</h1>
          <p className="muted">{typedDraft.title}</p>
        </div>
        <div className="row">
          {run ? (
            <Link className="button secondary" href={`/runs/${(run as WorkflowRun).id}`}>
              Run
            </Link>
          ) : null}
          <Link className="button secondary" href={`/clients/${typedDraft.client_id}/drafts`}>
            Client
          </Link>
        </div>
      </div>
      <DraftEditor draft={typedDraft} />
    </>
  );
}
