import {
    BadRequestException,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';

/**
 * Storage for question media (pictures and video).
 *
 * ## The one rule: bytes never touch the API
 *
 * Render gives this API 512 MB of RAM and an **ephemeral disk**. Streaming a
 * 100 MB question video through the Node process would blow the memory budget,
 * and anything written to its disk vanishes on the next deploy. So the API only
 * ever issues a short-lived **upload ticket**; the admin's browser uploads
 * straight to the storage provider and hands us back the resulting URL.
 *
 * ## Two providers, one seam
 *
 * | `STORAGE_PROVIDER` | Used for | Why |
 * |---|---|---|
 * | `cloudinary` (default) | **Testing / now** | 25 GB free, no bucket, no CORS, no IAM. Transcodes video and generates poster frames for free, which matters because a question video is played inline mid-exam. |
 * | `s3` | Later / production | Any S3-compatible endpoint — Cloudflare R2, Backblaze B2, Supabase Storage, MinIO, AWS. The escape hatch when 25 GB runs out. |
 *
 * The provider is chosen once, here. Everything upstream (`ExamService`, the
 * admin uploader) talks to {@link UploadTicket} and does not know which is live.
 *
 * ## Why signed uploads, not an unsigned preset
 *
 * Cloudinary's "unsigned upload preset" needs no server involvement at all — but
 * the preset name travels to the browser, and anyone who reads it can then upload
 * to our account for free, forever. Signing costs one SHA-1 and no extra
 * dependency, and it means only a request that has already passed the admin JWT
 * guard can obtain the right to upload.
 */

export type MediaKind = 'image' | 'video';

/**
 * What each kind of media may be, and how big it may get.
 *
 * The video ceiling is Cloudinary's **free-plan hard limit** (100 MB), not a
 * number we invented — going over it fails at their end regardless of what we
 * allow, so refusing early gives a better error than a 400 from a third party.
 */
export const MEDIA_RULES: Record<MediaKind, { types: string[]; maxBytes: number }> = {
    image: {
        types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
        maxBytes: 10 * 1024 * 1024, // 10 MB — Cloudinary free-plan image limit
    },
    video: {
        types: ['video/mp4', 'video/webm', 'video/quicktime'],
        maxBytes: 100 * 1024 * 1024, // 100 MB — Cloudinary free-plan video limit
    },
};

/**
 * Everything the browser needs to upload one file, and to tell us where it landed.
 *
 * The two providers upload differently, so the ticket says which shape to use
 * rather than pretending they are the same:
 *
 * - **cloudinary** — `POST` a multipart form of `fields` + the file to `uploadUrl`.
 *   The public URL is **not known in advance**; read `secure_url` off the response.
 * - **s3** — `PUT` the raw file to `uploadUrl` with exactly `headers`. The public
 *   URL **is** known in advance; it is `publicUrl`.
 */
export interface UploadTicket {
    provider: 'cloudinary' | 's3';
    uploadUrl: string;
    /** cloudinary: multipart form fields to send alongside the file. */
    fields?: Record<string, string>;
    /** s3: the exact headers the PUT must carry, or the signature fails. */
    headers?: Record<string, string>;
    /** s3 only: the permanent URL. Cloudinary returns its own on upload. */
    publicUrl?: string;
    /** s3 only: the object key — what a later delete needs, since `publicUrl` alone doesn't identify it to the S3 API. */
    key?: string;
    /** Echoed back so the client can refuse an oversized file before it starts. */
    maxBytes: number;
}

@Injectable()
export class ObjectStorageService {
    private readonly logger = new Logger(ObjectStorageService.name);
    private readonly provider: 'cloudinary' | 's3';

    // ── Cloudinary ───────────────────────────────────────────────────────────
    private readonly cloudName: string;
    private readonly apiKey: string;
    private readonly apiSecret: string;

    // ── S3-compatible ────────────────────────────────────────────────────────
    private readonly s3: S3Client | null = null;
    private readonly bucket: string;
    private readonly region: string;
    private readonly publicBaseUrl: string;

    constructor(private config: ConfigService) {
        this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
        this.apiKey = config.get<string>('CLOUDINARY_API_KEY') ?? '';
        this.apiSecret = config.get<string>('CLOUDINARY_API_SECRET') ?? '';

        // Legacy AWS_* names still work, so an older deployment keeps running.
        const endpoint = config.get<string>('STORAGE_ENDPOINT') || undefined;
        this.region =
            config.get<string>('STORAGE_REGION') || config.get<string>('AWS_REGION') || 'auto';
        this.bucket =
            config.get<string>('STORAGE_BUCKET') || config.get<string>('AWS_S3_BUCKET') || '';
        const accessKeyId =
            config.get<string>('STORAGE_ACCESS_KEY_ID') ||
            config.get<string>('AWS_ACCESS_KEY_ID') ||
            '';
        const secretAccessKey =
            config.get<string>('STORAGE_SECRET_ACCESS_KEY') ||
            config.get<string>('AWS_SECRET_ACCESS_KEY') ||
            '';
        this.publicBaseUrl = (config.get<string>('STORAGE_PUBLIC_BASE_URL') ?? '').replace(
            /\/$/,
            '',
        );

        // Provider selection, in strict priority order:
        //   1. An explicit STORAGE_PROVIDER always wins.
        //   2. Otherwise, **Cloudinary wins if it is fully configured.**
        //   3. Otherwise fall back to S3 if a bucket + key are present.
        //
        // Step 2 is deliberately ahead of step 3, and that ordering is load-bearing.
        // The reverse ("a bucket is set, so use S3") means a *stale* `AWS_S3_BUCKET`
        // left on a deployment from an earlier config silently hijacks the provider
        // — the Cloudinary keys are present and correct, and media still 503s with a
        // message about a bucket nobody meant to use. That is precisely what was
        // happening on Render. Configuring Cloudinary should be enough to select it.
        const explicit = config.get<string>('STORAGE_PROVIDER')?.toLowerCase();
        const cloudinaryReady = Boolean(this.cloudName && this.apiKey && this.apiSecret);

        this.provider =
            explicit === 's3' || explicit === 'cloudinary'
                ? explicit
                : cloudinaryReady
                  ? 'cloudinary'
                  : this.bucket && accessKeyId
                    ? 's3'
                    : 'cloudinary';

        if (this.provider === 's3' && this.bucket && accessKeyId && secretAccessKey) {
            this.s3 = new S3Client({
                region: this.region,
                ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
                credentials: { accessKeyId, secretAccessKey },
            });
        }

        if (!this.isConfigured) {
            // Never fail the boot. The rest of the platform works fine without
            // media, and a missing storage key should surface when someone tries
            // to upload — not take the whole API down. (This is exactly the
            // mistake `PaymentService` makes with Razorpay; see DOCUMENTATION §15.)
            this.logger.warn(
                `Media storage is not configured (provider "${this.provider}"). Question media upload will return 503 until it is.`,
            );
        }
    }

    get isConfigured(): boolean {
        return this.provider === 'cloudinary'
            ? Boolean(this.cloudName && this.apiKey && this.apiSecret)
            : this.s3 !== null;
    }

    /** The knobs the admin UI shows next to the upload box. */
    get limits() {
        return {
            provider: this.provider,
            image: MEDIA_RULES.image,
            video: MEDIA_RULES.video,
        };
    }

    // ── Upload tickets ───────────────────────────────────────────────────────

    /**
     * Authorises one direct browser → provider upload of a question's picture or
     * video. Validates kind, MIME type and declared size before signing anything.
     */
    async createUploadTicket(
        kind: MediaKind,
        filename: string,
        contentType: string,
        contentLength: number,
    ): Promise<UploadTicket> {
        const rules = MEDIA_RULES[kind];
        if (!rules) throw new BadRequestException('kind must be "image" or "video".');

        if (!rules.types.includes(contentType)) {
            throw new BadRequestException(
                `${kind === 'image' ? 'Images' : 'Videos'} must be one of: ${rules.types.join(', ')}. Got "${contentType}".`,
            );
        }
        if (!Number.isFinite(contentLength) || contentLength <= 0) {
            throw new BadRequestException('A valid file size is required.');
        }
        if (contentLength > rules.maxBytes) {
            throw new BadRequestException(
                `That ${kind} is ${mb(contentLength)} MB. The limit is ${mb(rules.maxBytes)} MB.`,
            );
        }

        if (!this.isConfigured) {
            throw new ServiceUnavailableException(
                this.provider === 'cloudinary'
                    ? 'Media storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'
                    : 'Media storage is not configured. Set STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY and STORAGE_PUBLIC_BASE_URL.',
            );
        }

        return this.provider === 'cloudinary'
            ? this.cloudinaryTicket(kind, rules.maxBytes)
            : this.s3Ticket(kind, filename, contentType, contentLength, rules.maxBytes);
    }

    /**
     * A signed Cloudinary upload.
     *
     * The signature is a SHA-1 of the signed parameters (alphabetical,
     * `k=v&k=v`) with the API secret appended — Cloudinary's scheme. Only the
     * params we sign are covered, so `file` and `api_key` are deliberately absent
     * from the string: they are not signed, by design.
     *
     * `timestamp` is what bounds the ticket — Cloudinary rejects a signature more
     * than an hour old, so a leaked ticket is not a standing upload permit.
     */
    private cloudinaryTicket(kind: MediaKind, maxBytes: number): UploadTicket {
        const timestamp = Math.floor(Date.now() / 1000);
        // Foldering keeps question media separate from anything else in the account,
        // so it can be listed, quota'd or purged on its own.
        const folder = `bio/questions/${kind}s`;

        const signed: Record<string, string> = {
            folder,
            timestamp: String(timestamp),
        };

        const toSign = Object.keys(signed)
            .sort()
            .map((key) => `${key}=${signed[key]}`)
            .join('&');
        const signature = createHash('sha1').update(`${toSign}${this.apiSecret}`).digest('hex');

        // `video` also covers audio; `image` covers stills. Cloudinary picks the
        // transcoding pipeline from this, so it must match the kind.
        const resourceType = kind === 'video' ? 'video' : 'image';

        return {
            provider: 'cloudinary',
            uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
            fields: {
                ...signed,
                api_key: this.apiKey,
                signature,
            },
            maxBytes,
        };
    }

    /** A presigned S3 PUT. `ContentLength` is signed in, so the client cannot exceed what it declared. */
    private async s3Ticket(
        kind: MediaKind,
        filename: string,
        contentType: string,
        contentLength: number,
        maxBytes: number,
    ): Promise<UploadTicket> {
        const client = this.s3;
        if (!client) throw new ServiceUnavailableException('S3 storage is not configured.');

        // The uploaded name is never trusted into the key — a filename can carry
        // path separators, unicode tricks, or someone else's question id.
        const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
        const key = `questions/${kind}s/${randomUUID()}${ext}`;

        const uploadUrl = await getSignedUrl(
            client,
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType,
                ContentLength: contentLength,
            }),
            { expiresIn: 900 }, // 15 min — a 100 MB video on a slow line needs the room
        );

        return {
            provider: 's3',
            uploadUrl,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(contentLength),
            },
            publicUrl: `${this.publicBaseUrl}/${key}`,
            key,
            maxBytes,
        };
    }

    // ── Server-side helpers (exports, proctor snapshots) ──────────────────────

    /**
     * Uploads a buffer the API itself produced. Only available on the S3 provider —
     * Cloudinary is configured here purely for question media, and routing anything
     * large through this process is the thing this file exists to prevent.
     */
    async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<string> {
        if (!this.s3) {
            throw new ServiceUnavailableException(
                'Server-side upload requires the S3 provider (STORAGE_PROVIDER=s3).',
            );
        }
        await this.s3.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            }),
        );
        return `${this.publicBaseUrl}/${key}`;
    }

    /**
     * Uploads a buffer to whichever provider is live, and reports back what the
     * gallery needs to record it as a {@link MediaAsset}.
     *
     * This is the one sanctioned exception to "bytes never touch the API". It
     * exists for the Google Drive question-image mirror: those files are small
     * (≤10 MB, enforced by the caller) and there is no browser in the loop to
     * do the upload for us, because the source is a Drive folder rather than a
     * file picker. Video deliberately stays browser-direct.
     */
    async uploadImageBuffer(
        buffer: Buffer,
        filename: string,
        contentType: string,
        folder = 'bio/questions/images',
    ): Promise<{ url: string; publicId: string; provider: 'cloudinary' | 's3' }> {
        if (!MEDIA_RULES.image.types.includes(contentType)) {
            throw new BadRequestException(
                `Images must be one of: ${MEDIA_RULES.image.types.join(', ')}. Got "${contentType}".`,
            );
        }
        if (buffer.byteLength > MEDIA_RULES.image.maxBytes) {
            throw new BadRequestException(
                `That image is ${mb(buffer.byteLength)} MB. The limit is ${mb(MEDIA_RULES.image.maxBytes)} MB.`,
            );
        }
        if (!this.isConfigured) {
            throw new ServiceUnavailableException(
                this.provider === 'cloudinary'
                    ? 'Media storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'
                    : 'Media storage is not configured. Set STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY and STORAGE_PUBLIC_BASE_URL.',
            );
        }

        if (this.provider === 's3') {
            const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
            const key = `questions/images/${randomUUID()}${ext}`;
            const url = await this.uploadBuffer(key, buffer, contentType);
            return { url, publicId: key, provider: 's3' };
        }

        // Cloudinary signed upload, same scheme as `cloudinaryTicket`: SHA-1 of
        // the sorted signed params with the secret appended. `file` and
        // `api_key` are not part of the signature, by Cloudinary's design.
        const timestamp = Math.floor(Date.now() / 1000);
        const signed: Record<string, string> = { folder, timestamp: String(timestamp) };
        const toSign = Object.keys(signed)
            .sort()
            .map((k) => `${k}=${signed[k]}`)
            .join('&');
        const signature = createHash('sha1').update(`${toSign}${this.apiSecret}`).digest('hex');

        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), filename);
        form.append('folder', folder);
        form.append('timestamp', String(timestamp));
        form.append('api_key', this.apiKey);
        form.append('signature', signature);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
            { method: 'POST', body: form },
        );
        const body = (await response.json().catch(() => ({}))) as {
            secure_url?: string;
            public_id?: string;
            error?: { message?: string };
        };
        if (!response.ok || !body.secure_url || !body.public_id) {
            const reason = body.error?.message ?? `HTTP ${response.status}`;
            this.logger.error(`Cloudinary upload failed for ${filename}: ${reason}`);
            throw new BadRequestException(`Cloudinary refused the upload: ${reason}`);
        }
        return { url: body.secure_url, publicId: body.public_id, provider: 'cloudinary' };
    }

    async getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
        if (!this.s3) {
            throw new ServiceUnavailableException('Signed reads require the S3 provider.');
        }
        return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
            expiresIn,
        });
    }

    async deleteObject(key: string): Promise<void> {
        if (!this.s3) {
            throw new ServiceUnavailableException('Deletes require the S3 provider.');
        }
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    // ── Gallery deletes (permanent, provider-side) ─────────────────────────────

    /**
     * Permanently removes one gallery asset at the provider that stores it.
     * `publicId` is the Cloudinary public_id or the S3 key — whichever this
     * asset's `provider` was uploaded through (see {@link MediaAsset}).
     */
    async deleteAsset(kind: MediaKind, provider: 'cloudinary' | 's3', publicId: string): Promise<void> {
        if (provider === 's3') return this.deleteObject(publicId);
        return this.deleteCloudinaryAsset(kind, publicId);
    }

    /**
     * Same signed-destroy scheme as the live spec exercises against the real
     * account: SHA-1 of sorted `k=v&k=v` + secret. `result: "not found"` is
     * treated as success — the asset is already gone either way, and the admin
     * gallery row should still clear.
     */
    private async deleteCloudinaryAsset(kind: MediaKind, publicId: string): Promise<void> {
        if (!this.cloudName || !this.apiKey || !this.apiSecret) {
            throw new ServiceUnavailableException('Media storage is not configured.');
        }

        const resourceType = kind === 'video' ? 'video' : 'image';
        const timestamp = Math.floor(Date.now() / 1000);
        const signed: Record<string, string> = { public_id: publicId, timestamp: String(timestamp) };
        const toSign = Object.keys(signed)
            .sort()
            .map((key) => `${key}=${signed[key]}`)
            .join('&');
        const signature = createHash('sha1').update(`${toSign}${this.apiSecret}`).digest('hex');

        const form = new FormData();
        form.append('public_id', publicId);
        form.append('timestamp', String(timestamp));
        form.append('api_key', this.apiKey);
        form.append('signature', signature);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/destroy`,
            { method: 'POST', body: form },
        );
        const body = await response.json().catch(() => ({}) as { result?: string });
        if (!response.ok || (body.result !== 'ok' && body.result !== 'not found')) {
            this.logger.error(`Cloudinary destroy failed for ${publicId}: ${JSON.stringify(body)}`);
            throw new BadRequestException('Cloudinary refused to delete that asset.');
        }
    }
}

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
