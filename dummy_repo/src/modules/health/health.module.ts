import { Module } from '@nestjs/common';
import { HealthService } from './health.service';

// Internal module has no extractable contracts, ports, or schema.
@Module({ providers: [HealthService] })
export class HealthModule {}
