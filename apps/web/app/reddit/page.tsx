import Link from "next/link";
import { ArrowUpRight, Search, Settings } from "lucide-react";
import type { Json, RedditIntelligenceRun, RedditThread } from "../../lib/database.types";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import { AutoRefresh } from "../components/AutoRefresh";
import { PeekabooLogo } from "../components/PeekabooLogo";
import { SetupNotice } from "../components/SetupNotice";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/ui/badge";
import { Button, ButtonLink } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { PageDescription, PageTitle } from "../components/ui/page-layout";
import { EmptyTableCell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "../components/ui/table";

export const dynamic = "force-dynamic";

type TraceRecord = Record<string, unknown>;

type RedditTrace = {
  plan: TraceRecord[];
  harness_events: TraceRecord[];
  tool_calls: TraceRecord[];
  decisions: TraceRecord[];
  rejected_threads: TraceRecord[];
  selected_threads: TraceRecord[];
  summary: string;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function asRecord(value: Json | unknown): TraceRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as TraceRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asTrace(value: Json): RedditTrace {
  const record = asRecord(value);
  return {
    plan: asArray(record.plan).filter((item): item is TraceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    harness_events: asArray(record.harness_events).filter((item): item is TraceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    tool_calls: asArray(record.tool_calls).filter((item): item is TraceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    decisions: asArray(record.decisions).filter((item): item is TraceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    rejected_threads: asArray(record.rejected_threads).filter((item): item is TraceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    selected_threads: asArray(record.selected_threads).filter((item): item is TraceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))),
    summary: typeof record.summary === "string" ? record.summary : ""
  };
}

function text(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function eventVariant(value: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const type = text(value, "");
  if (type === "observation" || type === "finish") return "success";
  if (type === "policy_check" || type === "tool_execution") return "info";
  if (type === "error") return "danger";
  if (type === "model_action") return "warning";
  return "neutral";
}

function eventDetail(event: TraceRecord) {
  const input = asRecord(event.input);
  const output = asRecord(event.output);
  const policy = asRecord(event.policy);
  const tool = text(event.tool, "");

  if (tool === "search_reddit") {
    return `${text(input.subreddit, "")} ${text(input.query, "")}`.trim();
  }
  if (tool === "fetch_thread") {
    return `${text(input.reddit_id, "")} ${text(input.reason, "")}`.trim();
  }
  if (tool === "final_judge") {
    const selected = number(output.selected_threads, -1);
    return selected >= 0 ? `${selected} selected, ${number(output.rejected_threads)} rejected` : text(event.summary, "");
  }
  if (typeof policy.reason === "string") return policy.reason;
  return text(event.summary, "");
}

function jsonStrings(value: Json) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function profileName(run: RedditIntelligenceRun | null) {
  if (!run) return "Mr Plumber Singapore";
  const summary = asRecord(run.summary);
  return run.profile_name || text(summary.profile_name, "Mr Plumber Singapore");
}

async function loadRedditData() {
  const supabase = createSupabaseAdmin();
  const { data: runs, error: runsError } = await supabase
    .from("reddit_intelligence_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);
  if (runsError) throw new Error(runsError.message);

  const typedRuns = (runs || []) as RedditIntelligenceRun[];
  const latestRun = typedRuns[0] || null;
  let threads: RedditThread[] = [];

  if (latestRun) {
    const { data: threadRows, error: threadError } = await supabase
      .from("reddit_threads")
      .select("*")
      .eq("run_id", latestRun.id)
      .order("relevance_score", { ascending: false });
    if (threadError) throw new Error(threadError.message);
    threads = (threadRows || []) as RedditThread[];
  }

  return {
    runs: typedRuns,
    latestRun,
    threads
  };
}

export default async function RedditPage() {
  let runs: RedditIntelligenceRun[] = [];
  let latestRun: RedditIntelligenceRun | null = null;
  let threads: RedditThread[] = [];
  let setupError: string | null = null;

  try {
    const data = await loadRedditData();
    runs = data.runs;
    latestRun = data.latestRun;
    threads = data.threads;
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  const trace = latestRun ? asTrace(latestRun.investigation_trace) : asTrace({});
  const isActive = runs.some((run) => run.status === "queued" || run.status === "running");
  const searchCalls = trace.tool_calls.filter((call) => call.tool === "search_reddit");
  const fetchCalls = trace.tool_calls.filter((call) => call.tool === "fetch_thread");
  const selectedFromTrace = trace.selected_threads.length;
  const latestHarnessEvent = trace.harness_events[trace.harness_events.length - 1] || null;
  const objectiveEvent = trace.harness_events.find((event) => event.type === "objective") || null;
  const policyEvents = trace.harness_events.filter((event) => event.type === "policy_check");
  const observationEvents = trace.harness_events.filter((event) => event.type === "observation");

  return (
    <>
      <AutoRefresh enabled={isActive} />

      <div className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-5 py-4 shadow-sm">
        <Link href="/clients">
          <PeekabooLogo size="lg" />
        </Link>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/clients" variant="secondary">
            Clients
          </ButtonLink>
          <ButtonLink href="/settings" variant="secondary">
            <Settings className="h-4 w-4" />
            Settings
          </ButtonLink>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-[1fr_auto] items-end gap-6 max-md:grid-cols-1">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600">
            <Search className="h-3.5 w-3.5" />
            Reddit investigation agent
          </div>
          <PageTitle>Reddit intelligence</PageTitle>
          <PageDescription>
            Search Singapore Reddit conversations for urgent plumbing needs, visible research decisions, and high-signal threads for Module 2.
          </PageDescription>
        </div>
        <form action="/api/reddit-intelligence" method="post">
          <Button type="submit" disabled={isActive || Boolean(setupError)}>
            Run Investigation
          </Button>
        </form>
      </div>

      {setupError ? (
        <SetupNotice error={setupError} />
      ) : (
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Latest Run</CardTitle>
                <CardDescription>
                  {latestRun
                    ? `${profileName(latestRun)} - ${trace.summary || text(asRecord(latestRun.summary).summary, "Investigation trace will appear as the run progresses.")}`
                    : "No Reddit investigation has been run yet."}
                </CardDescription>
              </div>
              {latestRun ? <StatusBadge status={latestRun.status} /> : null}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Stage</div>
                  <div className="mt-1 text-sm font-medium text-zinc-950">{latestRun?.current_stage || "-"}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Searches</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-950">{searchCalls.length}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Fetched</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-950">{fetchCalls.length}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Decisions</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-950">{trace.decisions.length}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Selected</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-950">{threads.length || selectedFromTrace}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Harness Run</CardTitle>
                <CardDescription>
                  Visible summaries of the agent loop: objective, requested actions, guardrail checks, tool execution, observations, and judge output.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Objective</div>
                  <div className="mt-1 line-clamp-3 text-sm font-medium text-zinc-950">{text(objectiveEvent?.summary, "Waiting for first run.")}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Current Step</div>
                  <div className="mt-1 text-sm font-medium text-zinc-950">{text(latestHarnessEvent?.label, latestRun?.current_stage || "-")}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{text(latestHarnessEvent?.summary, "")}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Policy Checks</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-950">{policyEvents.length}</div>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-medium uppercase text-zinc-500">Observations</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-950">{observationEvents.length}</div>
                </div>
              </div>

              <div className="grid max-h-[620px] gap-3 overflow-auto pr-1">
                {trace.harness_events.length ? (
                  trace.harness_events.slice(-36).reverse().map((event, index) => {
                    const policy = asRecord(event.policy);
                    const allowed = policy.allowed === true;
                    return (
                      <div key={`${text(event.id)}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={eventVariant(event.type)}>{text(event.type).replaceAll("_", " ")}</Badge>
                            {text(event.status, "") ? <StatusBadge status={text(event.status)} /> : null}
                            {text(event.actor, "") ? <span className="text-xs font-medium text-zinc-500">{text(event.actor)}</span> : null}
                          </div>
                          {text(event.tool, "") ? <span className="text-xs font-medium text-zinc-500">{text(event.tool)}</span> : null}
                        </div>
                        <div className="mt-2 text-sm font-medium text-zinc-950">{text(event.label)}</div>
                        <div className="mt-1 break-words text-xs text-zinc-600">{text(event.summary)}</div>
                        {eventDetail(event) && eventDetail(event) !== text(event.summary) ? (
                          <div className="mt-2 break-words rounded-md bg-zinc-50 px-2.5 py-2 text-xs text-zinc-500">{eventDetail(event)}</div>
                        ) : null}
                        {typeof policy.reason === "string" ? (
                          <div className="mt-2 text-xs text-zinc-500">
                            Guardrail: {allowed ? "allowed" : "blocked"} - {policy.reason}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-zinc-500">No harness events recorded yet.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Final High-Signal Threads</CardTitle>
                <CardDescription>Selected conversations that should feed the next agent simulation step.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thread</TableHead>
                      <TableHead>Subreddit</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {threads.length ? (
                      threads.map((thread) => (
                        <TableRow key={thread.id}>
                          <TableCell>
                            <div className="max-w-2xl font-medium text-zinc-950">{thread.title}</div>
                            <div className="mt-1 max-w-2xl text-xs text-zinc-500">{thread.why_relevant}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {jsonStrings(thread.matched_services)
                                .slice(0, 3)
                                .map((service) => (
                                  <Badge key={service} variant="info">
                                    {service}
                                  </Badge>
                                ))}
                            </div>
                          </TableCell>
                          <TableCell>{thread.subreddit}</TableCell>
                          <TableCell>{thread.relevance_score}</TableCell>
                          <TableCell>{thread.commercial_intent_score}</TableCell>
                          <TableCell className="text-right">
                            <a href={thread.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-zinc-950 hover:underline">
                              Open
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyTableCell colSpan={5}>Run Reddit intelligence to select final threads.</EmptyTableCell>
                    )}
                  </TableBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Search Plan</CardTitle>
                  <CardDescription>The agent starts from explicit profile hints, then expands if signal is thin.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {trace.plan.length ? (
                  trace.plan.map((step, index) => (
                    <div key={`${text(step.step)}-${index}`} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-sm font-medium text-zinc-950">{index + 1}. {text(step.step)}</div>
                      <div className="mt-1 text-xs text-zinc-600">{text(step.goal)}</div>
                      <div className="mt-2 text-xs text-zinc-500">{text(step.rationale)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-500">No plan recorded yet.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Visible Decisions</CardTitle>
                  <CardDescription>Selection, rejection, and expansion decisions recorded during the run.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid max-h-[520px] gap-3 overflow-auto pr-1">
                  {trace.decisions.length ? (
                    trace.decisions.slice(-16).reverse().map((decision, index) => (
                      <div key={`${text(decision.id)}-${index}`} className="rounded-md border border-zinc-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant={text(decision.type) === "selected" ? "success" : text(decision.type) === "rejected" ? "danger" : "neutral"}>
                            {text(decision.type)}
                          </Badge>
                          <span className="text-xs text-zinc-500">{number(decision.confidence)}%</span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-zinc-950">{text(decision.subject)}</div>
                        <div className="mt-1 text-xs text-zinc-600">{text(decision.rationale)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-500">No decisions recorded yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Research Tool Calls</CardTitle>
                <CardDescription>Recent Reddit searches and fetches from the investigation trace.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Input</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Output</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trace.tool_calls.length ? (
                      trace.tool_calls.slice(-20).reverse().map((call, index) => {
                        const input = asRecord(call.input);
                        return (
                          <TableRow key={`${text(call.id)}-${index}`}>
                            <TableCell>{text(call.tool)}</TableCell>
                            <TableCell>
                              <div className="max-w-xl text-xs text-zinc-700">
                                {text(input.subreddit, "")} {text(input.query, text(input.title, text(input.reddit_id, "")))}
                              </div>
                              {text(input.reason, "") ? <div className="mt-1 max-w-xl text-xs text-zinc-500">{text(input.reason, "")}</div> : null}
                            </TableCell>
                            <TableCell>{text(call.actor)}</TableCell>
                            <TableCell>
                              <StatusBadge status={text(call.status)} />
                            </TableCell>
                            <TableCell className="max-w-md text-xs text-zinc-600">{text(call.output_summary)}</TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <EmptyTableCell colSpan={5}>No tool calls recorded yet.</EmptyTableCell>
                    )}
                  </TableBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Rejected Threads</CardTitle>
                <CardDescription>Evidence the agent looked at but did not choose for Module 2.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thread</TableHead>
                      <TableHead>Subreddit</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trace.rejected_threads.length ? (
                      trace.rejected_threads.slice(0, 20).map((thread, index) => (
                        <TableRow key={`${text(thread.reddit_id)}-${index}`}>
                          <TableCell className="font-medium text-zinc-950">{text(thread.title)}</TableCell>
                          <TableCell>{text(thread.subreddit)}</TableCell>
                          <TableCell className="max-w-xl text-xs text-zinc-600">{text(thread.reason)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyTableCell colSpan={3}>No rejected threads recorded yet.</EmptyTableCell>
                    )}
                  </TableBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Run History</CardTitle>
                <CardDescription>Recent Reddit intelligence attempts.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TableWrap>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.length ? (
                      runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>{profileName(run)}</TableCell>
                          <TableCell>{run.current_stage || "-"}</TableCell>
                          <TableCell>{formatDate(run.created_at)}</TableCell>
                          <TableCell>{formatDate(run.completed_at)}</TableCell>
                          <TableCell className="max-w-sm truncate text-xs text-red-600">{run.error || "-"}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyTableCell colSpan={6}>No runs yet.</EmptyTableCell>
                    )}
                  </TableBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
