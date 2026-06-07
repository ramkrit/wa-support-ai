/**
 * DocumentController — wa-support-ai
 *
 * REST endpoints for document ingestion and management:
 * - POST /document/upload — upload and ingest a document
 * - GET /document — list all ingested documents
 * - GET /document/:id/chunks — get chunks for a document
 * - DELETE /document/:id — remove a document
 *
 * @author ramkrit
 */
import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DocumentService } from './document.service';

@ApiTags('document')
@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  /** Upload and ingest a document into the RAG knowledge base */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document for RAG ingestion (PDF, TXT, CSV, MD)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    return this.documentService.ingest(file);
  }

  /** List all ingested documents */
  @Get()
  @ApiOperation({ summary: 'List all ingested documents' })
  listDocuments() {
    return this.documentService.listDocuments();
  }

  /** Get chunks for a specific document */
  @Get(':id/chunks')
  @ApiOperation({ summary: 'Get chunks for a specific document' })
  getChunks(@Param('id') id: string) {
    return this.documentService.getChunks(id);
  }

  /** Delete a document and its chunks */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document from the knowledge base' })
  deleteDocument(@Param('id') id: string) {
    this.documentService.deleteDocument(id);
    return { success: true, message: `Document ${id} deleted` };
  }
}
