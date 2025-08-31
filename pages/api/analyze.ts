import type { NextApiRequest, NextApiResponse } from "next";
import { analyzeDocuments } from "../../lib/stores-enhanced.js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const analysis = analyzeDocuments();
    
    if (!analysis) {
      return res.status(404).json({ 
        error: "No documents found or analysis failed",
        message: "Please upload and ingest documents first"
      });
    }

    res.status(200).json({
      message: "Document analysis completed successfully",
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Analysis error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to analyze documents",
      message: "Please ensure documents are properly ingested"
    });
  }
}

