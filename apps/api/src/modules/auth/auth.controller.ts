import { Body, Controller, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService, type LoginResult } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';
import type { AuthUser } from '../../common/auth/auth-user';

class LoginDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  user_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  password!: string;
}

class RefreshDto {
  @IsString() @IsNotEmpty()
  refresh_token!: string;
}

class ChangePasswordDto {
  @IsString() @IsNotEmpty()
  current_password!: string;

  @IsString() @MinLength(8) @MaxLength(200)
  new_password!: string;
}

/** AUTH (3건) — 설계서 §11.2. login/refresh 는 공개, password 는 로그인 사용자. */
@ApiTags('AUTH')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: '로그인 — 해시 검증은 WAS 가 수행(FR-Emp-04/05)' })
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto.user_id, dto.password);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh 토큰으로 Access 재발급' })
  refresh(@Body() dto: RefreshDto): Promise<{ access_token: string }> {
    return this.auth.refresh(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Put('password')
  @HttpCode(204)
  @ApiOperation({ summary: '본인 비밀번호 변경 — 현재 비밀번호 검증 후 새 해시 저장' })
  async changePassword(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changeOwnPassword(req.user.userId, dto.current_password, dto.new_password);
  }
}
