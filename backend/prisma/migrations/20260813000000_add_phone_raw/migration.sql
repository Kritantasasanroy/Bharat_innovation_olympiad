-- Add phoneRaw: student-supplied number stored at registration even without OTP
-- verification. Not unique, not a login identifier — only for WhatsApp fallback.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneRaw" TEXT;
