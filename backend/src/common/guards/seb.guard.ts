import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SebGuard implements CanActivate {
    constructor(private prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        // Extract exam instance ID from route params or body
        const instanceId =
            request.params?.instanceId ||
            request.params?.examInstanceId ||
            request.body?.examInstanceId;

        if (!instanceId) return true; // Non-exam routes don't need SEB validation

        // Look up the exam instance
        const instance = await this.prisma.examInstance.findUnique({
            where: { id: instanceId },
        });

        if (!instance || !instance.requireSeb) return true;

        // 1. Check User-Agent for SEB identifier
        const ua = request.headers['user-agent'] || '';
        if (!ua.includes('SEB/')) {
            throw new ForbiddenException(
                'This exam requires Safe Exam Browser (SEB). Please launch SEB to access the exam.',
            );
        }

        // 2. Validate Browser Exam Key hash
        const requestHash = request.headers['x-safeexambrowser-requesthash'];
        if (!requestHash && instance.browserExamKey) {
            throw new ForbiddenException('Missing SEB Browser Exam Key hash');
        }

        if (instance.browserExamKey && requestHash) {
            // Construct the full URL as SEB sees it
            const protocol = request.headers['x-forwarded-proto'] || request.protocol;
            const host = request.headers['x-forwarded-host'] || request.get('host');
            const fullUrl = `${protocol}://${host}${request.originalUrl}`;

            // SHA256(url + browserExamKey)
            const expectedHash = createHash('sha256')
                .update(fullUrl + instance.browserExamKey)
                .digest('hex');

            if (requestHash.toLowerCase() !== expectedHash.toLowerCase()) {
                throw new ForbiddenException('Invalid SEB Browser Exam Key — access denied');
            }
        }

        // 3. Optionally validate Config Key hash
        const configKeyHash = request.headers['x-safeexambrowser-configkeyhash'];
        if (instance.configKey && configKeyHash) {
            const protocol = request.headers['x-forwarded-proto'] || request.protocol;
            const host = request.headers['x-forwarded-host'] || request.get('host');
            const fullUrl = `${protocol}://${host}${request.originalUrl}`;

            const expectedConfigHash = createHash('sha256')
                .update(fullUrl + instance.configKey)
                .digest('hex');

            if (configKeyHash.toLowerCase() !== expectedConfigHash.toLowerCase()) {
                throw new ForbiddenException('Invalid SEB Config Key — access denied');
            }
        }

        return true;
    }
}
