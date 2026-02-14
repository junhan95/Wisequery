import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type MessageContent = string | Array<{
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}>;

export async function* generateChatCompletionStream(
  messages: { role: string; content: MessageContent }[]
): AsyncGenerator<string, void, unknown> {
  const stream = await openai.chat.completions.create({
    model: "gpt-5",
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    max_completion_tokens: 8192,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Rewrite a user query into an optimized search query for better RAG retrieval.
 * Uses a lightweight model for cost efficiency.
 */
export async function rewriteQueryForSearch(originalQuery: string): Promise<{
  rewrittenQuery: string;
  searchKeywords: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a search query optimizer. Your task is to rewrite user queries into more effective search queries.

Rules:
1. Extract the core intent and key concepts
2. Remove filler words and conversational phrases
3. Add relevant synonyms or related terms in parentheses
4. Output keywords that would match relevant documents
5. Keep the query concise (3-10 essential words)
6. Handle both English and Korean queries

Output format (JSON):
{
  "rewrittenQuery": "optimized search query",
  "searchKeywords": ["keyword1", "keyword2", "keyword3"]
}

Examples:
Input: "What was the return policy we discussed last week?"
Output: {"rewrittenQuery": "return policy discussion", "searchKeywords": ["return", "policy", "refund", "exchange"]}

Input: "지난달에 김대리랑 미팅한 내용 뭐였지?"
Output: {"rewrittenQuery": "김대리 미팅 회의", "searchKeywords": ["김대리", "미팅", "회의", "회의록"]}

Input: "How do I configure the database connection settings?"
Output: {"rewrittenQuery": "database connection configuration settings", "searchKeywords": ["database", "connection", "config", "settings", "setup"]}`
        },
        {
          role: "user",
          content: originalQuery
        }
      ],
      max_tokens: 150,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        rewrittenQuery: parsed.rewrittenQuery || originalQuery,
        searchKeywords: parsed.searchKeywords || []
      };
    }
  } catch (error) {
    console.error("[Query Rewrite] Failed to rewrite query:", error);
  }
  
  // Fallback: return original query with basic keyword extraction
  return {
    rewrittenQuery: originalQuery,
    searchKeywords: originalQuery.split(/\s+/).filter(w => w.length > 2)
  };
}

/**
 * Calculate Reciprocal Rank Fusion (RRF) score for hybrid search.
 * Combines semantic and keyword search rankings.
 */
export function calculateRRFScore(
  semanticRank: number,
  keywordRank: number,
  semanticWeight: number = 0.7,
  keywordWeight: number = 0.3,
  k: number = 60
): number {
  const semanticScore = semanticRank > 0 ? 1 / (k + semanticRank) : 0;
  const keywordScore = keywordRank > 0 ? 1 / (k + keywordRank) : 0;
  return semanticWeight * semanticScore + keywordWeight * keywordScore;
}
