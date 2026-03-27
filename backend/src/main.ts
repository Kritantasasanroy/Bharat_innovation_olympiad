import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureNestApp } from './bootstrap';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    configureNestApp(app);

    const port = process.env.PORT || 4000;
    await app.listen(port);
    console.log(`🚀 Olympiad API running on http://localhost:${port}`);
}

bootstrap();
