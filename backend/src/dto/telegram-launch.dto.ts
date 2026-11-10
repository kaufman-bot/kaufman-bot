import { ApiProperty } from '@nestjs/swagger';

/**
 * Response body for POST /telegram/launch. Returns the deep-link URL
 * the user opens in a browser to start the conversation with the bot,
 * plus the one-time binding token embedded in that link.
 */
export class TelegramLaunchDto {
  @ApiProperty({
    description:
      'Absolute t.me deep-link URL with the start-token (scheme included so ' +
      'window.open resolves it as an external link, not a relative path)',
    example: 'https://t.me/my_support_bot?start=abc123def456',
  })
  url: string;

  @ApiProperty({
    description: 'One-time binding token embedded in the URL',
  })
  token: string;

  constructor(partial: Partial<TelegramLaunchDto> = {}) {
    Object.assign(this, partial);
  }
}
