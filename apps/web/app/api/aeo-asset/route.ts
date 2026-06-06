import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import { asRecord, text } from "../../../lib/codex-demo";
import type { aeoAssetGeneratorTask } from "../../../trigger/aeo-asset-generator";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function ideaFromRecord(value: unknown) {
  const record = asRecord(value);
  return {
    title: text(record.title, ""),
    angle: text(record.angle, ""),
    target_query: text(record.target_query || record.targetQuery, ""),
    rationale: text(record.rationale, ""),
    source_signals: jsonStrings(record.source_signals || record.sourceSignals)
  };
}

function sourceFromRecord(value: unknown) {
  const record = asRecord(value);
  const input = asRecord(record.input);
  const output = asRecord(record.output);
  const url = text(record.url || input.url || output.url, "");
  if (!url) return null;
  return {
    title: text(record.title || output.title, url),
    url,
    reason: text(record.reason || output.reason || record.summary, "Source accessed during Codex research."),
    agent_label: text(record.agent_label || record.agentLabel, "")
  };
}

function sourcePackFromTrace(value: unknown) {
  const trace = asRecord(value);
  const seen = new Set<string>();
  const sources: Array<Record<string, string>> = [];
  for (const item of [
    ...asArray(trace.events).filter((event) => text(asRecord(event).type, "") === "source_access"),
    ...asArray(trace.trusted_sources)
  ]) {
    const source = sourceFromRecord(item);
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    sources.push(source);
  }
  return sources.slice(0, 12);
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdmin();
  const form = await request.formData();
  const codexRunId = String(form.get("codexRunId") || "").trim();
  const ideaIndex = Number(form.get("ideaIndex"));

  if (!codexRunId || !Number.isInteger(ideaIndex) || ideaIndex < 0) {
    return NextResponse.json({ error: "Missing Codex run or invalid idea index." }, { status: 400 });
  }

  const { data: codexRun, error: codexError } = await supabase
    .from("codex_research_runs")
    .select("*")
    .eq("id", codexRunId)
    .single();
  if (codexError || !codexRun) {
    return NextResponse.json({ error: codexError?.message || "Codex research run not found." }, { status: 404 });
  }
  if (codexRun.status !== "completed") {
    return NextResponse.json({ error: "Codex research must be completed first." }, { status: 409 });
  }

  const brief = asRecord(codexRun.content_brief);
  const ideas = asArray(brief.content_ideas).map(ideaFromRecord);
  const selectedIdea = ideas[ideaIndex];
  if (!selectedIdea?.title || !selectedIdea.angle || !selectedIdea.rationale) {
    return NextResponse.json({ error: "Selected content idea was not found." }, { status: 400 });
  }

  const { count, error: activeError } = await supabase
    .from("aeo_asset_runs")
    .select("id", { count: "exact", head: true })
    .eq("codex_run_id", codexRunId)
    .in("status", ["queued", "running"]);
  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if ((count || 0) > 0) {
    return NextResponse.json({ error: "An AEO article is already queued or running for this Codex run." }, { status: 409 });
  }

  const { data: run, error } = await supabase
    .from("aeo_asset_runs")
    .insert({
      codex_run_id: codexRunId,
      status: "queued",
      current_stage: "queued",
      idea_index: ideaIndex,
      selected_idea: selectedIdea,
      source_pack: sourcePackFromTrace(codexRun.normalized_trace),
      summary: {
        selected_idea_title: selectedIdea.title
      }
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const handle = await tasks.trigger<typeof aeoAssetGeneratorTask>(
      "aeo-asset-generator",
      { runId: run.id },
      {
        idempotencyKey: run.id,
        tags: [`aeo_asset_run:${run.id}`, `codex_research_run:${codexRunId}`]
      }
    );

    await supabase.from("aeo_asset_runs").update({ trigger_run_id: handle.id }).eq("id", run.id);
  } catch (triggerError) {
    await supabase
      .from("aeo_asset_runs")
      .update({
        status: "failed",
        current_stage: "trigger launch failed",
        error: triggerError instanceof Error ? triggerError.message : String(triggerError)
      })
      .eq("id", run.id);
  }

  return NextResponse.redirect(new URL(`/codex?runId=${codexRunId}`, request.url), 303);
}
