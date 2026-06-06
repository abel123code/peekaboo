import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";

export async function POST(request: Request) {
  const formData = await request.formData();
  const supabase = createSupabaseAdmin();

  const name = String(formData.get("name") || "").trim();
  const websiteUrl = String(formData.get("website_url") || "").trim();
  const websiteContext = String(formData.get("website_context") || "").trim();

  if (!name || !websiteUrl || !websiteContext) {
    return NextResponse.json({ error: "Name, website URL, and website context are required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      website_url: websiteUrl,
      website_context: websiteContext,
      default_audience: String(formData.get("default_audience") || "").trim() || null,
      brand_voice: String(formData.get("brand_voice") || "").trim() || null,
      default_location_name: String(formData.get("default_location_name") || "Singapore").trim(),
      default_language_name: String(formData.get("default_language_name") || "English").trim()
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(new URL(`/clients/${data.id}`, request.url), 303);
}
