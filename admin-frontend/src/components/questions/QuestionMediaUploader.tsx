'use client';

import { MEDIA_LIMITS, type MediaKind, uploadMediaFile } from '@/lib/mediaUpload';
import { useState } from 'react';
import MediaGalleryPicker from './MediaGalleryPicker';

/**
 * Attaches a picture and/or a video to a question (item 13).
 *
 * Upload itself lives in `lib/mediaUpload.ts` (shared with the standalone
 * gallery at `/media`) — this component is just the two-slot picker UI: pick
 * an existing gallery asset, or upload a new one from the device.
 *
 * A question can carry a picture **and** a video at once, so these are two
 * independent slots rather than one "media" field.
 */

export interface QuestionMedia {
    imageUrl: string | null;
    videoUrl: string | null;
}

export default function QuestionMediaUploader({
    value,
    onChange,
}: {
    value: QuestionMedia;
    onChange: (next: QuestionMedia) => void;
}) {
    const [busy, setBusy] = useState<MediaKind | null>(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [pickerKind, setPickerKind] = useState<MediaKind | null>(null);

    async function upload(kind: MediaKind, file: File) {
        setBusy(kind);
        setError('');
        setProgress(0);
        try {
            const asset = await uploadMediaFile(kind, file, setProgress);
            onChange({ ...value, [kind === 'image' ? 'imageUrl' : 'videoUrl']: asset.url });
        } catch (err) {
            setError((err as Error)?.message || `Could not upload that ${kind}.`);
        } finally {
            setBusy(null);
        }
    }

    const clear = (kind: MediaKind) =>
        onChange({ ...value, [kind === 'image' ? 'imageUrl' : 'videoUrl']: null });

    return (
        <div className="form-group">
            <label>Media (optional)</label>
            <p className="hint hint-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Attach a picture and/or a video, from your device or the shared gallery. Students see
                these above the question while sitting the exam.
            </p>

            {error && <div className="form-error">{error}</div>}

            <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
                {(Object.keys(MEDIA_LIMITS) as MediaKind[]).map((kind) => {
                    const url = kind === 'image' ? value.imageUrl : value.videoUrl;
                    const limit = MEDIA_LIMITS[kind];

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
                                <>
                                    <label className="media-drop">
                                        <input
                                            type="file"
                                            accept={limit.accept}
                                            style={{ display: 'none' }}
                                            disabled={busy !== null}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) void upload(kind, file);
                                                e.target.value = '';
                                            }}
                                        />
                                        <span>
                                            {busy === kind
                                                ? `Uploading… ${progress}%`
                                                : `+ Add a ${limit.label.toLowerCase()}`}
                                        </span>
                                    </label>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ width: '100%' }}
                                        disabled={busy !== null}
                                        onClick={() => setPickerKind(kind)}
                                    >
                                        Choose from gallery
                                    </button>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {pickerKind && (
                <MediaGalleryPicker
                    kind={pickerKind}
                    onClose={() => setPickerKind(null)}
                    onSelect={(url) => {
                        onChange({ ...value, [pickerKind === 'image' ? 'imageUrl' : 'videoUrl']: url });
                        setPickerKind(null);
                    }}
                />
            )}
        </div>
    );
}
