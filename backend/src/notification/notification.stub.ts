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
export function notificationServiceStub(): any {
    const sent = jest.fn().mockResolvedValue(true);
    const noop = jest.fn().mockResolvedValue(undefined);
    return {
        sendOtpSms: jest.fn().mockResolvedValue('000000'),
        sendOtpVoice: noop,
        smsDiagnostics: jest.fn().mockResolvedValue({ provider: 'stub', voice: 'stub' }),
        smsProbe: jest.fn().mockResolvedValue({ provider: 'stub' }),
        smsDeliveryReport: jest.fn().mockResolvedValue('stub'),
        sendWelcome: noop,
        sendAccessPassActivated: noop,
        sendSlotConfirmed: noop,
        sendExamSubmitted: noop,
        sendResultsPublished: noop,
        sendParentApprovalEmail: sent,
        sendPartnerApplicationReceived: sent,
        sendPartnerApproved: sent,
        sendPartnerRejected: sent,
        sendPartnerRevoked: sent,
        sendPartnerTokenRotated: sent,
        sendPartnerAccessResent: sent,
        sendPartnerSchoolStatusChanged: sent,
        sendSchoolApplicationReceived: sent,
        sendSchoolApproved: sent,
        sendSchoolRejected: sent,
        sendSchoolRevoked: sent,
        sendSchoolTokenRotated: sent,
        sendSchoolAccessResent: sent,
        sendAdminBroadcast: sent,
        isAdminSmsConfigured: jest.fn().mockReturnValue(false),
        sendAdminSms: jest.fn().mockResolvedValue({ ok: true }),
    };
}
