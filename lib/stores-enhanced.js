import fs from "fs";
import path from "path";
import crypto from "crypto";
import { embed } from "./embeddings.js";
import { Document } from "langchain/document";
import { encodingForModel } from "js-tiktoken";

const DATA_DIR = "./data";
const VECTORS_PATH = path.join(DATA_DIR, "vectors.json");
const DOCS_PATH = path.join(DATA_DIR, "docs.json");
const META_PATH = path.join(DATA_DIR, "meta.json");

// Enhanced text chunking with true token counting
const enc = encodingForModel("gpt-4o-mini");

function countTokens(text) {
  return enc.encode(text).length;
}

function calculateChecksum(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function chunkTextEnhanced(text, maxTokens = 800, overlapTokens = 120) {
  // Split by paragraphs first, then by sentences
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    if (paragraph.trim().length === 0) continue;

    const sentences = paragraph.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.trim().length === 0) continue;

      // True token count
      const sentenceTokens = countTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentChunk.trim(),
          start: chunks.length,
          end: chunks.length + 1,
          tokens: currentTokens
        });

        // Start new chunk with overlap
        const overlapText = currentChunk.slice(-overlapTokens * 4);
        currentChunk = overlapText + sentence + ". ";
        currentTokens = countTokens(overlapText) + sentenceTokens;
      } else {
        currentChunk += sentence + ". ";
        currentTokens += sentenceTokens;
      }
    }

    // Add paragraph break
    currentChunk += "\n\n";
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      start: chunks.length,
      end: chunks.length + 1,
      tokens: currentTokens
    });
  }

  return chunks;
}

// Enhanced similarity search with multiple strategies
function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// BM25-like scoring for text relevance
function calculateTextRelevance(query, text) {
  const queryWords = query.toLowerCase().split(/\s+/);
  const textWords = text.toLowerCase().split(/\s+/);
  
  let score = 0;
  for (const word of queryWords) {
    if (word.length < 3) continue; // Skip short words
    
    const wordCount = textWords.filter(w => w.includes(word)).length;
    const textLength = textWords.length;
    
    if (wordCount > 0) {
      // TF-IDF inspired scoring
      score += (wordCount / textLength) * Math.log(1 + textLength / wordCount);
    }
  }
  
  return score;
}

export async function saveVectorStore(docs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  
  const processedDocs = [];
  let idCounter = 0;
  
  for (const doc of docs) {
    // Use enhanced chunking
    const chunks = chunkTextEnhanced(doc.pageContent, 800, 120);
    
    chunks.forEach((chunk, i) => {
      const id = `${++idCounter}`;
      const meta = {
        id,
        source: doc.metadata.source,
        pageSpan: `Chunk ${i + 1}/${chunks.length}`,
        section: doc.metadata.section || "",
        tags: doc.metadata.tags || [],
        version: "v3",
        chunkIndex: i,
        totalChunks: chunks.length,
        originalLength: doc.pageContent.length,
        tokens: chunk.tokens || 0,
        dateIngested: new Date().toISOString(),
        checksum: calculateChecksum(doc.pageContent)
      };
      
      processedDocs.push(new Document({ pageContent: chunk.text, metadata: meta }));
    });
  }
  
  // Generate embeddings for all chunks
  const texts = processedDocs.map(d => d.pageContent);
  const vectors = await embed(texts);
  const ids = processedDocs.map(d => d.metadata.id);
  
  // Save vectors
  fs.writeFileSync(VECTORS_PATH, JSON.stringify({ ids, vectors }));
  
  // Save documents
  const docsMap = {};
  processedDocs.forEach((d, i) => {
    docsMap[ids[i]] = { 
      text: d.pageContent, 
      metadata: d.metadata,
      vector: vectors[i]
    };
  });
  fs.writeFileSync(DOCS_PATH, JSON.stringify(docsMap));
  
  // Save metadata
  const meta = processedDocs.map(d => d.metadata);
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  
  console.log(`Enhanced processing: ${processedDocs.length} chunks from ${docs.length} documents`);
  return processedDocs;
}

export async function loadVectorStore() {
  const { ids, vectors } = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf-8"));
  const docsMap = JSON.parse(fs.readFileSync(DOCS_PATH, "utf-8"));
  
  return {
    async similaritySearchWithScore(query, k) {
      const q = (await embed([query]))[0];
      
      // Calculate scores for all documents
      const scores = ids.map((id, idx) => {
        const vectorScore = cosSim(q, vectors[idx]);
        const textScore = calculateTextRelevance(query, docsMap[id].text);
        return { id, idx, vectorScore, textScore };
      });

      // Find min/max for normalization
      const vectorScores = scores.map(s => s.vectorScore);
      const textScores = scores.map(s => s.textScore);
      const minVec = Math.min(...vectorScores);
      const maxVec = Math.max(...vectorScores);
      const minTxt = Math.min(...textScores);
      const maxTxt = Math.max(...textScores);

      // Normalize and combine scores
      const scored = scores.map(s => {
        const normVec = (s.vectorScore - minVec) / (maxVec - minVec + 1e-9);
        const normTxt = (s.textScore - minTxt) / (maxTxt - minTxt + 1e-9);
        const combinedScore = (normVec * 0.7) + (normTxt * 0.3);

        return {
          id: s.id,
          score: combinedScore,
          doc: {
            pageContent: docsMap[s.id].text,
            metadata: docsMap[s.id].metadata
          }
        };
      });
      
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map(s => [s.doc, 1 - s.score]);
    }
  };
}

export function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function saveMeta(meta) {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

export function loadDocsMap() {
  return JSON.parse(fs.readFileSync(DOCS_PATH, "utf-8"));
}

// Enhanced document analysis
export function analyzeDocuments() {
  try {
    const meta = loadMeta();
    const docsMap = loadDocsMap();
    
    const analysis = {
      totalDocuments: meta.length,
      sources: [...new Set(meta.map(m => m.source))],
      totalChunks: meta.length,
      averageChunkSize: 0,
      tags: {},
      sourceBreakdown: {},
      needsReingestion: []
    };
    
    // Calculate statistics
    let totalTextLength = 0;
    meta.forEach(m => {
      totalTextLength += docsMap[m.id]?.text?.length || 0;
      
      // Count tags
      (m.tags || []).forEach(tag => {
        analysis.tags[tag] = (analysis.tags[tag] || 0) + 1;
      });
      
      // Count sources
      analysis.sourceBreakdown[m.source] = (analysis.sourceBreakdown[m.source] || 0) + 1;
    });
    
    analysis.averageChunkSize = Math.round(totalTextLength / meta.length);
    
    return analysis;
  } catch (error) {
    console.error("Document analysis failed:", error);
    return null;
  }
}

// Check which documents need re-ingestion
export function checkDocumentStatus(docsDir = "./docs") {
  try {
    const meta = loadMeta();
    const existingDocs = new Map();
    
    // Group existing chunks by source
    meta.forEach(m => {
      if (!existingDocs.has(m.source)) {
        existingDocs.set(m.source, {
          chunks: [],
          checksums: new Set(),
          lastIngested: m.dateIngested
        });
      }
      existingDocs.get(m.source).chunks.push(m);
      existingDocs.get(m.source).checksums.add(m.checksum);
    });

    // Check current files
    const files = fs.readdirSync(docsDir).filter(f => 
      f.endsWith('.pdf') || f.endsWith('.txt') || f.endsWith('.md')
    );

    const status = {
      unchanged: [],
      modified: [],
      new: [],
      deleted: []
    };

    files.forEach(filename => {
      try {
        const filePath = path.join(docsDir, filename);
        
        // Handle different file types
        let content = "";
        if (filename.endsWith('.pdf')) {
          // For PDFs, we'll use file size and modification time as a simple checksum
          const stats = fs.statSync(filePath);
          content = `${filename}-${stats.size}-${stats.mtime.getTime()}`;
        } else {
          // For text files, read content and calculate checksum
          content = fs.readFileSync(filePath, 'utf-8');
        }
        
        const currentChecksum = calculateChecksum(content);
        
        if (existingDocs.has(filename)) {
          const existing = existingDocs.get(filename);
          if (existing.checksums.has(currentChecksum)) {
            status.unchanged.push(filename);
          } else {
            status.modified.push(filename);
          }
        } else {
          status.new.push(filename);
        }
      } catch (error) {
        console.warn(`Warning: Could not process ${filename}:`, error.message);
        // Add to modified so it gets processed
        status.modified.push(filename);
      }
    });

    // Check for deleted files
    existingDocs.forEach((_, filename) => {
      if (!files.includes(filename)) {
        status.deleted.push(filename);
      }
    });

    return status;
  } catch (error) {
    console.error("Document status check failed:", error);
    return null;
  }
}

