import { Module } from '@nestjs/common';
import { WaChannelService } from './wa-channel.service';
import { WaChannelController } from './wa-channel.controller';

@Module({
  controllers: [WaChannelController],
  providers: [WaChannelService],
  exports: [WaChannelService],
})
export class WaChannelModule {}
