import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly region: string;

    constructor(private config: ConfigService) {
        this.region = config.get<string>('AWS_REGION', 'ap-south-1');
        this.bucket = config.get<string>('AWS_S3_BUCKET', 'bio-olympiad-prod');
        this.client = new S3Client({
            region: this.region,
            credentials: {
                accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', ''),
                secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
            },
        });
    }

    // ── Static key generators ────────────────────────────────────────────────

    static profilePhotoKey(userId: string) {
        return `profiles/${userId}.jpg`;
    }

    static documentKey(userId: string, docType: string, filename: string) {
        return `documents/${userId}/${docType}/${filename}`;
    }

    static proctorSnapshotKey(attemptId: string, timestamp: number) {
        return `proctoring/${attemptId}/${timestamp}.jpg`;
    }

    static invoiceKey(paymentId: string) {
        return `invoices/${paymentId}.pdf`;
    }

    static admitCardKey(userId: string, slotId: string) {
        return `admit-cards/${userId}/${slotId}.pdf`;
    }

    static questionMediaKey(questionId: string, filename: string) {
        return `questions/${questionId}/${filename}`;
    }

    static exportKey(filename: string) {
        return `exports/${filename}`;
    }

    // ── Core methods ─────────────────────────────────────────────────────────

    /** Returns a presigned PUT URL for client-side direct upload. */
    async getPresignedPutUrl(key: string, contentType: string, expiresIn = 300): Promise<string> {
        const cmd = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });
        return getSignedUrl(this.client, cmd, { expiresIn });
    }

    /** Returns a presigned GET URL for time-limited downloads. */
    async getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
        const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
        return getSignedUrl(this.client, cmd, { expiresIn });
    }

    /** Uploads a buffer server-side (proctor snapshots, PDFs, etc.). */
    async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            }),
        );
    }

    /** Deletes an object from S3. */
    async deleteObject(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    /** Builds the permanent public URL for a key (requires bucket public-read on the prefix). */
    publicUrl(key: string): string {
        return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
}
