/**
 * DatabaseModule — wa-support-ai
 *
 * Configures MongoDB connection via Mongoose.
 * All other modules import this to access the database.
 *
 * @author ramkrit
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/wa_support_ai',
      }),
    }),
  ],
})
export class DatabaseModule {}
