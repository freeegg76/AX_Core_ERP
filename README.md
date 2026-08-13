# AX Bridge

SYSTEM / PARTNER / SALES / FINANCE 4개 도메인 내부 ERP/CRM 업무 시스템.

설계 근거는 [`AX_Bridge_시스템_설계서.md`](AX_Bridge_시스템_설계서.md), 원본 산출물은 [`Planning_Docs/`](Planning_Docs/) 를 정본으로 한다.

## 구조

```
apps/api    NestJS  — 쓰기=저장프로시저(node-mssql) / 조회=Prisma  (설계서 D1·D2)
apps/web    React + Vite + Ant Design + TanStack Query + Zustand
packages/   shared-constants (코드값 사전 · 오류코드 카탈로그 자동생성)
prisma/     schema.prisma (db pull 로 역생성 — 마이그레이션 주체가 아니다)
db/         01~09 SQL — **DDL 정본**
scripts/    apply-db.mjs · seed-admin.mjs · gen-error-catalog.mjs
```

## 준비

### 1. SQL Server

TCP/IP 가 **활성화**되어 있어야 한다 — Node 드라이버는 공유 메모리·이름있는 파이프를 지원하지 않는다.

```powershell
# 관리자 PowerShell
$base='HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.AX_BRIDGE\MSSQLServer\SuperSocketNetLib\Tcp'
Set-ItemProperty $base -Name Enabled -Value 1
Set-ItemProperty "$base\IPAll" -Name TcpPort -Value '1433'
Set-ItemProperty "$base\IPAll" -Name TcpDynamicPorts -Value ''
Restart-Service 'MSSQL$AX_BRIDGE' -Force
```

### 2. 환경변수

```bash
cp .env.example .env   # 접속정보·JWT 시크릿을 실제 값으로 교체
```

### 3. DB 적용

**순서를 반드시 지킨다** — `08` 이 `05` 의 프로시저 8건과 `06` 의 트리거 3건을 교체한다.
`01` 은 재실행이 파괴적이고 `07` 은 `TRUNCATE` 로 시작한다. `08`·`09` 만 멱등하다.

```bash
pnpm db:apply          # 01 → 09 순차 적용
node scripts/seed-admin.mjs admin   # built-in admin 의 Argon2id 해시 심기(필수)
pnpm db:pull && pnpm db:generate    # Prisma 스키마 역생성 + 클라이언트
```

`seed-admin.mjs` 를 돌리기 전에는 `user_pass` 가 플레이스홀더 문자열이라 **로그인이 불가능**하다.

### 4. 실행

```bash
pnpm install
pnpm --filter @ax-bridge/shared-constants build
pnpm --filter @ax-bridge/api build && node apps/api/dist/main.js   # :3000
pnpm --filter @ax-bridge/web dev                                    # :5173
```

- API: http://localhost:3000/api/v1 · Swagger: `/api/v1/docs`
- Web: http://localhost:5173 — `admin` / `admin`

## 아키텍처 핵심

| 결정 | 내용 |
|------|------|
| **D1** 쓰기 = node-mssql | 프로시저가 OUTPUT 파라미터 4종·다중 결과셋 2건을 쓰는데 Prisma 는 둘 다 미지원 |
| **D2** 조회 = Prisma | 82개 프로시저에 `OFFSET/FETCH` 가 0건이라 페이징을 애플리케이션이 구현한다 |
| **D3** `09_AX_Bridge_Fix.sql` | `01~08` 은 납품 원본 동결. 예외 2건은 스크립트가 실행 자체를 못 하던 결함 |
| **D6** 정수형 Decimal | `numeric(10,2)` 를 DB 에 유지하고 Mapper 경계에서 `number` 정규화 |
| **D7** 이월 음수 허용 | 마감 자동생성분은 음수 가능 — 합계를 부호 기반으로 계산하고 화면에 명시 표시 |
| **D8** `approved_date` | 승인 시각만 `datetime2(0)` 로 상향, 나머지 업무일자는 `date` 유지 |
| **D9** 권한 | 21개 테이블에 Role 저장소가 없어 인증 사용자에게 전체 권한을 부여. `@MinRole()` 표기는 유지 |

## 테넌트 격리

`company_id`/`entity_id` 는 **JWT claim 에서만** 온다(FR-Bank-08).

- 요청 본문·쿼리에 넣으면 `400` (`forbidNonWhitelisted`)
- `X-Company-Id` 헤더를 claim 과 다르게 보내면 `403`

## 오류 처리

DB `THROW 50xxx` / 트리거 `51xxx` → `AX-50xxx` + 프로시저가 만든 한글 메시지 그대로 전달.
HTTP 매핑은 손으로 적지 않고 SQL 에서 추출한다:

```bash
node scripts/gen-error-catalog.mjs   # 144건 → packages/shared-constants/src/error-catalog.generated.ts
```

## 알려진 제약

- **승인취소 기능이 없다** — 원본 75개 프로시저에 승인 관련은 `approve` 하나뿐이다. 따라서 연도 회계마감을 해제해도 기존 승인 전표는 편집할 수 없다(설계서 §9.6).
- **관리항목 상세값 개별 삭제 경로가 없다** — 수정으로만 정정한다(§9.8).
- **표준 GL 의 자산·자본 계정에 플래그 없는 계정이 하나도 없다** — 전표 입력 전에 은행/카드·고객사·거래처 마스터가 **반드시** 선행 등록되어야 한다(부록 C.6).
- **다통화 미지원** — `default_billing_currency` 는 참고 속성이고 전표·계약에 통화 컬럼이 없다.
