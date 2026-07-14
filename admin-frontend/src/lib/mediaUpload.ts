import api from '@/lib/api';

/**
 * Shared upload path for question media (picture/video), used by both the
 * per-question uploader and the media gallery. The file never passes through
 * our API — see `ObjectStorageService` on the backend for why (Render's
 * 512 MB instance cannot stream a 100 MB video). This module only ever:
 *  1. asks the backend for a short-lived upload ticket,
 *  2. sends the file straight to the storage provider, and
 *  3. records the finished upload in the gallery (`MediaAsset`) so it can be
 *     reused across questions and deleted independent of any one of them.
 */

export type MediaKind = 'image' | 'video';

export const MEDIA_LIMITS: Record<MediaKind, { label: string; accept: string; maxMb: number }> = {
    image: { label: 'Picture', accept: 'image/*', maxMb: 10 },
    video: { label: 'Video', accept: 'video/mp4,video/webm,video/quicktime', maxMb: 100 },
};

interface UploadTicket {
    provider: 'cloudinary' | 's3';
    uploadUrl: string;
    fields?: Record<string, string>;
    headers?: Record<string, string>;
    publicUrl?: string;
    key?: string;
    maxBytes: number;
}

export interface UploadedAsset {
    url: string;
    provider: 'cloudinary' | 's3';
    /** Cloudinary public_id, or the S3 object key — what a later delete needs. */
    publicId: string;
}

/** Uploads one file and records it in the gallery. Throws with a message fit to show the admin. */
export async function uploadMediaFile(
    kind: MediaKind,
    file: File,
    onProgress?: (pct: number) => void,
): Promise<UploadedAsset> {
    const limit = MEDIA_LIMITS[kind];
    if (file.size > limit.maxMb * 1024 * 1024) {
        throw new Error(
            `That ${kind} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${limit.maxMb} MB.`,
        );
    }

    let ticket: UploadTicket;
    try {
        const { data } = await api.get<UploadTicket>('/admin/questions/media-upload-url', {
            params: { kind, filename: file.name, contentType: file.type, contentLength: file.size },
        });
        ticket = data;
    } catch (err: unknown) {
        const message =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (err as Error)?.message;
        throw new Error(message || `Could not authorise that ${kind} upload.`);
    }

    const asset =
        ticket.provider === 'cloudinary'
            ? await uploadToCloudinary(kind, ticket, file, onProgress)
            : await uploadToS3(ticket, file, onProgress);

    // Gallery bookkeeping is secondary to the upload itself — a question can
    // still save the URL even if this call fails, so don't let it throw.
    try {
        await api.post('/admin/media', {
            kind: kind === 'image' ? 'IMAGE' : 'VIDEO',
            provider: asset.provider,
            url: asset.url,
            publicId: asset.publicId,
            filename: file.name,
            bytes: file.size,
        });
    } catch {
        /* not fatal — see above */
    }

    return asset;
}

/**
 * Cloudinary wants a multipart POST of the signed fields plus the file, and only
 * then tells us the URL (and the `public_id` a later delete needs). XHR rather
 * than fetch, because a 100 MB video on a slow connection needs a real progress bar.
 */
function uploadToCloudinary(
    kind: MediaKind,
    ticket: UploadTicket,
    file: File,
    onProgress?: (pct: number) => void,
): Promise<UploadedAsset> {
    const form = new FormData();
    for (const [key, val] of Object.entries(ticket.fields ?? {})) form.append(key, val);
    form.append('file', file);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', ticket.uploadUrl);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                let reason = `Upload failed (${xhr.status}).`;
                try {
                    reason = JSON.parse(xhr.responseText)?.error?.message ?? reason;
                } catch {
                    /* keep the status-code message */
                }
                reject(new Error(reason));
                return;
            }

            try {
                const body = JSON.parse(xhr.responseText);
                if (!body.secure_url) throw new Error('Upload succeeded but returned no URL.');
                if (!body.public_id) throw new Error('Upload succeeded but returned no public_id.');
                resolve({ url: body.secure_url as string, provider: 'cloudinary', publicId: body.public_id as string });
            } catch (err) {
                reject(err instanceof Error ? err : new Error('Could not read the upload response.'));
            }
        };

        xhr.onerror = () => reject(new Error('Could not reach the storage provider.'));
        xhr.send(form);
    });
}

/** S3-compatible: a raw PUT with exactly the signed headers. The URL (and key) are known already. */
function uploadToS3(
    ticket: UploadTicket,
    file: File,
    onProgress?: (pct: number) => void,
): Promise<UploadedAsset> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', ticket.uploadUrl);

        for (const [key, val] of Object.entries(ticket.headers ?? {})) {
            if (key.toLowerCase() === 'content-length') continue;
            xhr.setRequestHeader(key, val);
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`Storage rejected the upload (${xhr.status}).`));
                return;
            }
            if (!ticket.publicUrl || !ticket.key) {
                reject(new Error('Upload succeeded but no public URL was issued.'));
                return;
            }
            resolve({ url: ticket.publicUrl, provider: 's3', publicId: ticket.key });
        };

        xhr.onerror = () => reject(new Error('Could not reach the storage provider.'));
        xhr.send(file);
    });
}
