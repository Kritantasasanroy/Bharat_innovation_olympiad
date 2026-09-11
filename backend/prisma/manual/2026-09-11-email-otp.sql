-- Student email sign-in codes, moved off Neon Auth's hosted /email-otp/*
-- endpoints onto our own `EmailOtp` table.
--
-- No new table: `EmailOtp` already existed for the school/partner verify-first
-- flows and has exactly the right shape. All this needs is a new value on the
-- `kind` discriminator, which is what stops a student's code being redeemable
-- on a school or partner flow.
--
-- Applied by hand rather than with `prisma db push`, which drops any table not
-- mirrored in this schema (the admin-api Drizzle tables share this database).
-- Idempotent and safe to re-run.
--
-- ADD VALUE cannot run inside a transaction block on PostgreSQL < 12, and
-- psql wraps a file in one with --single-transaction. Run this file WITHOUT
-- that flag (the RDS instance is 16.x, where it is allowed either way).

ALTER TYPE "EmailOtpKind" ADD VALUE IF NOT EXISTS 'STUDENT';
