import fs from "fs";
import path from "path";
import { Document } from "langchain/document";
import { saveVectorStore } from "../lib/stores-langchain.js";

const DOCS_DIR = "./docs";

function inferTags(name) {
  const s = name.toLowerCase();
  const tags = [];
  if (s.includes("pricing")) tags.push("pricing");
  if (s.includes("retention")) tags.push("retention");
  if (s.includes("money") || s.includes("offer")) tags.push("offer");
  if (s.includes("playbook")) tags.push("playbook");
  if (s.includes("strategy")) tags.push("strategy");
  if (s.includes("business")) tags.push("business");
  if (s.includes("sales")) tags.push("sales");
  if (s.includes("marketing")) tags.push("marketing");
  return tags;
}

async function readFileFull(fp) {
  const ext = path.extname(fp).toLowerCase();
  
  if (ext === ".pdf") {
    try {
      // Use pdf-parse for PDF files
      const pdf = await import("pdf-parse");
      const dataBuffer = fs.readFileSync(fp);
      const data = await pdf.default(dataBuffer);
      return data.text;
    } catch (error) {
      console.error(`Error processing PDF ${fp}:`, error.message);
      return null;
    }
  } else if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(fp, "utf-8");
  }
  
  return null; // Skip unsupported file types
}

async function run() {
  const files = fs.readdirSync(DOCS_DIR).filter(f => /\.(pdf|txt|md)$/i.test(f));
  const docs = [];
  let idCounter = 0;

  console.log(`Found ${files.length} files to process:`, files);

  for (const f of files) {
    const full = path.join(DOCS_DIR, f);
    console.log(`Processing: ${f}`);
    
    const raw = await readFileFull(full);
    if (raw) {
      console.log(`Successfully read ${f}, length: ${raw.length} characters`);
      
      // Create a single document - the text splitter will handle chunking
      const meta = { 
        id: `${++idCounter}`,
        source: f,
        pageSpan: "", 
        section: "", 
        tags: inferTags(f), 
        version: "v2",
        originalLength: raw.length
      };
      
      docs.push(new Document({ pageContent: raw, metadata: meta }));
    } else {
      console.log(`Failed to process ${f}`);
    }
  }

  if (docs.length > 0) {
    console.log(`Processing ${docs.length} documents with LangChain...`);
    try {
      await saveVectorStore(docs);
      console.log(`Successfully ingested documents using LangChain.`);
    } catch (error) {
      console.error("Error during LangChain processing:", error);
      console.log("Falling back to simple processing...");
      
      // Fallback: create simple chunks
      const simpleDocs = [];
      docs.forEach(doc => {
        const chunks = doc.pageContent.match(/.{1,800}/g) || [];
        chunks.forEach((chunk, i) => {
          simpleDocs.push(new Document({
            pageContent: chunk,
            metadata: {
              ...doc.metadata,
              chunkIndex: i,
              totalChunks: chunks.length
            }
          }));
        });
      });
      
      console.log(`Created ${simpleDocs.length} simple chunks as fallback.`);
    }
  } else {
    console.log("No documents were successfully processed.");
  }
}

run().catch(console.error);

