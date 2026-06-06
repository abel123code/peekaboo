import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();

  const { data: existingDraft } = await supabase.from("article_drafts").select("published_at").eq("id", id).maybeSingle();
  const approvedAt = body.status === "approved" ? (existingDraft as any)?.published_at || new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("article_drafts")
    .update({
      status: body.status,
      title: body.title,
      slug: body.slug,
      meta_description: body.meta_description,
      excerpt: body.excerpt,
      summary_bullets: body.summary_bullets,
      cta_banner: body.cta_banner,
      content: body.content,
      review_notes: body.review_notes,
      ...(approvedAt ? { approved_at: approvedAt, published_at: approvedAt } : {})
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.status === "approved") {
    const normalizedKeyword = String(data.target_keyword || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    if (normalizedKeyword) {
      await supabase.from("published_content_coverage").upsert(
        {
          client_id: data.client_id,
          keyword: data.target_keyword,
          normalized_keyword: normalizedKeyword,
          article_draft_id: data.id,
          workflow_run_id: data.run_id,
          title: data.title,
          slug: data.slug,
          published_at: data.published_at || approvedAt
        },
        {
          onConflict: "client_id,normalized_keyword"
        }
      );

      await supabase
        .from("competitor_recommendations")
        .update({
          article_draft_id: data.id
        })
        .eq("workflow_run_id", data.run_id);
    }
  }

  return NextResponse.json({ draft: data });
}
