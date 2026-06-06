import Link from "next/link";
import type { ArticleDraft, Client, WorkflowRun } from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { AutoRefresh } from "../../../components/AutoRefresh";
import { StatusBadge } from "../../../components/StatusBadge";
import { ButtonLink } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyTableCell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "../../../components/ui/table";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function ClientRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: runs }, { data: drafts }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("workflow_runs").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("article_drafts").select("*").eq("client_id", id)
  ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;
  const typedRuns = (runs || []) as WorkflowRun[];
  const typedDrafts = (drafts || []) as ArticleDraft[];
  const draftByRunId = new Map(typedDrafts.map((draft) => [draft.run_id, draft]));
  const isActive = typedRuns.some((run) => run.status === "queued" || run.status === "running");

  return (
    <ClientWorkspaceShell client={typedClient} active="runs">
      <AutoRefresh enabled={isActive} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Workflow Runs</CardTitle>
            <CardDescription>Track article generation jobs and their current stage.</CardDescription>
          </div>
          <ButtonLink href={`/clients/${typedClient.id}/new-content`}>New Content</ButtonLink>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedRuns.length ? (
                  typedRuns.map((run) => {
                    const draft = draftByRunId.get(run.id);
                    return (
                      <TableRow key={run.id}>
                        <TableCell>
                          <Link href={`/runs/${run.id}`} className="font-medium text-zinc-950 hover:underline">
                            {run.keyword}
                          </Link>
                          <div className="max-w-lg truncate text-xs text-zinc-500">{run.topic}</div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>{run.current_stage || "-"}</TableCell>
                        <TableCell>{formatDate(run.created_at)}</TableCell>
                        <TableCell>{formatDate(run.completed_at)}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          {draft ? (
                            <ButtonLink variant="secondary" size="sm" href={`/drafts/${draft.id}`}>
                              Draft
                            </ButtonLink>
                          ) : null}
                          <ButtonLink variant="secondary" size="sm" href={`/runs/${run.id}`}>
                            Details
                          </ButtonLink>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <EmptyTableCell colSpan={6}>No workflow runs yet.</EmptyTableCell>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </ClientWorkspaceShell>
  );
}
