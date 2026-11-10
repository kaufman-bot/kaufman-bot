import { ApiProperty } from '@nestjs/swagger';

/**
 * A single inline keyboard button attached to a bot message or stored
 * inside a preset. `title` is the visible label; `callbackData` is the
 * payload that the server receives when the user presses the button
 * (mirrors Telegram's `InlineKeyboardButton.text` / `callback_data`).
 *
 * Liveness rules (length limits, non-empty) are enforced in the services
 * through `validateButtons`; the `maxLength` Swagger hints here are only
 * for SDK consumers and Swagger UI.
 */
export class KeyboardButtonDto {
  @ApiProperty({
    description: 'Visible label shown on the button',
    maxLength: 64,
    example: 'Да',
  })
  title: string;

  @ApiProperty({
    description:
      'Opaque payload sent back to the server when the button is pressed',
    maxLength: 256,
    example: 'confirm:order:42',
  })
  callbackData: string;

  constructor(partial: Partial<KeyboardButtonDto> = {}) {
    Object.assign(this, partial);
  }
}
