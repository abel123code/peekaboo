import { ArrowLeft } from "lucide-react";
import { PeekabooLogo } from "../components/PeekabooLogo";
import { Button, ButtonLink } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Field, Input, Label, Textarea } from "../components/ui/form";
import { PageDescription, PageHeader, PageTitle } from "../components/ui/page-layout";

export default function SettingsPage() {
  return (
    <>
      <PageHeader>
        <div>
          <div className="mb-4">
            <PeekabooLogo size="lg" />
          </div>
          <PageTitle>Settings</PageTitle>
          <PageDescription>Workspace-level setup for Codex-assisted answer engine optimization.</PageDescription>
        </div>
        <ButtonLink href="/clients" variant="secondary">
          <ArrowLeft className="h-4 w-4" />
          Clients
        </ButtonLink>
      </PageHeader>

      <Card className="max-w-5xl">
        <CardHeader>
          <div>
            <CardTitle>Create Client</CardTitle>
            <CardDescription>Add the client basics. The full company profile can be edited inside the client workspace.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" action="/api/clients" method="post">
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="Sofzsleep" required />
              </Field>
              <Field>
                <Label htmlFor="website_url">Website URL</Label>
                <Input id="website_url" name="website_url" placeholder="https://sofzsleep.com" required />
              </Field>
            </div>
            <Field>
              <Label htmlFor="website_context">Website Context</Label>
              <Textarea
                id="website_context"
                name="website_context"
                placeholder="A Singapore-focused sleep and mattress review site..."
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="default_audience">Default Audience</Label>
                <Textarea id="default_audience" name="default_audience" />
              </Field>
              <Field>
                <Label htmlFor="brand_voice">Brand Voice</Label>
                <Textarea id="brand_voice" name="brand_voice" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field>
                <Label htmlFor="default_location_name">Location</Label>
                <Input id="default_location_name" name="default_location_name" defaultValue="Singapore" />
              </Field>
              <Field>
                <Label htmlFor="default_language_name">Language</Label>
                <Input id="default_language_name" name="default_language_name" defaultValue="English" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Create Client</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
