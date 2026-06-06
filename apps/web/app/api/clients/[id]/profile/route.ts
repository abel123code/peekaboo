import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../../lib/supabase-admin";

function lines(value: FormDataEntryValue | null) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function links(value: FormDataEntryValue | null) {
  return lines(value)
    .map((line) => {
      const [url, ...titleParts] = line.split("|").map((part) => part.trim());
      return {
        url,
        title: titleParts.join(" | ") || url
      };
    })
    .filter((link) => link.url);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const supabase = createSupabaseAdmin();

  const profile = {
    mission: String(formData.get("mission") || "").trim(),
    positioning: String(formData.get("positioning") || "").trim(),
    products_services: lines(formData.get("products_services")),
    target_audiences: lines(formData.get("target_audiences")),
    funnel_stages: {
      awareness: lines(formData.get("funnel_awareness")),
      consideration: lines(formData.get("funnel_consideration")),
      comparison: lines(formData.get("funnel_comparison")),
      decision: lines(formData.get("funnel_decision")),
      retention: lines(formData.get("funnel_retention"))
    },
    pain_points: lines(formData.get("pain_points")),
    differentiators: lines(formData.get("differentiators")),
    proof_points: lines(formData.get("proof_points")),
    offers: lines(formData.get("offers")),
    brand_voice: String(formData.get("profile_brand_voice") || "").trim(),
    source_urls: links(formData.get("source_urls")),
    excluded_topics: lines(formData.get("excluded_topics"))
  };

  const { error } = await supabase.from("client_profiles").upsert(
    {
      client_id: id,
      profile
    },
    { onConflict: "client_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL(`/clients/${id}/settings`, request.url), 303);
}
