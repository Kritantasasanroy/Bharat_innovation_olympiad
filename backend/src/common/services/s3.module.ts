import { Global, Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';

/**
 * Object storage. Named `S3Module` for continuity, but it is no longer AWS-only —
 * `ObjectStorageService` speaks the S3 API against any S3-compatible endpoint and
 * defaults to Cloudflare R2. See `object-storage.service.ts`.
 */
@Global()
@Module({
    providers: [ObjectStorageService],
    exports: [ObjectStorageService],
})
export class S3Module {}
