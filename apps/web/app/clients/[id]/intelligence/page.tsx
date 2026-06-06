import type {
  Client,
  CompetitorIntelligenceRun,
  CompetitorIntelligenceSnapshot,
  CompetitorRecommendation,
  Json
} from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { AutoRefresh } from "../../../components/AutoRefresh";
import { StatusBadge } from "../../../components/StatusBadge";
import { Badge } from "../../../components/ui/badge";
import { Button, ButtonLink } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Field, Label } from "../../../components/ui/form";
import { EmptyTableCell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "../../../components/ui/table";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

const ARTIFACT_BUCKET = "seo-workflow-artifacts";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function daysOld(value: string | null) {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

function asArray(value: Json): any[] {
  return Array.isArray(value) ? value : [];
}

function summaryText(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value.executive_summary === "string"
    ? value.executive_summary
    : "";
}

async function loadSnapshotArtifact<T>(supabase: ReturnType<typeof createSupabaseAdmin>, snapshot: CompetitorIntelligenceSnapshot | null, fileName: string) {
  if (!snapshot?.artifact_prefix) return null;
  const bucket = snapshot.artifact_bucket || ARTIFACT_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).download(`${snapshot.artifact_prefix}/${fileName}`);
  if (error || !data) return null;
  return JSON.parse(await data.text()) as T;
}

function topRows<T>(value: T[] | null | undefined, limit = 12) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function artifactPreview(value: unknown) {
  return JSON.stringify(value, null, 2).slice(0, 5000);
}

function metric(value: unknown) {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string" && value.trim()) return value;
  return "-";
}

function keywordLabel(item: any) {
  return String(item?.keyword || item?.keyword_data?.keyword || "-");
}

function keywordVolume(item: any) {
  return item?.search_volume ?? item?.keyword_info?.search_volume ?? item?.keyword_data?.keyword_info?.search_volume ?? 0;
}

function keywordDifficulty(item: any) {
  return item?.keyword_difficulty ?? item?.keyword_properties?.keyword_difficulty ?? item?.keyword_data?.keyword_properties?.keyword_difficulty ?? null;
}

function rankValue(item: any) {
  return metric(item?.rank_absolute ?? item?.rank_group ?? item?.ranked_serp_element?.serp_item?.rank_absolute);
}

function DataSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-md border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-zinc-950">{title}</div>
          <div className="mt-1 text-xs text-zinc-500">{description}</div>
        </div>
        <span className="text-xs font-medium text-zinc-500 group-open:hidden">Open</span>
        <span className="hidden text-xs font-medium text-zinc-500 group-open:inline">Close</span>
      </summary>
      <div className="border-t border-zinc-100 p-4">{children}</div>
    </details>
  );
}

export default async function ClientIntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: runs }, { data: snapshots }, { data: recommendations }, { data: coverage }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single(),
      supabase.from("competitor_intelligence_runs").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("competitor_intelligence_snapshots").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(1),
      supabase.from("competitor_recommendations").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("published_content_coverage").select("*").eq("client_id", id).order("published_at", { ascending: false }).limit(25)
    ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;
  const typedRuns = (runs || []) as CompetitorIntelligenceRun[];
  const latestSnapshot = ((snapshots || [])[0] || null) as CompetitorIntelligenceSnapshot | null;
  const latestRun = typedRuns[0] || null;
  const latestRecommendationRunId = typedRuns.find((run) => run.status === "completed" && run.mode !== "fetch_only")?.id || null;
  const typedRecommendations = ((recommendations || []) as CompetitorRecommendation[]).filter(
    (recommendation) => !latestRecommendationRunId || recommendation.run_id === latestRecommendationRunId
  );
  const isActive = typedRuns.some((run) => run.status === "queued" || run.status === "running");
  const snapshotAge = daysOld(latestSnapshot?.created_at || null);
  const defaultMode = !latestSnapshot || (snapshotAge !== null && snapshotAge >= 7) ? "fetch_and_analyze" : "analyze_only";
  const competitors = latestSnapshot ? asArray(latestSnapshot.competitors).slice(0, 5) : [];
  const [competitorArtifact, clientRankedKeywords, competitorRankedKeywords, domainIntersections] = await Promise.all([
    loadSnapshotArtifact<{ all: any[]; selected: any[] }>(supabase, latestSnapshot, "01-competitors.json"),
    loadSnapshotArtifact<any[]>(supabase, latestSnapshot, "02-client-ranked-keywords.json"),
    loadSnapshotArtifact<Record<string, any[]>>(supabase, latestSnapshot, "03-competitor-ranked-keywords.json"),
    loadSnapshotArtifact<Record<string, any[]>>(supabase, latestSnapshot, "04-domain-intersections.json")
  ]);
  const competitorKeywordCount = Object.values(competitorRankedKeywords || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const intersectionCount = Object.values(domainIntersections || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);

  return (
    <ClientWorkspaceShell client={typedClient} active="intelligence">
      <AutoRefresh enabled={isActive} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Competitor Intelligence</CardTitle>
            <CardDescription>Refresh competitor data weekly, or rerun analysis against the latest saved snapshot.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1.2fr_0.8fr] gap-5 max-lg:grid-cols-1">
            <form className="grid gap-4" action="/api/competitor-intelligence" method="post">
              <input type="hidden" name="client_id" value={typedClient.id} />
              <input type="hidden" name="location_name" value={typedClient.default_location_name} />
              <input type="hidden" name="language_name" value={typedClient.default_language_name} />
              <Field>
                <Label htmlFor="mode">Run Mode</Label>
                <select
                  id="mode"
                  name="mode"
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                  defaultValue={defaultMode}
                >
                  <option value="fetch_and_analyze">Fetch + Analyze</option>
                  <option value="analyze_only" disabled={!latestSnapshot}>
                    Analyze Only
                  </option>
                  <option value="fetch_only">Fetch Only</option>
                </select>
              </Field>
              <div className="flex justify-end">
                <Button type="submit" disabled={isActive}>
                  Run Intelligence
                </Button>
              </div>
            </form>

            <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase text-zinc-500">Latest Snapshot</div>
                <div className="mt-1 text-zinc-950">{latestSnapshot ? formatDate(latestSnapshot.created_at) : "No snapshot yet"}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {snapshotAge === null ? "Fetch data before using Analyze Only." : snapshotAge < 1 ? "Fresh today" : `${snapshotAge} days old`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {competitors.length ? (
                  competitors.map((competitor) => (
                    <Badge key={competitor.domain || competitor} variant="info">
                      {competitor.domain || competitor}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-zinc-500">No competitors saved yet.</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Latest Strategy</CardTitle>
            <CardDescription>{latestRun ? summaryText(latestRun.summary) || "Run is still preparing strategy output." : "No intelligence run yet."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedRecommendations.length ? (
                  typedRecommendations.map((recommendation) => (
                    <TableRow key={recommendation.id}>
                      <TableCell>
                        <div className="font-medium text-zinc-950">{recommendation.keyword}</div>
                        <div className="max-w-xl truncate text-xs text-zinc-500">{recommendation.rationale}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={recommendation.recommendation_type === "gap" ? "warning" : "info"}>
                          {recommendation.recommendation_type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{metric(recommendation.search_volume)}</TableCell>
                      <TableCell>{metric(recommendation.keyword_difficulty)}</TableCell>
                      <TableCell>{recommendation.opportunity_score}</TableCell>
                      <TableCell className="text-right">
                        <ButtonLink variant="secondary" size="sm" href={`/clients/${typedClient.id}/new-content?recommendation_id=${recommendation.id}`}>
                          Use in Writer
                        </ButtonLink>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTableCell colSpan={6}>Run competitor intelligence to generate recommendations.</EmptyTableCell>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fetched Data</CardTitle>
            <CardDescription>Collapsed snapshot artifacts from the latest DataForSEO fetch.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {latestSnapshot ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-4 gap-3 text-sm max-lg:grid-cols-2 max-sm:grid-cols-1">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-medium uppercase text-zinc-500">Competitors</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{metric(competitorArtifact?.selected?.length || competitors.length)}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-medium uppercase text-zinc-500">Client Keywords</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{metric(clientRankedKeywords?.length || 0)}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-medium uppercase text-zinc-500">Competitor Keywords</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{metric(competitorKeywordCount)}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-medium uppercase text-zinc-500">Intersections</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-950">{metric(intersectionCount)}</div>
                </div>
              </div>

              <DataSection title="Competitor Domains" description="Domains discovered by DataForSEO and the top competitors selected for analysis.">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Intersections</TableHead>
                        <TableHead>Organic Keywords</TableHead>
                        <TableHead>Organic ETV</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topRows(competitorArtifact?.selected || competitors, 10).map((competitor: any) => (
                        <TableRow key={competitor.domain}>
                          <TableCell>{competitor.domain}</TableCell>
                          <TableCell>{metric(competitor.intersections)}</TableCell>
                          <TableCell>{metric(competitor.organic_keywords)}</TableCell>
                          <TableCell>{metric(competitor.organic_etv)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </DataSection>

              <DataSection title="Client Ranked Keywords" description="Top saved ranked keywords for the client domain from the snapshot.">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Keyword</TableHead>
                        <TableHead>Rank</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Difficulty</TableHead>
                        <TableHead>URL</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topRows(clientRankedKeywords, 15).map((keyword: any) => (
                        <TableRow key={`${keywordLabel(keyword)}-${rankValue(keyword)}`}>
                          <TableCell>{keywordLabel(keyword)}</TableCell>
                          <TableCell>{rankValue(keyword)}</TableCell>
                          <TableCell>{metric(keywordVolume(keyword))}</TableCell>
                          <TableCell>{metric(keywordDifficulty(keyword))}</TableCell>
                          <TableCell className="max-w-xs truncate">{keyword.url || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </DataSection>

              <DataSection title="Competitor Ranked Keywords" description="Saved ranked-keyword pulls grouped by selected competitor.">
                <div className="grid gap-4">
                  {Object.entries(competitorRankedKeywords || {}).map(([domain, rows]) => (
                    <div key={domain} className="grid gap-2">
                      <div className="text-sm font-medium text-zinc-950">
                        {domain} <span className="text-xs font-normal text-zinc-500">({rows.length} keywords)</span>
                      </div>
                      <TableWrap>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Keyword</TableHead>
                              <TableHead>Rank</TableHead>
                              <TableHead>Volume</TableHead>
                              <TableHead>Difficulty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topRows(rows, 10).map((keyword: any) => (
                              <TableRow key={`${domain}-${keywordLabel(keyword)}-${rankValue(keyword)}`}>
                                <TableCell>{keywordLabel(keyword)}</TableCell>
                                <TableCell>{rankValue(keyword)}</TableCell>
                                <TableCell>{metric(keywordVolume(keyword))}</TableCell>
                                <TableCell>{metric(keywordDifficulty(keyword))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableWrap>
                    </div>
                  ))}
                </div>
              </DataSection>

              <DataSection title="Domain Intersections" description="Keywords where the client and a competitor both rank, useful for weak-overlap analysis.">
                <div className="grid gap-4">
                  {Object.entries(domainIntersections || {}).map(([domain, rows]) => (
                    <div key={domain} className="grid gap-2">
                      <div className="text-sm font-medium text-zinc-950">
                        {domain} <span className="text-xs font-normal text-zinc-500">({rows.length} intersections)</span>
                      </div>
                      <TableWrap>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Keyword</TableHead>
                              <TableHead>Client Rank</TableHead>
                              <TableHead>Competitor Rank</TableHead>
                              <TableHead>Volume</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topRows(rows, 10).map((keyword: any) => (
                              <TableRow key={`${domain}-${keywordLabel(keyword)}-${keyword.first_domain_rank}-${keyword.second_domain_rank}`}>
                                <TableCell>{keywordLabel(keyword)}</TableCell>
                                <TableCell>{metric(keyword.first_domain_rank)}</TableCell>
                                <TableCell>{metric(keyword.second_domain_rank)}</TableCell>
                                <TableCell>{metric(keywordVolume(keyword))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableWrap>
                    </div>
                  ))}
                </div>
              </DataSection>

              <DataSection title="Raw JSON Preview" description="Small preview of the stored snapshot artifacts for debugging.">
                <pre className="max-h-96 overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
                  {artifactPreview({
                    competitors: competitorArtifact,
                    client_ranked_keywords: topRows(clientRankedKeywords, 5),
                    competitor_ranked_keywords: Object.fromEntries(
                      Object.entries(competitorRankedKeywords || {}).map(([domain, rows]) => [domain, topRows(rows, 3)])
                    ),
                    domain_intersections: Object.fromEntries(Object.entries(domainIntersections || {}).map(([domain, rows]) => [domain, topRows(rows, 3)]))
                  })}
                </pre>
              </DataSection>
            </div>
          ) : (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
              No fetched snapshot yet. Run Fetch + Analyze to save DataForSEO artifacts.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Runs</CardTitle>
              <CardDescription>Fetch and analysis history.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typedRuns.length ? (
                    typedRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>{run.mode.replaceAll("_", " ")}</TableCell>
                        <TableCell>{run.current_stage || "-"}</TableCell>
                        <TableCell>{formatDate(run.created_at)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyTableCell colSpan={4}>No intelligence runs yet.</EmptyTableCell>
                  )}
                </TableBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Published Coverage</CardTitle>
              <CardDescription>Approved drafts count as manually deployed content.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage?.length ? (
                    coverage.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.keyword}</TableCell>
                        <TableCell className="max-w-xs truncate">{item.title}</TableCell>
                        <TableCell>{formatDate(item.published_at)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyTableCell colSpan={3}>Approve deployed drafts to build coverage memory.</EmptyTableCell>
                  )}
                </TableBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      </div>
    </ClientWorkspaceShell>
  );
}
