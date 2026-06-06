import type { Client, ClientProfile } from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Field, Input, Label, Textarea } from "../../../components/ui/form";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

function profileText(profile: Record<string, any>, key: string) {
  const value = profile[key];
  return Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
}

function funnelText(profile: Record<string, any>, key: string) {
  const value = profile.funnel_stages?.[key];
  return Array.isArray(value) ? value.join("\n") : "";
}

function sourceLinksText(profile: Record<string, any>) {
  const value = profile.source_urls;
  if (!Array.isArray(value)) return "";
  return value
    .map((link) => `${link.url || ""}${link.title ? ` | ${link.title}` : ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

export default async function ClientSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: profileRow }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("client_profiles").select("*").eq("client_id", id).maybeSingle()
  ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;
  const typedProfile = profileRow as ClientProfile | null;
  const profile = ((typedProfile?.profile || {}) as Record<string, any>) || {};

  return (
    <ClientWorkspaceShell client={typedClient} active="settings">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Client Settings</CardTitle>
            <CardDescription>Core website, market, and voice details.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" action={`/api/clients/${typedClient.id}`} method="post">
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={typedClient.name} required />
              </Field>
              <Field>
                <Label htmlFor="website_url">Website URL</Label>
                <Input id="website_url" name="website_url" defaultValue={typedClient.website_url} required />
              </Field>
            </div>
            <Field>
              <Label htmlFor="website_context">Website Context</Label>
              <Textarea id="website_context" name="website_context" defaultValue={typedClient.website_context} required />
            </Field>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="default_audience">Default Audience</Label>
                <Textarea id="default_audience" name="default_audience" defaultValue={typedClient.default_audience || ""} />
              </Field>
              <Field>
                <Label htmlFor="brand_voice">Brand Voice</Label>
                <Textarea id="brand_voice" name="brand_voice" defaultValue={typedClient.brand_voice || ""} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="default_location_name">Location</Label>
                <Input id="default_location_name" name="default_location_name" defaultValue={typedClient.default_location_name} />
              </Field>
              <Field>
                <Label htmlFor="default_language_name">Language</Label>
                <Input id="default_language_name" name="default_language_name" defaultValue={typedClient.default_language_name} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" type="submit">
                Save Client
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Company Profile</CardTitle>
            <CardDescription>Inputs used by keyword research and content strategy.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" action={`/api/clients/${typedClient.id}/profile`} method="post">
            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
              <Field>
                <Label htmlFor="mission">Mission</Label>
                <Textarea id="mission" name="mission" defaultValue={profile.mission || ""} />
              </Field>
              <Field>
                <Label htmlFor="positioning">Positioning</Label>
                <Textarea id="positioning" name="positioning" defaultValue={profile.positioning || ""} />
              </Field>
              <Field>
                <Label htmlFor="products_services">Products / Services</Label>
                <Textarea id="products_services" name="products_services" defaultValue={profileText(profile, "products_services")} />
              </Field>
              <Field>
                <Label htmlFor="target_audiences">Target Audiences</Label>
                <Textarea id="target_audiences" name="target_audiences" defaultValue={profileText(profile, "target_audiences")} />
              </Field>
              <Field>
                <Label htmlFor="pain_points">Pain Points</Label>
                <Textarea id="pain_points" name="pain_points" defaultValue={profileText(profile, "pain_points")} />
              </Field>
              <Field>
                <Label htmlFor="differentiators">Differentiators</Label>
                <Textarea id="differentiators" name="differentiators" defaultValue={profileText(profile, "differentiators")} />
              </Field>
              <Field>
                <Label htmlFor="proof_points">Proof Points</Label>
                <Textarea id="proof_points" name="proof_points" defaultValue={profileText(profile, "proof_points")} />
              </Field>
              <Field>
                <Label htmlFor="offers">Offers / CTAs</Label>
                <Textarea id="offers" name="offers" defaultValue={profileText(profile, "offers")} />
              </Field>
            </div>

            <details className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">Funnel topics</summary>
              <div className="mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                {[
                  ["funnel_awareness", "Awareness", "awareness"],
                  ["funnel_consideration", "Consideration", "consideration"],
                  ["funnel_comparison", "Comparison", "comparison"],
                  ["funnel_decision", "Decision", "decision"],
                  ["funnel_retention", "Retention", "retention"]
                ].map(([id, label, key]) => (
                  <Field key={id}>
                    <Label htmlFor={id}>{label}</Label>
                    <Textarea id={id} name={id} defaultValue={funnelText(profile, key)} />
                  </Field>
                ))}
              </div>
            </details>

            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
              <Field>
                <Label htmlFor="profile_brand_voice">Profile Brand Voice</Label>
                <Textarea id="profile_brand_voice" name="profile_brand_voice" defaultValue={profile.brand_voice || ""} />
              </Field>
              <Field>
                <Label htmlFor="source_urls">Source URLs</Label>
                <Textarea id="source_urls" name="source_urls" defaultValue={sourceLinksText(profile)} placeholder="https://example.com/about | About" />
              </Field>
              <Field>
                <Label htmlFor="excluded_topics">Excluded Topics</Label>
                <Textarea id="excluded_topics" name="excluded_topics" defaultValue={profileText(profile, "excluded_topics")} />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" type="submit">
                Save Company Profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </ClientWorkspaceShell>
  );
}
