import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PasswordHasher } from '../../common/auth/password-hasher';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: c.get<string>('JWT_ACCESS_TTL', '30m') as never },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordHasher, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, PasswordHasher, JwtAuthGuard],
})
export class AuthModule {}
