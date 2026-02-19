import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    super();
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6381),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await this.redis.ping();
      if (result !== 'PONG') {
        throw new Error(`Unexpected PING response: ${result}`);
      }
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false),
      );
    }
  }
}
