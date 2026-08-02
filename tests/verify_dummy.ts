import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Small smoke test for public example.
 * It verifies semantic selection, not exact formatting or line numbers.
 */
const outputPath = path.resolve(process.cwd(), 'dummy_repo/dummy_repo_contracts.md');
const document = await readFile(outputPath, 'utf8');

const requiredText = [
  '## Content Map',
  'prisma/schema.prisma',
  'src/modules/orders/application/contracts/order.contract.ts',
  'src/modules/orders/domain/ports/order-repository.port.ts',
  'model Order',
  'interface CreateOrderInput',
];

for (const value of requiredText) {
  if (!document.includes(value)) {
    throw new Error(`Expected extracted context to contain: ${value}`);
  }
}

const forbiddenText = ['legacy-billing', 'health.service.ts', 'health.module.ts'];
for (const value of forbiddenText) {
  if (document.includes(value)) {
    throw new Error(`Expected extracted context to exclude: ${value}`);
  }
}

console.log('Dummy repository extraction verified.');
