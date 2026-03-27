import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureNestApp } from '../src/bootstrap';

type HttpHandler = (req: any, res: any) => void;

let cachedHttpHandler: HttpHandler | null = null;

async function getHttpHandler(): Promise<HttpHandler> {
    if (cachedHttpHandler) {
        return cachedHttpHandler;
    }

    const app = await NestFactory.create(AppModule);
    configureNestApp(app);
    await app.init();
    cachedHttpHandler = app.getHttpAdapter().getInstance() as HttpHandler;
    return cachedHttpHandler;
}

export default async function handler(req: any, res: any) {
    const httpHandler = await getHttpHandler();
    return httpHandler(req, res);
}
