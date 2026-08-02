import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MEDIA_RULES } from './object-storage.service';

/**
 * Reads question illustrations out of the shared Google Drive gallery folder.
 *
 * ## Why a folder at all
 *
 * The Olympiad question workbooks reference their images two different ways: a
 * few rows carry a full `Image Link` to a Drive file, but most carry only an
 * `Image Filename` (`EM_PAR_08_003.png`). Resolving the second kind means being
 * able to *list* the folder and match by name, which is why this service exists
 * rather than just storing whatever URL the spreadsheet happened to contain.
 *
 * ## Why an API key and not OAuth
 *
 * `files.list` works against a folder shared "Anyone with the link — Viewer"
 * with nothing but an API key. There is no user to consent, no token to
 * refresh, and no offline-access grant to keep alive for a folder that is
 * already public. If the folder is *not* shared, every call here 404s — which is
 * the correct and loud failure.
 *
 * ## Why there is a listing path that needs no key at all
 *
 * A folder shared "Anyone with the link" already serves its own contents to an
 * anonymous browser, as a JSON blob (`window['_DRIVE_ivd']`) embedded in the
 * folder page. {@link listPublicFolder} reads that.
 *
 * This is the fallback, not the default: the API is used whenever a key is
 * configured, because it is a contract and this is a page scrape. It exists
 * because the alternative was worse — without a key, "Sync from Drive" was a
 * button that could only ever return 503, so the question images for a live
 * paper could not be loaded at all without first provisioning a GCP project.
 * Both paths return the same {@link DriveFile} shape, and both feed the same
 * mirror-into-object-storage step, so nothing downstream can tell them apart.
 *
 * ## Why images get mirrored rather than hot-linked
 *
 * Drive is not a CDN. It rate-limits, it serves an interstitial for larger
 * files, and a folder someone un-shares in six months takes the exam paper down
 * with it. So the bytes are fetched once, pushed into object storage, and the
 * exam renders from there. Drive is the source, never the runtime dependency.
 *
 * ## SSRF
 *
 * {@link fetchImage} takes a **Drive file id**, never a URL. The URLs it
 * requests are built here from a fixed template against a hard-coded host
 * allowlist, so a malicious spreadsheet cannot steer a server-side fetch at an
 * internal address. `extractFileId` is the only thing that ever looks at a
 * caller-supplied string, and it returns an id or nothing.
 */

/** The only hosts this service will ever fetch bytes from. */
const ALLOWED_HOSTS = new Set(['lh3.googleusercontent.com', 'drive.google.com']);

/** A Drive file id: the opaque token in `/file/d/<id>/view` or `?id=<id>`. */
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
}

/**
 * Decodes a JavaScript single-quoted string literal.
 *
 * Drive writes its embedded folder listing as one, escaped with `\xNN` for every
 * punctuation character — which is legal JS and *illegal* JSON, so `JSON.parse`
 * cannot be pointed at it directly and `eval` is not on the table. One pass over
 * the recognised escape forms, so an escaped backslash cannot be mistaken for
 * the start of the next escape.
 */
function unescapeJsString(literal: string): string {
    return literal.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, seq: string) => {
        const kind = seq[0];
        if (kind === 'x' || kind === 'u') return String.fromCharCode(parseInt(seq.slice(1), 16));
        const simple: Record<string, string> = {
            n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0',
        };
        return simple[seq] ?? seq;
    });
}

@Injectable()
export class GoogleDriveService {
    private readonly logger = new Logger(GoogleDriveService.name);

    constructor(private config: ConfigService) {}

    private get apiKey(): string {
        return this.config.get<string>('GOOGLE_DRIVE_API_KEY')?.trim() ?? '';
    }

    /** The gallery folder configured for this deployment. */
    get defaultFolderId(): string {
        return this.config.get<string>('GOOGLE_DRIVE_GALLERY_FOLDER_ID')?.trim() ?? '';
    }

    get isConfigured(): boolean {
        return Boolean(this.apiKey);
    }

    /**
     * Drive prefixes a duplicated file with "Copy of ", and question images get
     * duplicated into the shared folder as a matter of course. The workbook's
     * `Image File` column names `08_EM_CE_004.png`, so that is what the gallery
     * has to be keyed on — otherwise every image in the folder is one the paper
     * cannot find.
     */
    static canonicalFilename(name: string): string {
        return name.replace(/^(?:Copy of\s+)+/i, '').trim();
    }

    /**
     * Pulls a Drive file id out of any of the shapes the workbooks use:
     *   https://drive.google.com/file/d/<id>/view?usp=drive_link
     *   https://drive.google.com/open?id=<id>
     *   https://drive.google.com/uc?export=download&id=<id>
     *   <id>
     * Returns null for anything that is not recognisably one of those — a bare
     * URL to some other host is rejected here rather than being fetched.
     */
    static extractFileId(input: string | null | undefined): string | null {
        const raw = (input ?? '').trim();
        if (!raw) return null;

        if (FILE_ID_RE.test(raw) && !raw.includes('/')) return raw;

        let url: URL;
        try {
            url = new URL(raw);
        } catch {
            return null;
        }
        if (!ALLOWED_HOSTS.has(url.hostname)) return null;

        const pathMatch = url.pathname.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/);
        if (pathMatch) return pathMatch[1];

        const queryId = url.searchParams.get('id');
        if (queryId && FILE_ID_RE.test(queryId)) return queryId;

        return null;
    }

    /**
     * Every image in a Drive folder.
     *
     * Paginated because a full question bank's illustrations comfortably exceed
     * one page, and a silently truncated listing would look exactly like "that
     * image isn't in the folder".
     */
    async listFolder(folderId?: string): Promise<DriveFile[]> {
        const folder = (folderId ?? this.defaultFolderId).trim();
        if (!folder) {
            throw new BadRequestException(
                'No Drive folder configured. Set GOOGLE_DRIVE_GALLERY_FOLDER_ID.',
            );
        }
        if (!FILE_ID_RE.test(folder)) {
            throw new BadRequestException(`"${folder}" is not a valid Google Drive folder id.`);
        }
        if (!this.isConfigured) return this.listPublicFolder(folder);

        const files: DriveFile[] = [];
        let pageToken: string | undefined;

        do {
            const params = new URLSearchParams({
                q: `'${folder}' in parents and trashed = false and mimeType contains 'image/'`,
                key: this.apiKey,
                fields: 'nextPageToken, files(id, name, mimeType)',
                pageSize: '200',
                // Shared-drive folders 404 without these two.
                supportsAllDrives: 'true',
                includeItemsFromAllDrives: 'true',
            });
            if (pageToken) params.set('pageToken', pageToken);

            const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
            const body = (await res.json().catch(() => ({}))) as {
                files?: DriveFile[];
                nextPageToken?: string;
                error?: { message?: string };
            };

            if (!res.ok) {
                const reason = body.error?.message ?? `HTTP ${res.status}`;
                throw new BadRequestException(
                    `Could not list the Drive folder: ${reason}. ` +
                        'Check that the folder is shared "Anyone with the link — Viewer" ' +
                        'and that GOOGLE_DRIVE_API_KEY has the Drive API enabled.',
                );
            }

            files.push(...(body.files ?? []));
            pageToken = body.nextPageToken;
        } while (pageToken);

        return files.map((f) => ({ ...f, name: GoogleDriveService.canonicalFilename(f.name) }));
    }

    /**
     * Lists a link-shared folder with no credentials, by reading the file table
     * Drive embeds in its own folder page.
     *
     * `window['_DRIVE_ivd']` is a hex-escaped JSON document whose first element
     * is the file list; each entry is `[id, [parentIds], name, mimeType, …]`.
     * Only those four positions are read, and every entry that does not have
     * them in the expected shape is dropped rather than guessed at — this is a
     * scrape, so it must fail to a short list, never to a wrong one.
     *
     * Unlike the API path this is not paginated. Drive renders roughly the first
     * few hundred entries into the page, so a very large gallery would come back
     * truncated: {@link syncDriveGallery} reports the count it saw, and a folder
     * near that size wants a real API key. For the ~20 images a question paper
     * carries, it is exact.
     */
    private async listPublicFolder(folderId: string): Promise<DriveFile[]> {
        const url = `https://drive.google.com/drive/folders/${folderId}`;
        const res = await fetch(url, {
            redirect: 'follow',
            // Drive serves a scriptless shell to clients it does not recognise,
            // and that shell contains no file table at all.
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });
        if (!res.ok) {
            throw new BadRequestException(
                `Could not open the Drive folder (HTTP ${res.status}). It must be shared ` +
                    '"Anyone with the link — Viewer", or set GOOGLE_DRIVE_API_KEY to use the API.',
            );
        }

        const html = await res.text();
        const match = html.match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:[^'\\]|\\.)*)'/);
        if (!match) {
            throw new BadRequestException(
                'That Drive folder did not return a file listing. The usual cause is that it ' +
                    'is not shared "Anyone with the link — Viewer". Set GOOGLE_DRIVE_API_KEY to ' +
                    'list private folders instead.',
            );
        }

        let entries: unknown;
        try {
            entries = JSON.parse(unescapeJsString(match[1]));
        } catch {
            throw new BadRequestException(
                'That Drive folder returned a listing this server could not read. ' +
                    'Set GOOGLE_DRIVE_API_KEY to use the Drive API instead.',
            );
        }

        const rows = Array.isArray(entries) && Array.isArray(entries[0]) ? entries[0] : [];
        const files: DriveFile[] = [];
        for (const row of rows) {
            if (!Array.isArray(row)) continue;
            const [id, , name, mimeType] = row as unknown[];
            if (typeof id !== 'string' || typeof name !== 'string' || typeof mimeType !== 'string') {
                continue;
            }
            if (!FILE_ID_RE.test(id)) continue;
            if (!mimeType.startsWith('image/')) continue;
            files.push({ id, name: GoogleDriveService.canonicalFilename(name), mimeType });
        }

        this.logger.log(`Listed ${files.length} image(s) in public Drive folder ${folderId}.`);
        return files;
    }

    /**
     * Downloads one Drive image by id.
     *
     * `lh3.googleusercontent.com/d/<id>` is tried first: it returns raw bytes
     * with no virus-scan interstitial, which the `uc?export=download` endpoint
     * inserts for anything it feels like. The second URL is the fallback for
     * files that endpoint will not serve.
     *
     * The response is size-checked *before* being buffered, and again after, so
     * a lying or absent Content-Length cannot be used to exhaust memory.
     */
    async fetchImage(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
        if (!FILE_ID_RE.test(fileId)) {
            throw new BadRequestException(`"${fileId}" is not a valid Google Drive file id.`);
        }

        const candidates = [
            `https://lh3.googleusercontent.com/d/${fileId}`,
            `https://drive.google.com/uc?export=download&id=${fileId}`,
        ];

        const failures: string[] = [];
        for (const url of candidates) {
            // Belt and braces: the templates above are fixed, but assert the
            // host anyway so a future edit cannot quietly widen the target set.
            if (!ALLOWED_HOSTS.has(new URL(url).hostname)) continue;

            try {
                const res = await fetch(url, { redirect: 'follow' });
                if (!res.ok) {
                    failures.push(`${new URL(url).hostname} → HTTP ${res.status}`);
                    continue;
                }

                const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
                if (!MEDIA_RULES.image.types.includes(contentType)) {
                    // Drive serves an HTML page rather than an error status when
                    // a file is not actually public, so this is the real
                    // "not shared" signal.
                    failures.push(`${new URL(url).hostname} → returned ${contentType || 'no content-type'}`);
                    continue;
                }

                const declared = Number(res.headers.get('content-length') ?? 0);
                if (declared > MEDIA_RULES.image.maxBytes) {
                    throw new BadRequestException(
                        `Drive file ${fileId} is larger than the ${MEDIA_RULES.image.maxBytes / 1024 / 1024} MB image limit.`,
                    );
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                if (buffer.byteLength > MEDIA_RULES.image.maxBytes) {
                    throw new BadRequestException(
                        `Drive file ${fileId} is larger than the ${MEDIA_RULES.image.maxBytes / 1024 / 1024} MB image limit.`,
                    );
                }
                return { buffer, contentType };
            } catch (err) {
                if (err instanceof BadRequestException) throw err;
                failures.push(`${new URL(url).hostname} → ${(err as Error).message}`);
            }
        }

        throw new BadRequestException(
            `Could not download Drive file ${fileId}. Tried: ${failures.join('; ')}. ` +
                'The most likely cause is that the file is not shared "Anyone with the link".',
        );
    }
}
