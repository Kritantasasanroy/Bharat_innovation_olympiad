'use client';

import api from '@/lib/api';
import { MEDIA_LIMITS, type MediaKind, uploadMediaFile } from '@/lib/mediaUpload';
import { useEffect, useState } from 'react';

interface GalleryAsset {
    id: string;
    kind: 'IMAGE' | 'VIDEO';
    url: string;
    filename: string | null;
    createdAt: string;
}

/** Modal: pick an already-uploaded gallery asset, or upload a new one from the device. */
export default function MediaGalleryPicker({
    kind,
    onSelect,
    onClose,
}: {
    kind: MediaKind;
    onSelect: (url: string) => void;
    onClose: () => void;
}) {
    const [assets, setAssets] = useState<GalleryAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const apiKind = kind === 'image' ? 'IMAGE' : 'VIDEO';
    const limit = MEDIA_LIMITS[kind];

    const load = async () => {
        try {
            setLoading(true);
            const { data } = await api.get<GalleryAsset[]>('/admin/media', { params: { kind: apiKind } });
            setAssets(data);
        } catch {
            setError('Failed to load the gallery.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [apiKind]); // eslint-disable-line react-hooks/exhaustive-deps

    const uploadNew = async (file: File) => {
        setUploading(true);
        setError('');
        setProgress(0);
        try {
            const asset = await uploadMediaFile(kind, file, setProgress);
            onSelect(asset.url);
        } catch (err) {
            setError((err as Error)?.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
            <div className="modal-content glass-card" style={{ width: '100%', maxWidth: '720px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ margin: 0 }}>Choose a {limit.label.toLowerCase()}</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 1rem' }}>
                    Pick from media already uploaded for other questions, or add a new one from your device.
                </p>

                {error && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

                <label className="media-drop" style={{ marginBottom: '1rem' }}>
                    <input
                        type="file"
                        accept={limit.accept}
                        style={{ display: 'none' }}
                        disabled={uploading}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadNew(file);
                            e.target.value = '';
                        }}
                    />
                    <span>{uploading ? `Uploading… ${progress}%` : `+ Upload a new ${limit.label.toLowerCase()} from your device`}</span>
                </label>

                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
                    {loading ? (
                        <div className="loading-container"><div className="spinner" /></div>
                    ) : assets.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center', margin: 0 }}>
                            No {limit.label.toLowerCase()}s in the gallery yet. Upload one above.
                        </p>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                            {assets.map((asset) => (
                                <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() => onSelect(asset.url)}
                                    title={asset.filename || undefined}
                                    style={{
                                        padding: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                                        overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-input)',
                                    }}
                                >
                                    {asset.kind === 'IMAGE' ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={asset.url} alt={asset.filename || 'Gallery image'} style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }} />
                                    ) : (
                                        <video src={asset.url} style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }} muted />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={onClose} disabled={uploading}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
