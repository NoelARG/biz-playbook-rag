import type { NextApiRequest, NextApiResponse } from "next";
import { unlink } from "fs/promises";
import { join } from "path";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: "Filename is required" });
    }

    const filePath = join(process.cwd(), "docs", filename);
    
    try {
      await unlink(filePath);
      res.status(200).json({ 
        message: "Document deleted successfully",
        deletedFile: filename
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: "File not found" });
      } else {
        throw error;
      }
    }

  } catch (error: any) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: error.message || "Failed to delete document" });
  }
}

