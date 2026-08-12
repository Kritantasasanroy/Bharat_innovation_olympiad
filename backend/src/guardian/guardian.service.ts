import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { normalizePhone } from '../auth/phone.helpers';
import { SubmitGuardianDto } from './dto/guardian.dto';

/**
 * Bump when the parental-consent wording changes. Stored on every row, so a
 * later revision is distinguishable from the consent originally given rather
 * than silently reinterpreting it.
 */
export const CURRENT_GUARDIAN_CONSENT_VERSION = '2026-07-v1';

/** Oldest and youngest plausible date of birth for a school student. */
const MAX_AGE_YEARS = 30;
const MIN_AGE_YEARS = 3;

/**
 * Registration part 2 — parent/guardian details and parental consent.
 *
 * ## Why this gates the exam and not the login
 *
 * "Parental consent is must and needs explicit acceptance for data." Under the
 * DPDP Act, processing a minor's data — which is exactly what proctoring a child
 * with a webcam is — needs verifiable guardian consent. So
 * `AttemptService.startAttempt` refuses to open a real paper without a complete
 * row here.
 *
 * It deliberately does *not* gate signing in. A student who registered before
 * this existed must be able to log in and *reach* the form; locking them out of
 * their own account to collect a consent would be self-defeating.
 *
 * ## Why it is separate from `Consent`
 *
 * `Consent` records what the **student** permits at exam time (media capture,
 * monitoring). This records what the **guardian** permits, plus the demographics
 * the guardian is the right person to supply. Both are kept; neither substitutes
 * for the other.
 */
@Injectable()
export class GuardianService {
    constructor(
        private prisma: PrismaService,
        private notifications?: NotificationService,
    ) {}

    /**
     * Create or update the guardian profile.
     *
     * Idempotent by design: a parent who resubmits the form (or a student who
     * corrects a typo months later) updates the row. The consent timestamps are
     * only advanced on a genuine re-consent, so the original acceptance time
     * survives an unrelated edit such as fixing a phone number.
     */
    async submit(userId: string, dto: SubmitGuardianDto, ipAddress?: string) {
        // Both, or neither. A half-given consent is not a consent, and storing
        // one would leave a row that *looks* complete to the exam gate.
        if (!dto.parentalConsent || !dto.dataConsent) {
            throw new BadRequestException(
                'Both parental consent and consent to data processing are required before the student can sit an exam.',
            );
        }

        // The form calls every field on it mandatory, so the server has to say
        // so too — a rule enforced only in the browser is not a rule, and these
        // are exactly the fields someone would want to skip.
        //
        // All of these are checked on *submission* only, deliberately not inside
        // `hasGuardianConsent`: adding them there would retroactively bar
        // students who consented before a field existed from sitting their exam,
        // which punishes them for a change they had no part in.
        if (!dto.studentDob) {
            throw new BadRequestException("Enter the student's date of birth.");
        }
        if (!dto.gender) {
            throw new BadRequestException("Select the student's gender.");
        }
        if (!dto.idDocumentType?.trim()) {
            throw new BadRequestException('Choose which ID document you are uploading.');
        }

        // Both sides, and named separately in the error: "upload the document"
        // when one of two is already attached tells a parent nothing about
        // which half is missing.
        const idDocumentUrl = dto.idDocumentUrl?.trim();
        if (!idDocumentUrl) {
            throw new BadRequestException(
                "Upload the front of the student's ID — a school ID, Aadhaar card or passport.",
            );
        }
        const idDocumentBackUrl = dto.idDocumentBackUrl?.trim();
        if (!idDocumentBackUrl) {
            throw new BadRequestException(
                "Upload the back of the student's ID as well. Both sides are needed.",
            );
        }

        const guardianPhone = this.normaliseGuardianPhone(dto.guardianPhone);
        const studentDob = this.parseDob(dto.studentDob);
        const now = new Date();

        const existing = await this.prisma.guardianProfile.findUnique({
            where: { userId },
            select: { parentalConsentAt: true, dataConsentAt: true, consentVersion: true },
        });

        // Re-consent only when the wording has moved on. Otherwise keep the
        // original timestamps — they are the legal record of when consent was
        // actually given, and an edit to a phone number must not rewrite it.
        const consentIsCurrent =
            existing !== null && existing.consentVersion === CURRENT_GUARDIAN_CONSENT_VERSION;

        const details = {
            guardianFirstName: dto.guardianFirstName.trim(),
            guardianLastName: dto.guardianLastName.trim(),
            relationship: dto.relationship,
            guardianEmail: dto.guardianEmail.trim().toLowerCase(),
            guardianPhone,
            studentDob,
            gender: dto.gender ?? null,
            // `pincode` was dropped from GuardianProfile along with the field in
            // the form. `city`/`state` keep their columns so an existing row's
            // values survive, but nothing collects them any more.
            city: dto.city?.trim() || null,
            state: dto.state?.trim() || null,
            idDocumentType: dto.idDocumentType ?? null,
            idDocumentUrl,
            idDocumentBackUrl,
        };

        const profile = await this.prisma.guardianProfile.upsert({
            where: { userId },
            create: {
                userId,
                ...details,
                parentalConsentAt: now,
                dataConsentAt: now,
                consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
                ...(ipAddress ? { ipAddress } : {}),
            },
            update: {
                ...details,
                ...(consentIsCurrent
                    ? {}
                    : {
                          parentalConsentAt: now,
                          dataConsentAt: now,
                          consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
                          ...(ipAddress ? { ipAddress } : {}),
                      }),
            },
        });

        // Send parent approval confirmation email.
        //
        // The send time is recorded rather than assumed from `createdAt`: this
        // is a best-effort path that never fails the consent submission, so a
        // consent can legitimately exist with no mail behind it, and "we told
        // the parent, at this time" is exactly the thing an admin needs to be
        // able to answer. Only a genuine send stamps the column.
        let sent = profile;
        if (this.notifications) {
            const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
            const studentName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Student';
            const guardianName = `${profile.guardianFirstName} ${profile.guardianLastName}`.trim();

            const delivered = await this.notifications.sendParentApprovalEmail(
                profile.guardianEmail,
                guardianName,
                studentName,
            );
            if (delivered) {
                sent = await this.prisma.guardianProfile.update({
                    where: { userId },
                    data: { approvalEmailSentAt: new Date() },
                });
            }
        }

        return this.present(sent);
    }

    /** What the student app reads to decide whether to prompt for part 2. */
    async status(userId: string) {
        const profile = await this.prisma.guardianProfile.findUnique({ where: { userId } });
        return {
            version: CURRENT_GUARDIAN_CONSENT_VERSION,
            complete: this.isComplete(profile),
            profile: profile ? this.present(profile) : null,
        };
    }

    /**
     * The single predicate the exam gate uses.
     *
     * A row whose `consentVersion` has fallen behind counts as **incomplete** —
     * that is the whole point of versioning the wording, and it is why the gate
     * asks this rather than merely "does a row exist".
     */
    async hasGuardianConsent(userId: string): Promise<boolean> {
        const profile = await this.prisma.guardianProfile.findUnique({
            where: { userId },
            select: { parentalConsentAt: true, dataConsentAt: true, consentVersion: true },
        });
        return this.isComplete(profile);
    }

    private isComplete(
        profile: { parentalConsentAt: Date | null; dataConsentAt: Date | null; consentVersion: string } | null,
    ): boolean {
        if (!profile) return false;
        return (
            Boolean(profile.parentalConsentAt) &&
            Boolean(profile.dataConsentAt) &&
            profile.consentVersion === CURRENT_GUARDIAN_CONSENT_VERSION
        );
    }

    /** Never return `ipAddress` to the client — it is audit data, not profile data. */
    private present(profile: Record<string, any>) {
        const { ipAddress: _ipAddress, ...rest } = profile;
        return rest;
    }

    private normaliseGuardianPhone(raw: string): string {
        // Same E.164 convention as `User.phone`, so a parent's number is
        // comparable with a student's and usable by the SMS provider as-is.
        //
        // Deliberately NOT verified by OTP: this is a contact number for the
        // organisers, not a login identifier, so it grants nothing. Demanding a
        // second OTP from a parent mid-registration is what makes forms get
        // abandoned.
        try {
            return normalizePhone(raw);
        } catch {
            // `normalizePhone` guarantees the shape or throws; only the wording
            // needs changing, so the parent knows which field is at fault.
            throw new BadRequestException(
                "Enter a valid mobile number for the parent or guardian.",
            );
        }
    }

    private parseDob(raw?: string): Date | null {
        if (!raw) return null;
        const dob = new Date(raw);
        if (Number.isNaN(dob.getTime())) {
            throw new BadRequestException('Enter a valid date of birth.');
        }

        const now = new Date();
        if (dob > now) {
            throw new BadRequestException('Date of birth cannot be in the future.');
        }
        const years = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (years > MAX_AGE_YEARS || years < MIN_AGE_YEARS) {
            throw new BadRequestException(
                `Check the date of birth — it works out to about ${Math.floor(years)} years old.`,
            );
        }
        return dob;
    }
}
