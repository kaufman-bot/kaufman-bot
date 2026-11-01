import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/index.js';
import { SeedService } from './seed.service.js';

// Standalone wrapper module slated for removal: SeedService (and PrismaService
// as its plain provider) will live directly in AppModule — see BACKLOG.md.
@Module({
  imports: [PrismaModule],
  providers: [SeedService],
})
export class SeedModule {}
