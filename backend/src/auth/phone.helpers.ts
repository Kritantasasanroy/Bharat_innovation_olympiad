import { BadRequestException } from '@nestjs/common';

const DEFAULT_COUNTRY_CODE = '91';

/**
 * Normalise a typed number to E.164 (`+91XXXXXXXXXX`).
 *
 * Phone numbers double as a login identifier, so the *same* number typed as
 * `98765 43210`, `+91-9876543210` or `09876543210` has to resolve to one
 * stored value — otherwise the unique index lets one person hold several
 * accounts on the same line and OTP sign-in picks an arbitrary one.
 */
export function normalizePhone(raw: string): string {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) throw new BadRequestException('Phone number is required');

    // Keep a leading `+` (country-code marker); drop spaces, hyphens, brackets.
    const hasPlus = trimmed.startsWith('+');
    let digits = trimmed.replace(/\D/g, '');

    if (!hasPlus) {
        // Indian domestic forms: `0XXXXXXXXXX` (trunk prefix) and bare 10-digit.
        if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
        if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
    }

    // E.164 allows at most 15 digits; a country code plus subscriber number is
    // never shorter than 8.
    if (digits.length < 8 || digits.length > 15) {
        throw new BadRequestException('Enter a valid phone number');
    }

    return `+${digits}`;
}
