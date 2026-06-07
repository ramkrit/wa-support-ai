/**
 * PDF Loader — wa-support-ai
 *
 * Extracts text content from PDF file buffers using pdf-parse.
 *
 * @author ramkrit
 */
import { Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

const logger = new Logger('PdfLoader');

export interface PdfLoadResult {
  text: string;
  pageCount: number;
}

/**
 * Loads and extracts text from a PDF buffer.
 * Returns the full text content and page count.
 */
export async function loadPdf(buffer: Buffer): Promise<PdfLoadResult> {
  logger.debug('[wa-support-ai] Parsing PDF buffer...');

  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();

  logger.debug(
    `[wa-support-ai] PDF parsed — ${result.total} pages, ${result.text.length} chars extracted`,
  );

  return {
    text: result.text,
    pageCount: result.total,
  };
}
