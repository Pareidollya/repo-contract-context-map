import { Module } from '@nestjs/common';

// Matching contracts exist, but extractor.config.json excludes entire module.
@Module({})
export class LegacyBillingModule {}
