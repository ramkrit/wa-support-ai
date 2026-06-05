import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWhatsappGroupMessages1690000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tp_whatsapp_group_messages',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'group_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'received_number',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'message_body',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'image',
            type: 'longtext',
            isNullable: true,
          },
          {
            name: 'input_data',
            type: 'json',
            isNullable: false,
          },
          {
            name: 'added_date',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tp_whatsapp_group_messages');
  }
}
