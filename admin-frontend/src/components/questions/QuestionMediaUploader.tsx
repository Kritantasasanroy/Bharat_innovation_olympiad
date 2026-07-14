'use client';

import api from '@/lib/api';
import { useState } from 'react';

/**
 * Attaches a picture and/or a video to a question (item 13).
 *
 * **The file never passes through our API.** The browser asks the backend for a
 * presigned PUT URL and uploads straight to object storage (Cloudflare R2 by
 * default). Render's API instance has 512 MB of RAM and an ephemeral disk —
 * streaming a 200 MB question video through it would blow the memory budget, and
 * anything written to its disk vanishes on the next deploy. So the only thing the
 * API handles is the signature.
 *
 * A question can carry a picture **and** a video at the same time, so these are
 * two independent slots rather than one "media" field.
 */

export interface QuestionMedia {
    imageUrl: string | null;
    videoUrl: string | null;
}

const LIMITS = {
    image: { label: 'Picture', accept: 'image/*', maxMb: 10 },
    video: { label: 'Video', accept: 'video/mp4,video/webm,video/quicktime', maxMb: 200 },
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
            // 1. Ask our API to sign an upload. The size is signed into the URL, so
            //    the browser cannot then push a bigger file than it declared.
            const { data: signed } = await api.get<{
                uploadUrl: string;
                publicUrl: string;
                requiredHeaders: Record<string, string>;
            }>('/admin/questions/media-upload-url', {
                params: {
                    kind,
                    filename: file.name,
                    contentType: file.type,
                    contentLength: file.size,
                },
            });

            // 2. Upload straight to the bucket. Note this is a bare fetch, NOT our
            //    `api` client — sending our Authorization header to the storage
            //    provider would break the presigned signature.
            const res = await fetch(signed.uploadUrl, {
                method: 'PUT',
                headers: signed.requiredHeaders,
                body: file,
            });
            if (!res.ok) {
                throw new Error(`Storage rejected the upload (${res.status}).`);
            }

            setProgress(100);
            onChange({ ...value, [kind === 'image' ? 'imageUrl' : 'videoUrl']: signed.publicUrl });
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
