import Link from "next/link";
import type { Client, KeywordOpportunity, KeywordResearchRun } from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { AutoRefresh } from "../../../components/AutoRefresh";
import { StatusBadge } from "../../../components/StatusBadge";
import { Button, ButtonLink } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyTableCell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "../../../components/ui/table";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatMetric(value: number | null) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function candidateCount(run: KeywordResearchRun) {
  const payload = run.dataforseo_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 0;
  const candidates = payload.candidates;
  return Array.isArray(candidates) ? candidates.length : 0;
}

export default async function ClientKeywordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: keywordRuns }, { data: opportunities }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("keyword_research_runs").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("keyword_opportunities").select("*").eq("client_id", id).order("opportunity_score", { ascending: false }).limit(100)
  ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;
  const typedKeywordRuns = (keywordRuns || []) as KeywordResearchRun[];
  const typedOpportunities = (opportunities || []) as KeywordOpportunity[];
  const isActive = typedKeywordRuns.some((run) => run.status === "queued" || run.status === "running");

  return (
    <ClientWorkspaceShell client={typedClient} active="keywords">
      <AutoRefresh enabled={isActive} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Keyword Research Runs</CardTitle>
            <CardDescription>Run discovery and monitor each stage.</CardDescription>
          </div>
          <form action="/api/keyword-research" method="post">
            <input type="hidden" name="client_id" value={typedClient.id} />
            <input type="hidden" name="location_name" value={typedClient.default_location_name} />
            <input type="hidden" name="language_name" value={typedClient.default_language_name} />
            <Button type="submit">Run Keyword Research</Button>
          </form>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Fetched Keywords</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedKeywordRuns.length ? (
                  typedKeywordRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>{run.current_stage || "-"}</TableCell>
                      <TableCell>{run.location_name}</TableCell>
                      <TableCell>{formatMetric(candidateCount(run))}</TableCell>
                      <TableCell>{formatDate(run.created_at)}</TableCell>
                      <TableCell>{formatDate(run.completed_at)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/clients/${typedClient.id}/keywords/runs/${run.id}`} className="text-xs font-medium text-zinc-950 hover:underline">
                          View Keywords
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTableCell colSpan={7}>No keyword research runs yet.</EmptyTableCell>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Keyword Opportunities</CardTitle>
            <CardDescription>Deduped active opportunities for this client.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Funnel</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedOpportunities.length ? (
                  typedOpportunities.map((opportunity) => (
                    <TableRow key={opportunity.id}>
                      <TableCell>
                        <div className="font-medium text-zinc-950">{opportunity.keyword}</div>
                        <div className="max-w-lg truncate text-xs text-zinc-500">{opportunity.suggested_topic}</div>
                      </TableCell>
                      <TableCell className="capitalize">{opportunity.funnel_stage}</TableCell>
                      <TableCell>{formatMetric(opportunity.search_volume)}</TableCell>
                      <TableCell>{formatMetric(opportunity.keyword_difficulty)}</TableCell>
                      <TableCell>{opportunity.opportunity_score}</TableCell>
                      <TableCell className="text-right">
                        <ButtonLink variant="secondary" size="sm" href={`/clients/${typedClient.id}/new-content?opportunity_id=${opportunity.id}`}>
                          Use in Writer
                        </ButtonLink>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTableCell colSpan={6}>Run keyword research to generate opportunities.</EmptyTableCell>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </ClientWorkspaceShell>
  );
}
