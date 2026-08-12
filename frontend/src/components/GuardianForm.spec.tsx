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

/**
 * A complete profile already on file, so the consent tests are not blocked by
 * the fields that come before the consents.
 *
 * Every one of these is mandatory now — date of birth, gender and *both* sides
 * of the ID — so a fixture missing any of them would stop at the first
 * validation check and never reach the consent behaviour under test.
 */
const WITH_DOCUMENT = {
    studentDob: '2012-04-18',
    gender: 'Female',
    idDocumentType: 'School ID Card',
    idDocumentUrl: 'https://cdn.example/existing-id.jpg',
    idDocumentBackUrl: 'https://cdn.example/existing-id-back.jpg',
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

    /** The two student details that are now mandatory alongside the ID. */
    const fillStudent = () => {
        fireEvent.change(screen.getByLabelText(/date of birth/i), {
            target: { value: '2012-04-18' },
        });
        fireEvent.change(screen.getByLabelText(/gender/i), { target: { value: 'Female' } });
    };

    /** Uploads one side and waits for it to be acknowledged on screen. */
    const upload = async (label: RegExp, filename: string) => {
        const input = screen.getByLabelText(label);
        const file = new File(['x'], filename, { type: 'image/jpeg' });
        Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 });
        fireEvent.change(input, { target: { files: [file] } });
        await screen.findByText(new RegExp(`uploaded: ${filename}`, 'i'));
    };

    const consents = () => screen.getAllByRole('checkbox');

    let onSubmit: ReturnType<typeof vi.fn>;

    /** Renders the form; `initial` lets a test start with fields already set. */
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
        // The mock is module-scoped, so its call log survives between tests.
        // Without this, "does not contact the server" passes or fails depending
        // on whether an earlier test happened to upload something — which is
        // exactly the kind of order-dependence that makes a suite untrustworthy.
        // `mockClear` and not `resetAllMocks`: the resolved value is part of the
        // fixture, not of any one test.
        vi.mocked(api.post).mockClear();
        // Most cases are about the consent rules, so they start with every
        // mandatory field before the consents already filled in.
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

    // Nothing on this form is optional any more. Date of birth used to be, and
    // it is the one the age band is derived from.
    it('refuses to submit with the student details left blank', async () => {
        cleanup();
        mount({
            idDocumentUrl: 'https://cdn.example/a.jpg',
            idDocumentBackUrl: 'https://cdn.example/b.jpg',
        } as never);
        fill();
        consents().forEach((box) => fireEvent.click(box));
        fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

        await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    });

    describe('the mandatory ID document', () => {
        // School ID is the document the olympiad actually wants: it is the only
        // one of the three that shows the school and class a student registered
        // under, and it avoids collecting a minor's Aadhaar by default.
        it('offers the school ID first, and picks it by default', () => {
            const select = screen.getByLabelText(/document type/i) as HTMLSelectElement;
            expect(select.value).toBe('School ID Card');
            expect(select.options[0].value).toBe('School ID Card');
        });

        // The preference and the two-sides rule have to be *stated*. A reordered
        // dropdown alone does not tell a parent reaching for Aadhaar by habit
        // why the school card is the better answer, and a missing back is the
        // most likely reason a submission gets bounced.
        it('says on screen which document is preferred, and that both sides are needed', () => {
            expect(
                screen.getByText(/school ID card if you have one/i),
            ).toBeInTheDocument();
            expect(screen.getByText(/both sides are required/i)).toBeInTheDocument();
        });

        it('blocks submission when neither side has been uploaded', async () => {
            cleanup();
            mount(); // nothing on file
            fill();
            fillStudent();
            consents().forEach((box) => fireEvent.click(box));
            fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

            await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
            expect(await screen.findByText(/upload the front/i)).toBeInTheDocument();
        });

        // The half-finished case, and the likelier one: the front is the side
        // everyone remembers.
        it('blocks submission when only the front has been uploaded', async () => {
            cleanup();
            mount();
            fill();
            fillStudent();
            await upload(/front of the card/i, 'front.jpg');
            consents().forEach((box) => fireEvent.click(box));
            fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

            await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
            expect(await screen.findByText(/upload the back/i)).toBeInTheDocument();
        });

        it('rejects a file over the size limit without contacting the server', async () => {
            cleanup();
            mount();
            const input = screen.getByLabelText(/front of the card/i);
            const huge = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
            // 11 MB — over the 10 MB cap the server also enforces.
            Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });

            fireEvent.change(input, { target: { files: [huge] } });

            // The point of the client-side cap: the parent is told immediately
            // rather than waiting out an upload that is going to be refused.
            expect(await screen.findByText(/the limit is 10 MB/i)).toBeInTheDocument();
            expect(api.post).not.toHaveBeenCalled();
        });

        it('uploads both sides and keeps only the returned URLs', async () => {
            cleanup();
            mount();
            await upload(/front of the card/i, 'front.jpg');
            await upload(/back of the card/i, 'back.jpg');

            expect(api.post).toHaveBeenCalledWith('/guardian/id-document', expect.any(FormData));

            fill();
            fillStudent();
            consents().forEach((box) => fireEvent.click(box));
            fireEvent.click(screen.getByRole('button', { name: /save and continue/i }));

            await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
            // URLs, not megabytes of base64 — this is the 413 fix.
            expect(onSubmit.mock.calls[0][0].idDocumentUrl).toBe('https://cdn.example/id.jpg');
            expect(onSubmit.mock.calls[0][0].idDocumentBackUrl).toBe('https://cdn.example/id.jpg');
        });

        // Each side owns its upload state. Sharing one set of
        // filename/uploading/error flags made picking the back blank the
        // "✓ Uploaded" line under the front, which reads as the front being
        // lost — and a parent would upload it again.
        it('keeps each side’s confirmation independent', async () => {
            cleanup();
            mount();
            await upload(/front of the card/i, 'front.jpg');
            await upload(/back of the card/i, 'back.jpg');
            expect(screen.getByText(/uploaded: front.jpg/i)).toBeInTheDocument();
            expect(screen.getByText(/uploaded: back.jpg/i)).toBeInTheDocument();
        });
    });
});
