"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock3,
  Loader2,
  Play,
  Search,
  Settings,
  ShieldCheck,
  XCircle
} from "lucide-react";
import type { DemoPhase, RedditLatestPayload, TraceRecord } from "../../lib/reddit-demo";
import { asRecord, jsonStrings, profileName, text } from "../../lib/reddit-demo";
import { PeekabooLogo } from "../components/PeekabooLogo";
import { SetupNotice } from "../components/SetupNotice";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/ui/badge";
import { Button, ButtonLink } from "../components/ui/button";

type RedditHarnessDemoProps = {
  initialData: RedditLatestPayload | null;
  setupError: string | null;
};

export function RedditHarnessDemo({ initialData, setupError }: RedditHarnessDemoProps) {
  const [data, setData] = useState(initialData);
  const [pollError, setPollError] = useState<string | null>(null);
  const isActive = Boolean(data?.demo.isActive);

  useEffect(() => {
    if (setupError || !isActive) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/reddit-intelligence/latest", { cache: "no-store" });
        const payload = (await response.json()) as RedditLatestPayload | { error?: string };
        if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Failed to refresh Reddit run.");
        if (!cancelled) {
          setData(payload as RedditLatestPayload);
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
  }, [isActive, setupError]);

  const demo = data?.demo;
  const latestRun = data?.latestRun || null;
  const summary = asRecord(latestRun?.summary);
  const selectedPreview = demo?.selected.slice(0, 5) || [];
  const rejectedPreview = demo?.rejected.slice(0, 5) || [];
  const recentRawEvents = data?.trace.harness_events.slice(-40).reverse() || [];

  return (
    <div className="-mx-1 pb-8">
      <TopBar isActive={isActive} />

      {setupError ? (
        <SetupNotice error={setupError} />
      ) : (
        <div className="grid gap-5">
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/40 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200/80 px-5 py-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <span className={isActive ? "h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-300"} />
                  {isActive ? "live run" : latestRun?.status || "ready"}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Reddit investigation harness</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
                  {latestRun
                    ? `${profileName(latestRun)} - ${text(summary.summary, "Visible agent decisions, tool calls, and Reddit evidence are shown as the run progresses.")}`
                    : "Press Run Investigation to watch the harness plan, search, fetch evidence, judge candidates, and select final Reddit threads."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {latestRun ? <StatusBadge status={latestRun.status} /> : null}
                <form action="/api/reddit-intelligence" method="post">
                  <Button type="submit" disabled={isActive} className="bg-emerald-600 hover:bg-emerald-700">
                    {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Run Investigation
                  </Button>
                </form>
              </div>
            </div>

            {demo ? (
              <div className="grid gap-5 p-5">
                <PhaseRail phases={demo.phases} />
                <NowRunningPanel action={demo.currentAction} phaseNumber={demo.currentPhaseIndex + 1} />

                <div className="grid grid-cols-[1fr_1fr] gap-4 max-lg:grid-cols-1">
                  <SearchMapPanel searches={demo.searchMap.slice(-10).reverse()} />
                  <EvidenceQueuePanel evidence={demo.evidenceQueue.slice(-8).reverse()} />
                </div>

                <DecisionBoard selected={selectedPreview} rejected={rejectedPreview} />
              </div>
            ) : (
              <div className="p-5 text-sm text-zinc-600">No Reddit investigation has been run yet.</div>
            )}
          </section>

          {demo ? (
            <section className="grid grid-cols-5 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              <Metric label="Searches" value={demo.counts.searches} />
              <Metric label="Fetched" value={demo.counts.fetched} />
              <Metric label="Candidates" value={demo.counts.candidates} />
              <Metric label="Selected" value={demo.counts.selected} />
              <Metric label="Rejected" value={demo.counts.rejected} />
            </section>
          ) : null}

          {data?.threads.length ? <FinalThreads threads={data.threads} /> : null}

          {data ? <RawTraceDrawer eventCount={demo?.counts.events || 0} events={recentRawEvents} /> : null}

          {pollError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Live polling error: {pollError}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TopBar({ isActive }: { isActive: boolean }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur">
      <Link href="/clients" className="shrink-0">
        <PeekabooLogo size="lg" />
      </Link>
      <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-500 md:flex">
        <span>Run</span>
        <span className="border-b-2 border-emerald-500 pb-1 text-zinc-950">Reddit</span>
        <span>Codex</span>
        <span>Verify</span>
      </nav>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 sm:flex">
          <span className={isActive ? "h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-300"} />
          {isActive ? "live" : "idle"}
        </div>
        <ButtonLink href="/settings" variant="secondary" size="icon" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </ButtonLink>
      </div>
    </header>
  );
}

function PhaseRail({ phases }: { phases: DemoPhase[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white px-4 py-5">
      <div className="min-w-[900px]">
        <div className="flex items-center">
          {phases.map((phase, index) => (
            <div key={phase.id} className="flex flex-1 items-center">
              <PhaseCircle phase={phase} />
              {index < phases.length - 1 ? (
                <div className={phase.status === "completed" ? "h-px flex-1 bg-emerald-400" : "h-px flex-1 bg-zinc-200"} />
              ) : null}
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

function PhaseCircle({ phase }: { phase: DemoPhase }) {
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

function NowRunningPanel({ action, phaseNumber }: { action: NonNullable<RedditLatestPayload["demo"]>["currentAction"]; phaseNumber: number }) {
  return (
    <section
      key={action.eventId}
      className={
        action.failed
          ? "harness-enter rounded-xl border border-red-200 bg-red-50 p-4"
          : "harness-enter rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
          Now running - phase {phaseNumber}: {action.phaseLabel}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={action.failed ? "danger" : "info"}>{action.tool}</Badge>
          <StatusBadge status={action.status} />
          <span className="text-xs font-medium text-zinc-500">{action.actor}</span>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-6 text-zinc-900">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{action.title}</div>
        <pre className="whitespace-pre-wrap break-words">{action.code}</pre>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-zinc-600 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            policy check
          </div>
          <p>{action.policy}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <Search className="h-3.5 w-3.5" />
            observation
          </div>
          <p>{action.observation || action.summary}</p>
        </div>
      </div>
    </section>
  );
}

function SearchMapPanel({ searches }: { searches: NonNullable<RedditLatestPayload["demo"]>["searchMap"] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <PanelHeader title="Search map" subtitle="Where the harness looked first." />
      <div className="mt-3 grid gap-2">
        {searches.length ? (
          searches.map((search) => (
            <div key={search.id} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm max-sm:grid-cols-1">
              <span className="font-medium text-zinc-950">{search.subreddit}</span>
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-zinc-700">"{search.query}"</div>
                {search.reason ? <div className="mt-0.5 truncate text-xs text-zinc-500">{search.reason}</div> : null}
              </div>
              <span className="justify-self-end rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 max-sm:justify-self-start">
                {search.resultCount ?? 0} results
              </span>
            </div>
          ))
        ) : (
          <EmptyPanel text="Searches will appear here as Reddit tools run." />
        )}
      </div>
    </section>
  );
}

function EvidenceQueuePanel({ evidence }: { evidence: NonNullable<RedditLatestPayload["demo"]>["evidenceQueue"] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <PanelHeader title="Evidence queue" subtitle="Threads fetched for comment-level inspection." />
      <div className="mt-3 grid gap-2">
        {evidence.length ? (
          evidence.map((item) => (
            <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm max-sm:grid-cols-[auto_1fr]">
              <StatusIcon status={item.status} />
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-950">{item.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{item.reason || item.outputSummary}</div>
              </div>
              <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 max-sm:col-span-2 max-sm:w-fit">
                {item.commentCount ?? 0} comments
              </span>
            </div>
          ))
        ) : (
          <EmptyPanel text="Fetched Reddit threads will queue up here." />
        )}
      </div>
    </section>
  );
}

function DecisionBoard({
  selected,
  rejected
}: {
  selected: NonNullable<RedditLatestPayload["demo"]>["selected"];
  rejected: NonNullable<RedditLatestPayload["demo"]>["rejected"];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <PanelHeader title="Decision board" subtitle="Visible final decisions and rationales." />
      <div className="mt-4 grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <div>
          <div className="mb-3 inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Selected ({selected.length})
          </div>
          <div className="grid gap-2">
            {selected.length ? (
              selected.map((item) => <DecisionRow key={item.id} item={item} type="selected" />)
            ) : (
              <EmptyPanel text="Selected threads will appear after final judging." />
            )}
          </div>
        </div>
        <div>
          <div className="mb-3 inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Rejected ({rejected.length})
          </div>
          <div className="grid gap-2">
            {rejected.length ? (
              rejected.map((item) => <DecisionRow key={item.id} item={item} type="rejected" />)
            ) : (
              <EmptyPanel text="Rejected threads will appear after evidence review." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DecisionRow({ item, type }: { item: NonNullable<RedditLatestPayload["demo"]>["selected"][number]; type: "selected" | "rejected" }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
      <span
        className={
          type === "selected"
            ? "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600"
            : "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400"
        }
      >
        {type === "selected" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <div className="font-medium text-zinc-950">{item.title}</div>
        <div className="mt-1 text-xs leading-5 text-zinc-500">rationale: {item.reason}</div>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-900 hover:underline">
            Open thread
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function FinalThreads({ threads }: { threads: RedditLatestPayload["threads"] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <PanelHeader title="Final high-signal threads" subtitle="The evidence set Module 2 can consume." />
      <div className="mt-4 grid gap-3">
        {threads.slice(0, 8).map((thread) => (
          <a
            key={thread.id}
            href={thread.url}
            target="_blank"
            rel="noreferrer"
            className="group grid grid-cols-[1fr_auto] gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition-colors hover:border-zinc-300 hover:bg-white max-sm:grid-cols-1"
          >
            <div>
              <div className="font-medium text-zinc-950">{thread.title}</div>
              <div className="mt-1 text-sm leading-6 text-zinc-600">{thread.why_relevant}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {jsonStrings(thread.matched_services)
                  .slice(0, 3)
                  .map((service) => (
                    <Badge key={service} variant="info">
                      {service}
                    </Badge>
                  ))}
              </div>
            </div>
            <div className="flex items-start gap-2 text-right max-sm:text-left">
              <div>
                <div className="text-xs font-medium uppercase text-zinc-500">{thread.subreddit}</div>
                <div className="mt-1 text-2xl font-semibold text-zinc-950">{thread.relevance_score}</div>
                <div className="text-xs text-zinc-500">relevance</div>
              </div>
              <ArrowUpRight className="mt-1 h-4 w-4 text-zinc-400 transition-colors group-hover:text-zinc-900" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function RawTraceDrawer({ eventCount, events }: { eventCount: number; events: TraceRecord[] }) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 text-center font-mono text-sm font-medium uppercase tracking-[0.18em] text-zinc-600">
        Raw trace ({eventCount} events)
      </summary>
      <div className="grid max-h-[520px] gap-2 overflow-auto border-t border-zinc-100 p-4">
        {events.length ? (
          events.map((event, index) => (
            <div key={`${text(event.id, "raw")}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 font-mono text-xs text-zinc-700">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-950">{text(event.type)}</span>
                <span>{text(event.status, "")}</span>
                <span>{text(event.tool, "")}</span>
              </div>
              <div>{text(event.label, "")}</div>
              <div className="mt-1 text-zinc-500">{text(event.summary, "")}</div>
            </div>
          ))
        ) : (
          <EmptyPanel text="No raw events yet." />
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

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</div>
      <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
    </div>
  );
}

function EmptyPanel({ text: emptyText }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">{emptyText}</div>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") {
    return <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />;
  }
  if (status === "failed") {
    return <XCircle className="mt-0.5 h-5 w-5 text-red-600" />;
  }
  return <Loader2 className="mt-0.5 h-5 w-5 text-amber-500 motion-safe:animate-spin" />;
}
