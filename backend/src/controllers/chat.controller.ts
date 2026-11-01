import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { X_API_KEY } from '../constants/api-key.constants.js';
import {
  ChatMessageDto,
  ChatStreamEventDto,
  SendMessageRequestDto,
} from '../dto/chat.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import type { AuthenticatedRequest } from '../guards/api-key.guard.js';
import { ApiKeyGuard, requireAuthUser } from '../guards/api-key.guard.js';
import { SseMessageEvent } from '../interfaces/sse-message-event.js';
import { ChatService } from '../services/chat.service.js';

/**
 * User-side chat endpoints: retrieve history, send messages, and stream
 * real-time events. All endpoints require a valid API key.
 */
@ApiTags('Chat')
@Controller('chat')
@UseGuards(ApiKeyGuard)
@ApiHeader({
  name: X_API_KEY,
  required: true,
  description: 'API key of the authenticated user',
})
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'No valid API key provided',
})
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('messages')
  @ApiOperation({
    summary: 'Retrieve the full message history of the authenticated user',
  })
  @ApiOkResponse({
    type: ChatMessageDto,
    isArray: true,
    description:
      'Array of messages ordered by creation time (ascending). Empty array when no conversation exists yet.',
  })
  async getMessages(
    @Req() req: AuthenticatedRequest,
  ): Promise<ChatMessageDto[]> {
    const user = requireAuthUser(req);
    return this.chatService.getHistory(user);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to the bot' })
  @ApiCreatedResponse({
    type: ChatMessageDto,
    description: 'The persisted message with its server-generated fields',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Message content is empty or exceeds 4000 characters',
  })
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendMessageRequestDto,
  ): Promise<ChatMessageDto> {
    const user = requireAuthUser(req);
    return this.chatService.sendMessage(user, dto.content);
  }

  @Sse('stream')
  @ApiOperation({
    summary: 'Stream real-time chat events via Server-Sent Events',
  })
  @ApiOkResponse({
    type: ChatStreamEventDto,
    description:
      'SSE stream of chat events. Each event uses the default "message" type (no explicit type field) so browser EventSource.onmessage receives it.',
  })
  streamEvents(
    @Req() req: AuthenticatedRequest,
  ): Observable<SseMessageEvent<ChatStreamEventDto>> {
    const user = requireAuthUser(req);
    return this.chatService.streamEvents(user).pipe(
      map((event) => ({
        data: event,
      })),
    );
  }
}
