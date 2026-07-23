import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { AppModule } from './app.module';
import { configureNestApp } from './bootstrap';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Capture the raw body for Razorpay webhook HMAC verification, before any
    // JSON parsing — re-serialising a parsed body changes the bytes and the
    // signature never matches.
    //
    // The path must include the `/api` global prefix (set in configureNestApp):
    // Express matches this against the real request URL, not the Nest route, so
    // mounting it at `/payments/webhook` silently never fires and every webhook
    // 401s with "Raw body missing".
    app.use(
        '/api/payments/webhook',
        express.raw({ type: 'application/json', limit: '1mb' }),
        (req: express.Request, _res: express.Response, next: express.NextFunction) => {
            // express.raw() leaves the Buffer on `body`; the controller reads
            // `rawBody`, so bridge the two.
            if (Buffer.isBuffer(req.body)) {
                (req as any).rawBody = req.body;
            }
            next();
        },
    );

    configureNestApp(app);

    const port = process.env.PORT || 4000;
    await app.listen(port);
    console.log(`🚀 Olympiad API running on http://localhost:${port}`);
}

bootstrap();
