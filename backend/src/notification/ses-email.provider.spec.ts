import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SesEmailProvider } from './email.provider';

/**
 * The SES transport.
 *
 * Nothing here talks to AWS: the point is the shape of the command, because
 * that is what the two environments disagree about. SES rejects a From address
 * that is not on a verified identity, and while the account is in the sandbox
 * it rejects unverified *recipients* too — both come back as an exception with
 * a name that reads like a permissions problem, so the wrapper has to keep
 * SES's own reason rather than flattening it.
 */
function provider(from = 'noreply@innovationolympiad.in') {
    const p = new SesEmailProvider(from, 'ap-south-2');
    const send = jest.fn().mockResolvedValue({});
    // eslint-disable-next-line @typescript-eslint/dot-notation
    (p as unknown as { client: { send: jest.Mock } })['client'] = { send } as never;
    return { p, send };
}

const MAIL = {
    to: 'student@example.com',
    subject: 'Your Innovation Olympiad code',
    html: '<p>123456</p>',
    text: '123456',
};

describe('SesEmailProvider', () => {
    it('sends from the configured address to the single recipient', async () => {
        const { p, send } = provider();
        await p.send(MAIL);

        const cmd = send.mock.calls[0][0] as SendEmailCommand;
        expect(cmd.input.FromEmailAddress).toBe('noreply@innovationolympiad.in');
        expect(cmd.input.Destination?.ToAddresses).toEqual(['student@example.com']);
    });

    it('carries the subject and both bodies as UTF-8', async () => {
        const { p, send } = provider();
        await p.send(MAIL);

        const simple = (send.mock.calls[0][0] as SendEmailCommand).input.Content?.Simple;
        expect(simple?.Subject).toEqual({ Data: MAIL.subject, Charset: 'UTF-8' });
        expect(simple?.Body?.Html).toEqual({ Data: MAIL.html, Charset: 'UTF-8' });
        expect(simple?.Body?.Text).toEqual({ Data: MAIL.text, Charset: 'UTF-8' });
    });

    // Templates render a text part for most mails but not all; sending an empty
    // Text block is not the same as sending none, and SES treats it differently.
    it('omits the text part entirely when there is none', async () => {
        const { p, send } = provider();
        await p.send({ to: MAIL.to, subject: MAIL.subject, html: MAIL.html });

        const body = (send.mock.calls[0][0] as SendEmailCommand).input.Content?.Simple?.Body;
        expect(body?.Html).toBeDefined();
        expect(body?.Text).toBeUndefined();
    });

    it('sets no configuration set unless one was configured', async () => {
        const { p, send } = provider();
        await p.send(MAIL);
        expect((send.mock.calls[0][0] as SendEmailCommand).input.ConfigurationSetName).toBeUndefined();
    });

    // A sandbox rejection names an unverified recipient, not a bad credential.
    // Losing that detail is what turns a five-minute fix into an afternoon.
    it('keeps SES’s own reason when a send is rejected', async () => {
        const { p, send } = provider();
        send.mockRejectedValue(
            Object.assign(new Error('Email address is not verified. The following identities failed: student@example.com'), {
                name: 'MessageRejected',
            }),
        );

        await expect(p.send(MAIL)).rejects.toThrow(/MessageRejected/);
        await expect(p.send(MAIL)).rejects.toThrow(/not verified/);
    });

    it('reports its name as ses', () => {
        expect(provider().p.name).toBe('ses');
    });
});
