/**
 * EmbeddingController — wa-support-ai
 *
 * REST endpoints for managing embeddings:
 * - POST /embedding/process — embed all unprocessed chunks
 * - POST /embedding/query — embed a query text and return the vector
 * - GET /embedding/visualize — vector space visualization UI
 * - GET /embedding/visualize-data — raw data for the visualization
 *
 * @author ramkrit
 */
import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EmbeddingService } from './embedding.service';
import { DocumentChunk, DocumentChunkDocument } from '../database/schemas/document-chunk.schema';

/** Load visualization HTML pages at startup */
const visualizeHtml = readFileSync(join(__dirname, 'pages', 'vector-space.page.html'), 'utf-8');
const visualize3dHtml = readFileSync(join(__dirname, 'pages', 'vector-space-3d.page.html'), 'utf-8');

@ApiTags('embedding')
@Controller('embedding')
export class EmbeddingController {
  constructor(
    private readonly embeddingService: EmbeddingService,
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunkDocument>,
  ) {}

  /** Embed all unprocessed document chunks stored in MongoDB */
  @Post('process')
  @ApiOperation({ summary: 'Generate embeddings for all unprocessed chunks' })
  async processChunks() {
    const result = await this.embeddingService.embedUnprocessedChunks();
    return {
      message: 'Embedding complete',
      ...result,
    };
  }

  /** Embed a query string and return the vector (for testing/debugging) */
  @Post('query')
  @ApiOperation({ summary: 'Embed a text and return the vector' })
  async embedQuery(@Body('text') text: string) {
    const vector = await this.embeddingService.embedText(text);
    return {
      text,
      dimensions: vector.length,
      vector,
    };
  }

  /** Serves the vector space visualization UI (2D) */
  @Get('visualize')
  @ApiOperation({ summary: 'Vector space visualization — 2D PCA projection' })
  getVisualizePage(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(visualizeHtml);
  }

  /** Serves the vector space visualization UI (3D) */
  @Get('visualize-3d')
  @ApiOperation({ summary: 'Vector space visualization — 3D PCA projection with Three.js' })
  getVisualize3dPage(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(visualize3dHtml);
  }

  /** Returns embedded chunks data for the visualization (JSON) */
  @Get('visualize-data')
  @ApiOperation({ summary: 'Get embedded chunk data for visualization' })
  async getVisualizeData() {
    const chunks = await this.chunkModel
      .find({ embedding: { $exists: true, $not: { $size: 0 } } })
      .select('documentId filename content chunkIndex embedding')
      .lean()
      .exec();

    return {
      total: chunks.length,
      chunks: chunks.map((chunk) => ({
        documentId: chunk.documentId,
        filename: chunk.filename,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        embedding: chunk.embedding,
      })),
    };
  }
}
