-- Add REVOKED to the PartnerStatus enum so staff can revoke (and re-grant)
-- a partner's access via PATCH /partners/:id/access. This is the immediate,
-- per-request gate the partner dashboard checks (portal-api requireApprovedPartner).
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction in older Postgres;
-- keep this as a single standalone statement.
ALTER TYPE "PartnerStatus" ADD VALUE IF NOT EXISTS 'REVOKED';
