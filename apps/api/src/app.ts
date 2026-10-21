import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Catch, ConsoleLogger, Controller, Get, HttpException, Inject, Injectable, Module, NotFoundException, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost, DynamicModule, ExceptionFilter } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { jobsQuerySchema } from '@career-radar/contracts';
import { JobsReader } from '@career-radar/database';
import type { Pool } from 'pg';
import { z } from 'zod';

const DATABASE = Symbol('DATABASE');

interface HttpResponse {
  locals: Record<string, unknown>;
  status(code: number): HttpResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  on(event: 'finish', listener: () => void): void;
  statusCode: number;
}

@Catch()
class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const controlled = body !== null && typeof body === 'object' && 'code' in body && 'message' in body ? body : null;
    if (status >= 500 && status !== 503) console.error(JSON.stringify({ level: 'error', code: 'HTTP_INTERNAL_ERROR', requestId: response.locals.requestId }));
    response.status(status).json({ error: {
      code: controlled?.code ?? (status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST'),
      message: controlled?.message ?? (status === 404 ? 'Endpoint not found' : status >= 500 ? 'Request could not be completed' : 'Invalid request'),
      requestId: response.locals.requestId,
      ...(controlled && 'details' in controlled ? { details: controlled.details } : {}),
    } });
  }
}

@Injectable()
class JobsService {
  private readonly reader: JobsReader;
  constructor(@Inject(DATABASE) pool: Pool) { this.reader = new JobsReader(pool); }
  sources() { return this.reader.sources(); }
  list(input: unknown) {
    const query = jobsQuerySchema.safeParse(input);
    if (!query.success) throw new BadRequestException({ code: 'INVALID_QUERY', message: 'Query parameters failed validation', details: query.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    return this.reader.list(query.data);
  }
  async get(id: string) {
    if (!z.uuid().safeParse(id).success) throw new BadRequestException({ code: 'INVALID_JOB_ID', message: 'Job ID must be a UUID' });
    const job = await this.reader.get(id);
    if (!job) throw new NotFoundException({ code: 'JOB_NOT_FOUND', message: 'Job was not found' });
    return { data: job };
  }
}

@Controller('jobs')
class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}
  @Get()
  list(@Query() query: unknown) { return this.jobs.list(query); }
  @Get(':id')
  get(@Param('id') id: string) { return this.jobs.get(id); }
}

@Controller('sources')
class SourcesController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}
  @Get()
  list() { return this.jobs.sources(); }
}

@Controller()
class HealthController {
  constructor(@Inject(DATABASE) private readonly pool: Pool) {}
  @Get('health')
  health() { return { status: 'ok', service: 'career-radar', phase: 1 }; }
  @Get('ready')
  async ready() {
    try {
      const result = await this.pool.query<{ ready: boolean }>(`SELECT
        to_regclass('eligibility_assessments') IS NOT NULL AND EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
          AND table_name='job_postings' AND column_name='last_provenance'
        ) AS ready`);
      if (result.rows[0]?.ready) return { status: 'ready', database: 'ok' };
    } catch { /* A stable public error envelope must not expose connection details. */ }
    throw new ServiceUnavailableException({ code: 'DATABASE_NOT_READY', message: 'Database unavailable or migrations missing' });
  }
}

@Module({})
class ApiModule {
  static register(pool: Pool): DynamicModule {
    return { module: ApiModule, controllers: [HealthController, JobsController, SourcesController], providers: [{ provide: DATABASE, useValue: pool }, JobsService] };
  }
}

export async function createApi(pool: Pool, options: { logging?: boolean } = {}) {
  const app = await NestFactory.create(ApiModule.register(pool), { bodyParser: false, logger: options.logging ? new ConsoleLogger({ json: true }) : false });
  app.use((request: { method: string }, response: HttpResponse, next: () => void) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const started = performance.now();
    if (options.logging) response.on('finish', () => console.log(JSON.stringify({ event: 'http_request', requestId, method: request.method, status: response.statusCode, durationMs: Math.round(performance.now() - started) })));
    next();
  });
  app.useGlobalFilters(new ApiErrorFilter());
  await app.init();
  return app;
}
