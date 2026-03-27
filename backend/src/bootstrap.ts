import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

function parseAllowedOrigins() {
    const values = [
        process.env.FRONTEND_URL,
        process.env.ADMIN_FRONTEND_URL,
        process.env.ALLOWED_ORIGINS,
        'http://localhost:3000',
        'http://localhost:3001',
    ].filter(Boolean) as string[];

    return Array.from(
        new Set(
            values.flatMap((value) =>
                value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
            ),
        ),
    );
}

export function configureNestApp(app: INestApplication) {
    app.use(helmet());
    app.setGlobalPrefix('api');
    app.enableCors({
        origin: parseAllowedOrigins(),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-SafeExamBrowser-RequestHash',
            'X-SafeExamBrowser-ConfigKeyHash',
        ],
    });
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );
}
