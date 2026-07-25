import { Global, Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { ObjectStorageService } from './object-storage.service';

/**
 * Object storage. Named `S3Module` for continuity, but it is no longer AWS-only —
 * `ObjectStorageService` speaks the S3 API against any S3-compatible endpoint and
 * defaults to Cloudflare R2. See `object-storage.service.ts`.
 *
 * Also carries `GoogleDriveService`, which reads question illustrations out of
 * the shared Drive gallery folder so they can be mirrored into that storage.
 */
@Global()
@Module({
    providers: [ObjectStorageService, GoogleDriveService],
    exports: [ObjectStorageService, GoogleDriveService],
})
export class S3Module {}
