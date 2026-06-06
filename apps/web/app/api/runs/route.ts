import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { slugify } from "../../../lib/slug";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import type { seoContentWorkflowTask } from "../../../trigger/seo-content-workflow";

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = createSupabaseAdmin();

  const clientId = String(formData.get("client_id") || "").trim();
  const keyword = String(formData.get("keyword") || "").trim();
  const topic = String(formData.get("topic") || "").trim();
  const goal = String(formData.get("goal") || "").trim();
  const audience = String(formData.get("audience") || "").trim();
  const imageSearchQuery = String(formData.get("image_search_query") || "").trim();
  const brandVoiceOverride = String(formData.get("brand_voice_override") || "").trim();
  const referenceLinksRaw = String(formData.get("backlinks") || "").trim();
  const competitorRecommendationId = String(formData.get("competitor_recommendation_id") || "").trim();

  if (!clientId || !keyword || !topic || !goal) {
    return NextResponse.json({ error: "Client, keyword, topic, and goal are required." }, { status: 400 });
  }

  const { count, error: activeError } = await supabase
    .from("workflow_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);

  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });
  if ((count || 0) > 0) {
    return NextResponse.json({ error: "Another workflow is already queued or running." }, { status: 409 });
  }

  const referenceLinks = referenceLinksRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, ...titleParts] = line.split("|").map((part) => part.trim());
      return {
        url,
        title: titleParts.join(" | ") || url
      };
    })
    .filter((link) => link.url);

  const runName = slugify(keyword || topic);
  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({
      client_id: clientId,
      run_name: runName,
      keyword,
      topic,
      goal,
      audience: audience || null,
      image_search_query: imageSearchQuery || null,
      brand_voice_override: brandVoiceOverride || null,
      backlinks: referenceLinks,
      status: "queued",
      current_stage: "queued"
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const handle = await tasks.trigger<typeof seoContentWorkflowTask>(
      "seo-content-workflow",
      { runId: data.id },
      {
        idempotencyKey: data.id,
        tags: [`workflow_run:${data.id}`, `client:${clientId}`]
      }
    );

    await supabase
      .from("workflow_runs")
      .update({
        trigger_run_id: handle.id,
        artifact_bucket: "seo-workflow-artifacts",
        artifact_prefix: `runs/${data.id}`
      })
      .eq("id", data.id);

    if (competitorRecommendationId) {
      await supabase
        .from("competitor_recommendations")
        .update({
          status: "used_in_writer",
          workflow_run_id: data.id
        })
        .eq("id", competitorRecommendationId)
        .eq("client_id", clientId);
    }
  } catch (triggerError) {
    await supabase
      .from("workflow_runs")
      .update({
        status: "failed",
        current_stage: "trigger launch failed",
        error: triggerError instanceof Error ? triggerError.message : String(triggerError)
      })
      .eq("id", data.id);
  }

  return NextResponse.redirect(new URL(`/runs/${data.id}`, request.url), 303);
}
