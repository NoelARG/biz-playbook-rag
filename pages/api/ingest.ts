import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Run the ingest script
    const { stdout, stderr } = await execAsync("npm run ingest", {
      cwd: process.cwd(),
    });

    if (stderr) {
      console.warn("Ingest stderr:", stderr);
    }

    res.status(200).json({
      message: "Documents ingested successfully",
      output: stdout
    });

  } catch (error: any) {
    console.error("Ingest error:", error);
    res.status(500).json({ error: error.message || "Ingestion failed" });
  }
}

