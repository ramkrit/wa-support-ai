/**
 * ChunkingService — wa-support-ai
 *
 * Splits document text into smaller chunks suitable for
 * vector embedding. Supports configurable chunk size and overlap
 * to maintain context across chunk boundaries.
 *
 * @author ramkrit
 */
import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface ChunkingOptions {
  /** Maximum characters per chunk (default: 500) */
  chunkSize?: number;
  /** Overlap between consecutive chunks to preserve context (default: 50) */
  chunkOverlap?: number;
  /** Separators to split on, in priority order */
  separators?: string[];
}

export interface TextChunk {
  content: string;
  index: number;
  startOffset: number;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  /**
   * Splits text into chunks using recursive character splitting.
   * This strategy tries to split on paragraphs first, then sentences,
   * then words — keeping chunks as semantically coherent as possible.
   */
  async chunkText(text: string, options: ChunkingOptions = {}): Promise<TextChunk[]> {
    const {
      chunkSize = 1000,
      chunkOverlap = 150,
      separators = ['\n\n', '\n', '. ', ' ', ''],
    } = options;

    if (!text || text.trim().length === 0) {
      this.logger.warn('[wa-support-ai] Empty text passed to chunking — returning empty array');
      return [];
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators,
    });

    const docs = await splitter.createDocuments([text]);

    const chunks: TextChunk[] = docs.map((doc, index) => ({
      content: doc.pageContent,
      index,
      startOffset: text.indexOf(doc.pageContent),
    }));

    this.logger.debug(
      `[wa-support-ai] Chunked text into ${chunks.length} pieces (size=${chunkSize}, overlap=${chunkOverlap})`,
    );

    return chunks;
  }

  /**
   * Estimates how many chunks a text will produce without actually splitting.
   * Useful for giving users feedback before processing large documents.
   */
  estimateChunkCount(textLength: number, chunkSize = 500, chunkOverlap = 50): number {
    if (textLength <= chunkSize) return 1;
    return Math.ceil((textLength - chunkOverlap) / (chunkSize - chunkOverlap));
  }
}
