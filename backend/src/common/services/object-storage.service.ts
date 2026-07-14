import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * Object storage for question media, proctor snapshots and exports.
 *
 * **Why not Render.** Render's free tier gives the API 512 MB of RAM and an
 * ephemeral disk. Streaming a 100 MB question video through the Node process
 * would blow the memory budget, and anything written to disk vanishes on the
 * next deploy. So bytes never touch the API at all: the browser asks for a
 * **presigned PUT URL** and uploads straight to the bucket. The API only ever
 * handles the (tiny) signature and the resulting public URL.
 *
 * **Provider-agnostic.** This speaks the S3 API against a configurable endpoint,
 * so it runs unchanged on **Cloudflare R2** (the default and the recommendation:
 * 10 GB free, and — the reason it matters here — **zero egress fees**, which a
 * video-heavy exam will otherwise rack up fast), Backblaze B2, Supabase Storage,
 * MinIO, or plain AWS S3. Only env vars change.
 *
 * Set:
 *   STORAGE_ENDPOINT          https://<account-id>.r2.cloudflarestorage.com
 *   STORAGE_REGION            auto            (R2; AWS wants a real region)
 *   STORAGE_BUCKET            bio-media
 *   STORAGE_ACCESS_KEY_ID     …
 *   STORAGE_SECRET_ACCESS_KEY …
 *   STORAGE_PUBLIC_BASE_URL   https://pub-<hash>.r2.dev   (or your CDN domain)
 *
 * The bucket needs public read on the `questions/` prefix and a CORS rule
 * allowing `PUT` from the admin origin — see DOCUMENTATION.md §4.
 */

export type MediaKind = 'image' | 'video';

/** What each kind of media is allowed to be, and how big it may get. */
export const MEDIA_RULES: Record<MediaKind, { types: string[]; maxBytes: number }> = {
    image: {
        types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
        maxBytes: 10 * 1024 * 1024, // 10 MB
    },
    video: {
        types: ['video/mp4', 'video/webm', 'video/quicktime'],
        // Generous, but bounded: the signed URL pins Content-Length, so a client
        // cannot upload more than it declared, and it cannot declare more than this.
        maxBytes: 200 * 1024 * 1024, // 200 MB
    },
};

export interface PresignedUpload {
    uploadUrl: string;
    publicUrl: string;
    key: string;
    /** Echoed back so the client can fail fast before it starts the PUT. */
    maxBytes: number;
    /** The client must send exactly these headers on the PUT, or the signature fails. */
    requiredHeaders: Record<string, string>;
}

@Injectable()
export class ObjectStorageService {
    private readonly logger = new Logger(ObjectStorageService.name);
    private readonly client: S3Client | null;
    private readonly bucket: string;
    private readonly region: string;
    private readonly publicBaseUrl: string;

    constructor(private config: ConfigService) {
        // Legacy AWS_* names are still honoured so an existing deployment keeps
        // working without an env change.
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

        this.publicBaseUrl = (
            config.get<string>('STORAGE_PUBLIC_BASE_URL') ||
            (this.bucket ? `https://${this.bucket}.s3.${this.region}.amazonaws.com` : '')
        ).replace(/\/$/, '');

        if (!this.bucket || !accessKeyId || !secretAccessKey) {
            // Boot must not fail — the rest of the platform works fine without
            // media, and a missing bucket should surface when someone tries to
            // upload, not take the whole API down. (This is the mistake
            // PaymentService made with Razorpay; see DOCUMENTATION.md §15.)
            this.client = null;
            this.logger.warn(
                'Object storage is not configured (STORAGE_BUCKET / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY). Question media upload will be unavailable.',
            );
            return;
        }

        this.client = new S3Client({
            region: this.region,
            ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
            credentials: { accessKeyId, secretAccessKey },
        });
    }

    get isConfigured(): boolean {
        return this.client !== null;
    }

    private require(): S3Client {
        if (!this.client) {
            throw new ServiceUnavailableException(
                'Media storage is not configured on this environment. Set STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY and STORAGE_PUBLIC_BASE_URL.',
            );
        }
        return this.client;
    }

    // ── Key generators ───────────────────────────────────────────────────────

    static questionMediaKey(kind: MediaKind, filename: string) {
        const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
        // The uploaded name is never trusted into the key — a filename can carry
        // path separators, unicode tricks, or someone else's question id.
        return `questions/${kind}s/${randomUUID()}${ext}`;
    }

    static profilePhotoKey(userId: string) {
        return `profiles/${userId}.jpg`;
    }

    static proctorSnapshotKey(attemptId: string, timestamp: number) {
        return `proctoring/${attemptId}/${timestamp}.jpg`;
    }

    static exportKey(filename: string) {
        return `exports/${filename}`;
    }

    // ── Upload ───────────────────────────────────────────────────────────────

    /**
     * Signs a direct browser → bucket upload for one piece of question media.
     *
     * `contentLength` is signed into the URL, so the client cannot upload a file
     * larger than the one it declared — without it, a 200 MB cap on the request
     * body would be a suggestion rather than a limit.
     */
    async presignQuestionMedia(
        kind: MediaKind,
        filename: string,
        contentType: string,
        contentLength: number,
    ): Promise<PresignedUpload> {
        const rules = MEDIA_RULES[kind];
        if (!rules) throw new BadRequestException(`Unsupported media kind: ${kind}`);

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

        const client = this.require();
        const key = ObjectStorageService.questionMediaKey(kind, filename);

        const uploadUrl = await getSignedUrl(
            client,
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType,
                ContentLength: contentLength,
            }),
            { expiresIn: 900 }, // 15 min — a 200 MB video on a slow line needs the room
        );

        return {
            uploadUrl,
            publicUrl: this.publicUrl(key),
            key,
            maxBytes: rules.maxBytes,
            requiredHeaders: {
                'Content-Type': contentType,
                'Content-Length': String(contentLength),
            },
        };
    }

    /** Server-side upload, for things the API itself generates (exports, snapshots). */
    async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<string> {
        await this.require().send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            }),
        );
        return this.publicUrl(key);
    }

    async getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
        return getSignedUrl(
            this.require(),
            new GetObjectCommand({ Bucket: this.bucket, Key: key }),
            { expiresIn },
        );
    }

    async deleteObject(key: string): Promise<void> {
        await this.require().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    /** The permanent, public URL for a key. Stored on `Question.imageUrl` / `videoUrl`. */
    publicUrl(key: string): string {
        return `${this.publicBaseUrl}/${key}`;
    }
}

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
