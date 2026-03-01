import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Security headers
    app.use(helmet());

    // Global prefix
    app.setGlobalPrefix('api');

    // CORS
    app.enableCors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-SafeExamBrowser-RequestHash',
            'X-SafeExamBrowser-ConfigKeyHash',
        ],
    });

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,          // Strip unknown properties
            forbidNonWhitelisted: true, // Throw on unknown properties
            transform: true,         // Auto-transform types
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    const port = process.env.PORT || 4000;
    await app.listen(port);
    console.log(`🚀 Olympiad API running on http://localhost:${port}`);
}

bootstrap();
