import { ArrowUpRight, Bot, FileText, Lightbulb, PencilLine, Radar, Settings, Sparkles } from "lucide-react";
import type { Client } from "../../../lib/database.types";
import { createSupabaseAdmin } from "../../../lib/supabase-admin";
import { Card, CardContent } from "../../components/ui/card";
import { ClientWorkspaceShell } from "./ClientWorkspaceShell";

const actions = [
  {
    title: "AEO Agent",
    description: "Chat with the Codex-backed client agent and confirm workflow actions.",
    href: "agent",
    icon: Bot
  },
  {
    title: "Keyword Research",
    description: "Find and prioritize answer-ready content opportunities.",
    href: "keywords",
    icon: Lightbulb
  },
  {
    title: "Competitor Intelligence",
    description: "Analyze competitor gaps and recommend content actions.",
    href: "intelligence",
    icon: Radar
  },
  {
    title: "New Content",
    description: "Start a new AEO article workflow.",
    href: "new-content",
    icon: Sparkles
  },
  {
    title: "Runs",
    description: "Track workflow execution and stages.",
    href: "runs",
    icon: PencilLine
  },
  {
    title: "Drafts",
    description: "Review generated article drafts.",
    href: "drafts",
    icon: FileText
  },
  {
    title: "Client Settings",
    description: "Edit profile, audience, voice, and source inputs.",
    href: "settings",
    icon: Settings
  }
];

const iconTone = "bg-zinc-50 text-zinc-700 ring-zinc-200";

export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: client, error: clientError } = await supabase.from("clients").select("*").eq("id", id).single();

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;

  return (
    <ClientWorkspaceShell client={typedClient} active="overview">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm">
        <div className="grid grid-cols-[1fr_auto] items-end gap-5 max-md:grid-cols-1">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
              <Sparkles className="h-3.5 w-3.5" />
              Live demo cockpit
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Launch research, intelligence, and answer-ready content from one place.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Built for a clean hackathon walkthrough: expose market signals, validate answer opportunities, then open the Codex writer flow.
            </p>
          </div>
          <a
            href={`/clients/${typedClient.id}/new-content`}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          >
            Start AEO Content
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <a key={action.href} href={`/clients/${typedClient.id}/${action.href}`} className="group block cursor-pointer">
              <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-zinc-300 group-hover:bg-white group-hover:shadow-md">
                <CardContent className="flex gap-4 p-5">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${iconTone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-zinc-950">{action.title}</div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors duration-200 group-hover:text-zinc-700" />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
                  </div>
                </CardContent>
              </Card>
            </a>
          );
        })}
      </div>
    </ClientWorkspaceShell>
  );
}
