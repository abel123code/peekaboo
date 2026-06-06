"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Circle, Clock3, FileText, Loader2, Rows3, XCircle } from "lucide-react";
import type { AeoAssetPayload } from "../../lib/aeo-asset-data";
import type { AeoAssetRunSummary, TraceRecord } from "../../lib/codex-demo";
import { asRecord, number, text } from "../../lib/codex-demo";
import { PeekabooLogo } from "../components/PeekabooLogo";
import { SetupNotice } from "../components/SetupNotice";
import { StatusBadge } from "../components/StatusBadge";
import { ButtonLink } from "../components/ui/button";

type AeoAssetWriterPageProps = {
  initialPayload: AeoAssetPayload | null;
  setupError: string | null;
  assetRunId: string;
};

export function AeoAssetWriterPage({ initialPayload, setupError, assetRunId }: AeoAssetWriterPageProps) {
  const [payload, setPayload] = useState(initialPayload);
  const [pollError, setPollError] = useState<string | null>(null);
  const assetRun = payload?.assetRun || null;
  const codexRun = payload?.codexRun || null;
  const isRunning = assetRun?.status === "queued" || assetRun?.status === "running";

  useEffect(() => {
    if (setupError || !isRunning) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/aeo-asset/latest?assetRunId=${encodeURIComponent(assetRunId)}`, { cache: "no-store" });
        const nextPayload = (await response.json()) as AeoAssetPayload | { error?: string };
        if (!response.ok) throw new Error("error" in nextPayload && nextPayload.error ? nextPayload.error : "Failed to refresh writer run.");
        if (!cancelled) {
          setPayload(nextPayload as AeoAssetPayload);
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
  }, [assetRunId, isRunning, setupError]);

  const selectedIdea = asRecord(assetRun?.selected_idea);
  const selectedThread = asRecord(codexRun?.selected_reddit_thread);
  const sourcePack = Array.isArray(assetRun?.source_pack) ? assetRun.source_pack.map(asRecord) : [];

  return (
    <div className="-mx-1 pb-8">
      <WriterTopBar codexRunId={codexRun?.id || assetRun?.codex_run_id || ""} isRunning={isRunning} />

      {setupError ? (
        <SetupNotice error={setupError} />
      ) : assetRun ? (
        <div className="grid gap-5">
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/50 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200/80 px-5 py-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <span className={isRunning ? "h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-300"} />
                  {isRunning ? "live writer run" : "writer ready"}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">AEO article writer</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
                  A focused preview room for the selected content idea, writing pipeline, and generated agent-readable asset bundle.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={assetRun.status} />
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : null}
              </div>
            </div>

            <div className="grid gap-5 p-5">
              <WriterCaseFile selectedIdea={selectedIdea} selectedThread={selectedThread} sourceCount={sourcePack.length} />
              <AeoAssetWriterView assetRun={assetRun} isRunning={isRunning} />
            </div>
          </section>

          <SourcePackDrawer sources={sourcePack} />
          {pollError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Live polling error: {pollError}</div> : null}
        </div>
      ) : (
        <SetupNotice error="AEO asset run not found." />
      )}
    </div>
  );
}

function WriterTopBar({ codexRunId, isRunning }: { codexRunId: string; isRunning: boolean }) {
  const codexHref = codexRunId ? `/codex?runId=${encodeURIComponent(codexRunId)}` : "/codex";
  return (
    <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur">
      <Link href="/clients" className="shrink-0">
        <PeekabooLogo size="md" className="max-sm:h-14 max-sm:w-48" />
      </Link>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 sm:flex">
          <span className={isRunning ? "h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" : "h-2 w-2 rounded-full bg-zinc-300"} />
          {isRunning ? "writing" : "preview"}
        </div>
        <ButtonLink href={codexHref} variant="secondary">
          <ArrowLeft className="h-4 w-4" />
          Codex
        </ButtonLink>
      </div>
    </header>
  );
}

function WriterCaseFile({
  selectedIdea,
  selectedThread,
  sourceCount
}: {
  selectedIdea: TraceRecord;
  selectedThread: TraceRecord;
  sourceCount: number;
}) {
  const threadUrl = text(selectedThread.url, "");
  return (
    <section className="grid grid-cols-[1.4fr_1fr] gap-4 max-lg:grid-cols-1">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <PanelHeader title="Selected idea" subtitle="The human choice that starts the final writing pass." icon={<FileText className="h-4 w-4" />} />
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-zinc-950">{text(selectedIdea.title, "Selected content idea")}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{text(selectedIdea.angle, "Angle pending.")}</p>
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Target query: {text(selectedIdea.target_query || selectedIdea.targetQuery, "Captured from the Codex run")}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <PanelHeader title="Source basis" subtitle="The article is built from the chosen Reddit case and tracked sources." icon={<Rows3 className="h-4 w-4" />} />
        <div className="mt-4 grid gap-3 text-sm">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Reddit case</div>
            <div className="mt-1 font-medium text-zinc-950">{text(selectedThread.title, "Thread snapshot unavailable")}</div>
            {threadUrl ? (
              <a href={threadUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs font-medium text-emerald-700 hover:underline">
                Open Reddit case
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-600">
            {sourceCount} tracked source{sourceCount === 1 ? "" : "s"} available for the article writer.
          </div>
        </div>
      </div>
    </section>
  );
}

export function AeoAssetWriterView({ assetRun, isRunning }: { assetRun: AeoAssetRunSummary; isRunning: boolean }) {
  const generatedAsset = asRecord(assetRun.generated_asset);
  const files = asRecord(generatedAsset.files);
  const meta = asRecord(generatedAsset.meta);
  const reviewTrace = Array.isArray(assetRun.review_trace) ? assetRun.review_trace.map(asRecord) : [];
  const article = text(files.article_md, "");
  const tabs = [
    { id: "preview", label: "Preview", value: article },
    { id: "article", label: "article.md", value: article },
    { id: "llms", label: "llms.txt", value: text(files.llms_txt, "") },
    { id: "robots", label: "robots.txt", value: text(files.robots_txt, "") },
    { id: "schema", label: "faq.schema.json", value: JSON.stringify(asRecord(files.faq_schema_json), null, 2) },
    { id: "meta", label: "meta.json", value: JSON.stringify(asRecord(files.meta_json || meta), null, 2) }
  ] as const;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeader title="Writing pipeline" subtitle="Preview-only bundle generation, captured stage by stage." icon={<Rows3 className="h-4 w-4" />} />
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={assetRun.status} />
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : null}
        </div>
      </div>
      <AeoAssetStageRail run={assetRun} />

      {assetRun.error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{assetRun.error}</div>
      ) : null}

      {assetRun.status === "completed" && article ? (
        <AssetTabs tabs={tabs} meta={meta} reviewTrace={reviewTrace} />
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
          {isRunning ? `Current stage: ${assetRun.current_stage || "writing"}` : "The generated article files will appear here once the writer finishes."}
        </div>
      )}
    </section>
  );
}

export function AeoAssetStageRail({ run }: { run: AeoAssetRunSummary }) {
  const current = text(run.current_stage, run.status).toLowerCase();
  const activeIndex =
    run.status === "completed"
      ? 4
      : run.status === "failed"
      ? Math.max(0, ["idea", "draft", "review", "building", "preview"].findIndex((label) => current.includes(label)))
      : current.includes("preview")
      ? 4
      : current.includes("building")
      ? 3
      : current.includes("review")
      ? 2
      : current.includes("draft")
      ? 1
      : 0;
  const stages = ["Idea locked", "Drafting article", "Reviewing AEO checklist", "Building files", "Preview ready"];

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
      <div className="grid min-w-[760px] grid-cols-5 gap-2">
        {stages.map((stage, index) => {
          const completed = run.status === "completed" || index < activeIndex;
          const active = run.status !== "completed" && index === activeIndex;
          const failed = run.status === "failed" && index === activeIndex;
          return (
            <div
              key={stage}
              className={
                failed
                  ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2"
                  : active
                  ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                  : completed
                  ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                  : "rounded-lg border border-zinc-200 bg-white px-3 py-2"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500">{index + 1}</span>
                {failed ? (
                  <XCircle className="h-4 w-4 text-red-600" />
                ) : completed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : active ? (
                  <Clock3 className="h-4 w-4 text-amber-600" />
                ) : (
                  <Circle className="h-4 w-4 text-zinc-400" />
                )}
              </div>
              <div className={active ? "mt-2 text-sm font-semibold text-amber-700" : "mt-2 text-sm font-semibold text-zinc-800"}>{stage}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetTabs({
  tabs,
  meta,
  reviewTrace
}: {
  tabs: ReadonlyArray<{ id: string; label: string; value: string }>;
  meta: TraceRecord;
  reviewTrace: TraceRecord[];
}) {
  const [activeTab, setActiveTab] = useState("preview");
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const checklist = asRecord(meta.checklist);
  const passed = Object.values(checklist).filter(Boolean).length;
  const total = Object.keys(checklist).length || 5;

  return (
    <div className="mt-4 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Preview ready</div>
          <div className="mt-1 text-sm font-medium text-zinc-800">{text(meta.title, "Generated AEO article")}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
          <span className="rounded-md border border-emerald-200 bg-white px-2 py-1">{passed}/{total} AEO checks</span>
          <span className="rounded-md border border-emerald-200 bg-white px-2 py-1">{number(meta.token_estimate, 0)} tokens est.</span>
          <span className="rounded-md border border-emerald-200 bg-white px-2 py-1">{reviewTrace.length} review pass{reviewTrace.length === 1 ? "" : "es"}</span>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 px-3 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "cursor-pointer rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white"
                  : "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="max-h-[760px] overflow-auto p-4">
          {active?.id === "preview" ? (
            <article className="article-preview rounded-xl border border-zinc-100 bg-zinc-50 px-5 py-5">
              <MarkdownPreview content={active.value} />
            </article>
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100">
              {active?.value || "No content generated."}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function SourcePackDrawer({ sources }: { sources: TraceRecord[] }) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-zinc-900">
        Source pack used by writer ({sources.length})
      </summary>
      <div className="grid gap-2 border-t border-zinc-100 p-4">
        {sources.length ? (
          sources.map((source, index) => {
            const url = text(source.url, "");
            return (
              <div key={`${url}-${index}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
                <div className="font-medium text-zinc-950">{text(source.title, url || "Tracked source")}</div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{text(source.reason, "Source captured during Codex research.")}</p>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-emerald-700 hover:underline">
                    {url}
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">
            No tracked sources were attached to this writer run.
          </div>
        )}
      </div>
    </details>
  );
}

function renderInlineMarkdown(value: string) {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    if (match[2]) {
      parts.push(<strong key={`strong-${match.index}`}>{match[2]}</strong>);
    } else if (match[4] && match[5]) {
      parts.push(
        <a key={`link-${match.index}`} href={match[5]} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
          {match[4]}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
}

function parseMarkdownTable(lines: string[], startIndex: number) {
  const rows: string[][] = [];
  let index = startIndex;
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index] || "")) {
    const line = lines[index] || "";
    if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) {
      rows.push(
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim())
      );
    }
    index++;
  }
  return { rows, nextIndex: index };
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() || "";
    if (!line.trim()) {
      index++;
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const label = line.replace(/^#{1,3}\s+/, "");
      if (level === 1) blocks.push(<h1 key={`h-${index}`} className="text-3xl font-semibold tracking-tight text-zinc-950">{renderInlineMarkdown(label)}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h-${index}`} className="mt-7 text-xl font-semibold text-zinc-950">{renderInlineMarkdown(label)}</h2>);
      else blocks.push(<h3 key={`h-${index}`} className="mt-5 text-base font-semibold text-zinc-900">{renderInlineMarkdown(label)}</h3>);
      index++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|.*\|\s*$/.test(lines[index + 1] || "")) {
      const { rows, nextIndex } = parseMarkdownTable(lines, index);
      const [head, ...body] = rows;
      blocks.push(
        <div key={`table-${index}`} className="my-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            {head ? (
              <thead className="bg-zinc-100 text-xs uppercase tracking-[0.08em] text-zinc-500">
                <tr>{head.map((cell) => <th key={cell} className="px-3 py-2 font-semibold">{renderInlineMarkdown(cell)}</th>)}</tr>
              </thead>
            ) : null}
            <tbody className="divide-y divide-zinc-100">
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-3 py-2 align-top text-zinc-700">{renderInlineMarkdown(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      index = nextIndex;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] || "")) {
        items.push((lines[index] || "").replace(/^\s*[-*]\s+/, ""));
        index++;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="my-3 grid gap-1.5 pl-5 text-sm leading-6 text-zinc-700">
          {items.map((item) => <li key={item} className="list-disc">{renderInlineMarkdown(item)}</li>)}
        </ul>
      );
      continue;
    }

    const paragraph = [line.trim()];
    index++;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^#{1,3}\s+/.test(lines[index] || "") &&
      !/^\s*[-*]\s+/.test(lines[index] || "") &&
      !/^\s*\|.*\|\s*$/.test(lines[index] || "")
    ) {
      paragraph.push((lines[index] || "").trim());
      index++;
    }
    blocks.push(<p key={`p-${index}`} className="my-3 text-sm leading-7 text-zinc-700">{renderInlineMarkdown(paragraph.join(" "))}</p>);
  }

  return <div className="mx-auto max-w-4xl">{blocks}</div>;
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
