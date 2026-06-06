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
  Loader2,
  Play,
  Search,
  Sparkles,
  Terminal,
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
              <div className="grid grid-cols-[0.9fr_1.1fr] gap-4 max-lg:grid-cols-1">
                <CaseFile selectedThread={selectedThread} fallbackThread={firstThread} />
                {demo ? <NowRunning action={demo.currentAction} /> : <EmptyPanel text="Start a Codex research run to populate the live trace." />}
              </div>

              {demo ? <MasterPlan plan={data?.trace.plan || []} /> : null}
              {demo ? <SubagentLanes lanes={demo.lanes} /> : null}
            </div>
          </section>

          {demo ? (
            <section className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              <Metric label="Events" value={demo.counts.events} />
              <Metric label="Subagents" value={demo.counts.subagents} />
              <Metric label="Trusted" value={demo.counts.trustedSources} />
              <Metric label="Ignored" value={demo.counts.ignoredSources} />
            </section>
          ) : null}

          {demo ? <SourceIntelligence demo={demo} /> : null}
          {latestRun ? <ContentBrief brief={contentBrief} /> : null}
          {latestRun?.proposed_skill_diff ? <SkillDiff diff={latestRun.proposed_skill_diff} /> : null}

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
