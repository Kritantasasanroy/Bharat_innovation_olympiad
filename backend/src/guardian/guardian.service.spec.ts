import { BadRequestException } from '@nestjs/common';
import { CURRENT_GUARDIAN_CONSENT_VERSION, GuardianService } from './guardian.service';
import { SubmitGuardianDto } from './dto/guardian.dto';

/**
 * Registration part 2 — parental consent.
 *
 * The rules worth pinning are all about *not* accepting something that merely
 * looks like consent: a half-ticked form, a stale consent version, or an edit
 * that quietly rewrites when consent was originally given.
 */
describe('GuardianService', () => {
    const USER = 'student-1';

    function valid(overrides: Partial<SubmitGuardianDto> = {}): SubmitGuardianDto {
        return {
            guardianFirstName: 'Meera',
            guardianLastName: 'Sharma',
            relationship: 'Mother',
            guardianEmail: 'Meera.Sharma@Example.COM',
            guardianPhone: '98765 43210',
            // Every one of these is mandatory now, so a "valid" DTO has to carry
            // them all — a fixture missing one would fail on that field rather
            // than on whatever the test is actually about.
            studentDob: '2012-04-18',
            gender: 'Female',
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
            ['parental consent unticked', { parentalConsent: false }],
            ['data consent unticked', { dataConsent: false }],
            ['both unticked', { parentalConsent: false, dataConsent: false }],
        ])('rejects %s and writes nothing', async (_label, overrides) => {
            const { service, prisma } = serviceWith();
            await expect(service.submit(USER, valid(overrides))).rejects.toThrow(BadRequestException);
            // The important half: a refused consent must not leave a row behind
            // that the exam gate would then read as complete.
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

        // The back carries the class, section and school stamp on a school card,
        // and the address on an Aadhaar — most of what makes the document worth
        // checking. A front-only submission is not a verified identity.
        it.each([
            ['missing', undefined],
            ['blank', ''],
            ['whitespace only', '   '],
        ])('rejects a submission whose back-of-card URL is %s', async (_label, url) => {
            const { service, prisma } = serviceWith();
            await expect(
                service.submit(USER, valid({ idDocumentBackUrl: url as string })),
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

    it('normalises the guardian email and phone', async () => {
        const { service, prisma } = serviceWith();
        await service.submit(USER, valid());

        const { create } = prisma.guardianProfile.upsert.mock.calls[0][0];
        expect(create.guardianEmail).toBe('meera.sharma@example.com');
        // Same E.164 convention as User.phone, so the two are comparable.
        expect(create.guardianPhone).toBe('+919876543210');
    });

    it.each([
        ['too short', '123'],
        ['letters', 'not a number'],
        ['empty', '   '],
    ])('rejects an invalid guardian phone (%s) with a parent-specific message', async (_l, phone) => {
        const { service } = serviceWith();
        await expect(service.submit(USER, valid({ guardianPhone: phone }))).rejects.toThrow(
            /parent or guardian/i,
        );
    });

    describe('re-submitting', () => {
        const existing = {
            parentalConsentAt: new Date('2026-01-01T00:00:00Z'),
            dataConsentAt: new Date('2026-01-01T00:00:00Z'),
            consentVersion: CURRENT_GUARDIAN_CONSENT_VERSION,
        };

        it('does not rewrite the original consent time when only details change', async () => {
            const { service, prisma } = serviceWith(existing);
            await service.submit(USER, valid({ guardianPhone: '+919000000001' }));

            const { update } = prisma.guardianProfile.upsert.mock.calls[0][0];
            // The consent timestamp is the legal record of *when* consent was
            // given. Fixing a typo in a phone number must not move it.
            expect(update.parentalConsentAt).toBeUndefined();
            expect(update.dataConsentAt).toBeUndefined();
            expect(update.guardianPhone).toBe('+919000000001');
        });

        it('re-stamps consent when the wording version has moved on', async () => {
            const { service, prisma } = serviceWith({ ...existing, consentVersion: '2020-01-v0' });
            await service.submit(USER, valid());

            const { update } = prisma.guardianProfile.upsert.mock.calls[0][0];
            expect(update.parentalConsentAt).toBeInstanceOf(Date);
            expect(update.consentVersion).toBe(CURRENT_GUARDIAN_CONSENT_VERSION);
        });
    });

    describe('date of birth', () => {
        it('accepts a plausible school-age date', async () => {
            const { service, prisma } = serviceWith();
            const dob = new Date();
            dob.setFullYear(dob.getFullYear() - 13);
            await service.submit(USER, valid({ studentDob: dob.toISOString() }));

            const { create } = prisma.guardianProfile.upsert.mock.calls[0][0];
            expect(create.studentDob).toBeInstanceOf(Date);
        });

        // It used to be optional. It is not: the age band a student competes in
        // is derived from it, and it is what the uploaded ID is checked against.
        it.each([
            ['missing', undefined],
            ['blank', ''],
        ])('rejects a submission whose date of birth is %s', async (_label, dob) => {
            const { service, prisma } = serviceWith();
            await expect(
                service.submit(USER, valid({ studentDob: dob as string })),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.guardianProfile.upsert).not.toHaveBeenCalled();
        });

        it('rejects a submission with no gender given', async () => {
            const { service, prisma } = serviceWith();
            await expect(
                service.submit(USER, valid({ gender: undefined })),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.guardianProfile.upsert).not.toHaveBeenCalled();
        });

        it('rejects a future date', async () => {
            const { service } = serviceWith();
            const future = new Date();
            future.setFullYear(future.getFullYear() + 1);
            await expect(
                service.submit(USER, valid({ studentDob: future.toISOString() })),
            ).rejects.toThrow(/future/i);
        });

        it.each([
            ['a 60-year-old', 60],
            ['a 1-year-old', 1],
        ])('rejects an implausible age (%s)', async (_label, yearsAgo) => {
            const { service } = serviceWith();
            const dob = new Date();
            dob.setFullYear(dob.getFullYear() - yearsAgo);
            await expect(
                service.submit(USER, valid({ studentDob: dob.toISOString() })),
            ).rejects.toThrow(/date of birth/i);
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
            ['parental consent missing', { parentalConsentAt: null, dataConsentAt: new Date() }],
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
                        guardianFirstName: 'Meera',
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
            expect(result.profile).toHaveProperty('guardianFirstName', 'Meera');
        });
    });
});
