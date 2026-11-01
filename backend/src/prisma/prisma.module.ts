import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Standalone wrapper module slated for removal: PrismaService will be
// registered directly in AppModule so the app keeps a single Nest module —
// see BACKLOG.md.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
