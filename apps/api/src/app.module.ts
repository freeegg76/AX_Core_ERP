import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { resolve } from 'node:path';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { DatabaseModule } from './common/database/database.module';
import { AllExceptionsFilter } from './common/exception/all-exceptions.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';
import { RolesGuard } from './common/permission/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { FinanceModule } from './modules/finance/finance.module';
import { PartnerModule } from './modules/partner/partner.module';
import { SalesModule } from './modules/sales/sales.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 모노레포 루트의 .env 를 읽는다.
      envFilePath: [resolve(__dirname, '../../../.env'), '.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => [
        // 사용자당 120 req/min (설계서 §11.1)
        { ttl: 60_000, limit: Number(c.get<string>('RATE_LIMIT_PER_MIN', '120')) },
      ],
    }),
    DatabaseModule,
    AuthModule,
    SystemModule,
    PartnerModule,
    SalesModule,
    FinanceModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 순서: 인증 → 권한 → Rate Limit
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule {}
