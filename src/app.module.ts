import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { WaChannelModule } from './wa-channel/wa-channel.module';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { DocumentModule } from './document/document.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { DashboardController } from './frontend/dashboard.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    WaChannelModule,
    LlmModule,
    ChatModule,
    DocumentModule,
    EmbeddingModule,
  ],
  controllers: [DashboardController],
})
export class AppModule {}
