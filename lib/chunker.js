import { encodingForModel } from "js-tiktoken";
const enc = encodingForModel("gpt-4o-mini");

export function chunkText(text, maxTokens = 800, overlapTokens = 120) {
  const ids = enc.encode(text);
  const chunks = [];
  for (let start = 0; start < ids.length; start += (maxTokens - overlapTokens)) {
    const end = Math.min(start + maxTokens, ids.length);
    const sub = ids.slice(start, end);
    chunks.push({ text: enc.decode(sub), start, end });
    if (end === ids.length) break;
  }
  return chunks;
}

