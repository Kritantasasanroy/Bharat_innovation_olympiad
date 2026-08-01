import { describe, expect, it } from 'vitest';
import api from './api';

/**
 * The shared axios client's request interceptors.
 *
 * These exist because of a bug that every other layer of testing missed. The
 * client sets `Content-Type: application/json` for every request — correct for
 * the JSON endpoints, silently fatal for a file upload, because axios will not
 * overwrite an already-set Content-Type and so a `FormData` body went out
 * labelled JSON with no multipart `boundary=`. The server found no file.
 *
 * It was missed because the end-to-end check posted with raw `fetch`, which sets
 * the boundary itself — so the endpoint was proven working while the app's own
 * call path was broken. These tests run the request through the real client, the
 * way the app does.
 */

/** Runs every request interceptor in order, as axios does before sending. */
async function runInterceptors(config: Record<string, unknown>) {
    let result: any = {
        headers: { 'Content-Type': 'application/json' },
        ...config,
    };
    // @ts-expect-error — axios does not type its interceptor handler list.
    for (const handler of api.interceptors.request.handlers) {
        if (handler?.fulfilled) result = await handler.fulfilled(result);
    }
    return result;
}

describe('api client — multipart handling', () => {
    it('strips the JSON Content-Type from a FormData request', async () => {
        const form = new FormData();
        form.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'id.jpg');

        const config = await runInterceptors({ data: form, method: 'post' });

        // Nothing may name Content-Type: axios has to set it itself so the
        // multipart boundary is included. This assertion is the whole bug.
        expect(config.headers['Content-Type']).toBeUndefined();
        expect(config.headers['content-type']).toBeUndefined();
    });

    it('leaves the JSON Content-Type alone for an ordinary request', async () => {
        const config = await runInterceptors({ data: { hello: 'world' }, method: 'post' });
        expect(config.headers['Content-Type']).toBe('application/json');
    });

    it('leaves a GET with no body alone', async () => {
        const config = await runInterceptors({ method: 'get' });
        expect(config.headers['Content-Type']).toBe('application/json');
    });

    it('still attaches the auth token to a FormData request', async () => {
        // The upload endpoint is authenticated; stripping the content type must
        // not cost the request its Authorization header.
        localStorage.setItem('accessToken', 'test-token-123');
        try {
            const form = new FormData();
            form.append('file', new Blob(['x']), 'id.jpg');
            const config = await runInterceptors({ data: form, method: 'post' });

            expect(config.headers.Authorization).toBe('Bearer test-token-123');
            expect(config.headers['Content-Type']).toBeUndefined();
        } finally {
            localStorage.removeItem('accessToken');
        }
    });
});
