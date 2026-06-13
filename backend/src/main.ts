import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { AppModule } from './app.module';
import { configureNestApp } from './bootstrap';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Capture raw body for Razorpay webhook HMAC verification before any JSON parsing
    app.use('/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }));

    configureNestApp(app);

    const port = process.env.PORT || 4000;
    await app.listen(port);
    console.log(`🚀 Olympiad API running on http://localhost:${port}`);
}

bootstrap();
