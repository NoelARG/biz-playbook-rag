import fs from "fs";
import path from "path";
import { Document } from "langchain/document";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RetrievalQAChain } from "langchain/chains";
import { Ollama } from "@langchain/community/llms/ollama";

const DATA_DIR = "./data";
const CHROMA_DIR = path.join(DATA_DIR, "chroma");
const META_PATH = path.join(DATA_DIR, "meta.json");

let vectorStore = null;
let qaChain = null;

// Initialize embeddings
const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: "Xenova/all-MiniLM-L6-v2",
});

// Initialize text splitter with better chunking strategy
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", " ", ""],
});

export async function saveVectorStore(docs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  
  // Process documents with better chunking
  const processedDocs = [];
  for (const doc of docs) {
    const chunks = await textSplitter.splitText(doc.pageContent);
    chunks.forEach((chunk, index) => {
      processedDocs.push(
        new Document({
          pageContent: chunk,
          metadata: {
            ...doc.metadata,
            chunkIndex: index,
            totalChunks: chunks.length,
          },
        })
      );
    });
  }

  // Create ChromaDB vector store
  vectorStore = await Chroma.fromDocuments(processedDocs, embeddings, {
    collectionName: "business_playbook",
    collectionMetadata: {
      "hnsw:space": "cosine",
    },
  });

  // Save metadata
  const meta = processedDocs.map((doc, i) => ({
    id: i.toString(),
    source: doc.metadata.source,
    chunkIndex: doc.metadata.chunkIndex,
    totalChunks: doc.metadata.totalChunks,
    tags: doc.metadata.tags || [],
    version: "v2",
  }));
  
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
  
  console.log(`Saved ${processedDocs.length} chunks to ChromaDB`);
  return processedDocs;
}

export async function loadVectorStore() {
  if (!vectorStore) {
    try {
      // Try to load existing ChromaDB
      vectorStore = await Chroma.fromExistingCollection(embeddings, {
        collectionName: "business_playbook",
        collectionMetadata: {
          "hnsw:space": "cosine",
        },
      });
      console.log("Loaded existing ChromaDB collection");
    } catch (error) {
      console.log("No existing ChromaDB found, creating new one");
      vectorStore = await Chroma.fromDocuments([], embeddings, {
        collectionName: "business_playbook",
        collectionMetadata: {
          "hnsw:space": "cosine",
        },
      });
    }
  }
  
  return vectorStore;
}

export async function createQAChain() {
  if (!qaChain) {
    const vs = await loadVectorStore();
    
    // Initialize Ollama LLM
    const llm = new Ollama({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      temperature: 0.1,
    });

    // Create retrieval QA chain
    qaChain = RetrievalQAChain.fromLLM(llm, vs.asRetriever({
      searchType: "similarity",
      searchKwargs: { k: 8 },
    }));

    console.log("Created QA chain with Ollama");
  }
  
  return qaChain;
}

export async function similaritySearch(query, k = 8) {
  const vs = await loadVectorStore();
  return await vs.similaritySearch(query, k);
}

export async function similaritySearchWithScore(query, k = 8) {
  const vs = await loadVectorStore();
  return await vs.similaritySearchWithScore(query, k);
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

// Cleanup function
export async function cleanup() {
  if (vectorStore) {
    await vectorStore.deleteCollection();
    vectorStore = null;
  }
  qaChain = null;
}

