import { BadRequestException } from '@nestjs/common';
import { CURRENT_GUARDIAN_CONSENT_VERSION, GuardianService } from './guardian.service';
import { SubmitGuardianDto } from './dto/guardian.dto';

/**
 * Student identification — the record the exam gate checks.
 *
 * The rules worth pinning are all about *not* accepting something that merely
 * looks complete: a half-ticked form, a stale consent version, or an edit
 * that quietly rewrites when consent was originally given. No parent/guardian
 * fields exist any more — the submission is the participant's own details.
 */
describe('GuardianService', () => {
    const USER = 'student-1';

    function valid(overrides: Partial<SubmitGuardianDto> = {}): SubmitGuardianDto {
        return {
            // Every one of these is mandatory now, so a "valid" DTO has to carry
            // them all — a fixture missing one would fail on that field rather
            // than on whatever the test is actually about.
            idDocumentType: 'School ID Card',
            idDocumentUrl: 'https://cdn.example/id.jpg',
            idDocumentBackUrl: 'https://cdn.example/id-back.jpg',
            parentalConsent: true,
            dataConsent: true,
            ...overrides,
        } as SubmitGuardianDto;
    }

    function serviceWith(existing: any = null) {
        const prisma: any = {
            guardianProfile: {
                findUnique: jest.fn().mockResolvedValue(existing),
                upsert: jest.fn().mockImplementation(({ create, update }: any) =>
                    Promise.resolve({ id: 'gp-1', userId: USER, ...(existing ? update : create) }),
                ),
            },
        };
        return { service: new GuardianService(prisma), prisma };
    }

    describe('refusing a partial consent', () => {
        it.each([
            ['participation consent unticked', { parentalConsent: false }],
            ['data consent unticked', { dataConsent: false }],
            ['both unticked', { parentalConsent: false, dataConsent: false }],
        ])('rejects %s and writes nothing', async (_label, overrides) => {
            const { service, prisma } = serviceWith();
            await expect(service.submit(USER, valid(overrides))).rejects.toThrow(BadRequestException);
            // The important half: a refused submission must not leave a row
            // behind that the exam gate would then read as complete.
            expect(prisma.guardianProfile.upsert).not.toHaveBeenCalled();
        });
    });

    describe('the mandatory ID document', () => {
        it.each([
            ['missing', undefined],
            ['blank', ''],
            ['whitespace only', '   '],
        ])('rejects a submission whose document URL is %s', async (_label, url) => {
            const { service, prisma } = serviceWith();
            await expect(
                service.submit(USER, valid({ idDocumentUrl: url as string })),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.guardianProfile.upsert).not.toHaveBeenCalled();
        });

        // The back of a school card carries the class, section and school stamp —
        // most of what makes it worth checking — so a school ID needs both sides.
        it.each([
            ['missing', undefined],
            ['blank', ''],
            ['whitespace only', '   '],
        ])('rejects a School ID Card submission whose back-of-card URL is %s', async (_label, url) => {
            const { service, prisma } = serviceWith();
            await expect(
                service.submit(USER, valid({ idDocumentBackUrl: url as string })),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.guardianProfile.upsert).not.toHaveBeenCalled();
        });

        // A school-diary page or "other" document is a single picture — there is
        // no second side to ask for, so a missing back must NOT block it.
        it.each([
            'School Diary (student info page)',
            'Other (any relevant document)',
        ])('accepts %s with one picture and no back', async (docType) => {
            const { service, prisma } = serviceWith();
            await service.submit(
                USER,
                valid({ idDocumentType: docType, idDocumentBackUrl: undefined }),
            );
            const { create } = prisma.guardianProfile.upsert.mock.calls[0][0];
            expect(create.idDocumentType).toBe(docType);
            expect(create.idDocumentUrl).toBe('https://cdn.example/id.jpg');
            expect(create.idDocumentBackUrl).toBeNull();
        });

        it('still requires the one picture for a non-school-ID document', async () => {
            const { service, prisma } = serviceWith();
            await expect(
                service.submit(
                    USER,
                    valid({
                        idDocumentType: 'Other (any relevant document)',
                        idDocumentUrl: undefined,
                        idDocumentBackUrl: undefined,
                    }),
                ),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.guardianProfile.upsert).not.toHaveBeenCalled();
        });

        it('stores both trimmed URLs and the document type', async () => {
            const { service, prisma } = serviceWith();
            await service.submit(USER, valid({
                idDocumentUrl: '  https://cdn.example/id.jpg  ',
                idDocumentBackUrl: '  https://cdn.example/id-back.jpg  ',
            }));

            const { create } = prisma.guardianProfile.upsert.mock.calls[0][0];
            expect(create.idDocumentUrl).toBe('https://cdn.example/id.jpg');
            expect(create.idDocumentBackUrl).toBe('https://cdn.example/id-back.jpg');
            expect(create.idDocumentType).toBe('School ID Card');
        });

        it('does not retroactively bar a student who consented before it existed', async () => {
            // `hasGuardianConsent` gates the exam. It must keep passing for a row
            // with no document, or a change of policy locks out students who did
            // nothing wrong. The requirement applies to new submissions only.
            const prisma: any = {
                guardianProfile: {
                    findUnique: jest.fn().mockResolvedValue({
                        parentalConsentAt: new Date(),
                        dataConsentAt: new Date(),
                        consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
                        idDocumentUrl: null,
                    }),
                },
            };
            await expect(new GuardianService(prisma).hasGuardianConsent(USER)).resolves.toBe(true);
        });
    });

    it('stores both consent timestamps and the current version on first submit', async () => {
        const { service, prisma } = serviceWith();
        await service.submit(USER, valid(), '203.0.113.7');

        const { create } = prisma.guardianProfile.upsert.mock.calls[0][0];
        expect(create.parentalConsentAt).toBeInstanceOf(Date);
        expect(create.dataConsentAt).toBeInstanceOf(Date);
        expect(create.consentVersion).toBe(CURRENT_GUARDIAN_CONSENT_VERSION);
        expect(create.ipAddress).toBe('203.0.113.7');
    });

    it('writes no parent/guardian fields — they do not exist any more', async () => {
        const { service, prisma } = serviceWith();
        await service.submit(USER, valid());

        const { create } = prisma.guardianProfile.upsert.mock.calls[0][0];
        for (const field of [
            'guardianFirstName',
            'guardianLastName',
            'relationship',
            'guardianEmail',
            'guardianPhone',
        ]) {
            expect(create).not.toHaveProperty(field);
        }
    });

    describe('re-submitting', () => {
        const existing = {
            parentalConsentAt: new Date('2026-01-01T00:00:00Z'),
            dataConsentAt: new Date('2026-01-01T00:00:00Z'),
            consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
        };

        it('does not rewrite the original consent time when only details change', async () => {
            const { service, prisma } = serviceWith(existing);
            await service.submit(USER, valid({ city: 'Raipur' }));

            const { update } = prisma.guardianProfile.upsert.mock.calls[0][0];
            // The consent timestamp is the legal record of *when* consent was
            // given. Changing a detail must not move it.
            expect(update.parentalConsentAt).toBeUndefined();
            expect(update.dataConsentAt).toBeUndefined();
            expect(update.city).toBe('Raipur');
        });

        it('never touches the dob/gender registration wrote — they are not part of this submission', async () => {
            const { service, prisma } = serviceWith(existing);
            await service.submit(USER, valid());

            const { create, update } = prisma.guardianProfile.upsert.mock.calls[0][0];
            for (const fields of [create, update]) {
                expect(fields).not.toHaveProperty('studentDob');
                expect(fields).not.toHaveProperty('gender');
            }
        });

        it('re-stamps consent when the wording version has moved on', async () => {
            const { service, prisma } = serviceWith({ ...existing, consentVersion: '2020-01-v0' });
            await service.submit(USER, valid());

            const { update } = prisma.guardianProfile.upsert.mock.calls[0][0];
            expect(update.parentalConsentAt).toBeInstanceOf(Date);
            expect(update.consentVersion).toBe(CURRENT_GUARDIAN_CONSENT_VERSION);
        });
    });

    describe('hasGuardianConsent — the predicate the exam gate uses', () => {
        async function consentFor(profile: any) {
            const prisma: any = { guardianProfile: { findUnique: jest.fn().mockResolvedValue(profile) } };
            return new GuardianService(prisma).hasGuardianConsent(USER);
        }

        it('is false when no profile exists', async () => {
            await expect(consentFor(null)).resolves.toBe(false);
        });

        it('is true for a complete, current profile', async () => {
            await expect(
                consentFor({
                    parentalConsentAt: new Date(),
                    dataConsentAt: new Date(),
                    consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
                }),
            ).resolves.toBe(true);
        });

        it('is false when the consent version is stale — that is the point of versioning', async () => {
            await expect(
                consentFor({
                    parentalConsentAt: new Date(),
                    dataConsentAt: new Date(),
                    consentVersion: '2020-01-v0',
                }),
            ).resolves.toBe(false);
        });

        it.each([
            ['participation consent missing', { parentalConsentAt: null, dataConsentAt: new Date() }],
            ['data consent missing', { parentalConsentAt: new Date(), dataConsentAt: null }],
        ])('is false when %s', async (_label, partial) => {
            await expect(
                consentFor({ ...partial, consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION }),
            ).resolves.toBe(false);
        });
    });

    describe('status', () => {
        it('never leaks the stored IP address to the client', async () => {
            const prisma: any = {
                guardianProfile: {
                    findUnique: jest.fn().mockResolvedValue({
                        id: 'gp-1',
                        userId: USER,
                        studentDob: new Date('2012-04-18'),
                        parentalConsentAt: new Date(),
                        dataConsentAt: new Date(),
                        consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
                        ipAddress: '203.0.113.7',
                    }),
                },
            };
            const result = await new GuardianService(prisma).status(USER);
            expect(result.complete).toBe(true);
            expect(result.profile).not.toHaveProperty('ipAddress');
        });
    });
});
