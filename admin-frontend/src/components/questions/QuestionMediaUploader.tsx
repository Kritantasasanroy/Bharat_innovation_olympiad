'use client';

import api from '@/lib/api';
import { useState } from 'react';

/**
 * Attaches a picture and/or a video to a question (item 13).
 *
 * **The file never passes through our API.** The browser asks the backend for a
 * short-lived *upload ticket* and sends the file straight to the storage provider
 * (Cloudinary today). Render's API instance has 512 MB of RAM and an ephemeral
 * disk — streaming a 100 MB question video through it would blow the memory
 * budget, and anything written to its disk vanishes on the next deploy. The API
 * only ever handles the signature.
 *
 * Two upload shapes, because the providers genuinely differ (see
 * `ObjectStorageService`):
 *  - **cloudinary** — multipart `POST`; the public URL is only known *after* the
 *    upload, from `secure_url` on the response.
 *  - **s3** — raw `PUT`; the public URL is known up front.
 *
 * A question can carry a picture **and** a video at once, so these are two
 * independent slots rather than one "media" field.
 */

export interface QuestionMedia {
    imageUrl: string | null;
    videoUrl: string | null;
}

interface UploadTicket {
    provider: 'cloudinary' | 's3';
    uploadUrl: string;
    fields?: Record<string, string>;
    headers?: Record<string, string>;
    publicUrl?: string;
    maxBytes: number;
}

const LIMITS = {
    image: { label: 'Picture', accept: 'image/*', maxMb: 10 },
    video: { label: 'Video', accept: 'video/mp4,video/webm,video/quicktime', maxMb: 100 },
} as const;

type Kind = keyof typeof LIMITS;

export default function QuestionMediaUploader({
    value,
    onChange,
}: {
    value: QuestionMedia;
    onChange: (next: QuestionMedia) => void;
}) {
    const [busy, setBusy] = useState<Kind | null>(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');

    async function upload(kind: Kind, file: File) {
        const limit = LIMITS[kind];
        if (file.size > limit.maxMb * 1024 * 1024) {
            setError(
                `That ${kind} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${limit.maxMb} MB.`,
            );
            return;
        }

        setBusy(kind);
        setError('');
        setProgress(0);

        try {
            // 1. Ask our API to authorise the upload. This is the only call that
            //    carries our JWT — the storage provider must never see it.
            const { data: ticket } = await api.get<UploadTicket>(
                '/admin/questions/media-upload-url',
                {
                    params: {
                        kind,
                        filename: file.name,
                        contentType: file.type,
                        contentLength: file.size,
                    },
                },
            );

            // 2. Upload straight to the provider. A bare fetch/XHR, NOT our `api`
            //    client — attaching our Authorization header here would break the
            //    provider's own signature check.
            const url =
                ticket.provider === 'cloudinary'
                    ? await uploadToCloudinary(ticket, file, setProgress)
                    : await uploadToS3(ticket, file, setProgress);

            onChange({ ...value, [kind === 'image' ? 'imageUrl' : 'videoUrl']: url });
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                (err as Error)?.message;
            setError(message || `Could not upload that ${kind}.`);
        } finally {
            setBusy(null);
        }
    }

    const clear = (kind: Kind) =>
        onChange({ ...value, [kind === 'image' ? 'imageUrl' : 'videoUrl']: null });

    return (
        <div className="form-group">
            <label>Media (optional)</label>
            <p className="hint hint-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Attach a picture and/or a video. Students see these above the question while sitting
                the exam.
            </p>

            {error && <div className="form-error">{error}</div>}

            <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                {(Object.keys(LIMITS) as Kind[]).map((kind) => {
                    const url = kind === 'image' ? value.imageUrl : value.videoUrl;
                    const limit = LIMITS[kind];

                    return (
                        <div key={kind} className="media-slot">
                            <div className="media-slot-head">
                                <strong>{limit.label}</strong>
                                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                    max {limit.maxMb} MB
                                </span>
                            </div>

                            {url ? (
                                <>
                                    {kind === 'image' ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={url} alt="Question media" className="media-preview" />
                                    ) : (
                                        <video src={url} controls className="media-preview" />
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        style={{ width: '100%' }}
                                        onClick={() => clear(kind)}
                                    >
                                        Remove {limit.label.toLowerCase()}
                                    </button>
                                </>
                            ) : (
                                <label className="media-drop">
                                    <input
                                        type="file"
                                        accept={limit.accept}
                                        style={{ display: 'none' }}
                                        disabled={busy !== null}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) void upload(kind, file);
                                            // Reset, so re-picking the same file fires again.
                                            e.target.value = '';
                                        }}
                                    />
                                    <span>
                                        {busy === kind
                                            ? `Uploading… ${progress}%`
                                            : `+ Add a ${limit.label.toLowerCase()}`}
                                    </span>
                                </label>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Cloudinary wants a multipart POST of the signed fields plus the file, and only
 * then tells us the URL. XHR rather than fetch, because a 100 MB video on a slow
 * connection needs a real progress bar — `fetch` cannot report upload progress.
 */
function uploadToCloudinary(
    ticket: UploadTicket,
    file: File,
    onProgress: (pct: number) => void,
): Promise<string> {
    const form = new FormData();
    for (const [key, val] of Object.entries(ticket.fields ?? {})) form.append(key, val);
    form.append('file', file);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', ticket.uploadUrl);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                // Cloudinary reports its own reason in the body; surface it rather
                // than a bare status code.
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
                // `secure_url` is the https one. `url` is plain http and would be
                // blocked as mixed content on our HTTPS pages.
                if (!body.secure_url) throw new Error('Upload succeeded but returned no URL.');
                resolve(body.secure_url as string);
            } catch (err) {
                reject(err instanceof Error ? err : new Error('Could not read the upload response.'));
            }
        };

        xhr.onerror = () => reject(new Error('Could not reach the storage provider.'));
        xhr.send(form);
    });
}

/** S3-compatible: a raw PUT with exactly the signed headers. The URL is known already. */
function uploadToS3(
    ticket: UploadTicket,
    file: File,
    onProgress: (pct: number) => void,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', ticket.uploadUrl);

        for (const [key, val] of Object.entries(ticket.headers ?? {})) {
            // The browser sets Content-Length itself and forbids setting it here.
            if (key.toLowerCase() === 'content-length') continue;
            xhr.setRequestHeader(key, val);
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`Storage rejected the upload (${xhr.status}).`));
                return;
            }
            if (!ticket.publicUrl) {
                reject(new Error('Upload succeeded but no public URL was issued.'));
                return;
            }
            resolve(ticket.publicUrl);
        };

        xhr.onerror = () => reject(new Error('Could not reach the storage provider.'));
        xhr.send(file);
    });
}
