import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
    constructor(private prisma: PrismaService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const action = `${req.method} ${req.route?.path || req.url}`;
        const userId = req.user?.id || null;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

        return next.handle().pipe(
            tap(async () => {
                try {
                    await this.prisma.auditLog.create({
                        data: {
                            userId,
                            action,
                            resource: req.params?.id || req.originalUrl,
                            ipAddress,
                            details: {
                                method: req.method,
                                path: req.originalUrl,
                                userAgent: req.headers['user-agent'],
                            },
                        },
                    });
                } catch (err) {
                    // Non-critical — don't fail the request if logging fails
                    console.error('[AuditLog] Error:', err);
                }
            }),
        );
    }
}
