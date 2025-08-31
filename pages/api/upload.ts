import type { NextApiRequest, NextApiResponse } from "next";
import { writeFile, mkdir, copyFile, unlink } from "fs/promises";
import { join } from "path";
import formidable from "formidable";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Create temp directory if it doesn't exist
    const tempDir = join(process.cwd(), "temp");
    await mkdir(tempDir, { recursive: true });

    const form = formidable({
      uploadDir: tempDir,
      keepExtensions: true,
      maxFiles: 10,
      maxFileSize: 100 * 1024 * 1024, // 100MB limit
      maxTotalFileSize: 500 * 1024 * 1024, // 500MB total limit
    });

    const [fields, files] = await form.parse(req);
    
    if (!files.files || files.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files];
    const results = [];

    for (const file of uploadedFiles) {
      if (file.filepath && file.originalFilename) {
        const fileName = file.originalFilename;
        const filePath = join(process.cwd(), "docs", fileName);
        
        // Ensure docs directory exists
        await mkdir(join(process.cwd(), "docs"), { recursive: true });
        
        // Copy file to docs directory with original name
        await copyFile(file.filepath, filePath);
        
        // Clean up temp file
        await unlink(file.filepath);
        
        results.push({
          name: fileName,
          size: file.size,
          status: "uploaded"
        });
      }
    }

    res.status(200).json({ 
      message: "Files uploaded successfully", 
      files: results 
    });

  } catch (error: any) {
    console.error("Upload error:", error);
    
    // Provide more specific error messages
    let errorMessage = "Upload failed";
    if (error.code === 1009) {
      errorMessage = "File too large. Maximum file size is 50MB.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ error: errorMessage });
  }
}

