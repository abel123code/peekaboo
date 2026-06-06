import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import type { keywordOpportunityResearchTask } from "../../../trigger/keyword-opportunity-research";

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = createSupabaseAdmin();

  const clientId = String(formData.get("client_id") || "").trim();
  const locationName = String(formData.get("location_name") || "").trim() || "Singapore";
  const languageName = String(formData.get("language_name") || "").trim() || "English";

  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }

  const { count, error: activeError } = await supabase
    .from("keyword_research_runs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .in("status", ["queued", "running"]);

  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if ((count || 0) > 0) {
    return NextResponse.json({ error: "Another keyword research run is already queued or running." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("keyword_research_runs")
    .insert({
      client_id: clientId,
      location_name: locationName,
      language_name: languageName,
      status: "queued",
      current_stage: "queued"
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const handle = await tasks.trigger<typeof keywordOpportunityResearchTask>(
      "keyword-opportunity-research",
      { researchRunId: data.id },
      {
        idempotencyKey: data.id,
        tags: [`keyword_research_run:${data.id}`, `client:${clientId}`]
      }
    );

    await supabase
      .from("keyword_research_runs")
      .update({
        trigger_run_id: handle.id
      })
      .eq("id", data.id);
  } catch (triggerError) {
    await supabase
      .from("keyword_research_runs")
      .update({
        status: "failed",
        current_stage: "trigger launch failed",
        error: triggerError instanceof Error ? triggerError.message : String(triggerError)
      })
      .eq("id", data.id);
  }

  return NextResponse.redirect(new URL(`/clients/${clientId}/keywords`, request.url), 303);
}
