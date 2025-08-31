import type { NextApiRequest, NextApiResponse } from "next";
import { loadVectorStore, loadMeta, loadDocsMap } from "../../lib/stores-enhanced.js";
import { z } from "zod";

const bodySchema = z.object({
  query: z.string().min(3),
  systemPrompt: z.string().min(10),
  k: z.number().default(8)
});

async function generateEnhanced(systemPrompt: string, query: string, contexts: any[]) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  
  console.log("Using Claude API with key length:", anthropicKey.length);
  
  const contextBlock = contexts.map((c, i) => 
    `### [${i+1}] ${c[0].metadata?.source || 'Unknown'} ${c[0].metadata?.pageSpan ? `(${c[0].metadata.pageSpan})` : ""} [${c[0].metadata?.tokens || 0} tokens]\n${c[0].pageContent}`
  ).join("\n\n");
  
  try {
    console.log("Making Claude API call...");
    
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [
          { role: "user", content: `${systemPrompt}\n\nUser question: ${query}\n\nUse only the following retrieved context. Cite like [#] matching the bracket numbers.\n\nContext:\n${contextBlock}` }
        ]
      })
    });
    
    console.log("Claude API response status:", r.status);
    
    if (!r.ok) {
      const errorText = await r.text();
      console.log("Claude API error:", r.status, errorText);
      throw new Error(`Claude API error: ${r.status}`);
    }
    
    const j = await r.json();
    const response = j.content?.[0]?.text || "";
    console.log("Claude API response received, length:", response.length);
    return response;
    
  } catch (error: any) {
    console.log("Claude API failed, using fallback:", error.message);
    
    // Simple fallback response
    const contextSummary = contexts.map((c, i) => {
      const source = c[0].metadata?.source || 'Unknown';
      return `[${i+1}] ${source}: ${c[0].pageContent.slice(0, 150)}...`;
    }).join('\n\n');

    return `Based on your question: "${query}"

Here are the relevant passages from your documents:

${contextSummary}

**Note:** This is a fallback response. Claude API call failed: ${error.message}`;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { query, systemPrompt, k } = bodySchema.parse(req.body);
    
    const vs = await loadVectorStore();
    const meta = loadMeta();
    
    // Get contexts using enhanced similarity search
    const contexts = await vs.similaritySearchWithScore(query, k);
    
    // Format contexts for response
    const formattedContexts = contexts.map(([doc, score]: [any, number]) => ({
      id: doc.metadata?.id || Math.random().toString(),
      text: doc.pageContent,
      meta: {
        source: doc.metadata?.source || 'Unknown',
        score: score.toFixed(3),
        tags: doc.metadata?.tags || [],
        pageSpan: doc.metadata?.pageSpan || '',
        chunkIndex: doc.metadata?.chunkIndex,
        totalChunks: doc.metadata?.totalChunks
      }
    }));
    
    // Check for insufficient corpus
    if (contexts.length < 2) {
      const insufficientResponse = `Insufficient corpus for query: "${query}"

**Available documents:** ${meta.length} total
**Relevant chunks found:** ${contexts.length}

**Recommendation:** Upload more documents related to this topic or try a different query.`;

      return res.status(200).json({
        answer: insufficientResponse,
        contexts: formattedContexts,
        totalDocuments: meta.length,
        searchResults: contexts.length,
        system: "enhanced",
        insufficient: true
      });
    }

    // Check if we have any contexts at all
    if (contexts.length === 0) {
      const noContextResponse = `No relevant content found for query: "${query}"

**Available documents:** ${meta.length} total
**Search results:** 0

**Possible issues:**
- Query doesn't match any document content
- Documents may not be properly indexed
- Try re-running ingestion with: npm run ingest

**Recommendation:** Check your documents and try a different query or re-index your documents.`;

      return res.status(200).json({
        answer: noContextResponse,
        contexts: [],
        totalDocuments: meta.length,
        searchResults: 0,
        system: "enhanced",
        insufficient: true,
        noContext: true
      });
    }

    // Generate answer using enhanced system
    const answer = await generateEnhanced(systemPrompt, query, contexts);
    
    res.status(200).json({ 
      answer, 
      contexts: formattedContexts,
      totalDocuments: meta.length,
      searchResults: contexts.length,
      system: "enhanced",
      insufficient: false
    });
  } catch (e: any) {
    console.error("API Error:", e);
    res.status(400).json({ error: e.message || "bad request" });
  }
}
