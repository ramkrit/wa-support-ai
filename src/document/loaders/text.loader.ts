/**
 * Text/CSV/Markdown Loader — wa-support-ai
 *
 * Handles plain text-based file formats. Since these are
 * already text, the "loading" is just decoding the buffer
 * with optional encoding detection.
 *
 * @author ramkrit
 */
import { Logger } from '@nestjs/common';

const logger = new Logger('TextLoader');

export interface TextLoadResult {
  text: string;
}

/**
 * Decodes a buffer as UTF-8 text.
 * Works for .txt, .csv, .md, and similar text formats.
 */
export function loadText(buffer: Buffer): TextLoadResult {
  const text = buffer.toString('utf-8');

  logger.debug(`[wa-support-ai] Text file loaded — ${text.length} chars`);

  return { text };
}
