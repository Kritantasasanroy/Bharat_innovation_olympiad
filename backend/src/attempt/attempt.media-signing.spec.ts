import { AttemptService } from './attempt.service';
import { notificationServiceStub } from '../notification/notification.stub';
import { whatsAppStub } from '../notification/whatsapp.stub';

/**
 * Question media reaches the player as a loadable URL, whichever generation of
 * value the database holds.
 *
 * Two shapes live side by side in `Question.imageUrl` / `videoUrl` / `mediaUrl`:
 * a legacy `https://res.cloudinary.com/…` URL, and — for anything uploaded since
 * the media bucket was made private — a bare S3 object key. The player cannot
 * load a bare key, so `AttemptService` runs every question through
 * `ObjectStorageService.resolveUrl` on the way out: a URL passes straight
 * through, a key is signed. This pins that seam so a future refactor of the
 * several `startAttempt` return points can't quietly drop it.
 */
describe('AttemptService — question media is resolved on the way to the player', () => {
    /** A storage double that mimics `resolveUrl`: URLs through, keys signed. */
    function storageDouble() {
        const resolveUrl = jest.fn(async (stored: string | null | undefined) => {
            if (!stored) return null;
            if (/^https?:\/\//i.test(stored)) return stored;
            return `https://media.dev.example/signed/${stored}?sig=abc`;
        });
        return {
            resolveUrl,
            resolveUrls: jest.fn(async (xs: (string | null | undefined)[]) =>
                Promise.all(xs.map((x) => resolveUrl(x))),
            ),
        };
    }

    function service(storage: any) {
        return new AttemptService(
            null as any,
            null as any,
            null as any,
            null as any,
            whatsAppStub(),
            notificationServiceStub(),
            storage,
        );
    }

    it('signs a bare S3 key and leaves a Cloudinary URL untouched', async () => {
        const storage = storageDouble();
        const rows = [
            { imageUrl: 'questions/images/abc-123.png', videoUrl: null, mediaUrl: null },
            {
                imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/q2.jpg',
                videoUrl: null,
                mediaUrl: null,
            },
            { imageUrl: null, videoUrl: 'questions/video/clip.mp4', mediaUrl: null },
        ];

        await (service(storage) as any).signQuestionMedia(rows);

        expect(rows[0].imageUrl).toBe('https://media.dev.example/signed/questions/images/abc-123.png?sig=abc');
        expect(rows[1].imageUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/q2.jpg');
        expect(rows[2].videoUrl).toBe('https://media.dev.example/signed/questions/video/clip.mp4?sig=abc');
    });

    it('is a no-op when storage is not wired (unit-test construction)', async () => {
        const rows = [{ imageUrl: 'questions/images/abc.png', videoUrl: null, mediaUrl: null }];
        await expect((service(undefined) as any).signQuestionMedia(rows)).resolves.toBeUndefined();
        expect(rows[0].imageUrl).toBe('questions/images/abc.png');
    });

    it('tolerates null rows and empty input', async () => {
        const storage = storageDouble();
        await expect((service(storage) as any).signQuestionMedia([])).resolves.toBeUndefined();
        await expect((service(storage) as any).signQuestionMedia([null, undefined])).resolves.toBeUndefined();
        expect(storage.resolveUrls).not.toHaveBeenCalled();
    });

    it('startAttempt runs its questions through the signer before returning', async () => {
        const storage = storageDouble();
        const svc = service(storage);
        const signed = jest
            .spyOn(svc as any, 'openAttempt')
            .mockResolvedValue({
                attempt: { id: 'a1' },
                questions: [{ id: 'q1', imageUrl: 'questions/images/x.png', videoUrl: null, mediaUrl: null }],
            });

        const result: any = await svc.startAttempt('u1', 'i1');

        expect(signed).toHaveBeenCalledWith('u1', 'i1', undefined);
        expect(result.questions[0].imageUrl).toBe(
            'https://media.dev.example/signed/questions/images/x.png?sig=abc',
        );
    });
});
