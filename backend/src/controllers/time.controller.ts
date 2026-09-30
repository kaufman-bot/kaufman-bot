import { Controller, Get, Header, Logger, Sse } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { interval, map, Observable } from 'rxjs';
import { ServerTimeDto, TimeStreamEventDto } from '../dto/time.dto.js';
import { SseMessageEvent } from '../interfaces/sse-message-event.js';

@ApiTags('time')
@ApiExtraModels(TimeStreamEventDto)
@Controller('time')
export class TimeController {
  private logger = new Logger(TimeController.name);

  @Get()
  @ApiOperation({ summary: 'Get current server time' })
  @ApiOkResponse({ type: ServerTimeDto })
  time(): ServerTimeDto {
    return new ServerTimeDto(new Date());
  }

  @Sse('stream')
  @ApiOperation({
    summary: 'Stream current server time every second (SSE)',
    description:
      'Server-Sent Events stream; connects from the browser via EventSource.',
  })
  @ApiOkResponse({
    description: 'SSE stream; each event data payload is a TimeStreamEventDto.',
    content: {
      'text/event-stream': {
        schema: { $ref: getSchemaPath(TimeStreamEventDto) },
      },
    },
  })
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  stream(): Observable<SseMessageEvent<TimeStreamEventDto>> {
    this.logger.log('Streaming started');
    return interval(1000).pipe(
      map(
        () =>
          ({
            data: new TimeStreamEventDto(new Date().toISOString()),
          }) satisfies SseMessageEvent<TimeStreamEventDto>,
      ),
    );
  }
}
