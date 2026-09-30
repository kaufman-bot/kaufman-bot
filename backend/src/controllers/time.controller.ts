import { Controller, Get, Header, Logger, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { interval, map, Observable } from 'rxjs';
import { ServerTimeDto } from '../dto/time.dto.js';
import { SseMessageEvent } from '../interfaces/sse-message-event.js';

@ApiTags('time')
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
      'Server-Sent Events stream; connects from the browser via EventSource. ' +
      'Public like GET /time, so it takes no API key at all.',
  })
  @ApiOkResponse({
    description:
      'SSE stream; each event data payload is a ServerTimeDto — the same ' +
      'ISO-8601 string format as GET /time.',
    type: ServerTimeDto,
  })
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  stream(): Observable<SseMessageEvent<ServerTimeDto>> {
    this.logger.log('Streaming started');
    return interval(1000).pipe(
      map(
        () =>
          ({
            data: new ServerTimeDto(new Date()),
          }) satisfies SseMessageEvent<ServerTimeDto>,
      ),
    );
  }
}
