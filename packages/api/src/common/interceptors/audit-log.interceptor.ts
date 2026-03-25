import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log({
            action: `${method} ${req.url}`,
            userId: req.user?.id || null,
            tenantId: req.user?.tenantId || null,
            method,
            endpoint: req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startTime,
          });
        },
        error: (err) => {
          this.logger.warn({
            action: `${method} ${req.url}`,
            userId: req.user?.id || null,
            tenantId: req.user?.tenantId || null,
            method,
            endpoint: req.url,
            statusCode: err.status || 500,
            durationMs: Date.now() - startTime,
            error: err.message,
          });
        },
      }),
    );
  }
}
