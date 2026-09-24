import {
  Controller,
  Get,
  Header,
  Logger,
  MessageEvent,
  Sse,
} from '@nestjs/common';
import { interval, map, Observable } from 'rxjs';

@Controller('time')
export class TimeController {
  private logger = new Logger(TimeController.name);

  @Get()
  time() {
    return new Date();
  }

  @Sse('stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  stream(): Observable<MessageEvent> {
    this.logger.log('Streaming started');
    return interval(1000).pipe(
      map(
        () =>
          ({ data: { time: new Date().toISOString() } }) satisfies MessageEvent,
      ),
    );
  }
}
