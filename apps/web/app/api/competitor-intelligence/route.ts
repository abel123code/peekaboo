import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import type { competitorIntelligenceTask } from "../../../trigger/competitor-intelligence";

const modes = new Set(["fetch_and_analyze", "analyze_only", "fetch_only"]);

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = createSupabaseAdmin();

  const clientId = String(formData.get("client_id") || "").trim();
  const requestedMode = String(formData.get("mode") || "analyze_only").trim();
  const mode = modes.has(requestedMode) ? requestedMode : "analyze_only";
  const locationName = String(formData.get("location_name") || "").trim() || "Singapore";
  const languageName = String(formData.get("language_name") || "").trim() || "English";

  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }

  const { count, error: activeError } = await supabase
    .from("competitor_intelligence_runs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", ["queued", "running"]);

  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if ((count || 0) > 0) {
    return NextResponse.json({ error: "Another competitor intelligence run is already queued or running." }, { status: 409 });
  }

  if (mode === "analyze_only") {
    const { count: snapshotCount, error: snapshotError } = await supabase
      .from("competitor_intelligence_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    if ((snapshotCount || 0) === 0) {
      return NextResponse.json({ error: "No saved snapshot exists yet. Run Fetch + Analyze first." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("competitor_intelligence_runs")
    .insert({
      client_id: clientId,
      mode,
      location_name: locationName,
      language_name: languageName,
      status: "queued",
      current_stage: "queued"
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const handle = await tasks.trigger<typeof competitorIntelligenceTask>(
      "competitor-intelligence",
      { runId: data.id },
      {
        idempotencyKey: data.id,
        tags: [`competitor_intelligence_run:${data.id}`, `client:${clientId}`]
      }
    );

    await supabase
      .from("competitor_intelligence_runs")
      .update({
        trigger_run_id: handle.id
      })
      .eq("id", data.id);
  } catch (triggerError) {
    await supabase
      .from("competitor_intelligence_runs")
      .update({
        status: "failed",
        current_stage: "trigger launch failed",
        error: triggerError instanceof Error ? triggerError.message : String(triggerError)
      })
      .eq("id", data.id);
  }

  return NextResponse.redirect(new URL(`/clients/${clientId}/intelligence`, request.url), 303);
}
