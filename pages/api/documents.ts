import type { NextApiRequest, NextApiResponse } from "next";
import { readdir, stat } from "fs/promises";
import { join } from "path";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const docsDir = join(process.cwd(), "docs");
    
    try {
      const files = await readdir(docsDir);
      const documents = [];

      for (const file of files) {
        if (file.startsWith('.')) continue; // Skip hidden files
        
        const filePath = join(docsDir, file);
        const stats = await stat(filePath);
        
        if (stats.isFile()) {
          const ext = file.split('.').pop()?.toLowerCase();
          const sizeInKB = Math.round(stats.size / 1024);
          
          documents.push({
            name: file,
            size: `${sizeInKB} KB`,
            type: ext || 'unknown',
            uploaded: stats.mtime.toLocaleDateString(),
            path: file
          });
        }
      }

      // Sort by upload date (newest first)
      documents.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());

      res.status(200).json({ 
        documents,
        total: documents.length,
        message: "Documents retrieved successfully"
      });

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Docs directory doesn't exist yet
        res.status(200).json({ 
          documents: [],
          total: 0,
          message: "No documents directory found"
        });
      } else {
        throw error;
      }
    }

  } catch (error: any) {
    console.error("Documents error:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve documents" });
  }
}

