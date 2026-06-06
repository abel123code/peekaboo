"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  GitPullRequest,
  Link2,
  Loader2,
  Play,
  Search,
  Sparkles,
  Terminal,
  WandSparkles,
  XCircle
} from "lucide-react";
import type { CodexLatestPayload, CodexPhase, TraceRecord } from "../../lib/codex-demo";
import { asRecord, jsonStrings, number, text } from "../../lib/codex-demo";
import { PeekabooLogo } from "../components/PeekabooLogo";
import { SetupNotice } from "../components/SetupNotice";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/ui/badge";
import { Button, ButtonLink } from "../components/ui/button";

type CodexMissionControlProps = {
  initialData: CodexLatestPayload | null;
  setupError: string | null;
  runId: string | null;
};

export function CodexMissionControl({ initialData, setupError, runId }: CodexMissionControlProps) {
  const [data, setData] = useState(initialData);
  const [pollError, setPollError] = useState<string | null>(null);
  const isActive = Boolean(data?.demo.isActive);

  useEffect(() => {
    if (setupError || !isActive) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const suffix = runId ? `?runId=${encodeURIComponent(runId)}` : "";
        const response = await fetch(`/api/codex-research/latest${suffix}`, { cache: "no-store" });
        const payload = (await response.json()) as CodexLatestPayload | { error?: string };
        if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Failed to refresh Codex run.");
        if (!cancelled) {
          setData(payload as CodexLatestPayload);
          setPollError(null);
        }
      } catch (error) {
        if (!cancelled) setPollError(error instanceof Error ? error.message : String(error));
      }
    };

    const timer = window.setInterval(refresh, 1500);
    void refresh();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isActive, runId, setupError]);

  const latestRun = data?.latestRun || null;
  const demo = data?.demo || null;
  const selectedThread = asRecord(latestRun?.selected_reddit_thread);
  const contentBrief = asRecord(latestRun?.content_brief);
  const rawEvents = data?.trace.events.slice(-80).reverse() || [];
  const firstThread = data?.redditThreads[0] || null;
  const contentIdeas = buildContentIdeas(contentBrief, selectedThread);

  return (
    <div className="-mx-1 pb-8">
      <TopBar isActive={isActive} mode={latestRun?.execution_mode || "real_codex"} />

      {setupError ? (
        <SetupNotice error={setupError} />
      ) : (
        <div className="grid gap-5">
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/50 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200/80 px-5 py-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <span className={isActive ? "h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-300"} />
                  {isActive ? "live Codex run" : latestRun?.status || "ready"}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Codex mission control</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
                  {latestRun
                    ? `Watching ${latestRun.execution_mode === "real_codex" ? "real Codex" : "virtual fallback"} subagents research one Reddit pain point and convert visible behavior into an AEO brief.`
                    : "Pick a Module 1 Reddit thread and watch Master Codex spawn three research lanes, capture observable tool behavior, and propose content/skill updates."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {latestRun ? <StatusBadge status={latestRun.status} /> : null}
                {latestRun ? <Badge variant="info">{latestRun.execution_mode.replace("_", " ")}</Badge> : null}
                {firstThread && !isActive ? <StartCodexForm threadId={firstThread.id} label="Run Latest Thread" /> : null}
              </div>
            </div>

            <div className="grid gap-5 p-5">
              {demo ? <PhaseRail phases={demo.phases} /> : null}
              <CaseBanner selectedThread={selectedThread} fallbackThread={firstThread} />
              {demo ? <AgentTerminalBoard lanes={demo.lanes} action={demo.currentAction} /> : <EmptyPanel text="Start a Codex research run to populate the live trace." />}
              {demo ? <WriterSourceBoard sources={demo.sourceAccesses} isRunning={isActive} /> : null}
            </div>
          </section>

          <ContentIdeaChooser ideas={contentIdeas} isRunning={isActive} />

          {latestRun ? (
            <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-zinc-900">
                More details: evidence, generated brief, and skill learning
              </summary>
              <div className="grid gap-4 border-t border-zinc-100 p-5">
                {demo ? <SourceIntelligence demo={demo} /> : null}
                <ContentBrief brief={contentBrief} />
                {latestRun.proposed_skill_diff ? <SkillDiff diff={latestRun.proposed_skill_diff} /> : null}
              </div>
            </details>
          ) : null}

          {data?.redditThreads.length ? <ThreadChooser threads={data.redditThreads} isActive={isActive} /> : null}
          {data ? <RawTrace eventCount={data.trace.events.length} events={rawEvents} /> : null}

          {pollError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Live polling error: {pollError}</div> : null}
        </div>
      )}
    </div>
  );
}

function TopBar({ isActive, mode }: { isActive: boolean; mode: string }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur">
      <Link href="/clients" className="shrink-0">
        <PeekabooLogo size="xl" className="max-sm:h-14 max-sm:w-48" />
      </Link>
      <div className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 md:block">
        Master Codex trace engine
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 sm:flex">
          <span className={isActive ? "h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-300"} />
          {isActive ? "live" : mode.replace("_", " ")}
        </div>
        <ButtonLink href="/reddit" variant="secondary">
          <Search className="h-4 w-4" />
          Reddit
        </ButtonLink>
      </div>
    </header>
  );
}

function StartCodexForm({ threadId, label = "Run Codex" }: { threadId: string; label?: string }) {
  return (
    <form action="/api/codex-research" method="post">
      <input type="hidden" name="threadId" value={threadId} />
      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
        <Play className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}

function PhaseRail({ phases }: { phases: CodexPhase[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white px-4 py-5">
      <div className="min-w-[900px]">
        <div className="flex items-center">
          {phases.map((phase, index) => (
            <div key={phase.id} className="flex flex-1 items-center">
              <PhaseCircle phase={phase} />
              {index < phases.length - 1 ? <div className={phase.status === "completed" ? "h-px flex-1 bg-emerald-400" : "h-px flex-1 bg-zinc-200"} /> : null}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-6 gap-3">
          {phases.map((phase, index) => (
            <div key={`${phase.id}-label`} className={phase.status === "active" ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" : "px-3 py-2"}>
              <div className="text-xs font-medium text-zinc-500">{index + 1}.</div>
              <div className={phase.status === "active" ? "text-sm font-semibold text-amber-700" : phase.status === "completed" ? "text-sm font-semibold text-zinc-950" : "text-sm font-medium text-zinc-400"}>
                {phase.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhaseCircle({ phase }: { phase: CodexPhase }) {
  if (phase.status === "completed") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-5 w-5" />
      </span>
    );
  }
  if (phase.status === "failed") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-600">
        <XCircle className="h-5 w-5" />
      </span>
    );
  }
  if (phase.status === "active") {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 text-amber-600 shadow-sm shadow-amber-100 motion-safe:animate-pulse">
        <Clock3 className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400">
      <Circle className="h-5 w-5" />
    </span>
  );
}

function CaseBanner({ selectedThread, fallbackThread }: { selectedThread: TraceRecord; fallbackThread: CodexLatestPayload["redditThreads"][number] | null }) {
  const title = text(selectedThread.title, fallbackThread?.title || "No Reddit thread selected");
  const subreddit = text(selectedThread.subreddit, fallbackThread?.subreddit || "-");
  const url = text(selectedThread.url, fallbackThread?.url || "");
  const score = number(selectedThread.relevance_score, fallbackThread?.relevance_score || 0);

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Selected Reddit case</div>
        <div className="mt-1 truncate text-base font-semibold text-zinc-950">{title}</div>
        <div className="mt-1 text-xs font-medium text-zinc-500">r/{subreddit} - {score} relevance</div>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50">
          Reddit
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </section>
  );
}

function AgentTerminalBoard({
  lanes,
  action
}: {
  lanes: NonNullable<CodexLatestPayload["demo"]>["lanes"];
  action: NonNullable<CodexLatestPayload["demo"]>["currentAction"];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeader title="3 agents running" subtitle="Watch each Codex lane call tools and report visible decisions, one event at a time." icon={<Terminal className="h-4 w-4" />} />
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600">
          Current: {action.agentLabel} - {action.title}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 max-xl:grid-cols-1">
        {lanes.length ? (
          lanes.map((lane) => <AgentTerminalLane key={lane.id} lane={lane} />)
        ) : (
          <>
            <PendingLane label="Agent A" />
            <PendingLane label="Agent B" />
            <PendingLane label="Agent C" />
          </>
        )}
      </div>
    </section>
  );
}

function AgentTerminalLane({ lane }: { lane: NonNullable<CodexLatestPayload["demo"]>["lanes"][number] }) {
  const events = lane.events.slice(-8);
  const isRunning = lane.status === "running" || events.some((event) => text(event.status, "") === "running");

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
            <span className={isRunning ? "h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-500"} />
            {lane.label}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{lane.angle}</div>
        </div>
        <StatusBadge status={lane.status} />
      </div>
      <div className="min-h-[280px] max-h-[360px] overflow-auto p-3 font-mono text-xs leading-5">
        {events.length ? (
          events.map((event, index) => <TerminalEvent key={`${text(event.id, "event")}-${index}`} event={event} />)
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/70 p-3 text-zinc-400">
            waiting for Codex events...
          </div>
        )}
      </div>
    </div>
  );
}

function PendingLane({ label }: { label: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 text-zinc-100 shadow-sm">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</div>
        <div className="mt-1 text-sm font-semibold text-white">queued</div>
      </div>
      <div className="min-h-[280px] p-3 font-mono text-xs leading-5 text-zinc-400">waiting for Master Codex...</div>
    </div>
  );
}

function TerminalEvent({ event }: { event: TraceRecord }) {
  const type = text(event.type, "event");
  const input = asRecord(event.input);
  const output = asRecord(event.output);
  const sourceUrl = text(input.url || output.url, "");
  const command = text(input.command || input.query || input.tool || sourceUrl, "");
  const prefix =
    type === "source_access"
      ? "access article"
      : type === "web_search"
      ? "search"
      : type === "command_execution"
      ? "cmd"
      : type === "tool_call"
      ? "tool"
      : type === "agent_message"
      ? "note"
      : type === "fallback"
      ? "fallback"
      : "event";

  return (
    <div className="mb-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
        <span>{prefix}</span>
        <span>{text(event.status, "completed")}</span>
      </div>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-emerald-300 hover:text-emerald-200 hover:underline">
          access_article: {sourceUrl}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : command ? (
        <div className="mt-1 break-words text-emerald-300">{command}</div>
      ) : null}
      <div className="mt-1 break-words text-zinc-200">{text(event.summary, text(event.label, ""))}</div>
    </div>
  );
}

function WriterSourceBoard({ sources, isRunning }: { sources: TraceRecord[]; isRunning: boolean }) {
  const visibleSources = sources.slice(0, 8);
  const copyReady = visibleSources
    .map((source, index) => {
      const url = text(source.url, "");
      const title = text(source.title, hostFromUrl(url));
      const agent = text(source.agent_label, "Codex");
      return `${index + 1}. ${title}\n${url}\nUsed by: ${agent}\nWhy: ${text(source.reason, "Source accessed during research.")}`;
    })
    .join("\n\n");

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeader title="Sources captured for writer" subtitle="Every URL the trace saw as an accessed or trusted source." icon={<Link2 className="h-4 w-4" />} />
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600">
          {sources.length} source{sources.length === 1 ? "" : "s"} tracked
        </div>
      </div>

      {visibleSources.length ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            {visibleSources.map((source, index) => {
              const url = text(source.url, "");
              return (
                <div key={`${url}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
                    <span>{text(source.agent_label, "Codex")}</span>
                    <span>{hostFromUrl(url)}</span>
                  </div>
                  <div className="mt-2 font-medium text-zinc-950">{text(source.title, hostFromUrl(url))}</div>
                  <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-emerald-700 hover:underline">
                    {url}
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  </a>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{text(source.reason, "Source accessed during research.")}</p>
                </div>
              );
            })}
          </div>
          <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Copy-ready source list
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-zinc-200 p-3 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-700">{copyReady}</pre>
          </details>
        </>
      ) : (
        <div className="mt-4">
          <EmptyPanel text={isRunning ? "Article URLs will appear here as Codex searches or opens sources." : "No article URLs were captured for this run yet."} />
        </div>
      )}
    </section>
  );
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "source";
  }
}

function CaseFile({ selectedThread, fallbackThread }: { selectedThread: TraceRecord; fallbackThread: CodexLatestPayload["redditThreads"][number] | null }) {
  const title = text(selectedThread.title, fallbackThread?.title || "No Reddit thread selected");
  const subreddit = text(selectedThread.subreddit, fallbackThread?.subreddit || "-");
  const url = text(selectedThread.url, fallbackThread?.url || "");
  const why = text(selectedThread.why_relevant, fallbackThread?.why_relevant || "Run Module 1 first, then select a thread for Codex research.");
  const score = number(selectedThread.relevance_score, fallbackThread?.relevance_score || 0);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <PanelHeader title="Case file" subtitle="One Reddit pain point becomes the research mission." icon={<FileText className="h-4 w-4" />} />
      <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
          <span>r/{subreddit}</span>
          <span className="rounded-md border border-zinc-200 bg-white px-2 py-0.5">{score} relevance</span>
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-7 text-zinc-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{why}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:underline">
            Open Reddit thread
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </section>
  );
}

function NowRunning({ action }: { action: NonNullable<CodexLatestPayload["demo"]>["currentAction"] }) {
  return (
    <section className={action.failed ? "harness-enter rounded-xl border border-red-200 bg-red-50 p-4" : "harness-enter rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Now running - {action.phaseLabel}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={action.failed ? "danger" : "info"}>{action.agentLabel}</Badge>
          <StatusBadge status={action.status} />
          <span className="text-xs font-medium text-zinc-500">{action.actor}</span>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-6 text-zinc-900">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{action.title}</div>
        <pre className="whitespace-pre-wrap break-words">{action.code}</pre>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{action.summary}</p>
    </section>
  );
}

type ContentIdea = {
  id: string;
  title: string;
  angle: string;
  targetQuery: string;
  rationale: string;
  sourceSignals: string[];
};

function buildContentIdeas(brief: TraceRecord, _selectedThread: TraceRecord): ContentIdea[] {
  const rawIdeas = Array.isArray(brief.content_ideas) ? brief.content_ideas : [];
  return rawIdeas
    .map((idea, index) => {
      const record = asRecord(idea);
      return {
        id: `idea-${index + 1}`,
        title: text(record.title, ""),
        angle: text(record.angle, ""),
        targetQuery: text(record.target_query, ""),
        rationale: text(record.rationale, ""),
        sourceSignals: jsonStrings(record.source_signals)
      };
    })
    .filter((idea) => idea.title && idea.angle && idea.rationale)
    .slice(0, 3);
}

function latestVisibleThinking(events: TraceRecord[]) {
  return events
    .filter((event) => {
      const type = text(event.type, "");
      return ["plan", "agent_message", "decision", "fallback"].includes(type);
    })
    .slice(0, 5);
}

function latestToolCalls(events: TraceRecord[]) {
  return events
    .filter((event) => {
      const type = text(event.type, "");
      return ["web_search", "command_execution", "tool_call", "mcp_tool_call"].includes(type);
    })
    .slice(0, 6);
}

function VisibleThinkingPanel({
  action,
  events
}: {
  action: NonNullable<CodexLatestPayload["demo"]>["currentAction"] | null;
  events: TraceRecord[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <PanelHeader title="Visible agent thinking" subtitle="Decision summaries and rationale, not hidden chain-of-thought." icon={<BrainCircuit className="h-4 w-4" />} />
      {action ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            <span>{action.agentLabel}</span>
            <StatusBadge status={action.status} />
          </div>
          <div className="mt-2 font-semibold text-zinc-950">{action.title}</div>
          <p className="mt-1 text-sm leading-6 text-zinc-700">{action.summary}</p>
        </div>
      ) : (
        <EmptyPanel text="The agent's visible decisions will appear here." />
      )}
      <div className="mt-3 grid gap-2">
        {events.length ? (
          events.map((event, index) => (
            <div key={`${text(event.id, "thought")}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <div className="text-xs font-medium text-zinc-500">{text(event.agent_label, "Master Codex")} - {text(event.label, "Decision")}</div>
              <div className="mt-1 text-sm leading-6 text-zinc-700">{text(event.summary, "")}</div>
            </div>
          ))
        ) : (
          <EmptyPanel text="No decision summaries yet." />
        )}
      </div>
    </section>
  );
}

function ToolCallsPanel({ events }: { events: TraceRecord[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <PanelHeader title="Tools called" subtitle="Observable searches, commands, and tool calls captured from the run." icon={<Terminal className="h-4 w-4" />} />
      <div className="mt-4 grid gap-2">
        {events.length ? (
          events.map((event, index) => {
            const input = asRecord(event.input);
            const label = text(event.type, "tool").replaceAll("_", " ");
            const queryOrCommand = text(input.query || input.command || input.tool, "");
            return (
              <div key={`${text(event.id, "tool")}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</div>
                  <StatusBadge status={text(event.status, "completed")} />
                </div>
                <div className="mt-2 font-mono text-sm text-zinc-900">{queryOrCommand || text(event.label, "tool_call()")}</div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{text(event.summary, "")}</p>
              </div>
            );
          })
        ) : (
          <EmptyPanel text="Tool calls will appear here as Codex researches." />
        )}
      </div>
    </section>
  );
}

function ContentIdeaChooser({ ideas, isRunning }: { ideas: ContentIdea[]; isRunning: boolean }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = ideas.find((idea) => idea.id === selectedId) || ideas[0] || null;

  useEffect(() => {
    if (!selectedId && ideas[0]) setSelectedId(ideas[0].id);
  }, [ideas, selectedId]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <PanelHeader title="Final decisions" subtitle="Choose one of three content ideas generated from the real run output." icon={<WandSparkles className="h-4 w-4" />} />
      {ideas.length ? (
        <div className="mt-4 grid grid-cols-3 gap-3 max-lg:grid-cols-1">
          {ideas.map((idea, index) => {
            const active = selected?.id === idea.id;
            return (
              <button
                key={idea.id}
                type="button"
                onClick={() => setSelectedId(idea.id)}
                className={
                  active
                    ? "rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-left shadow-sm"
                    : "rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left transition-colors hover:border-zinc-300 hover:bg-white"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600">Idea {index + 1}</span>
                  {active ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-zinc-400" />}
                </div>
                <h2 className="mt-3 text-base font-semibold leading-6 text-zinc-950">{idea.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{idea.angle}</p>
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                  Target query: {idea.targetQuery || "Captured from run"}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyPanel text={isRunning ? "The three final content ideas will appear when trace analysis finishes." : "Run Codex on a selected Reddit thread to generate three content ideas."} />
        </div>
      )}

      {selected ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Why this idea</div>
          <p className="mt-2 text-sm leading-6 text-zinc-700">{selected.rationale}</p>
          {selected.sourceSignals.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.sourceSignals.slice(0, 5).map((signal) => (
                <span key={signal} className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-zinc-700">{signal}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DemoStory({ demo }: { demo: NonNullable<CodexLatestPayload["demo"]> }) {
  const steps = [
    {
      title: "Read the Reddit case",
      detail: "Lock onto one real pain point instead of generic SEO keywords.",
      status: "done",
      icon: <FileText className="h-4 w-4" />
    },
    {
      title: "Run 3 Codex angles",
      detail: "Urgency, responsibility, and DIY/vendor comparison run as separate lanes.",
      status: demo.lanes.some((lane) => lane.eventCount > 0) ? "done" : "active",
      icon: <BrainCircuit className="h-4 w-4" />
    },
    {
      title: "Watch what agents use",
      detail: "Keep trusted sources, ignored patterns, and repeated queries.",
      status: demo.counts.trustedSources || demo.repeatedQueries.length ? "done" : demo.isActive ? "active" : "waiting",
      icon: <Search className="h-4 w-4" />
    },
    {
      title: "Turn it into choices",
      detail: "End with three content ideas a human can choose from.",
      status: demo.currentPhaseIndex >= 4 ? "done" : demo.isActive ? "active" : "waiting",
      icon: <WandSparkles className="h-4 w-4" />
    }
  ];

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <PanelHeader title="What Peekaboo is doing" subtitle="A simple story for the demo, with the trace still captured behind it." icon={<Sparkles className="h-4 w-4" />} />
      <div className="mt-4 grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className={
              step.status === "active"
                ? "rounded-xl border border-amber-200 bg-amber-50 p-4"
                : step.status === "done"
                ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                : "rounded-xl border border-zinc-200 bg-zinc-50 p-4"
            }
          >
            <div className="flex items-center justify-between gap-3">
              <span className={step.status === "active" ? "text-amber-600" : step.status === "done" ? "text-emerald-600" : "text-zinc-400"}>{step.icon}</span>
              <span className="text-xs font-medium text-zinc-500">{index + 1}</span>
            </div>
            <div className="mt-3 font-semibold text-zinc-950">{step.title}</div>
            <p className="mt-1 text-sm leading-6 text-zinc-600">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MasterPlan({ plan }: { plan: TraceRecord[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <PanelHeader title="Master Codex plan" subtitle="Three clean research angles, one Reddit problem." icon={<BrainCircuit className="h-4 w-4" />} />
      <div className="mt-4 grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        {plan.length ? (
          plan.map((item) => (
            <div key={text(item.id)} className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{text(item.label)}</div>
              <div className="mt-2 font-semibold text-zinc-950">{text(item.angle)}</div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{text(item.objective)}</p>
            </div>
          ))
        ) : (
          <EmptyPanel text="Master Codex will create three angles when the run starts." />
        )}
      </div>
    </section>
  );
}

function SubagentLanes({ lanes }: { lanes: NonNullable<CodexLatestPayload["demo"]>["lanes"] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <PanelHeader title="Subagent lanes" subtitle="Each lane is one Codex run or fallback worker." icon={<Terminal className="h-4 w-4" />} />
      <div className="mt-4 grid grid-cols-3 gap-3 max-xl:grid-cols-1">
        {lanes.length ? (
          lanes.map((lane) => (
            <div key={lane.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{lane.label}</div>
                  <div className="mt-1 font-semibold text-zinc-950">{lane.angle}</div>
                </div>
                <StatusBadge status={lane.status} />
              </div>
              <div className="mt-4 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
                {lane.latestEvent ? text(lane.latestEvent.summary, "Waiting for event.") : "Queued for research."}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span>{lane.eventCount} events</span>
                <span>{lane.trustedSources.length} trusted</span>
                <span>{lane.ignoredSources.length} ignored</span>
              </div>
            </div>
          ))
        ) : (
          <EmptyPanel text="Subagent lanes will appear after Master Codex plans the run." />
        )}
      </div>
    </section>
  );
}

function SourceIntelligence({ demo }: { demo: NonNullable<CodexLatestPayload["demo"]> }) {
  return (
    <section className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <PanelHeader title="Sources agents trusted" subtitle="Signals future content should satisfy." icon={<CheckCircle2 className="h-4 w-4" />} />
        <SourceList sources={demo.trustedSources} empty="Trusted source patterns will appear after subagents finish." />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <PanelHeader title="Sources agents ignored" subtitle="Weak patterns Peekaboo should avoid." icon={<XCircle className="h-4 w-4" />} />
        <SourceList sources={demo.ignoredSources} empty="Ignored source patterns will appear after subagents finish." />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <PanelHeader title="Repeated search phrases" subtitle="Queries that reveal agent intent." icon={<Search className="h-4 w-4" />} />
        <PillList items={demo.repeatedQueries} empty="Search patterns will appear here." />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <PanelHeader title="Content gaps" subtitle="What the current web failed to answer cleanly." icon={<Sparkles className="h-4 w-4" />} />
        <PillList items={demo.missingContentOpportunities} empty="Content gaps will appear here." />
      </div>
    </section>
  );
}

function SourceList({ sources, empty }: { sources: TraceRecord[]; empty: string }) {
  return (
    <div className="mt-4 grid gap-2">
      {sources.length ? (
        sources.slice(0, 8).map((source, index) => (
          <div key={`${text(source.title)}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
            <div className="font-medium text-zinc-950">{text(source.title)}</div>
            <div className="mt-1 text-xs leading-5 text-zinc-500">{text(source.reason)}</div>
            {text(source.url, "") ? (
              <a href={text(source.url, "")} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-900 hover:underline">
                Open source
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        ))
      ) : (
        <EmptyPanel text={empty} />
      )}
    </div>
  );
}

function PillList({ items, empty }: { items: string[]; empty: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.length ? items.slice(0, 12).map((item) => <span key={item} className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-700">{item}</span>) : <EmptyPanel text={empty} />}
    </div>
  );
}

function ContentBrief({ brief }: { brief: TraceRecord }) {
  const sections = jsonStrings(brief.sections);
  const questions = jsonStrings(brief.questions_to_answer);
  const rules = jsonStrings(brief.content_rules);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <PanelHeader title="Content brief" subtitle="The AEO-ready page strategy produced from Codex behavior." icon={<FileText className="h-4 w-4" />} />
      <div className="mt-4 grid grid-cols-[1fr_1fr] gap-5 max-lg:grid-cols-1">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">{text(brief.title, "Brief will appear after trace analysis.")}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{text(brief.promise, "Peekaboo will summarize the promise once the run completes.")}</p>
          <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">{text(brief.audience, "Audience pending.")}</div>
        </div>
        <div className="grid gap-3">
          <MiniList title="Sections" items={sections} />
          <MiniList title="Questions" items={questions} />
          <MiniList title="Rules" items={rules} />
        </div>
      </div>
    </section>
  );
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</div>
      <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-zinc-600">
        {items.length ? items.slice(0, 5).map((item) => <li key={item}>- {item}</li>) : <li>- Pending</li>}
      </ul>
    </div>
  );
}

function SkillDiff({ diff }: { diff: string }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <PanelHeader title="Skill update proposal" subtitle="Peekaboo gets better by proposing durable learning, not silently changing global Codex config." icon={<GitPullRequest className="h-4 w-4" />} />
      <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-sm leading-6 text-zinc-100">{diff}</pre>
    </section>
  );
}

function ThreadChooser({ threads, isActive }: { threads: CodexLatestPayload["redditThreads"]; isActive: boolean }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <PanelHeader title="Start from Module 1 threads" subtitle="Pick another selected Reddit conversation for Codex research." icon={<Play className="h-4 w-4" />} />
      <div className="mt-4 grid gap-2">
        {threads.map((thread) => (
          <div key={thread.id} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 max-sm:grid-cols-1">
            <div>
              <div className="text-xs font-medium text-zinc-500">r/{thread.subreddit} - {thread.relevance_score} relevance - {thread.comment_count} comments</div>
              <div className="mt-1 font-medium text-zinc-950">{thread.title}</div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{thread.why_relevant}</p>
            </div>
            <div className="flex items-center gap-2">
              <a href={thread.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
                Reddit
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              <form action="/api/codex-research" method="post">
                <input type="hidden" name="threadId" value={thread.id} />
                <Button type="submit" disabled={isActive} variant="secondary">
                  {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run
                </Button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RawTrace({ eventCount, events }: { eventCount: number; events: TraceRecord[] }) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 text-center font-mono text-sm font-medium uppercase tracking-[0.18em] text-zinc-600">
        Raw normalized trace ({eventCount} events)
      </summary>
      <div className="grid max-h-[520px] gap-2 overflow-auto border-t border-zinc-100 p-4">
        {events.length ? (
          events.map((event, index) => (
            <div key={`${text(event.id, "raw")}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 font-mono text-xs text-zinc-700">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-950">{text(event.type)}</span>
                <span>{text(event.status, "")}</span>
                <span>{text(event.agent_label, "")}</span>
              </div>
              <div>{text(event.label, "")}</div>
              <div className="mt-1 text-zinc-500">{text(event.summary, "")}</div>
            </div>
          ))
        ) : (
          <EmptyPanel text="No trace events yet." />
        )}
      </div>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-950">{value}</div>
    </div>
  );
}

function PanelHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon ? <div className="mt-0.5 text-emerald-600">{icon}</div> : null}
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</div>
        <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyPanel({ text: emptyText }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">{emptyText}</div>;
}
