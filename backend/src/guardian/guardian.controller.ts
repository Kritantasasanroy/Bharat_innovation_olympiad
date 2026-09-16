import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Ip,
    Post,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
    DOCUMENT_RULES,
    ObjectStorageService,
} from '../common/services/object-storage.service';
import { SubmitGuardianDto } from './dto/guardian.dto';
import { GuardianService } from './guardian.service';

/** Student identification — guardian details, ward ID document, consents. */
@Controller()
@UseGuards(JwtAuthGuard)
export class GuardianController {
    constructor(
        private guardianService: GuardianService,
        private storage: ObjectStorageService,
    ) {}

    /**
     * Uploads the ward's ID document and returns only its URL.
     *
     * The form used to base64 the file into the JSON body of `POST /identification`.
     * A phone photo of an Aadhaar card is 2–5 MB, which base64 inflates by ~33%,
     * so every submission with a document attached was rejected by Express's
     * 100 kB body limit with "request entity too large" — and the parent was
     * stuck on the last step of registration with no way forward.
     *
     * Multipart keeps the bytes out of the JSON body entirely; the profile then
     * stores a short URL instead of megabytes of text in a database column.
     */
    @Post('identification/id-document')
    @UseInterceptors(
        FileInterceptor('file', {
            // Rejected by multer before the whole body is buffered, so an
            // oversized file cannot be used to exhaust memory.
            limits: { fileSize: DOCUMENT_RULES.maxBytes, files: 1 },
        }),
    )
    async uploadIdDocument(
        @CurrentUser('id') userId: string,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Choose a file to upload.');

        // `userId` partitions the object key (guardians/<userId>/id/<uuid>), which
        // is what makes a DPDP erasure request one prefix delete. On the S3
        // provider `url` is now an object KEY, not a URL — the bucket is private
        // and reads are signed at render time.
        const { url } = await this.storage.uploadDocumentBuffer(
            file.buffer,
            file.originalname || 'id-document',
            file.mimetype,
            undefined,
            userId,
            'guardians',
        );
        return { url };
    }

    @Get('identification/me')
    status(@CurrentUser('id') userId: string) {
        return this.guardianService.status(userId);
    }

    @Post('identification')
    submit(
        @CurrentUser('id') userId: string,
        @Body() dto: SubmitGuardianDto,
        @Ip() ip: string,
    ) {
        return this.guardianService.submit(userId, dto, ip);
    }
}
