import { ApiProperty } from '@nestjs/swagger';

/**
 * Request body for PUT /admin/users/:id/telegram-target.
 * `telegramBotId` must be an existing bot owned by the calling admin;
 * `null` resets the target to mock-server.
 */
export class SetTelegramTargetRequestDto {
  @ApiProperty({
    description:
      'ID of the Telegram bot to assign as active target, or null to reset to mock-server.',
    nullable: true,
    type: String,
  })
  telegramBotId: string | null;
}
