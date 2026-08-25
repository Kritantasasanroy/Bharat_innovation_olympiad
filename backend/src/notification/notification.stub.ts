import { NotificationService } from './notification.service';

/**
 * A no-op `NotificationService` for unit tests.
 *
 * Every send here is best-effort — a mail outage must never fail the business
 * action that triggered it — so most specs have nothing to assert about
 * notifications, they only need the dependency to exist and stay quiet. A
 * shared stub keeps that from being a slightly different inline object in
 * every spec file that has to be updated whenever a method is added.
 *
 * `notification.service.spec.ts` (if/when one exists) would cover the real
 * behaviour; this is deliberately inert, always "sent".
 */
export class NotificationServiceTestDouble extends NotificationService {
    sendOtpSms = jest.fn(async (_toE164: string): Promise<string> => '000000');
    sendOtpVoice = jest.fn(async (_toE164: string, _code: string): Promise<void> => undefined);
    smsDiagnostics = jest.fn(async () => ({ provider: 'stub', voice: 'stub' }));
    smsProbe = jest.fn(async (_toE164: string) => ({ provider: 'stub' }));
    smsDeliveryReport = jest.fn(async (_sessionId: string): Promise<string> => 'stub');

    sendWelcome = jest.fn(
        async (_to: string, _firstName: string, _rollNumber?: string | null): Promise<void> => undefined,
    );
    sendAccessPassActivated = jest.fn(
        async (_to: string, _firstName: string, _amountPaise: number): Promise<void> => undefined,
    );
    sendSlotConfirmed = jest.fn(
        async (
            _to: string,
            _vars: {
                firstName: string;
                examTitle: string;
                slotLabel?: string | null;
                startsAt: Date;
                endsAt: Date;
                rollNumber?: string | null;
                bookingId: string;
            },
        ): Promise<void> => undefined,
    );
    sendExamSubmitted = jest.fn(
        async (_to: string, _firstName: string, _examTitle: string): Promise<void> => undefined,
    );
    sendResultsPublished = jest.fn(
        async (_to: string, _firstName: string, _examTitle: string): Promise<void> => undefined,
    );
    sendParentApprovalEmail = jest.fn(
        async (_to: string, _guardianName: string, _studentName: string): Promise<boolean> => true,
    );

    sendPartnerEmailVerification = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string; token: string }): Promise<boolean> =>
            true,
    );
    sendPartnerStartVerification = jest.fn(
        async (_to: string, _vars: { code: string }): Promise<boolean> => true,
    );
    sendPartnerApplicationReceived = jest.fn(
        async (_to: string, _contactPerson: string, _orgName: string): Promise<boolean> => true,
    );
    sendPartnerApproved = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string; accessToken: string }): Promise<boolean> =>
            true,
    );
    sendPartnerRejected = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string; reason: string }): Promise<boolean> =>
            true,
    );
    sendPartnerRevoked = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string; reason: string }): Promise<boolean> =>
            true,
    );
    sendPartnerTokenRotated = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string; accessToken: string }): Promise<boolean> =>
            true,
    );
    sendPartnerAccessResent = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string; accessToken: string }): Promise<boolean> =>
            true,
    );
    sendPartnerSchoolStatusChanged = jest.fn(
        async (
            _to: string,
            _vars: { contactPerson: string; schoolName: string; status: 'APPROVED' | 'REJECTED' },
        ): Promise<boolean> => true,
    );
    sendPartnerBankDetailsSubmitted = jest.fn(
        async (
            _to: string,
            _vars: { contactPerson: string; accountNumberLast4: string },
        ): Promise<boolean> => true,
    );
    sendPartnerPasswordResetCode = jest.fn(
        async (_to: string, _vars: { code: string }): Promise<boolean> => true,
    );
    sendPartnerPasswordChanged = jest.fn(
        async (_to: string, _vars: { contactPerson: string; orgName: string }): Promise<boolean> => true,
    );

    sendSchoolEmailVerification = jest.fn(
        async (_to: string, _vars: { coordinatorName: string; schoolName: string; token: string }): Promise<boolean> =>
            true,
    );
    sendSchoolStartVerification = jest.fn(
        async (_to: string, _vars: { code: string }): Promise<boolean> => true,
    );
    sendSchoolApplicationReceived = jest.fn(
        async (_to: string, _coordinatorName: string, _schoolName: string): Promise<boolean> => true,
    );
    sendSchoolPasswordResetCode = jest.fn(
        async (_to: string, _vars: { code: string }): Promise<boolean> => true,
    );
    sendSchoolPasswordChanged = jest.fn(
        async (_to: string, _vars: { coordinatorName: string; schoolName: string }): Promise<boolean> => true,
    );
    sendSchoolApproved = jest.fn(
        async (
            _to: string,
            _vars: {
                coordinatorName: string;
                schoolName: string;
                schoolCode: string | null;
                accessToken: string;
            },
        ): Promise<boolean> => true,
    );
    sendSchoolRejected = jest.fn(
        async (_to: string, _vars: { coordinatorName: string; schoolName: string; reason: string }): Promise<boolean> =>
            true,
    );
    sendSchoolRevoked = jest.fn(
        async (_to: string, _vars: { coordinatorName: string; schoolName: string; reason: string }): Promise<boolean> =>
            true,
    );
    sendSchoolTokenRotated = jest.fn(
        async (_to: string, _vars: { coordinatorName: string; schoolName: string; accessToken: string }): Promise<boolean> =>
            true,
    );
    sendSchoolAccessResent = jest.fn(
        async (_to: string, _vars: { coordinatorName: string; schoolName: string; accessToken: string }): Promise<boolean> =>
            true,
    );

    sendAdminBroadcast = jest.fn(
        async (_to: string, _subject: string, _message: string): Promise<boolean> => true,
    );
    isAdminSmsConfigured = jest.fn((): boolean => false);
    sendAdminSms = jest.fn(async (_toE164: string, _message: string) => ({ ok: true as const }));
}

export function notificationServiceStub(): NotificationServiceTestDouble {
    return new NotificationServiceTestDouble();
}
