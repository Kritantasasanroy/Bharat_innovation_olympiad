'use client';

import AuthGuard from '@/components/layout/AuthGuard';
import Navbar from '@/components/layout/Navbar';
import api from '@/lib/api';
import { MEDIA_LIMITS, type MediaKind, uploadMediaFile } from '@/lib/mediaUpload';
import { Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface GalleryAsset {
    id: string;
    kind: 'IMAGE' | 'VIDEO';
    url: string;
    filename: string | null;
    bytes: number | null;
    createdAt: string;
    inUse: boolean;
}

const FILTERS = [
    { label: 'All', value: '' as const },
    { label: 'Pictures', value: 'IMAGE' as const },
    { label: 'Videos', value: 'VIDEO' as const },
];

function MediaPage() {
    const [assets, setAssets] = useState<GalleryAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<'' | 'IMAGE' | 'VIDEO'>('');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [uploadKind, setUploadKind] = useState<MediaKind>('image');
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError('');
            const { data } = await api.get<GalleryAsset[]>('/admin/media', {
                params: filter ? { kind: filter } : undefined,
            });
            setAssets(data);
        } catch {
            setError('Failed to load the media gallery.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

    const uploadNew = async (file: File) => {
        setUploading(true);
        setError('');
        setProgress(0);
        try {
            await uploadMediaFile(uploadKind, file, setProgress);
            await load();
        } catch (err) {
            setError((err as Error)?.message || 'Upload failed.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const deleteAsset = async (asset: GalleryAsset) => {
        if (asset.inUse) {
            setError('This item is still attached to a question — detach it there first.');
            return;
        }
        if (!confirm('Permanently delete this from storage? This cannot be undone.')) return;
        setDeletingId(asset.id);
        setError('');
        try {
            await api.delete(`/admin/media/${asset.id}`);
            setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to delete this item.');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <main className="container page-content animate-fade-in">
            <div className="page-header">
                <div>
                    <h1>Media Gallery</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                        Every picture and video uploaded for question authoring. Reused across questions from
                        here — delete permanently once nothing still points at it.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="form-control"
                        value={uploadKind}
                        onChange={(e) => setUploadKind(e.target.value as MediaKind)}
                        style={{ maxWidth: '140px' }}
                        disabled={uploading}
                    >
                        <option value="image">Picture</option>
                        <option value="video">Video</option>
                    </select>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={MEDIA_LIMITS[uploadKind].accept}
                        style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadNew(f); }}
                    />
                    <button
                        className="btn btn-primary"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload size={16} style={{ marginRight: '0.5rem' }} />
                        {uploading ? `Uploading… ${progress}%` : 'Upload to gallery'}
                    </button>
                </div>
            </div>

            {error && <div className="form-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'var(--space-6)' }}>
                {FILTERS.map((f) => (
                    <button
                        key={f.label}
                        className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter(f.value)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {loading ? 'Loading…' : `${assets.length} item${assets.length !== 1 ? 's' : ''}`}
            </p>

            {loading ? (
                <div className="loading-container" style={{ minHeight: '200px' }}><div className="spinner" /></div>
            ) : assets.length === 0 ? (
                <div className="glass-card empty-state" style={{ marginTop: 'var(--space-4)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>🖼️</div>
                    <h3>No media yet</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Upload a picture or video above, or attach one while editing a question.</p>
                </div>
            ) : (
                <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                    {assets.map((asset) => (
                        <div key={asset.id} className="glass-card" style={{ padding: 'var(--space-3)' }}>
                            {asset.kind === 'IMAGE' ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={asset.url} alt={asset.filename || 'Gallery image'} className="media-preview" style={{ width: '100%', height: '130px' }} />
                            ) : (
                                <video src={asset.url} controls className="media-preview" style={{ width: '100%', height: '130px' }} />
                            )}
                            <p style={{ margin: '0.6rem 0 0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.filename || undefined}>
                                {asset.filename || 'Untitled'}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                                {asset.inUse ? (
                                    <span className="badge badge-success">In use</span>
                                ) : (
                                    <span className="badge badge-muted">Unused</span>
                                )}
                                <button
                                    className="btn btn-sm btn-danger"
                                    disabled={deletingId === asset.id || asset.inUse}
                                    onClick={() => deleteAsset(asset)}
                                    title={asset.inUse ? 'Still attached to a question' : 'Permanently delete'}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}

export default function MediaGalleryPage() {
    return (
        <AuthGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Navbar />
            <MediaPage />
        </AuthGuard>
    );
}
