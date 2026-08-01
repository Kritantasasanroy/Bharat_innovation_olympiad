import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import GuardianForm from './GuardianForm';

// The ID document upload posts to the API; stubbed so the form's own behaviour
// is what is under test. The real upload is covered end-to-end against a running
// backend and Cloudinary.
vi.mock('@/lib/api', () => ({
    default: { post: vi.fn().mockResolvedValue({ data: { url: 'https://cdn.example/id.jpg' } }) },
}));

/** A document already on file, so consent tests aren't blocked by the upload. */
const WITH_DOCUMENT = {
    idDocumentType: 'Aadhaar Card',
    idDocumentUrl: 'https://cdn.example/existing-id.jpg',
};

/**
 * Registration part 2 — the client half of the consent rule.
 *
 * The server rejects a submission with either consent unticked; this pins that
 * the form never *sends* one, so a parent cannot get as far as a server error and
 * conclude the site is broken. Both halves matter: the client for the experience,
 * the server for the guarantee.
 */
describe('GuardianForm', () => {
    const fill = () => {
        fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Meera' } });
        fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Sharma' } });
        fireEvent.change(screen.getByLabelText(/email address/i), {
            target: { value: 'meera@example.com' },
        });
        fireEvent.change(screen.getByLabelText(/mobile number/i), {
            target: { value: '9876543210' },
        });
    };

    const consents = () => screen.getAllByRole('checkbox');

    let onSubmit: ReturnType<typeof vi.fn>;

    /** Renders the form; `initial` lets a test start with a document on file. */
    const mount = (initial?: Record<string, string>) => {
        onSubmit = vi.fn();
        return render(
            <GuardianForm
                studentName="Aarav Sharma"
                initial={initial as never}
                submitLabel="Save and continue"
                busy={false}
                onSubmit={onSubmit}
            />,
        );
    };

    beforeEach(() => {
        // Most cases are about the consent rules, so they start with the
        // mandatory ID document already attached.
        mount(WITH_DOCUMENT);
    });

    it('disables submit until both consents are ticked', () => {
        const submit = screen.getByRole('button', { name: /save and continue/i });
        expect(submit).toBeDisabled();

        fireEvent.click(consents()[0]);
        expect(submit).toBeDisabled();

        fireEvent.click(consents()[1]);
        expect(submit).toBeEnabled();
    });

    it('does not submit with only one consent ticked', async () => {
        fill();
        fireEvent.click(consents()[0]);
        fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

        await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    });

    it('submits both consents once the form is complete', async () => {
        fill();
        consents().forEach((box) => fireEvent.click(box));
        fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0][0]).toMatchObject({
            guardianFirstName: 'Meera',
            guardianEmail: 'meera@example.com',
            parentalConsent: true,
            dataConsent: true,
        });
    });

    it('refuses to submit with the name left blank', async () => {
        consents().forEach((box) => fireEvent.click(box));
        fireEvent.change(screen.getByLabelText(/email address/i), {
            target: { value: 'meera@example.com' },
        });
        fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '9876543210' } });
        fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

        // Blocked by the browser's own `required` validation before the submit
        // handler runs, so no custom message appears — which is why this asserts
        // the outcome (nothing is sent) rather than the wording. The handler's
        // own name check still covers a whitespace-only name, which `required`
        // lets through.
        await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
        expect(screen.getByLabelText(/first name/i)).toBeInvalid();
    });

    it('refuses a whitespace-only name, which `required` alone would allow', async () => {
        fill();
        fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: '   ' } });
        consents().forEach((box) => fireEvent.click(box));
        fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

        await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
        expect(await screen.findByText(/full name/i)).toBeInTheDocument();
    });

    it('names the student in the consent wording', () => {
        // A parent consenting for the wrong child is the failure this prevents;
        // the name has to be in the sentence they are agreeing to.
        expect(screen.getAllByText(/Aarav Sharma/).length).toBeGreaterThan(0);
    });

    it('says both boxes are required while either is unticked', () => {
        expect(screen.getByText(/both boxes must be ticked/i)).toBeInTheDocument();
    });

    describe('the mandatory ID document', () => {
        it('blocks submission when none has been uploaded', async () => {
            cleanup();
            mount(); // no document on file
            fill();
            consents().forEach((box) => fireEvent.click(box));
            fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

            await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
            expect(await screen.findByText(/upload the student/i)).toBeInTheDocument();
        });

        it('rejects a file over the size limit without contacting the server', async () => {
            cleanup();
            mount();
            const input = screen.getByLabelText(/upload document/i);
            const huge = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
            // 11 MB — over the 10 MB cap the server also enforces.
            Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });

            fireEvent.change(input, { target: { files: [huge] } });

            // The point of the client-side cap: the parent is told immediately
            // rather than waiting out an upload that is going to be refused.
            expect(await screen.findByText(/the limit is 10 MB/i)).toBeInTheDocument();
            expect(api.post).not.toHaveBeenCalled();
        });

        it('uploads an acceptable file and keeps only the returned URL', async () => {
            cleanup();
            mount();
            const input = screen.getByLabelText(/upload document/i);
            const file = new File(['x'], 'aadhaar.jpg', { type: 'image/jpeg' });
            Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 });

            fireEvent.change(input, { target: { files: [file] } });

            await waitFor(() => expect(api.post).toHaveBeenCalledWith('/guardian/id-document', expect.any(FormData)));
            expect(await screen.findByText(/uploaded: aadhaar.jpg/i)).toBeInTheDocument();

            fill();
            consents().forEach((box) => fireEvent.click(box));
            fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

            await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
            // The URL, not megabytes of base64 — this is the 413 fix.
            expect(onSubmit.mock.calls[0][0].idDocumentUrl).toBe('https://cdn.example/id.jpg');
        });
    });
});
