# NestJS CRUD Contract Extraction Fixture

Minimal non-runnable source fixture for contract extraction tests.

- `orders` contains CRUD application contracts and a repository port that should be extracted.
- `health` has no ports, contracts, or schema and should be ignored naturally.
- `legacy-billing` contains extractable-looking files but is excluded by configuration.
- `prisma/schema.prisma` supplies one Prisma schema.

No dependency manifest is included. This repository is intentionally not runnable.

From parent repository, run:

```bash
pnpm example
```

Generated `dummy_repo_contracts.md` should contain only Prisma schema and `orders` contract context.
