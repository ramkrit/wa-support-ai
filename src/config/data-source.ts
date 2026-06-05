import 'dotenv/config';
import { DataSource } from 'typeorm';
import { WhatsappGroupMessage } from '../database/entities/whatsapp-group-message.entity';

const migrations = __filename.endsWith('.ts')
  ? ['src/database/migrations/*.ts']
  : ['dist/database/migrations/*.js'];

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'wa_support_ai',
  entities: [WhatsappGroupMessage],
  migrations,
  synchronize: false,
});
