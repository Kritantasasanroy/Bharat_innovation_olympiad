# lemon-current-impl (bio-contracts chunk)

Shared platform code and the data model from the monolith, the raw material for the shared `@bio/*` contract packages.

- `common` - guards, decorators, interceptors, S3 service, demo-exam helpers.
- `prisma/schema.prisma`, `prisma-service` - the shared Postgres data model + Prisma client.
- `types/student`, `types/admin` - shared TypeScript types (exam, proctor).

These are refactored into `packages/{domain-contracts,shared-types,auth-kit,...}` via the workbench/ralph flow.
