import { pipeline } from "@xenova/transformers";

let embedder;

export async function getEmbeddings() {
  if (!embedder) embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return embedder;
}

export async function embed(texts) {
  const e = await getEmbeddings();
  const out = [];
  for (const t of texts) {
    const v = await e(t, { pooling: "mean", normalize: true });
    out.push(Array.from(v.data));
  }
  return out;
}

