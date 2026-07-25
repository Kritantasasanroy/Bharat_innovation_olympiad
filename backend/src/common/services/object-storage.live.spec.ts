import { createHash } from 'crypto';
import { ObjectStorageService } from './object-storage.service';

/**
 * A **live** check against the real Cloudinary account: it performs an actual
 * signed upload and then deletes the probe asset.
 *
 * Why this exists as well as the offline signature tests: a signature that is
 * subtly wrong — or an API key without upload rights — fails with an opaque 401
 * or 403 *at Cloudinary's end*, which locally looks like perfectly healthy code.
 * The only way to know the ticket is genuinely usable is to use one.
 *
 * It **skips itself** when Cloudinary credentials are not in the environment, so
 * `npx jest` stays green on a machine that has none. To run it:
 *
 *   cd backend && npx jest object-storage.live      # reads backend/.env
 */

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const KEY = process.env.CLOUDINARY_API_KEY ?? '';
const SECRET = process.env.CLOUDINARY_API_SECRET ?? '';

const configured = Boolean(CLOUD && KEY && SECRET);

const config = {
    get: <T>(k: string, fallback?: T) =>
        (({
            STORAGE_PROVIDER: 'cloudinary',
            CLOUDINARY_CLOUD_NAME: CLOUD,
            CLOUDINARY_API_KEY: KEY,
            CLOUDINARY_API_SECRET: SECRET,
        })[k] ?? fallback) as T,
};

/** A real 1x1 transparent PNG — the smallest thing Cloudinary will accept as an image. */
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

// `describe.skip` rather than a silent pass: a skipped test is visibly not run,
// whereas a test that passes because it checked nothing is a lie.
const suite = configured ? describe : describe.skip;

suite('LIVE — a ticket this service signs is accepted by Cloudinary', () => {
    it('uploads a real image with the generated signature, then deletes it', async () => {
        const service = new ObjectStorageService(config as never);
        expect(service.isConfigured).toBe(true);

        const ticket = await service.createUploadTicket(
            'image',
            'probe.png',
            'image/png',
            PNG.length,
        );
        expect(ticket.provider).toBe('cloudinary');

        // Exactly what the admin browser does: a multipart POST of the signed
        // fields plus the file.
        const form = new FormData();
        for (const [k, v] of Object.entries(ticket.fields ?? {})) form.append(k, v);
        form.append('file', new Blob([PNG], { type: 'image/png' }), 'probe.png');

        const response = await fetch(ticket.uploadUrl, { method: 'POST', body: form });
        const body = await response.json();

        if (response.status === 403 && /missing permissions/i.test(body?.error?.message ?? '')) {
            throw new Error(
                'The Cloudinary API key authenticates but is READ-ONLY — it has no "create" permission, so it cannot upload. ' +
                    'Fix it in the Cloudinary console (Settings → API Keys): give this key write access, or generate a new key with it. ' +
                    `Cloudinary said: ${body.error.message}`,
            );
        }

        expect(response.status).toBe(200);
        expect(body.secure_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
        // The folder we sign is what keeps question media separable from anything
        // else that ever lands in this account.
        expect(body.public_id).toContain('bio/questions/images');

        // Clean up the probe, so the account is left exactly as we found it.
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHash('sha1')
            .update(`public_id=${body.public_id}&timestamp=${timestamp}${SECRET}`)
            .digest('hex');

        const destroy = new FormData();
        destroy.append('public_id', body.public_id);
        destroy.append('timestamp', String(timestamp));
        destroy.append('api_key', KEY);
        destroy.append('signature', signature);

        const deleted = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, {
            method: 'POST',
            body: destroy,
        });
        expect((await deleted.json()).result).toBe('ok');
    }, 30_000);
});
