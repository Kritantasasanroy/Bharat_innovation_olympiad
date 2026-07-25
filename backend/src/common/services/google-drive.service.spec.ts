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

    it('refuses to list a folder when no API key is set, rather than failing obscurely', async () => {
        await expect(service().listFolder('folder-1')).rejects.toThrow(/not configured/i);
    });

    it('refuses to list when no folder is configured or supplied', async () => {
        await expect(service({ GOOGLE_DRIVE_API_KEY: 'k' }).listFolder()).rejects.toThrow(
            /No Drive folder configured/i,
        );
    });
});
