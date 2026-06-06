import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import type { redditIntelligenceTask } from "../../../trigger/reddit-intelligence";

export async function POST(request: Request) {
  const supabase = createSupabaseAdmin();

  const { count, error: activeError } = await supabase
    .from("reddit_intelligence_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);

  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if ((count || 0) > 0) {
    return NextResponse.json({ error: "Another Reddit intelligence run is already queued or running." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("reddit_intelligence_runs")
    .insert({
      profile_slug: "mr-plumber-sg",
      profile_name: "Mr Plumber Singapore",
      status: "queued",
      current_stage: "queued"
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const handle = await tasks.trigger<typeof redditIntelligenceTask>(
      "reddit-intelligence",
      { runId: data.id },
      {
        idempotencyKey: data.id,
        tags: [`reddit_intelligence_run:${data.id}`, "profile:mr-plumber-sg"]
      }
    );

    await supabase
      .from("reddit_intelligence_runs")
      .update({
        trigger_run_id: handle.id
      })
      .eq("id", data.id);
  } catch (triggerError) {
    await supabase
      .from("reddit_intelligence_runs")
      .update({
        status: "failed",
        current_stage: "trigger launch failed",
        error: triggerError instanceof Error ? triggerError.message : String(triggerError)
      })
      .eq("id", data.id);
  }

  return NextResponse.redirect(new URL("/reddit", request.url), 303);
}
