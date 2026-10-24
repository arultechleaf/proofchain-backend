import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    // Raw request bodies are needed to verify the Razorpay webhook signature.
    rawBody: true,
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── CORS ───────────────────────────────────────────────────────────────────
  // CORS_ORIGIN may list several frontends, comma-separated.
  const corsOrigin = (
    process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:3002'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ── Validation ─────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ProofChain API')
    .setDescription(
      'Blockchain-Based Delivery Proof & Verification Platform REST API',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', 'Authentication')
    .addTag('deliveries', 'Delivery management')
    .addTag('approvals', 'Delivery approvals')
    .addTag('verification', 'Proof verification')
    .addTag('blockchain', 'Blockchain explorer')
    .addTag('companies', 'Organization management')
    .addTag('users', 'User management')
    .addTag('audit', 'Audit logs')
    .addTag('dashboard', 'Dashboard analytics')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  const port = process.env.APP_PORT ?? 3001;
  await app.listen(port);
  logger.log(`🚀 ProofChain API running on http://localhost:${port}/api`);
  logger.log(`📄 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
