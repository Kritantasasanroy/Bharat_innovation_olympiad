import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { MEDIA_RULES, ObjectStorageService } from './object-storage.service';

/**
 * The upload ticket is the whole security boundary for question media: it is the
 * only thing standing between "an authenticated admin may upload one file" and
 * "anyone may upload anything to our account forever".
 *
 * These tests pin the two things that are easy to get silently wrong:
 *  - the **Cloudinary signature scheme** (a wrong signature fails at their end,
 *    with an opaque 401, long after the code looks fine here); and
 *  - the **validation gates**, which must reject before anything is signed.
 */

const config = (values: Record<string, string>) => ({
    get: <T>(key: string, fallback?: T) => (values[key] ?? fallback) as T,
});

const CLOUDINARY = {
    STORAGE_PROVIDER: 'cloudinary',
    CLOUDINARY_CLOUD_NAME: 'bio-test',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'super-secret',
};

const service = (values: Record<string, string> = CLOUDINARY) =>
    new ObjectStorageService(config(values) as never);

const ticket = (over: Partial<Parameters<ObjectStorageService['createUploadTicket']>> = []) =>
    service().createUploadTicket(
        (over[0] as never) ?? 'image',
        (over[1] as never) ?? 'diagram.png',
        (over[2] as never) ?? 'image/png',
        (over[3] as never) ?? 1024,
    );

describe('provider selection', () => {
    it('defaults to Cloudinary when only Cloudinary keys are present', () => {
        expect(service().limits.provider).toBe('cloudinary');
        expect(service().isConfigured).toBe(true);
    });

    it('infers S3 when a bucket and key are configured but no provider is named', () => {
        const s3 = service({
            STORAGE_BUCKET: 'bio-media',
            STORAGE_ACCESS_KEY_ID: 'key',
            STORAGE_SECRET_ACCESS_KEY: 'secret',
        });
        expect(s3.limits.provider).toBe('s3');
        expect(s3.isConfigured).toBe(true);
    });

    it('an explicit STORAGE_PROVIDER wins over inference', () => {
        const forced = service({
            ...CLOUDINARY,
            STORAGE_PROVIDER: 's3',
            STORAGE_BUCKET: 'bio-media',
            STORAGE_ACCESS_KEY_ID: 'key',
            STORAGE_SECRET_ACCESS_KEY: 'secret',
        });
        expect(forced.limits.provider).toBe('s3');
    });

    it('a STALE AWS bucket left on a deployment does NOT hijack a working Cloudinary config', () => {
        // The real failure this guards. Render still carried `AWS_S3_BUCKET` and
        // `AWS_ACCESS_KEY_ID` from an earlier config. Inferring "a bucket exists, so
        // use S3" meant the correct Cloudinary keys were ignored and media 503'd
        // with a message about a bucket nobody meant to use. Configuring Cloudinary
        // must be enough to select Cloudinary.
        const stale = service({
            ...CLOUDINARY,
            STORAGE_PROVIDER: '', // not set — inference decides
            AWS_S3_BUCKET: 'leftover-bucket',
            AWS_ACCESS_KEY_ID: 'leftover-key',
        });

        expect(stale.limits.provider).toBe('cloudinary');
        expect(stale.isConfigured).toBe(true);
    });

    it('still falls back to S3 when Cloudinary is only half-configured', () => {
        // A partial Cloudinary config must not shadow a complete S3 one — otherwise
        // a typo'd cloud name would take working storage offline.
        const partial = service({
            CLOUDINARY_CLOUD_NAME: 'bio-test', // key + secret missing
            STORAGE_BUCKET: 'bio-media',
            STORAGE_ACCESS_KEY_ID: 'key',
            STORAGE_SECRET_ACCESS_KEY: 'secret',
        });

        expect(partial.limits.provider).toBe('s3');
        expect(partial.isConfigured).toBe(true);
    });

    it('boots (does not throw) when nothing is configured at all', () => {
        // Media is not worth taking the whole API down for — the platform runs
        // fine without it, and the failure should surface at upload time.
        const none = service({});
        expect(none.isConfigured).toBe(false);
    });

    it('reports 503, not 500, when an upload is attempted while unconfigured', async () => {
        await expect(
            service({}).createUploadTicket('image', 'a.png', 'image/png', 1024),
        ).rejects.toThrow(ServiceUnavailableException);
    });
});

describe('validation — nothing is signed until the file is acceptable', () => {
    it('rejects an unknown media kind', async () => {
        await expect(ticket(['audio' as never])).rejects.toThrow(BadRequestException);
    });

    it('rejects a MIME type that does not match the kind', async () => {
        // A video file smuggled into the image slot would be transcoded as a still.
        await expect(ticket(['image', 'clip.mp4', 'video/mp4', 1024])).rejects.toThrow(
            /Images must be one of/i,
        );
    });

    it('rejects an image over the 10 MB limit', async () => {
        await expect(
            ticket(['image', 'big.png', 'image/png', MEDIA_RULES.image.maxBytes + 1]),
        ).rejects.toThrow(/limit is 10 MB/i);
    });

    it('rejects a video over the 100 MB limit (Cloudinary’s free-plan ceiling)', async () => {
        await expect(
            ticket(['video', 'big.mp4', 'video/mp4', MEDIA_RULES.video.maxBytes + 1]),
        ).rejects.toThrow(/limit is 100 MB/i);
    });

    it('accepts a file exactly on the limit', async () => {
        await expect(
            ticket(['video', 'ok.mp4', 'video/mp4', MEDIA_RULES.video.maxBytes]),
        ).resolves.toMatchObject({ provider: 'cloudinary' });
    });

    it('rejects a zero-byte or nonsense size', async () => {
        await expect(ticket(['image', 'a.png', 'image/png', 0])).rejects.toThrow(/valid file size/i);
        await expect(ticket(['image', 'a.png', 'image/png', NaN])).rejects.toThrow(
            /valid file size/i,
        );
    });
});

describe('Cloudinary ticket', () => {
    it('routes images and videos to the right transcoding pipeline', async () => {
        const image = await ticket(['image', 'a.png', 'image/png', 100]);
        const video = await ticket(['video', 'a.mp4', 'video/mp4', 100]);

        expect(image.uploadUrl).toBe('https://api.cloudinary.com/v1_1/bio-test/image/upload');
        expect(video.uploadUrl).toBe('https://api.cloudinary.com/v1_1/bio-test/video/upload');
    });

    it('signs exactly the params Cloudinary expects — SHA-1 of sorted `k=v&k=v` + secret', async () => {
        const result = await ticket(['image', 'a.png', 'image/png', 100]);
        const fields = result.fields ?? {};

        // Recompute the signature independently, to Cloudinary's documented scheme.
        // `api_key`, `file` and `resource_type` are NOT signed, by design.
        const signable = Object.keys(fields)
            .filter((key) => key !== 'api_key' && key !== 'signature')
            .sort()
            .map((key) => `${key}=${fields[key]}`)
            .join('&');
        const expected = createHash('sha1')
            .update(`${signable}${CLOUDINARY.CLOUDINARY_API_SECRET}`)
            .digest('hex');

        expect(fields.signature).toBe(expected);
        expect(signable).toBe(`folder=bio/questions/images&timestamp=${fields.timestamp}`);
    });

    it('never leaks the API secret to the browser', async () => {
        const result = await ticket();
        // The whole point of signing server-side: the secret stays here. An
        // unsigned upload preset would have travelled to the client instead.
        expect(JSON.stringify(result)).not.toContain(CLOUDINARY.CLOUDINARY_API_SECRET);
        expect(result.fields?.api_key).toBe(CLOUDINARY.CLOUDINARY_API_KEY);
    });

    it('bounds the ticket in time — the timestamp is what expires it', async () => {
        const now = Math.floor(Date.now() / 1000);
        const result = await ticket();
        const timestamp = Number(result.fields?.timestamp);

        // Cloudinary rejects a signature older than an hour, so a leaked ticket is
        // not a standing permit to upload.
        expect(timestamp).toBeGreaterThanOrEqual(now - 2);
        expect(timestamp).toBeLessThanOrEqual(now + 2);
    });

    it('keeps question media in its own folder, so it can be purged on its own', async () => {
        expect((await ticket(['image'])).fields?.folder).toBe('bio/questions/images');
        expect((await ticket(['video', 'a.mp4', 'video/mp4', 10])).fields?.folder).toBe(
            'bio/questions/videos',
        );
    });

    it('does not promise a public URL up front — Cloudinary only reveals it on upload', async () => {
        const result = await ticket();
        // The client must read `secure_url` off the upload response. Handing it a
        // guessed URL here would produce a broken <img> for every question.
        expect(result.publicUrl).toBeUndefined();
    });
});

describe('deleteAsset (gallery permanent delete)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('routes s3 deletes through deleteObject with the given key', async () => {
        const s3 = service({
            STORAGE_PROVIDER: 's3',
            STORAGE_BUCKET: 'bio-media',
            STORAGE_ACCESS_KEY_ID: 'key',
            STORAGE_SECRET_ACCESS_KEY: 'secret',
        });
        const spy = jest.spyOn(s3, 'deleteObject').mockResolvedValue(undefined);

        await s3.deleteAsset('image', 's3', 'questions/images/abc.png');

        expect(spy).toHaveBeenCalledWith('questions/images/abc.png');
    });

    it('signs a Cloudinary destroy the same way the live spec does — SHA-1 of sorted public_id/timestamp + secret', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'ok' }) });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

        await service().deleteAsset('image', 'cloudinary', 'bio/questions/images/abc');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.cloudinary.com/v1_1/bio-test/image/destroy');

        const form = init.body as FormData;
        const publicId = form.get('public_id');
        const timestamp = form.get('timestamp');
        const expected = createHash('sha1')
            .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY.CLOUDINARY_API_SECRET}`)
            .digest('hex');

        expect(form.get('signature')).toBe(expected);
    });

    it('routes a video delete to the video destroy endpoint', async () => {
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'ok' }) });
        (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

        await service().deleteAsset('video', 'cloudinary', 'bio/questions/videos/abc');

        expect(fetchMock.mock.calls[0][0]).toBe('https://api.cloudinary.com/v1_1/bio-test/video/destroy');
    });

    it('treats Cloudinary "not found" as success — the gallery row should still clear', async () => {
        (global as unknown as { fetch: typeof fetch }).fetch = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ result: 'not found' }) }) as unknown as typeof fetch;

        await expect(service().deleteAsset('image', 'cloudinary', 'x')).resolves.toBeUndefined();
    });

    it('throws when Cloudinary refuses the delete', async () => {
        (global as unknown as { fetch: typeof fetch }).fetch = jest
            .fn()
            .mockResolvedValue({ ok: false, json: async () => ({ result: 'error' }) }) as unknown as typeof fetch;

        await expect(service().deleteAsset('image', 'cloudinary', 'x')).rejects.toThrow(BadRequestException);
    });
});
