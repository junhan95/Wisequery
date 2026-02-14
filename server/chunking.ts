export interface ChunkResult {
  content: string;
  tokenCount: number;
  chunkIndex: number;
  metadata: {
    startChar: number;
    endChar: number;
  };
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const CHARS_PER_TOKEN = 4;

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function findSentenceBoundary(text: string, targetIndex: number, direction: 'before' | 'after'): number {
  const sentenceEnders = /[.!?。！？]\s*/g;
  let lastBoundary = 0;
  let match;
  
  while ((match = sentenceEnders.exec(text)) !== null) {
    const boundaryEnd = match.index + match[0].length;
    
    if (direction === 'before') {
      if (boundaryEnd <= targetIndex) {
        lastBoundary = boundaryEnd;
      } else {
        break;
      }
    } else {
      if (boundaryEnd >= targetIndex) {
        return boundaryEnd;
      }
    }
  }
  
  return direction === 'before' ? lastBoundary : text.length;
}

function findParagraphBoundary(text: string, targetIndex: number): number {
  const paragraphBreak = /\n\s*\n/g;
  let lastBoundary = 0;
  let match;
  
  while ((match = paragraphBreak.exec(text)) !== null) {
    if (match.index <= targetIndex) {
      lastBoundary = match.index + match[0].length;
    } else {
      break;
    }
  }
  
  return lastBoundary;
}

export function chunkText(text: string): ChunkResult[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const cleanedText = text.replace(/\r\n/g, '\n').trim();
  const targetChunkChars = CHUNK_SIZE * CHARS_PER_TOKEN;
  const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;
  
  const chunks: ChunkResult[] = [];
  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < cleanedText.length) {
    let endPos = Math.min(currentPos + targetChunkChars, cleanedText.length);
    
    if (endPos < cleanedText.length) {
      // Safely slice with bounds checking
      const lookAheadEnd = Math.min(endPos + 200, cleanedText.length);
      const paragraphBoundary = findParagraphBoundary(cleanedText.slice(currentPos, lookAheadEnd), targetChunkChars);
      if (paragraphBoundary > targetChunkChars * 0.5) {
        endPos = Math.min(currentPos + paragraphBoundary, cleanedText.length);
      } else {
        const sentenceLookAhead = Math.min(endPos + 100, cleanedText.length);
        const sentenceBoundary = findSentenceBoundary(cleanedText.slice(currentPos, sentenceLookAhead), targetChunkChars, 'after');
        if (sentenceBoundary > targetChunkChars * 0.5 && sentenceBoundary < targetChunkChars * 1.5) {
          endPos = Math.min(currentPos + sentenceBoundary, cleanedText.length);
        }
      }
    }

    // Ensure endPos is within bounds
    endPos = Math.min(endPos, cleanedText.length);
    const chunkContent = cleanedText.slice(currentPos, endPos).trim();
    
    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        tokenCount: estimateTokenCount(chunkContent),
        chunkIndex,
        metadata: {
          startChar: currentPos,
          endChar: endPos,
        },
      });
      chunkIndex++;
    }

    // Calculate next position with overlap, but ensure forward progress
    const nextPos = endPos - overlapChars;
    if (nextPos <= currentPos || (cleanedText.length - endPos) < overlapChars) {
      // Skip overlap if chunk is too small or we're near the end
      currentPos = endPos;
    } else {
      currentPos = nextPos;
    }
    
    if (currentPos >= cleanedText.length) {
      break;
    }
  }

  return chunks;
}

export function shouldChunkContent(content: string | null | undefined): boolean {
  if (!content) return false;
  const tokenCount = estimateTokenCount(content);
  return tokenCount > CHUNK_SIZE;
}
