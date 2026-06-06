import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import type { RedditThread } from "../../../lib/database.types";
import type { codexResearchTask } from "../../../trigger/codex-research";

function threadSnapshot(thread: RedditThread) {
  return {
    id: thread.id,
    reddit_id: thread.reddit_id,
    subreddit: thread.subreddit,
    title: thread.title,
    url: thread.url,
    reddit_score: thread.reddit_score,
    comment_count: thread.comment_count,
    relevance_score: thread.relevance_score,
    urgency_score: thread.urgency_score,
    commercial_intent_score: thread.commercial_intent_score,
    why_relevant: thread.why_relevant,
    thread_content: thread.thread_content,
    matched_services: thread.matched_services,
    matched_icps: thread.matched_icps
  };
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdmin();
  const form = await request.formData();
  const threadId = String(form.get("threadId") || "");
  const forceVirtual = String(form.get("forceVirtual") || "") === "true";

  if (!threadId) {
    return NextResponse.json({ error: "Missing selected Reddit thread." }, { status: 400 });
  }

  const { count, error: activeError } = await supabase
    .from("codex_research_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);

  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if ((count || 0) > 0) {
    return NextResponse.json({ error: "Another Codex research run is already queued or running." }, { status: 409 });
  }

  const { data: thread, error: threadError } = await supabase.from("reddit_threads").select("*").eq("id", threadId).single();
  if (threadError || !thread) {
    return NextResponse.json({ error: threadError?.message || "Selected Reddit thread not found." }, { status: 404 });
  }

  const snapshot = threadSnapshot(thread as RedditThread);
  const { data, error } = await supabase
    .from("codex_research_runs")
    .insert({
      reddit_thread_id: threadId,
      profile_slug: "mr-plumber-sg",
      status: "queued",
      execution_mode: forceVirtual ? "virtual_fallback" : "real_codex",
      current_stage: "queued",
      selected_reddit_thread: snapshot,
      summary: {
        selected_thread_title: snapshot.title
      }
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const handle = await tasks.trigger<typeof codexResearchTask>(
      "codex-research",
      { runId: data.id, forceVirtual },
      {
        idempotencyKey: data.id,
        tags: [`codex_research_run:${data.id}`, `reddit_thread:${threadId}`]
      }
    );

    await supabase.from("codex_research_runs").update({ trigger_run_id: handle.id }).eq("id", data.id);
  } catch (triggerError) {
    await supabase
      .from("codex_research_runs")
      .update({
        status: "failed",
        current_stage: "trigger launch failed",
        error: triggerError instanceof Error ? triggerError.message : String(triggerError)
      })
      .eq("id", data.id);
  }

  return NextResponse.redirect(new URL(`/codex?runId=${data.id}`, request.url), 303);
}
