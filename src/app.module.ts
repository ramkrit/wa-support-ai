import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WaChannelModule } from './wa-channel/wa-channel.module';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { DashboardController } from './frontend/dashboard.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    WaChannelModule,
    LlmModule,
    ChatModule,
  ],
  controllers: [DashboardController],
})
export class AppModule {}
