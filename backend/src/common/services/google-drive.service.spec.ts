import { BadRequestException } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';

/**
 * The Drive importer takes URLs out of an admin-uploaded spreadsheet and then
 * makes the *server* fetch them. That is a server-side request forgery hole
 * unless the target set is pinned, so these tests are about what this service
 * refuses as much as what it accepts:
 *
 *   - `extractFileId` only ever yields a Drive file id, never a URL, and
 *     returns null for any host that is not Google's.
 *   - `fetchImage` only accepts an id matching the Drive id shape, so a crafted
 *     "id" cannot be smuggled into the request path.
 */

const service = (env: Record<string, string> = {}) =>
    new GoogleDriveService({ get: (k: string) => env[k] } as any);

describe('GoogleDriveService.extractFileId', () => {
    const ID = '1ay_yDgfZRPR5cQjF-2mImgVJ6XPMn-jE';

    it('reads the id out of every Drive URL shape the workbooks use', () => {
        const urls = [
            `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
            `https://drive.google.com/file/d/${ID}/view`,
            `https://drive.google.com/open?id=${ID}`,
            `https://drive.google.com/uc?export=download&id=${ID}`,
            `https://lh3.googleusercontent.com/d/${ID}`,
        ];
        for (const url of urls) {
            expect(GoogleDriveService.extractFileId(url)).toBe(ID);
        }
    });

    it('accepts a bare file id', () => {
        expect(GoogleDriveService.extractFileId(ID)).toBe(ID);
        expect(GoogleDriveService.extractFileId(`  ${ID}  `)).toBe(ID);
    });

    it('rejects non-Google hosts — this is the SSRF guard', () => {
        const hostile = [
            `https://evil.example.com/file/d/${ID}/view`,
            'http://169.254.169.254/latest/meta-data/',       // cloud metadata
            'http://localhost:4000/api/admin/exams',           // our own API
            'http://127.0.0.1:6379/',                          // Redis
            'file:///etc/passwd',
            `https://drive.google.com.evil.example/file/d/${ID}/view`, // lookalike
        ];
        for (const url of hostile) {
            expect(GoogleDriveService.extractFileId(url)).toBeNull();
        }
    });

    it('returns null rather than guessing at unusable input', () => {
        for (const v of ['', '   ', null, undefined, 'not a url', 'https://drive.google.com/']) {
            expect(GoogleDriveService.extractFileId(v as any)).toBeNull();
        }
    });

    it('rejects a Google URL that carries no id', () => {
        expect(GoogleDriveService.extractFileId('https://drive.google.com/drive/my-drive')).toBeNull();
        expect(GoogleDriveService.extractFileId('https://drive.google.com/open?id=short')).toBeNull();
    });
});

describe('GoogleDriveService.fetchImage', () => {
    it('refuses anything that is not a Drive file id, so no URL can be smuggled in', async () => {
        const drive = service({ GOOGLE_DRIVE_API_KEY: 'k' });
        const attempts = [
            'http://169.254.169.254/',
            '../../etc/passwd',
            'abc',                       // too short to be a Drive id
            'has spaces in it here',
            'id/with/slashes/inside',
        ];
        for (const bad of attempts) {
            await expect(drive.fetchImage(bad)).rejects.toBeInstanceOf(BadRequestException);
        }
    });
});

describe('GoogleDriveService configuration', () => {
    it('reports itself unconfigured without an API key', () => {
        expect(service().isConfigured).toBe(false);
        expect(service({ GOOGLE_DRIVE_API_KEY: '  ' }).isConfigured).toBe(false);
        expect(service({ GOOGLE_DRIVE_API_KEY: 'key' }).isConfigured).toBe(true);
    });

    it('refuses to list when no folder is configured or supplied', async () => {
        await expect(service({ GOOGLE_DRIVE_API_KEY: 'k' }).listFolder()).rejects.toThrow(
            /No Drive folder configured/i,
        );
    });

    it('refuses a folder id that is not shaped like one, before any request is made', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch' as never);
        await expect(service().listFolder('folder-1')).rejects.toThrow(/not a valid Google Drive folder id/i);
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});

/**
 * Listing a link-shared folder with no API key.
 *
 * This path exists so "Sync from Drive" is usable without provisioning a GCP
 * project, and it works by reading the file table Drive embeds in its own folder
 * page. That makes it a scrape, so what matters is that it degrades safely: a
 * page it cannot read must raise, never return a plausible-looking short list,
 * and rows that are not shaped as expected are dropped rather than guessed at.
 */
describe('GoogleDriveService public folder listing', () => {
    const FOLDER = '17uieaNy6KULjNjJ-47AIcIrEn_QROR52';
    const ID_A = '1fljBp0TT-IsCGzKbcd-SgPZyp3lCyX05';
    const ID_B = '1jwuKJ7lrFa4oe6_k8Q7zYxDh0qijeKVD';

    /** The page Drive actually serves: a JS string literal, \x-escaped. */
    const pageWith = (rows: unknown[]) => {
        const json = JSON.stringify([rows]);
        const escaped = json.replace(
            /[[\]{}",/]/g,
            (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
        );
        return `<script>window['_DRIVE_ivd'] = '${escaped}';</script>`;
    };

    const mockPage = (body: string, ok = true) => {
        global.fetch = jest.fn().mockResolvedValue({
            ok,
            status: ok ? 200 : 404,
            text: async () => body,
        }) as never;
    };

    afterEach(() => { jest.restoreAllMocks(); });

    it('reads ids, names and types out of the embedded file table', async () => {
        mockPage(
            pageWith([
                [ID_A, [FOLDER], '08_EM_CE_004.png', 'image/png'],
                [ID_B, [FOLDER], '08_EM_CE_012.png', 'image/png'],
            ]),
        );

        const files = await service().listFolder(FOLDER);

        expect(files).toEqual([
            { id: ID_A, name: '08_EM_CE_004.png', mimeType: 'image/png' },
            { id: ID_B, name: '08_EM_CE_012.png', mimeType: 'image/png' },
        ]);
    });

    it('strips the "Copy of" Drive adds, so the workbook\'s Image File still matches', async () => {
        mockPage(pageWith([[ID_A, [FOLDER], 'Copy of 08_EM_CE_004.png', 'image/png']]));

        const [file] = await service().listFolder(FOLDER);

        expect(file.name).toBe('08_EM_CE_004.png');
    });

    it('drops non-images and malformed rows instead of guessing at them', async () => {
        mockPage(
            pageWith([
                [ID_A, [FOLDER], 'notes.pdf', 'application/pdf'],
                [ID_B, [FOLDER], 'sub-folder', 'application/vnd.google-apps.folder'],
                ['short', [FOLDER], 'bad-id.png', 'image/png'],
                [ID_A, [FOLDER]], // truncated row
                'not-a-row',
            ]),
        );

        expect(await service().listFolder(FOLDER)).toEqual([]);
    });

    it('raises when the folder is not link-shared, rather than reporting it empty', async () => {
        // What Drive serves for a folder an anonymous visitor cannot see: a real
        // page, no file table. Returning [] here would read as "no images in the
        // folder" and silently import a paper with no pictures.
        mockPage('<html><body>You need access</body></html>');

        await expect(service().listFolder(FOLDER)).rejects.toThrow(/not shared "Anyone with the link/i);
    });

    it('raises on an HTTP failure', async () => {
        mockPage('', false);

        await expect(service().listFolder(FOLDER)).rejects.toThrow(/HTTP 404/);
    });

    it('uses the Drive API instead whenever an API key is configured', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ files: [{ id: ID_A, name: 'Copy of x.png', mimeType: 'image/png' }] }),
        }) as never;

        const files = await service({ GOOGLE_DRIVE_API_KEY: 'k' }).listFolder(FOLDER);

        expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('googleapis.com/drive/v3/files');
        // Canonicalised on both paths, or the same picture keys differently
        // depending on which one loaded it.
        expect(files[0].name).toBe('x.png');
    });
});

describe('GoogleDriveService.canonicalFilename', () => {
    it('removes however many times Drive has prefixed "Copy of"', () => {
        expect(GoogleDriveService.canonicalFilename('Copy of 08_EM_CE_004.png')).toBe('08_EM_CE_004.png');
        expect(GoogleDriveService.canonicalFilename('Copy of Copy of a.png')).toBe('a.png');
        expect(GoogleDriveService.canonicalFilename('  a.png ')).toBe('a.png');
    });

    it('leaves a name that merely mentions a copy alone', () => {
        expect(GoogleDriveService.canonicalFilename('Copyright_notice.png')).toBe('Copyright_notice.png');
    });
});
