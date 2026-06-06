import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const formData = await request.formData();
  const supabase = createSupabaseAdmin();

  const { error } = await supabase
    .from("clients")
    .update({
      name: String(formData.get("name") || "").trim(),
      website_url: String(formData.get("website_url") || "").trim(),
      website_context: String(formData.get("website_context") || "").trim(),
      default_audience: String(formData.get("default_audience") || "").trim() || null,
      brand_voice: String(formData.get("brand_voice") || "").trim() || null,
      default_location_name: String(formData.get("default_location_name") || "Singapore").trim(),
      default_language_name: String(formData.get("default_language_name") || "English").trim()
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(new URL(`/clients/${id}/settings`, request.url), 303);
}
