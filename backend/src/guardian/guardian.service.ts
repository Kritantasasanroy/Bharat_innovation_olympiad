import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { SubmitGuardianDto } from './dto/guardian.dto';

/**
 * Bump when the consent wording changes. Stored on every row, so a later
 * revision is distinguishable from the consent originally given rather than
 * silently reinterpreting it.
 */
export const CURRENT_GUARDIAN_CONSENT_VERSION = '2026-07-v1';

/**
 * Student identification — the ID document, the demographics, and the two
 * consents that `AttemptService.startAttempt` gates on.
 *
 * ## Why this gates the exam and not the login
 *
 * Processing a minor's data — which is exactly what proctoring a child with a
 * webcam is — needs recorded consent under the DPDP Act. So
 * `AttemptService.startAttempt` refuses to open a real paper without a
 * complete row here.
 *
 * It deliberately does *not* gate signing in. A student who registered before
 * this existed must be able to log in and *reach* the form; locking them out
 * of their own account to collect it would be self-defeating.
 *
 * The guardian's name/email/WhatsApp is collected once at registration
 * (`AuthService.recordGuardianContact`) and stored on this same record, but
 * this flow itself is the participant's own identification — consent, ID
 * document, demographics. The face scan half lives on `User.faceEmbedding`
 * via `ProctorService.enrollFace`.
 */
@Injectable()
export class GuardianService {
    constructor(
        private prisma: PrismaService,
        private notifications?: NotificationService,
    ) {}

    /**
     * Create or update the identification record.
     *
     * Idempotent by design: a student who resubmits (or corrects a typo months
     * later) updates the row. The consent timestamps are only advanced on a
     * genuine re-consent, so the original acceptance time survives an
     * unrelated edit.
     */
    async submit(userId: string, dto: SubmitGuardianDto, ipAddress?: string) {
        // Both, or neither. A half-given consent is not a consent, and storing
        // one would leave a row that *looks* complete to the exam gate.
        if (!dto.parentalConsent || !dto.dataConsent) {
            throw new BadRequestException(
                'Both participation consent and consent to data processing are required before the participant can sit an exam.',
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
        const idDocumentType = dto.idDocumentType?.trim();
        if (!idDocumentType) {
            throw new BadRequestException('Choose which ID document you are uploading.');
        }

        // One picture is enough for a school-diary page or "other" document;
        // only a school ID card, whose class/section is on the back, asks for
        // two. Mirrors `TWO_SIDED_DOC` in `IdentificationForm`.
        const needsBackSide = idDocumentType === 'School ID Card';

        const idDocumentUrl = dto.idDocumentUrl?.trim();
        if (!idDocumentUrl) {
            throw new BadRequestException(
                needsBackSide
                    ? 'Upload the front of the school ID card.'
                    : 'Upload a picture of the identity document.',
            );
        }
        const idDocumentBackUrl = dto.idDocumentBackUrl?.trim();
        if (needsBackSide && !idDocumentBackUrl) {
            throw new BadRequestException(
                'Upload the back of the school ID card as well. Both sides are needed.',
            );
        }

        const now = new Date();

        const existing = await this.prisma.guardianProfile.findUnique({
            where: { userId },
            select: { parentalConsentAt: true, dataConsentAt: true, consentVersion: true },
        });

        // Re-consent only when the wording has moved on. Otherwise keep the
        // original timestamps — they are the legal record of when consent was
        // actually given, and a later edit must not rewrite it.
        const consentIsCurrent =
            existing !== null && existing.consentVersion === CURRENT_GUARDIAN_CONSENT_VERSION;

        const details = {
            // `studentDob`/`gender` are deliberately absent: registration
            // already wrote them onto this record via `/auth/sync`, and an
            // update set carrying them would wipe what the student typed there
            // with nulls.
            // `city`/`state` keep their columns so an existing row's values
            // survive, but nothing collects them any more.
            city: dto.city?.trim() || null,
            state: dto.state?.trim() || null,
            idDocumentType,
            idDocumentUrl,
            // Explicitly null (not undefined) so switching a school ID re-submit
            // to a one-picture document clears the old back rather than leaving
            // a stale URL that Prisma's "skip undefined" would preserve.
            idDocumentBackUrl: idDocumentBackUrl || null,
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

        // Identification just went complete → the "verification complete" mail
        // (BIO-STU-007) to the student, deduped on the user so a resubmission
        // never re-mails.
        if (this.notifications && this.isComplete(profile)) {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { firstName: true, email: true, rollNumber: true },
            });
            if (user?.email) {
                await this.notifications.sendVerificationComplete(user.email, {
                    userId,
                    firstName: user.firstName,
                    rollNumber: user.rollNumber,
                });
            }
        }

        return this.present(profile);
    }

    /** What the student app reads to decide whether to prompt for the form. */
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
        profile: { parentalConsentAt: Date | null; dataConsentAt: Date | null; consentVersion: string | null } | null,
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
}
