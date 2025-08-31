#!/usr/bin/env node

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import pdf from "pdf-parse";
import { saveVectorStore, checkDocumentStatus } from "../lib/stores-enhanced.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI argument parsing
const args = process.argv.slice(2);
const targetFile = args.find(arg => arg.startsWith('--file='))?.split('=')[1];
const tags = args.find(arg => arg.startsWith('--tags='))?.split('=')[1]?.split(',');

console.log("🚀 Enhanced RAG Ingestion Script");
console.log("=================================");

if (targetFile) {
  console.log(`📁 Processing single file: ${targetFile}`);
  console.log(`🏷️  Tags: ${tags?.join(', ') || 'auto-detected'}`);
} else {
  console.log("📚 Processing all documents in ./docs");
}

// Check document status first
console.log("\n🔍 Checking document status...");
const status = checkDocumentStatus("./docs");

if (status) {
  console.log(`✅ Unchanged: ${status.unchanged.length}`);
  console.log(`🔄 Modified: ${status.modified.length}`);
  console.log(`🆕 New: ${status.new.length}`);
  console.log(`🗑️  Deleted: ${status.deleted.length}`);
}

// Determine which files to process
let filesToProcess = [];
if (targetFile) {
  // Single file mode
  if (status?.new.includes(targetFile) || status?.modified.includes(targetFile)) {
    filesToProcess = [targetFile];
  } else if (status?.unchanged.includes(targetFile)) {
    console.log(`✅ ${targetFile} is unchanged, skipping ingestion`);
    process.exit(0);
  } else {
    console.log(`❌ File ${targetFile} not found in ./docs`);
    process.exit(1);
  }
} else {
  // Full ingestion mode
  filesToProcess = [...(status?.new || []), ...(status?.modified || [])];
  
  if (filesToProcess.length === 0) {
    console.log("✅ All documents are up to date!");
    process.exit(0);
  }
}

console.log(`\n📖 Processing ${filesToProcess.length} document(s)...`);

// Process documents
const documents = [];

for (const filename of filesToProcess) {
  console.log(`\n📄 Processing: ${filename}`);
  
  try {
    const filePath = join(__dirname, "..", "docs", filename);
    let content = "";
    
    if (filename.endsWith('.pdf')) {
      const dataBuffer = readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      content = pdfData.text;
      console.log(`   📊 PDF parsed: ${pdfData.numpages} pages, ${content.length} characters`);
    } else {
      content = readFileSync(filePath, 'utf-8');
      console.log(`   📝 Text loaded: ${content.length} characters`);
    }
    
    // Auto-detect tags if not provided
    let detectedTags = tags || [];
    if (detectedTags.length === 0) {
      detectedTags = inferTags(content, filename);
    }
    
    documents.push({
      pageContent: content,
      metadata: {
        source: filename,
        tags: detectedTags,
        section: "",
        checksum: ""
      }
    });
    
    console.log(`   ✅ Added to processing queue`);
    
  } catch (error) {
    console.error(`   ❌ Error processing ${filename}:`, error.message);
  }
}

if (documents.length === 0) {
  console.log("❌ No documents to process");
  process.exit(1);
}

// Process all documents together
console.log(`\n🧠 Generating embeddings and saving to vector store...`);
try {
  const processed = await saveVectorStore(documents);
  console.log(`✅ Successfully processed ${processed.length} chunks from ${documents.length} documents`);
  
  // Show final status
  const finalStatus = checkDocumentStatus("./docs");
  if (finalStatus) {
    console.log(`\n📊 Final Status:`);
    console.log(`   Total chunks: ${finalStatus.unchanged.length + finalStatus.modified.length + finalStatus.new.length}`);
    console.log(`   Sources: ${Object.keys(finalStatus.sourceBreakdown || {}).length}`);
  }
  
} catch (error) {
  console.error("❌ Failed to save vector store:", error.message);
  process.exit(1);
}

// Helper function to infer tags from content
function inferTags(content, filename) {
  const tags = [];
  const lowerContent = content.toLowerCase();
  const lowerFilename = filename.toLowerCase();
  
  // Business-related tags
  if (lowerContent.includes('pricing') || lowerFilename.includes('pricing')) tags.push('pricing');
  if (lowerContent.includes('retention') || lowerFilename.includes('retention')) tags.push('retention');
  if (lowerContent.includes('offer') || lowerFilename.includes('offer')) tags.push('offers');
  if (lowerContent.includes('conversion') || lowerFilename.includes('conversion')) tags.push('conversion');
  if (lowerContent.includes('playbook') || lowerFilename.includes('playbook')) tags.push('playbook');
  if (lowerContent.includes('strategy') || lowerFilename.includes('strategy')) tags.push('strategy');
  if (lowerContent.includes('marketing') || lowerFilename.includes('marketing')) tags.push('marketing');
  if (lowerContent.includes('sales') || lowerFilename.includes('sales')) tags.push('sales');
  
  // Document type tags
  if (filename.endsWith('.pdf')) tags.push('pdf');
  if (filename.endsWith('.txt')) tags.push('text');
  if (filename.endsWith('.md')) tags.push('markdown');
  
  return tags.length > 0 ? tags : ['business', 'document'];
}

