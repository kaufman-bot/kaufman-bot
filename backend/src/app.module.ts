import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { HealthController } from './controllers/health.controller.js';
import { TimeController } from './controllers/time.controller.js';
import { PrismaModule } from './prisma/index.js';
import { SeedModule } from './seed/seed.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'kaufman-bot',
    }),
    PrismaModule,
    SeedModule,
  ],
  controllers: [TimeController, HealthController],
  providers: [],
})
export class AppModule {}
