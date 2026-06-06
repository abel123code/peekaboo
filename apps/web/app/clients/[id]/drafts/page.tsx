import Link from "next/link";
import type { ArticleDraft, Client } from "../../../../lib/database.types";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";
import { StatusBadge } from "../../../components/StatusBadge";
import { ButtonLink } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyTableCell, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from "../../../components/ui/table";
import { ClientWorkspaceShell } from "../ClientWorkspaceShell";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function ClientDraftsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const [{ data: client, error: clientError }, { data: drafts }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("article_drafts").select("*").eq("client_id", id).order("created_at", { ascending: false })
  ]);

  if (clientError || !client) {
    throw new Error(clientError?.message || "Client not found.");
  }

  const typedClient = client as Client;
  const typedDrafts = (drafts || []) as ArticleDraft[];

  return (
    <ClientWorkspaceShell client={typedClient} active="drafts">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Article Drafts</CardTitle>
            <CardDescription>Review generated drafts and editorial status.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedDrafts.length ? (
                  typedDrafts.map((draft) => (
                    <TableRow key={draft.id}>
                      <TableCell>
                        <Link href={`/drafts/${draft.id}`} className="font-medium text-zinc-950 hover:underline">
                          {draft.title}
                        </Link>
                        <div className="max-w-xl truncate text-xs text-zinc-500">{draft.excerpt}</div>
                      </TableCell>
                      <TableCell>{draft.target_keyword}</TableCell>
                      <TableCell>
                        <StatusBadge status={draft.status} />
                      </TableCell>
                      <TableCell>{formatDate(draft.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <ButtonLink variant="secondary" size="sm" href={`/drafts/${draft.id}`}>
                          Review
                        </ButtonLink>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTableCell colSpan={5}>No generated drafts yet.</EmptyTableCell>
                )}
              </TableBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </ClientWorkspaceShell>
  );
}
