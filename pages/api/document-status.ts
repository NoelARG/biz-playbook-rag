import type { NextApiRequest, NextApiResponse } from "next";
import { checkDocumentStatus } from "../../lib/stores-enhanced.js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const status = await checkDocumentStatus("./docs");
    
    if (!status) {
      console.warn("Document status check returned null, returning empty status");
      return res.status(200).json({
        status: {
          unchanged: [],
          modified: [],
          new: [],
          deleted: []
        },
        summary: {
          total: 0,
          unchanged: 0,
          modified: 0,
          new: 0,
          deleted: 0
        }
      });
    }

    res.status(200).json({
      status,
      summary: {
        total: status.unchanged.length + status.modified.length + status.new.length,
        unchanged: status.unchanged.length,
        modified: status.modified.length,
        new: status.new.length,
        deleted: status.deleted.length
      }
    });

  } catch (error: any) {
    console.error("Document status check error:", error);
    res.status(500).json({ error: error.message || "Status check failed" });
  }
}
