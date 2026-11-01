import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { X_API_KEY } from '../constants/api-key.constants.js';
import { ChatMessageDto } from '../dto/chat.dto.js';
import { ApiErrorDto } from '../dto/error.dto.js';
import {
  ConversationSummaryDto,
  MockBotReplyRequestDto,
  MockBotStreamEventDto,
} from '../dto/mock-bot.dto.js';
import { AdminGuard } from '../guards/admin.guard.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { SseMessageEvent } from '../interfaces/sse-message-event.js';
import { MockBotService } from '../services/mock-bot.service.js';

/**
 * Operator-side mock-bot console endpoints: list conversations, read
 * messages, reply as bot, and stream real-time events. All endpoints
 * require ADMIN role.
 */
@ApiTags('Mock Bot Console')
@Controller('mock-bot')
@UseGuards(ApiKeyGuard, AdminGuard)
@ApiHeader({
  name: X_API_KEY,
  required: true,
  description: 'API key of an ADMIN account',
})
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'No valid API key provided',
})
@ApiForbiddenResponse({
  type: ApiErrorDto,
  description: 'Authenticated account is not an admin',
})
export class MockBotController {
  constructor(private readonly mockBotService: MockBotService) {}

  @Get('conversations')
  @ApiOperation({
    summary:
      'List all conversations with last message preview and unread count',
  })
  @ApiOkResponse({
    type: ConversationSummaryDto,
    isArray: true,
    description:
      'Array of conversation summaries sorted by latest activity (most recent first)',
  })
  async listConversations(): Promise<ConversationSummaryDto[]> {
    return this.mockBotService.listConversations();
  }

  @Get('conversations/:userId/messages')
  @ApiOperation({
    summary: 'Retrieve all messages for a specific user conversation',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID whose conversation to read',
  })
  @ApiOkResponse({
    type: ChatMessageDto,
    isArray: true,
    description:
      'Array of messages ordered by creation time (ascending). Marks user messages as read.',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'Conversation not found for this user',
  })
  async getConversationMessages(
    @Param('userId') userId: string,
  ): Promise<ChatMessageDto[]> {
    return this.mockBotService.getConversationMessages(userId);
  }

  @Post('conversations/:userId/messages')
  @ApiOperation({ summary: 'Send a reply on behalf of the bot to a user' })
  @ApiParam({ name: 'userId', description: 'User ID to reply to' })
  @ApiCreatedResponse({
    type: ChatMessageDto,
    description: 'The persisted bot message with its server-generated fields',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Reply content is empty or exceeds 4000 characters',
  })
  async replyAsBot(
    @Param('userId') userId: string,
    @Body() dto: MockBotReplyRequestDto,
  ): Promise<ChatMessageDto> {
    return this.mockBotService.replyAsBot(userId, dto.content);
  }

  @Sse('stream')
  @ApiOperation({
    summary:
      'Stream real-time chat events from all users via Server-Sent Events',
  })
  @ApiOkResponse({
    type: MockBotStreamEventDto,
    description:
      'SSE stream of all chat events. Each event uses the default "message" type (no explicit type field) so browser EventSource.onmessage receives it.',
  })
  streamEvents(): Observable<SseMessageEvent<MockBotStreamEventDto>> {
    return this.mockBotService.streamEvents().pipe(
      mergeMap(async (event) => {
        // Enrich with userId from conversation
        const enriched =
          await this.mockBotService.enrichStreamEventWithUserId(event);
        return { data: enriched };
      }),
    );
  }
}
