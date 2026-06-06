import type { Client, ClientProfile, CompetitorRecommendation, KeywordOpportunity } from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Field, Input, Label, Textarea } from "../../../components/ui/form";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

function referenceLinksText(opportunity: KeywordOpportunity | null) {
  const links = opportunity?.reference_links;
  if (!Array.isArray(links)) return "";
  return links
    .map((link: any) => `${link.url || ""}${link.title ? ` | ${link.title}` : ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

function recommendationLinksText(recommendation: CompetitorRecommendation | null) {
  const links = recommendation?.reference_links;
  if (!Array.isArray(links)) return "";
  return links
    .map((link: any) => `${link.url || ""}${link.title ? ` | ${link.title}` : ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

export default async function ClientNewContentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opportunity_id?: string; recommendation_id?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const selectedOpportunityId = String(query.opportunity_id || "").trim();
  const selectedRecommendationId = String(query.recommendation_id || "").trim();
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: profileRow }, { data: selectedOpportunity }, { data: selectedRecommendation }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("client_profiles").select("*").eq("client_id", id).maybeSingle(),
    selectedOpportunityId
      ? supabase.from("keyword_opportunities").select("*").eq("id", selectedOpportunityId).eq("client_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    selectedRecommendationId
      ? supabase.from("competitor_recommendations").select("*").eq("id", selectedRecommendationId).eq("client_id", id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;
  const typedProfile = profileRow as ClientProfile | null;
  const profile = ((typedProfile?.profile || {}) as Record<string, any>) || {};
  const typedSelectedOpportunity = selectedOpportunity as KeywordOpportunity | null;
  const typedSelectedRecommendation = selectedRecommendation as CompetitorRecommendation | null;
  const selectedKeyword = typedSelectedRecommendation?.keyword || typedSelectedOpportunity?.keyword || "";
  const selectedTopic = typedSelectedRecommendation?.suggested_topic || typedSelectedOpportunity?.suggested_topic || "";
  const selectedGoal = typedSelectedRecommendation?.suggested_goal || typedSelectedOpportunity?.suggested_goal || "";
  const selectedAudience = typedSelectedRecommendation?.suggested_audience || typedSelectedOpportunity?.suggested_audience || typedClient.default_audience || "";
  const selectedImageQuery = typedSelectedRecommendation?.image_search_query || typedSelectedOpportunity?.image_search_query || "";
  const selectedLinks = typedSelectedRecommendation ? recommendationLinksText(typedSelectedRecommendation) : referenceLinksText(typedSelectedOpportunity);

  return (
    <ClientWorkspaceShell client={typedClient} active="new-content">
      <Card className="max-w-5xl">
        <CardHeader>
          <div>
            <CardTitle>Start AEO Article Workflow</CardTitle>
            <CardDescription>Create a focused Codex-assisted content run from an answer opportunity or manual brief.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" action="/api/runs" method="post">
            <input type="hidden" name="client_id" value={typedClient.id} />
            {typedSelectedRecommendation ? <input type="hidden" name="competitor_recommendation_id" value={typedSelectedRecommendation.id} /> : null}
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="keyword">Target Keyword</Label>
                <Input id="keyword" name="keyword" placeholder="customised mattress singapore" defaultValue={selectedKeyword} required />
              </Field>
              <Field>
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  name="topic"
                  placeholder="Customised Mattress Singapore: Buying Guide"
                  defaultValue={selectedTopic}
                  required
                />
              </Field>
            </div>
            <Field>
              <Label htmlFor="goal">Goal</Label>
              <Textarea
                id="goal"
                name="goal"
                placeholder="Create an AEO article that helps Singapore shoppers get a direct, citation-ready answer..."
                defaultValue={selectedGoal}
                required
              />
            </Field>
            <Field>
              <Label htmlFor="audience">Audience Override</Label>
              <Textarea id="audience" name="audience" defaultValue={selectedAudience} />
            </Field>

            <details className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4" open={Boolean(typedSelectedOpportunity || typedSelectedRecommendation)}>
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">Advanced options</summary>
              <div className="mt-4 grid gap-4">
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <Field>
                    <Label htmlFor="image_search_query">Image Search Query</Label>
                    <Input
                      id="image_search_query"
                      name="image_search_query"
                      placeholder="custom mattress bedroom singapore"
                      defaultValue={selectedImageQuery}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="brand_voice_override">Brand Voice Override</Label>
                    <Textarea
                      id="brand_voice_override"
                      name="brand_voice_override"
                      placeholder={typedClient.brand_voice || "Leave blank to use the client brand voice."}
                      defaultValue={profile.brand_voice || ""}
                    />
                  </Field>
                </div>
                <Field>
                  <Label htmlFor="backlinks">Reference Links</Label>
                  <Textarea
                    id="backlinks"
                    name="backlinks"
                    placeholder={"https://example.com/page | Source title\nhttps://example.com/guide | Another source"}
                    defaultValue={selectedLinks}
                  />
                </Field>
              </div>
            </details>

            <div className="flex justify-end">
              <Button type="submit">Run Workflow</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </ClientWorkspaceShell>
  );
}
