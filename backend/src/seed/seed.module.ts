import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/index.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [PrismaModule],
  providers: [SeedService],
})
export class SeedModule {}
