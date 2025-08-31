import fs from "fs";
import path from "path";
import { embed } from "./embeddings.js";
import { Document } from "langchain/document";

const DATA_DIR = "./data";
const VECTORS_PATH = path.join(DATA_DIR, "vectors.json");
const DOCS_PATH = path.join(DATA_DIR, "docs.json");
const BM25_PATH = path.join(DATA_DIR, "bm25.json");
const META_PATH = path.join(DATA_DIR, "meta.json");

function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

export async function saveVectorStore(docs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const texts = docs.map(d => d.pageContent);
  const vectors = await embed(texts);
  const ids = docs.map(d => d.metadata.id);
  fs.writeFileSync(VECTORS_PATH, JSON.stringify({ ids, vectors }));
  const docsMap = {};
  docs.forEach((d, i) => {
    docsMap[ids[i]] = { text: d.pageContent, metadata: d.metadata };
  });
  fs.writeFileSync(DOCS_PATH, JSON.stringify(docsMap));
}

export async function loadVectorStore() {
  const { ids, vectors } = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf-8"));
  const docsMap = JSON.parse(fs.readFileSync(DOCS_PATH, "utf-8"));
  return {
    async similaritySearchWithScore(query, k) {
      const q = (await embed([query]))[0];
      const scored = ids.map((id, idx) => ({
        id,
        score: cosSim(q, vectors[idx]),
        doc: { pageContent: docsMap[id].text, metadata: docsMap[id].metadata }
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map(s => [s.doc, 1 - s.score]);
    }
  };
}

export function buildBM25Index(docs) {
  // Disabled BM25 for now due to compatibility issues
  console.log("BM25 indexing disabled - using vector search only");
  return;
}

export function loadBM25Index() {
  // Return a dummy BM25 object that won't crash
  return {
    search: (query) => {
      console.log("BM25 search disabled - using vector search only");
      return [];
    }
  };
}

export function saveMeta(meta) {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

export function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function loadDocsMap() {
  return JSON.parse(fs.readFileSync(DOCS_PATH, "utf-8"));
}
