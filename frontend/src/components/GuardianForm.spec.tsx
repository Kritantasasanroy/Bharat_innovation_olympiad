import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GuardianForm from './GuardianForm';

// The pincode lookup hits the network on every complete pincode; stubbed so the
// form's own behaviour is what is under test.
vi.mock('@/lib/schools', () => ({
    lookupPincode: vi.fn().mockResolvedValue({ city: 'Nagpur', state: 'Maharashtra' }),
}));

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

    beforeEach(() => {
        onSubmit = vi.fn();
        render(
            <GuardianForm
                studentName="Aarav Sharma"
                submitLabel="Save and continue"
                busy={false}
                onSubmit={onSubmit}
            />,
        );
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
});
