import type { NextApiRequest, NextApiResponse } from "next";
import { loadVectorStore, loadBM25Index, loadMeta } from "../../lib/stores.js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Test if the RAG system can load and search
    const vs = await loadVectorStore();
    const bm = loadBM25Index();
    const meta = loadMeta();

    // Test a simple search
    const testQuery = "pricing strategy";
    const dense = await vs.similaritySearchWithScore(testQuery, 3);

    res.status(200).json({
      message: "RAG system is working!",
      testQuery,
      resultsFound: dense.length,
      sampleResults: dense.slice(0, 2).map(([doc, score]) => ({
        source: doc.metadata?.source,
        score: score.toFixed(3),
        preview: doc.pageContent?.slice(0, 100) + "..."
      })),
      totalDocuments: meta.length,
      status: "Ready for queries"
    });

  } catch (error: any) {
    console.error("RAG test error:", error);
    res.status(500).json({
      error: error.message || "RAG system test failed",
      status: "Not ready"
    });
  }
}

