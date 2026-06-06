import Link from "next/link";
import { ArrowUpRight, Globe2, Languages, MapPin, Search, Settings, Sparkles } from "lucide-react";
import type { Client } from "../../lib/database.types";
import { createSupabaseAdmin } from "../../lib/supabase-admin";
import { PeekabooLogo } from "../components/PeekabooLogo";
import { SetupNotice } from "../components/SetupNotice";  
import { ButtonLink } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { PageDescription, PageTitle } from "../components/ui/page-layout";

async function loadClients() {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Client[];
}

export default async function ClientsPage() {
  let clients: Client[] = [];
  let setupError: string | null = null;

  try {
    clients = await loadClients();
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-5 py-4 shadow-sm">
        <PeekabooLogo size="xl" />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/reddit" variant="secondary">
            <Search className="h-4 w-4" />
            Reddit
          </ButtonLink>
          <ButtonLink href="/settings" variant="secondary">
            <Settings className="h-4 w-4" />
            Settings
          </ButtonLink>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-[1fr_auto] items-end gap-6 max-md:grid-cols-1">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600">
            <Sparkles className="h-3.5 w-3.5" />
            Codex-powered AEO workspace
          </div>
          <PageTitle>Answer visibility command center</PageTitle>
          <PageDescription>Pick a brand, launch research, and turn answer-engine signals into draft-ready workflows.</PageDescription>
        </div>
        {!setupError ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-4 text-zinc-950 shadow-sm">
            <div className="text-2xl font-semibold">{clients.length}</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Active clients</div>
          </div>
        ) : null}
      </div>

      {setupError ? (
        <SetupNotice error={setupError} />
      ) : clients.length ? (
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`} className="group block cursor-pointer">
              <Card className="h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-zinc-300 group-hover:bg-white group-hover:shadow-md">
                <CardContent className="p-0">
                  <div className="h-1.5 bg-zinc-950" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-zinc-950">{client.name}</div>
                        <div className="mt-2 flex items-center gap-2 truncate text-sm text-slate-600">
                          <Globe2 className="h-4 w-4 shrink-0 text-zinc-400" />
                          <span className="truncate">{client.website_url}</span>
                        </div>
                      </div>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 transition-colors duration-200 group-hover:bg-zinc-950 group-hover:text-white">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 ring-1 ring-slate-200">
                        <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                        {client.default_location_name}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 ring-1 ring-slate-200">
                        <Languages className="h-3.5 w-3.5 text-zinc-500" />
                        {client.default_language_name}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-sm font-medium text-zinc-950">No clients yet</div>
            <p className="mt-1 text-sm text-zinc-500">Create your first client from Settings.</p>
            <ButtonLink className="mt-4" href="/settings">
              Open Settings
            </ButtonLink>
          </CardContent>
        </Card>
      )}
    </>
  );
}
