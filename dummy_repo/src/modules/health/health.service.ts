import { Injectable } from '@nestjs/common';

// Local NestJS implementation detail is outside configured extraction criteria.
@Injectable()
export class HealthService {
  check(): string {
    return 'ok';
  }
}
