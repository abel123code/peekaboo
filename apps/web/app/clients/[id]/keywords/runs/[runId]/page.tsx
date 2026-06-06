import Link from "next/link";
import type { Client, Json, KeywordResearchRun } from "../../../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../../../lib/supabase-admin";
import { Badge } from "../../../../../components/ui/badge";
import { ButtonLink } from "../../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { EmptyTableCell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "../../../../../components/ui/table";
import { ClientWorkspaceShell } from "../../../ClientWorkspaceShell";

type Candidate = {
  keyword: string;
  source?: string | null;
  search_volume?: number | null;
  cpc?: number | null;
  competition?: string | null;
  keyword_difficulty?: number | null;
  intent?: string | null;
  last_updated?: string | null;
};

const SORT_KEYS = new Set(["keyword", "source", "search_volume", "cpc", "competition", "keyword_difficulty", "intent", "last_updated"]);
const PAGE_SIZES = new Set([25, 50, 100]);

function asString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function candidatesFromPayload(payload: Json): Candidate[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) return [];

  return candidates
    .filter((candidate): candidate is Record<string, Json | undefined> => Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate)))
    .map((candidate) => ({
      keyword: String(candidate.keyword || ""),
      source: typeof candidate.source === "string" ? candidate.source : null,
      search_volume: asNumber(candidate.search_volume),
      cpc: asNumber(candidate.cpc),
      competition: typeof candidate.competition === "string" ? candidate.competition : null,
      keyword_difficulty: asNumber(candidate.keyword_difficulty),
      intent: typeof candidate.intent === "string" ? candidate.intent : null,
      last_updated: typeof candidate.last_updated === "string" ? candidate.last_updated : null
    }))
    .filter((candidate) => candidate.keyword);
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  return a - b;
}

function compareNullableString(a: string | null | undefined, b: string | null | undefined) {
  return String(a || "").localeCompare(String(b || ""));
}

function sortCandidates(candidates: Candidate[], sort: string, order: "asc" | "desc") {
  const sorted = [...candidates].sort((a, b) => {
    let value = 0;
    if (sort === "search_volume" || sort === "cpc" || sort === "keyword_difficulty") {
      value = compareNullableNumber(a[sort], b[sort]);
    } else {
      value = compareNullableString(a[sort as keyof Candidate] as string | null | undefined, b[sort as keyof Candidate] as string | null | undefined);
    }
    return order === "asc" ? value : -value;
  });
  return sorted;
}

function queryHref({
  clientId,
  runId,
  q,
  sort,
  order,
  page,
  pageSize
}: {
  clientId: string;
  runId: string;
  q: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("sort", sort);
  params.set("order", order);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/clients/${clientId}/keywords/runs/${runId}?${params.toString()}`;
}

function SortLink({
  label,
  sortKey,
  activeSort,
  order,
  clientId,
  runId,
  q,
  pageSize
}: {
  label: string;
  sortKey: string;
  activeSort: string;
  order: "asc" | "desc";
  clientId: string;
  runId: string;
  q: string;
  pageSize: number;
}) {
  const nextOrder = activeSort === sortKey && order === "desc" ? "asc" : "desc";
  const indicator = activeSort === sortKey ? (order === "desc" ? " ↓" : " ↑") : "";
  return (
    <Link
      href={queryHref({ clientId, runId, q, sort: sortKey, order: nextOrder, page: 1, pageSize })}
      className="hover:text-zinc-950 hover:underline"
    >
      {label}
      {indicator}
    </Link>
  );
}

export default async function KeywordResearchRunKeywordsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, runId } = await params;
  const query = await searchParams;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: run, error: runError }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("keyword_research_runs").select("*").eq("id", runId).eq("client_id", id).single()
  ]);

  if (clientError || !client) throw new Error(clientError?.message || "Client not found.");
  if (runError || !run) throw new Error(runError?.message || "Keyword research run not found.");

  const typedClient = client as Client;
  const typedRun = run as KeywordResearchRun;
  const q = asString(query.q).trim();
  const sort = SORT_KEYS.has(asString(query.sort)) ? asString(query.sort) : "search_volume";
  const order = asString(query.order) === "asc" ? "asc" : "desc";
  const requestedPageSize = Number(asString(query.pageSize) || 50);
  const pageSize = PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 50;
  const allCandidates = candidatesFromPayload(typedRun.dataforseo_payload);
  const filteredCandidates = q
    ? allCandidates.filter((candidate) => candidate.keyword.toLowerCase().includes(q.toLowerCase()))
    : allCandidates;
  const sortedCandidates = sortCandidates(filteredCandidates, sort, order);
  const pageCount = Math.max(1, Math.ceil(sortedCandidates.length / pageSize));
  const requestedPage = Number(asString(query.page) || 1);
  const page = Math.max(1, Math.min(pageCount, Number.isFinite(requestedPage) ? requestedPage : 1));
  const pageCandidates = sortedCandidates.slice((page - 1) * pageSize, page * pageSize);

  return (
    <ClientWorkspaceShell client={typedClient} active="keywords">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fetched Keywords</CardTitle>
            <CardDescription>
              {formatDate(typedRun.created_at)} · {typedRun.location_name} · {typedRun.language_name}
            </CardDescription>
          </div>
          <ButtonLink variant="secondary" href={`/clients/${typedClient.id}/keywords`}>
            Back to Keywords
          </ButtonLink>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <Badge>{typedRun.status}</Badge>
              <span>{filteredCandidates.length.toLocaleString()} keywords</span>
              {q ? <span>matching “{q}”</span> : null}
            </div>
            <form className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="order" value={order} />
              <input type="hidden" name="pageSize" value={pageSize} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search keywords"
                className="h-9 w-60 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
              />
              <button className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
                Search
              </button>
            </form>
          </div>

          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortLink label="Keyword" sortKey="keyword" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="Source" sortKey="source" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="Volume" sortKey="search_volume" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="KD" sortKey="keyword_difficulty" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="CPC" sortKey="cpc" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="Competition" sortKey="competition" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="Intent" sortKey="intent" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                  <TableHead>
                    <SortLink label="Updated" sortKey="last_updated" activeSort={sort} order={order} clientId={id} runId={runId} q={q} pageSize={pageSize} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageCandidates.length ? (
                  pageCandidates.map((candidate) => (
                    <TableRow key={`${candidate.source || "source"}-${candidate.keyword}`}>
                      <TableCell className="font-medium text-zinc-950">{candidate.keyword}</TableCell>
                      <TableCell>{candidate.source || "-"}</TableCell>
                      <TableCell>{formatMetric(candidate.search_volume)}</TableCell>
                      <TableCell>{formatMetric(candidate.keyword_difficulty)}</TableCell>
                      <TableCell>{typeof candidate.cpc === "number" ? candidate.cpc.toFixed(2) : "-"}</TableCell>
                      <TableCell>{candidate.competition || "-"}</TableCell>
                      <TableCell>{candidate.intent || "-"}</TableCell>
                      <TableCell>{formatDate(candidate.last_updated)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTableCell colSpan={8}>No fetched keywords found for this run.</EmptyTableCell>
                )}
              </TableBody>
            </Table>
          </TableWrap>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
            <div>
              Page {page.toLocaleString()} of {pageCount.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <ButtonLink
                variant="secondary"
                size="sm"
                href={queryHref({ clientId: id, runId, q, sort, order, page: Math.max(1, page - 1), pageSize })}
                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
              >
                Previous
              </ButtonLink>
              <ButtonLink
                variant="secondary"
                size="sm"
                href={queryHref({ clientId: id, runId, q, sort, order, page: Math.min(pageCount, page + 1), pageSize })}
                className={page >= pageCount ? "pointer-events-none opacity-50" : ""}
              >
                Next
              </ButtonLink>
            </div>
          </div>
        </CardContent>
      </Card>
    </ClientWorkspaceShell>
  );
}
