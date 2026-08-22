/**
 * The single source of truth for the app's JWT signing/verification secret.
 *
 * Every module used to independently fall back to the literal string
 * `'dev-jwt-secret'` whenever `JWT_SECRET` was unset. That string is public —
 * it is sitting in this repository — so an environment that forgot to set
 * `JWT_SECRET` was not "insecure by omission", it was signing and accepting
 * admin/partner/school tokens under a password anyone can read. Failing fast
 * at boot is strictly safer than staying up on a known secret.
 *
 * Every caller of this file must have `JWT_SECRET` set for its environment —
 * it already is in `backend/.env` locally and is documented in
 * `backend/.env.example`.
 */
export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error(
            'JWT_SECRET is not set. Refusing to start with a hardcoded fallback secret — ' +
                'set JWT_SECRET in the environment before starting the backend.',
        );
    }
    return secret;
}
