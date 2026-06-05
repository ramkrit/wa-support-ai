import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WaChannelModule } from './wa-channel/wa-channel.module';
import { DashboardController } from './frontend/dashboard.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    WaChannelModule,
  ],
  controllers: [DashboardController],
})
export class AppModule {}
