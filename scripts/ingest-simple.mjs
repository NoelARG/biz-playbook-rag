import fs from "fs";
import path from "path";
import { Document } from "langchain/document";
import { chunkText } from "../lib/chunker.js";
import { saveVectorStore, buildBM25Index, saveMeta } from "../lib/stores.js";

const DOCS_DIR = "./docs";
const META = [];

function inferTags(name) {
  const s = name.toLowerCase();
  const tags = [];
  if (s.includes("pricing")) tags.push("pricing");
  if (s.includes("retention")) tags.push("retention");
  if (s.includes("money") || s.includes("offer")) tags.push("offer");
  if (s.includes("playbook")) tags.push("playbook");
  if (s.includes("strategy")) tags.push("strategy");
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
      const chunks = chunkText(raw, 800, 120);
      console.log(`Created ${chunks.length} chunks from ${f}`);
      
      chunks.forEach((c, i) => {
        const id = `${++idCounter}`;
        const meta = { 
          id, 
          source: f, // Use original filename
          pageSpan: "", 
          section: "", 
          tags: inferTags(f), 
          version: "v1" 
        };
        META.push(meta);
        docs.push(new Document({ pageContent: c.text, metadata: meta }));
      });
    } else {
      console.log(`Failed to process ${f}`);
    }
  }

  if (docs.length > 0) {
    console.log(`Saving ${docs.length} document chunks...`);
    await saveVectorStore(docs);
    buildBM25Index(docs);
    saveMeta(META);
    console.log(`Successfully ingested ${docs.length} chunks from ${files.length} files.`);
  } else {
    console.log("No documents were successfully processed.");
  }
}

run().catch(console.error);

