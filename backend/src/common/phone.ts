/**
 * A contact phone as collected from the school and partner application forms:
 * 7–20 characters, starting with `+` or a digit, then digits and the usual
 * separators. This mirrors the `pattern` the portal forms enforce, so the
 * server never accepts a number the form itself would have rejected.
 */
export const PHONE_PATTERN = /^[+0-9][0-9()\s-]{6,19}$/;

export const PHONE_MESSAGE =
    'Enter a valid phone number (7–20 digits, optionally with +, spaces or dashes).';
