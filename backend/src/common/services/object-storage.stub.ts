/**
 * A pass-through `ObjectStorageService` for unit tests.
 *
 * The read paths (exam player, admin review, certificate page) now run every
 * stored media reference through `resolveUrl` / `resolveUrls` so a private-bucket
 * S3 key becomes a signed URL. The specs for those flows have nothing to assert
 * about signing — they only need the dependency to exist and to hand each value
 * straight back. A shared stub keeps that from being a dozen slightly different
 * inline objects.
 *
 * `object-storage.service.spec.ts` covers the real signing behaviour.
 */
export function objectStorageStub(): any {
    return {
        resolveUrl: jest.fn(async (stored: string | null | undefined) => stored ?? null),
        resolveUrls: jest.fn(async (stored: (string | null | undefined)[]) =>
            stored.map((s) => s ?? null),
        ),
    };
}
