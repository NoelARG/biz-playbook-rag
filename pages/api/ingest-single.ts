import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: "Filename is required" });
    }

    // Check if file exists
    const filePath = path.join(process.cwd(), "docs", filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

         // Run ingestion for this specific file using enhanced script
     const { stdout, stderr } = await execAsync(`npm run ingest:file -- "${filename}"`, {
       cwd: process.cwd(),
     });

    if (stderr) {
      console.warn("Ingest stderr:", stderr);
    }

    res.status(200).json({
      message: `Document ${filename} processed successfully`,
      output: stdout
    });

  } catch (error: any) {
    console.error("Single document ingest error:", error);
    res.status(500).json({ error: error.message || "Ingestion failed" });
  }
}
