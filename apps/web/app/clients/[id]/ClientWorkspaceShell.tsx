import Link from "next/link";
import type { Client } from "../../../lib/database.types";
import { cn } from "../../../lib/utils";
import { PeekabooLogo } from "../../components/PeekabooLogo";

type ClientSection = "overview" | "agent" | "keywords" | "intelligence" | "new-content" | "runs" | "drafts" | "settings";

const sections: Array<{ id: ClientSection; label: string; href: (clientId: string) => string }> = [
  { id: "overview", label: "Overview", href: (clientId) => `/clients/${clientId}` },
  { id: "agent", label: "Agent", href: (clientId) => `/clients/${clientId}/agent` },
  { id: "keywords", label: "Keywords", href: (clientId) => `/clients/${clientId}/keywords` },
  { id: "intelligence", label: "Intelligence", href: (clientId) => `/clients/${clientId}/intelligence` },
  { id: "new-content", label: "New Content", href: (clientId) => `/clients/${clientId}/new-content` },
  { id: "runs", label: "Runs", href: (clientId) => `/clients/${clientId}/runs` },
  { id: "drafts", label: "Drafts", href: (clientId) => `/clients/${clientId}/drafts` },
  { id: "settings", label: "Settings", href: (clientId) => `/clients/${clientId}/settings` }
];

export function ClientWorkspaceShell({
  client,
  active,
  children
}: {
  client: Client;
  active: ClientSection;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <Link href="/clients" className="mb-4 inline-block">
          <PeekabooLogo size="lg" />
        </Link>
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/clients" className="transition-colors duration-200 hover:text-zinc-950">
            Clients
          </Link>
          <span>/</span>
          <span className="text-slate-700">{client.name}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-5 max-md:grid-cols-1">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 max-sm:text-2xl">{client.name}</h1>
            <p className="mt-2 text-sm text-slate-600">{client.website_url}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-md bg-zinc-50 px-2.5 py-1 text-zinc-700 ring-1 ring-zinc-200">{client.default_location_name}</span>
            <span className="rounded-md bg-zinc-50 px-2.5 py-1 text-zinc-700 ring-1 ring-zinc-200">{client.default_language_name}</span>
          </div>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-sm" aria-label="Client sections">
        {sections.map((section) => (
          <Link
            key={section.id}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-950",
              section.id === active && "bg-zinc-950 text-white shadow-sm hover:bg-zinc-950 hover:text-white"
            )}
            href={section.href(client.id)}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-5">{children}</div>
    </div>
  );
}
