import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "../../../../lib/supabase-admin";

const SEO_ARTIFACT_BUCKET = "seo-workflow-artifacts";

async function readStorageText(path: string) {
  const supabase = createSupabaseAdmin();
  const normalizedPath = path.replace(`${SEO_ARTIFACT_BUCKET}/`, "").replace(/^\/+/, "");
  const { data, error } = await supabase.storage.from(SEO_ARTIFACT_BUCKET).download(normalizedPath);
  if (error) return "";
  return data.text();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = String(url.searchParams.get("client_id") || "").trim();

  if (!clientId) {
    return NextResponse.json({ error: "Client is required." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: client, error: clientError } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const { data: latestRun, error: runError } = await supabase
    .from("competitor_intelligence_runs")
    .select("memory_path")
    .eq("client_id", clientId)
    .not("memory_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const agentMemoryPath = `agent-memory/clients/${clientId}.md`;
  const intelligenceMemoryPath = latestRun?.memory_path ? String(latestRun.memory_path) : "";
  const [agentMemory, intelligenceMemory] = await Promise.all([
    readStorageText(agentMemoryPath),
    intelligenceMemoryPath ? readStorageText(intelligenceMemoryPath) : Promise.resolve("")
  ]);

  return NextResponse.json({
    agentMemory,
    agentMemoryPath: `${SEO_ARTIFACT_BUCKET}/${agentMemoryPath}`,
    intelligenceMemory,
    intelligenceMemoryPath
  });
}
