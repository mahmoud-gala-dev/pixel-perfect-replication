// =====================================================================
// KNOWLEDGE BRAIN — DOWNLOAD BRAIN EXPORT UTILITY
// Fetches full knowledge graph, claims & sources, and triggers JSON export
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import { exportBrainData } from "./export-import";

export async function downloadBrainExport(): Promise<void> {
  const [nodesRes, edgesRes, claimsRes, sourcesRes] = await Promise.all([
    supabase.from("knowledge_nodes").select("*").limit(2000),
    supabase.from("knowledge_edges").select("*").limit(3000),
    supabase.from("knowledge_claims").select("*").limit(4000),
    supabase.from("sources").select("*").limit(1000),
  ]);

  const pkg = exportBrainData({
    nodes: (nodesRes.data || []) as any,
    edges: (edgesRes.data || []) as any,
    claims: claimsRes.data || [],
    sources: sourcesRes.data || [],
  });

  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `brain-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
