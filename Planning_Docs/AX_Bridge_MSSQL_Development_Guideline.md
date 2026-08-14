# AX Bridge 개발 지침

> 목적: VS Code + Claude를 활용하여 AX Bridge를 구현할 때 사용할 공통 개발 규칙  
> 대상 스택: React + TypeScript + NestJS + Prisma + Microsoft SQL Server  
> 아키텍처 방향: Modular Monolith + DDD-lite + Clean Architecture  
> 개정: v1.1 (2026-08-14) — 구현 완료본(apps/api · apps/web · db/01~09)과 대조하여 as-built 반영

---

## 0. 이 문서를 읽는 법 (v1.1 개정 요지)

초판은 착수 전 **권장안**이었다. v1.1 은 실제 구현과 대조해 갈라진 곳을 정정한 것이다.
문서 곳곳의 `[as-built]` 표기는 "구현이 이렇게 되어 있다"는 사실 기술이고, `[미도입]` 은
권장했으나 채택하지 않은 것이다. 남은 서술은 여전히 지켜야 할 규칙이다.

주요 정정 4건:

| 항목 | 초판 권장 | 실제 |
|---|---|---|
| Grid | AG Grid | Ant Design `Table` — 별도 그리드 라이브러리를 도입하지 않았다 |
| Primary Key | UNIQUEIDENTIFIER 기술키 우선 | **복합 업무키**(§9 개정) — 프로시저·트리거 산출물이 복합키를 전제한다 |
| 폴더 구조 | 계층별 4단 중첩 | 도메인당 4파일 수준으로 평탄화(§4·§6) |
| 테스트 | Unit / Integration / E2E | **Domain 단위 테스트 97건만 있다**(api). Integration·E2E 는 미작성(§26·§32) |

---

## 1. 프로젝트 기본 원칙

AX Bridge는 SYSTEM, PARTNER, SALES, FINANCE 도메인이 서로 강하게 연결된 ERP/CRM 성격의 내부 업무 시스템이다.

초기 구현 단계에서는 마이크로서비스로 분리하지 않고 **Modular Monolith** 구조를 사용한다.

백엔드는 **도메인 중심 객체지향 설계**를 적용하고, 프론트엔드는 **Feature 기반 구조**를 적용한다.

핵심 원칙은 다음과 같다.

1. Domain 계층은 NestJS, Prisma, React 등 프레임워크에 의존하지 않는다.
2. Controller에서 Prisma Client를 직접 호출하지 않는다.
3. 모든 DB 접근은 Infrastructure Repository를 통해 수행한다.
4. 저장/승인/마감/삭제 등 업무 규칙은 Domain Entity 또는 Domain Policy에서 처리한다.
5. 조회 화면은 화면 성능을 위해 Query 전용 서비스를 둘 수 있다.
6. SYSTEM, PARTNER, SALES, FINANCE 도메인의 경계를 유지한다.
7. 모든 회사 단위 데이터 접근에는 `company_id + entity_id` 범위를 적용한다.
8. 화면 구현은 AX Bridge 공통 UI 패턴을 재사용한다.
9. FR/UC 요구사항은 구현 코드와 테스트 케이스에서 추적 가능하도록 남긴다.
10. Claude가 임의로 새로운 범용 CRUD 프레임워크나 추상화 계층을 만들지 않도록 한다.

---

## 2. 기술 스택 `[as-built]`

### Frontend

- React 18 · TypeScript 5.7 · Vite 6
- Ant Design 5 — 그리드도 antd `Table` 을 쓴다. **AG Grid `[미도입]`**: Head/Detail 그리드가
  단순 목록이라 별도 그리드 라이브러리의 값이 없었다. 가상 스크롤·피벗이 필요해지면 재검토한다.
- TanStack Query 5 (서버 상태) · Zustand 5 (인증·탭 등 클라이언트 상태)
- React Hook Form · Zod
- Vitest — 러너만 배선(`--passWithNoTests`), 테스트는 아직 없다
- Playwright `[미도입]`

> 프런트엔드에는 검증할 순수 규칙이 거의 없다 — 업무 판정은 전부 백엔드 Domain 과
> 프로시저에 있고 화면은 그 결과를 표시한다. 그래서 테스트 투자를 백엔드 Domain 에
> 먼저 했다(§26). 화면 쪽은 단위 테스트보다 E2E 가 값을 낼 자리다.

### Backend

- NestJS 11 · TypeScript 5.7
- Prisma 6 (`@prisma/client`) + `mssql` 드라이버 풀 — 프로시저 호출은 `mssql`,
  Query Service 조회는 Prisma 를 쓴다(§14·D2)
- Passport + `@nestjs/jwt` (Access / Refresh)
- Argon2id (`argon2`)
- OpenAPI / Swagger (`@nestjs/swagger`) — `/api/v1/docs`
- `@nestjs/throttler` — 사용자당 120 req/min 전역 Guard
- `class-validator` / `class-transformer` — 전역 `ValidationPipe`(`forbidNonWhitelisted: true`)
- Jest + ts-jest — `jest.config.js`, Domain 스펙 97건(§26)

### Database

- Microsoft SQL Server (2016 이상 — `OPENJSON` · `SESSION_CONTEXT` 사용), DB명 `AX_Bridge`
- **스키마 원천은 `db/01~09` T-SQL 스크립트다.** Prisma Migration 은 쓰지 않는다 `[미도입]` —
  프로시저·트리거가 산출물의 일부라 마이그레이션 생성기로 표현할 수 없다.
  적용은 `pnpm db:apply`(`scripts/apply-db.mjs`), Prisma 스키마는 `pnpm db:pull` 로 역생성한다.
- `09_AX_Bridge_Fix.sql` 이후의 모든 DB 수정은 새 번호 스크립트에 집약한다(01~08 은 납품 원본으로 동결).

### Monorepo / Tooling

- pnpm workspace 11 · Turborepo 2
- VS Code · Claude
- Docker Compose `[미도입]` — 로컬 SQL Server 인스턴스에 직접 연결한다
- ESLint / Prettier `[부분]` — `packages/eslint-config` 는 만들지 않았고 web 의 `lint` 는 no-op 이다

---

## 3. 프로젝트 최상위 폴더 구조 `[as-built]`

```text
AX_Core/
├─ apps/
│  ├─ web/                    React + Vite
│  └─ api/                    NestJS
│
├─ packages/
│  ├─ shared-types/
│  └─ shared-constants/       Role · 코드값 Enum (web/api 공용)
│
├─ prisma/
│  └─ schema.prisma           db:pull 로 역생성 — 손으로 고치지 않는다
│
├─ db/                        ★ 스키마 원천 (Planning_Docs 사본과 동일 파일)
│  ├─ 01_AX_Bridge_Tables.sql          DDL + 부트스트랩
│  ├─ 02~05_..._Procs_*.sql            SYSTEM / PARTNER / SALES / FINANCE
│  ├─ 06_AX_Bridge_Triggers.sql
│  ├─ 07_AX_Bridge_Seed_GL.sql
│  ├─ 08_AX_Bridge_Update_v3_Finance.sql
│  └─ 09_AX_Bridge_Fix.sql             결함수정·무결성 보강·마감해제 (멱등)
│
├─ scripts/apply-db.mjs        01~09 순차 적용
├─ Planning_Docs/              화면기획서 · DB/API 명세서 · 본 지침
├─ AX_Bridge_시스템_설계서.md
├─ pnpm-workspace.yaml
├─ turbo.json
└─ README.md
```

`docs/` 는 비어 있다 — 명세는 `Planning_Docs/` 와 Swagger(`/api/v1/docs`)가 대신한다.
`docker-compose.yml` · `prisma.config.ts` · `CLAUDE.md` · `prisma/migrations` · `prisma/seed` 는
만들지 않았다(표준 GL seed 는 `07_AX_Bridge_Seed_GL.sql` 이 담당한다).

---

## 4. 백엔드 아키텍처

백엔드는 다음 의존성 방향을 유지한다.

```text
Presentation
     ↓
Application
     ↓
Domain

Infrastructure
     ↓
Domain Repository Interface
```

### 기본 구조 `[as-built]`

```text
apps/api/src/
├─ main.ts                    전역 prefix · CORS · ValidationPipe · Swagger
├─ app.module.ts              전역 Guard(JWT → Roles → Throttler) · Interceptor · Filter
│
├─ common/
│  ├─ auth/                   auth-user · password-hasher(Argon2id)
│  ├─ permission/             roles.guard  (@MinRole 최소등급 비교)
│  ├─ tenant/                 company-scope · @Scope() 데코레이터
│  ├─ database/               prisma.service · mssql-pool.service · stored-proc.executor · numeric
│  ├─ exception/              all-exceptions.filter · sql-procedure.error (50xxx → AX-50xxx)
│  ├─ http/                   api-response.interceptor  ({success, data})
│  └─ audit/                  audit.interceptor
│
└─ modules/
   ├─ auth/  ├─ system/  ├─ partner/  ├─ sales/  └─ finance/
```

`common/transaction/` 은 만들지 않았다 — 트랜잭션 경계는 프로시저 안에 있다(§24).

### 각 도메인의 공통 구조 `[as-built]`

계층 이름은 초판 그대로 두되, **디렉터리 대신 파일 단위로 평탄화**했다. 도메인마다
파일이 한 자리 수라 4단 중첩은 탐색 비용만 늘렸다. 계층 의존 방향은 그대로 지킨다.

```text
<domain>/
├─ domain/            프레임워크 비의존 규칙 — 있는 도메인만 둔다
│                     finance/domain/ledger.ts        전표 Aggregate·차대 균형·Layer3 충돌
│                     sales/domain/pipeline.ts        스테이지 전이
│                     partner/domain/payment-term.strategy.ts   EOM / CURM
│                     system/domain/employee-account.policy.ts  사용자계정 정책
├─ application/       Domain 판정 + Repository 호출 조립 (finance/system 만 존재)
├─ infrastructure/    <domain>.repository.ts  프로시저 호출 (mssql)
│                     <domain>.query.ts       조회 전용 (Prisma) — D2 해당 건만
├─ presentation/      <domain>.controller.ts  · <domain>.dto.ts
└─ <domain>.module.ts
```

> 규칙은 유지된다 — Controller 는 Prisma/mssql 을 직접 만지지 않고, 업무 판정은
> `domain/` 이 하며, DB 접근은 `infrastructure/` 만 한다. 바뀐 것은 **파일 배치**뿐이다.
> 도메인이 커져 한 파일이 다루기 어려워지면 그때 디렉터리로 승격한다.

---

## 5. 도메인 구성

> `[as-built]` 아래 트리는 **책임 분해**로 읽는다. §4 에서 밝힌 대로 실제 디렉터리는
> 애그리거트마다 만들지 않고 도메인당 파일 몇 개로 평탄화되어 있다. 예를 들어 SYSTEM 의
> company·entity·team·pod·employee·fiscal-year 는 `system.repository.ts` /
> `system.controller.ts` 안에 컨트롤러 클래스 단위로 나뉜다. 나눠야 할 **책임**은 그대로다.

### SYSTEM

```text
system/
├─ company/
├─ entity/
├─ team/
├─ pod/
├─ employee/
├─ fiscal-year/
└─ admin/
```

SYSTEM은 다음 기준정보를 담당한다.

- 그룹
- 회사
- 부서
- Pod
- 직원/사용자
- 회사 기수
- 초기 Admin 계정
- 인증/권한의 기초정보

인증 관련 기능을 `EmployeeService` 하나에 몰아넣지 않는다.

권장 분리:

```text
Employee
UserAccount
Role
Permission
AuthenticationService
PasswordHasher
```

---

### PARTNER

```text
partner/
├─ client/
├─ vendor/
└─ payment-term/
```

지급/수금 정책은 단순 CRUD 값으로만 처리하지 않고 업무 규칙으로 모델링한다.

```typescript
export interface PaymentTermStrategy {
  calculate(baseDate: Date): Date;
}
```

예시 구현:

```text
EomPaymentTermStrategy
CurrentMonthPaymentTermStrategy
```

정책 예시:

- `EOM+15`
- `CurM25`

---

### SALES

```text
sales/
├─ pipeline/
├─ activity/
└─ contract/
```

Pipeline의 Stage 변경은 단순 속성 대입을 금지한다.

금지:

```typescript
pipeline.stage = '5';
```

권장:

```typescript
pipeline.moveToMeeting();
pipeline.moveToNegotiation();
pipeline.close();
pipeline.cancel();
pipeline.reopen();
```

Stage 전환 시 필요한 날짜 변경, 검증, 상태 변경을 Entity 내부 또는 Policy에서 함께 처리한다.

---

### FINANCE

```text
finance/
├─ gl/
├─ dimension/
├─ bank-account/
├─ open-balance/
├─ ledger/
└─ services/
```

FINANCE는 CRUD 중심으로 설계하지 않는다.

특히 전표는 DB의 Head/Detail 테이블을 그대로 서비스 계층 객체로 노출하지 않고 하나의 Aggregate로 다룬다.

```text
Ledger
├─ LedgerId
├─ LedgerDate
├─ LedgerNumber
├─ ApprovalStatus
└─ LedgerLine[]
   ├─ LedgerLineId
   ├─ LineNumber
   ├─ Account
   ├─ DebitCredit
   └─ Money
```

권장 폴더:

```text
ledger/
├─ domain/
│  ├─ entities/
│  │  ├─ ledger.ts
│  │  └─ ledger-line.ts
│  ├─ value-objects/
│  │  ├─ money.ts
│  │  ├─ ledger-number.ts
│  │  └─ debit-credit.ts
│  ├─ policies/
│  │  ├─ ledger-approval.policy.ts
│  │  ├─ ledger-balance.policy.ts
│  │  └─ ledger-delete.policy.ts
│  └─ repositories/
│     └─ ledger.repository.ts
```

---

## 6. 프론트엔드 구조

React는 클래스 기반 객체지향 구조보다 Feature 기반 구조를 사용한다.

```text
apps/web/src/
├─ main.tsx
├─ app/
│  ├─ router.tsx              라우트 정의 (`/` = HomePage)
│  ├─ AppLayout.tsx           앱 셸 — 4도메인 사이드바 + 상단 실행메뉴 탭
│  ├─ menu.ts                 ★ 메뉴 단일 출처 — 사이드바와 탭이 같은 정의를 쓴다
│  ├─ HomePage.tsx            메인 화면
│  ├─ LoginPage.tsx · PasswordPage.tsx
│  ├─ auth.store.ts           zustand + persist (토큰·세션 사용자)
│  └─ tabs.store.ts           zustand — 열린 실행메뉴 탭 (저장하지 않는다)
│
├─ features/                  도메인당 1파일. 마스터 12화면은 MasterScreen 설정으로 만든다
│  ├─ MasterScreen.tsx        ★ Head/Detail 마스터 화면 제네릭
│  ├─ system.screens.tsx      그룹·회사·Pod·부서·직원·기수
│  ├─ partner.screens.tsx     지급정책·고객사·거래처
│  ├─ sales.screens.tsx       파이프라인(액티비티 포함)·계약
│  ├─ finance.screens.tsx     계정과목·관리항목·은행/카드·마감관리
│  ├─ LedgerScreen.tsx        전표 3-Layer (전용 화면)
│  └─ OpenBalanceScreen.tsx   초기이월 (전용 화면)
│
└─ shared/
   ├─ api/client.ts           fetch 래퍼 — 토큰 주입 · 401 시 refresh 재시도
   └─ ui/                     아래 공통 컴포넌트
```

액티비티는 별도 메뉴가 아니라 파이프라인 화면 안의 하위 패널이다.

### 공통 UI 컴포넌트 `[as-built]`

다음 컴포넌트는 화면별로 중복 구현하지 않는다.

| 컴포넌트 | 역할 |
|---|---|
| `<AppToolbar />` | 조회 → 신규 → 수정 → 저장 → 삭제 → 취소 버튼열·상태 표시 |
| `<HeadDetailLayout />` | 좌 Head Grid / 우 Detail 폼 배치 |
| `<ResizablePanes />` | 패널 폭 드래그 조절. 인접 두 패널만 조정, 더블클릭 초기화, ←/→ 키 지원,<br>화면별 키로 `localStorage` 유지. HeadDetailLayout(마스터 12화면)과 전표 3-Layer 가 공유한다 |
| `<LookupPopup />` | F2 / Enter 조회 팝업 (§21, FR-UI-04) |
| `<DirtyFormGuard />` · `useDirtyGuard` | 미저장 변경 보호 (§22, FR-UI-06) |
| `StatusBadge` 모듈 | `ActiveBadge` · `ApprovalBadge` · `ClosingBadge` · `ConfirmedBadge` · `EmploymentBadge` · `StageBadge` · `Money` |

`<SearchBar />` 와 `<ConfirmDialog />` 는 별도 컴포넌트로 만들지 않았다 `[미도입]` —
조회조건은 화면마다 필드가 달라 각 화면이 직접 구성하고, 확인창은 antd `Modal.confirm` 을 쓴다.

### 상단 실행메뉴 탭 `[as-built]`

메뉴를 실행하면 헤더에 탭이 뜨고, 탭 클릭으로 그 화면에 돌아간다.

- 탭 생성은 메뉴 클릭 핸들러가 아니라 **경로 변경**을 보고 한다 — 주소창 직접 입력·화면 내부
  이동·새로고침에도 동일하게 동작한다. 메뉴에 없는 경로(`/`, 비밀번호 변경)는 탭을 만들지 않는다.
- 같은 메뉴를 다시 눌러도 탭은 하나다.
- 탭을 닫을 때 그 탭을 보고 있었다면 옆 탭으로, 남은 탭이 없으면 메인 화면으로 이동한다.
- 로그아웃 시 탭을 비운다.

AX Bridge 공통 UI 흐름은 아래 형태를 기본으로 한다.

```text
조회조건 입력
   ↓
조회
   ↓
Head Grid
   ↓
행 선택
   ↓
Detail 표시
   ↓
신규 / 수정
   ↓
검증
   ↓
저장 트랜잭션
   ↓
Head 재조회 + 선택 유지
```

툴바 기본 순서:

```text
조회 → 신규 → 수정 → 저장 → 삭제 → 취소
```

---

## 7. CompanyScope 규칙

AX Bridge의 대부분의 업무 데이터는 `company_id`, `entity_id` 범위를 가진다.

반복 문자열 인자를 직접 전달하는 대신 Value Object를 사용한다.

```typescript
export class CompanyScope {
  constructor(
    public readonly companyId: string,
    public readonly entityId: string,
  ) {}
}
```

Repository 예시:

```typescript
export interface ClientRepository {
  findById(
    scope: CompanyScope,
    clientId: string,
  ): Promise<Client | null>;

  findAll(
    scope: CompanyScope,
    condition: ClientSearchCondition,
  ): Promise<Client[]>;

  save(
    scope: CompanyScope,
    client: Client,
  ): Promise<void>;
}
```

### 필수 규칙

- 회사 단위 테이블 조회 시 `company_id + entity_id` 필터를 누락하지 않는다.
- 다른 회사 데이터가 ID만으로 조회되지 않도록 한다.
- Controller가 scope를 임의 생성하지 않고 인증 세션 또는 명확한 요청 Context로부터 생성한다.
- 다른 회사의 FK를 연결하려는 요청은 저장 전에 차단한다.

---

## 8. MSSQL 데이터 타입 기준

### 업무 코드

업무 식별용 영문/숫자 코드는 `VARCHAR`를 사용한다.

예:

```text
company_id
entity_id
employee_id
client_id
vendor_id
gl_id
term_id
```

권장:

```sql
VARCHAR(10)
VARCHAR(20)
```

명세 길이에 따라 결정한다.

---

### 사용자 표시 문자열

한글, 이름, 설명, 메모 등 사용자 표시 문자열은 `NVARCHAR`를 기본으로 한다.

예:

```text
company_name
company_name_ko
entity_name
employee_name
description
note
client_name
vendor_name
```

권장:

```sql
NVARCHAR(100)
NVARCHAR(200)
NVARCHAR(500)
NVARCHAR(1000)
```

---

### Boolean

신규 DB는 가능하면 `BIT`로 통일한다.

예:

```text
status
approval_status
closed
user_yn
```

DB 값이 기존 명세에서 `Y/N`, `y/n`, `0/1`로 섞여 있더라도 Domain에는 그대로 노출하지 않는다.

```typescript
export enum ApprovalStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
}
```

DB 변환은 Mapper에서 처리한다.

---

### 금액

회계 금액에 `FLOAT` 또는 `REAL`을 사용하지 않는다.

권장:

```sql
DECIMAL(19, 2)
```

소수점 4자리까지 필요한 업무라면:

```sql
DECIMAL(19, 4)
```

Domain에는 `Money` Value Object 사용을 권장한다.

---

### 날짜

날짜만 의미하는 값:

```sql
DATE
```

예:

```text
ledger_date
due_date
start_date
end_date
closed_date
birthday
```

일시를 의미하는 값:

```sql
DATETIME2
```

예:

```text
created_at
updated_at
approved_at
last_login
last_manual_edit_at
```

Timezone까지 명확하게 저장해야 하는 신규 컬럼은 `DATETIMEOFFSET` 사용을 검토한다.

---

## 9. Primary Key / Business Key 설계 `[as-built — 초판 권장안 폐기]`

초판은 `UNIQUEIDENTIFIER` 기술 PK + 업무 Unique Key 를 권장했다. **채택하지 않았다.**
AX Bridge 는 **복합 업무키를 그대로 Primary Key 로 쓴다.**

```text
DB Primary Key = 복합 업무키  (company_id, entity_id, …)
```

이유는 산출물 구조에 있다.

1. 프로시저 74건과 트리거 10건이 모두 `@company_id, @entity_id, <업무코드>` 파라미터로
   행을 특정한다. 기술 PK 를 도입하면 이 서명을 전부 바꾸거나 매 호출마다 코드→GUID
   변환 조회를 끼워야 한다.
2. 멀티테넌시가 PK 선두 두 컬럼에 들어 있어 회사 범위 격리가 인덱스 수준에서 강제된다.
3. 화면·API 경로가 업무코드를 그대로 쓴다(`/system/employees/{employeeId}`). 기술 PK 는
   여기서 아무 값도 더하지 않는다.

### 실제 PK 구성 예

```sql
CONSTRAINT PK_finance_bank_account PRIMARY KEY (company_id, entity_id, bank_id)
CONSTRAINT PK_sales_pipeline_detail PRIMARY KEY (company_id, entity_id, pipeline_id, activity_id)
```

### nullable 컬럼과 PK

"선택 가능한 nullable 컬럼을 PK 에 포함하지 않는다"는 원칙은 유지된다. 다만
`finance_open_balance` 처럼 보조잔액 키(은행/카드·고객사·거래처)가 선택 입력인 경우가 있다.
이때는 **PERSISTED 계산컬럼으로 NULL 을 제거한 뒤** PK 에 넣는다(`09` 1-1).

```sql
bank_key   AS ISNULL(bank_id,   '-') PERSISTED
client_key AS ISNULL(client_id, '-') PERSISTED
vendor_key AS ISNULL(vendor_id, '-') PERSISTED

CONSTRAINT PK_finance_open_balance PRIMARY KEY CLUSTERED
    (company_id, entity_id, company_year_id, gl_id, DRCR, bank_key, client_key, vendor_key)
```

계산컬럼이 결정적이고 NULL 이 될 수 없어 PK 구성이 가능하다. 환경 제약으로 거부되면
같은 컬럼 집합의 UNIQUE CLUSTERED INDEX 로 대체한다.

### Prisma

`prisma/schema.prisma` 는 `db:pull` 로 역생성한 결과이며 복합키가 `@@id([...])` 로 표현된다.
손으로 고치지 않는다 — 스키마 원천은 `db/01~09` T-SQL 이다.

---

## 10. SALES 계약 테이블 주의사항

전표 연결이 선택사항이라면 다음 필드는 nullable일 수 있다.

```text
ledger_date
ledger_no
```

따라서 이 컬럼들을 Primary Key에 포함시키지 않는다.

권장 개념:

```text
sales_contract

id              UNIQUEIDENTIFIER PK
company_id      VARCHAR(10)
entity_id       VARCHAR(10)
contract_id     VARCHAR(20)
contract_type   VARCHAR(5)

ledger_date     DATE NULL
ledger_no       INT NULL
```

업무 Unique Key:

```sql
UNIQUE (
    company_id,
    entity_id,
    contract_id,
    contract_type
)
```

---

## 11. FINANCE 전표 키 설계

권장 Head:

```text
finance_ledger_head

ledger_id        UNIQUEIDENTIFIER PK
company_id       VARCHAR(10)
entity_id        VARCHAR(10)
ledger_date      DATE
ledger_no        INT
ledger_name      NVARCHAR(100)
ledger_type      VARCHAR(10)
approval_status  BIT
...
```

업무 Unique Key:

```sql
UNIQUE (
    company_id,
    entity_id,
    ledger_date,
    ledger_no
)
```

권장 Detail:

```text
finance_ledger_detail

ledger_detail_id UNIQUEIDENTIFIER PK
ledger_id        UNIQUEIDENTIFIER FK
line_no          INT
gl_id             VARCHAR(10)
drcr              VARCHAR(10)
amount            DECIMAL(19, 2)
...
```

업무 Unique Key:

```sql
UNIQUE (
    ledger_id,
    line_no
)
```

---

## 12. 전표번호 생성 규칙

전표번호는 SQL Server의 단순 `IDENTITY`로 해결하지 않는다.

AX Bridge 전표번호는 회사/일자별 순번 개념으로 관리한다.

예:

```text
2026-08-13
  1
  2
  3

2026-08-14
  1
  2
```

Domain/Application에 인터페이스를 둔다.

```typescript
export interface LedgerNumberGenerator {
  next(
    scope: CompanyScope,
    ledgerDate: Date,
  ): Promise<number>;
}
```

MSSQL Infrastructure에서 트랜잭션과 잠금 정책을 사용하여 동시 저장 시 번호 충돌을 방지한다.

전표번호 생성 로직을 Controller 또는 UI에서 구현하지 않는다.

---

## 13. Repository 규칙

Domain은 DB 구현체를 알지 못한다.

```typescript
export interface LedgerRepository {
  findById(id: LedgerId): Promise<Ledger | null>;
  save(ledger: Ledger): Promise<void>;
}
```

Infrastructure에서 MSSQL/Prisma 구현체를 제공한다 `[as-built]`:

```text
infrastructure/
├─ <domain>.repository.ts   프로시저 호출 — StoredProcExecutor(mssql 풀)
└─ <domain>.query.ts        조회 전용 SELECT — Prisma (D2 해당 건만)
```

읽기 경로가 둘인 것은 의도된 것이다(§14·D2). **기본은 프로시저다** — 검증·권한·마감
잠금이 프로시저 안에 있기 때문이다. Prisma Query Service 는 프로시저가 돌려주는 열이
화면 요구에 못 미칠 때만 쓴다. 현재 해당 건은 `GET /finance/gl` 하나뿐이다
(`usp_finance_gl_list` 는 `gl_id`·`gl_name` 2열만 반환하는데 화면기획서 5-1 ② 는
계정구분까지 3열을 요구한다. 부수 효과로 페이징이 붙었다).

> 프로시저를 고쳐 열을 늘리는 선택지도 있었다. 그러지 않은 이유는 `01~08` 을 납품
> 원본으로 동결하기 때문이다 — 조회 형태가 바뀔 때마다 프로시저를 고치면 그 동결이 깨진다.

### 금지

```typescript
@Controller()
export class LedgerController {
  constructor(private readonly prisma: PrismaService) {}
}
```

### 권장

```text
Controller
   ↓
Application Service
   ↓
LedgerRepository Interface
   ↓
PrismaLedgerRepository
   ↓
MSSQL
```

---

## 14. Command / Query 분리

완전한 CQRS 프레임워크 도입은 필수가 아니다.

다만 다음 정도의 분리는 권장한다.

### Command

업무 상태를 변경하는 기능:

```text
등록
수정
삭제
승인
승인취소   ← [미구현] 원본 프로시저에 경로가 없다(§23)
마감
마감해제   ← 09 에서 신설(usp_finance_closing_reopen)
```

처리 흐름:

```text
Application
   ↓
Domain Entity / Policy
   ↓
Repository
```

### Query

화면 조회:

```text
검색조건 조회
Head Grid 조회
Detail 조회
Lookup Popup 조회
집계 조회
```

복잡한 조회는 Domain Entity 복원 없이 Query 전용 DTO로 바로 반환할 수 있다.

```text
Query Service
   ↓
Prisma 또는 최적화된 MSSQL SELECT
   ↓
Read DTO
```

---

## 15. Raw SQL 규칙

Raw SQL은 다음 경우에만 사용한다.

- 복잡한 Grid 조회
- 대량 집계
- 성능상 ORM Query가 부적절한 경우
- SQL Server 전용 기능이 필요한 경우

Raw SQL을 Domain Entity 저장 로직의 기본 수단으로 사용하지 않는다.

### 주의

Prisma + SQL Server에서 문자열 Raw Query를 사용할 때 `NVARCHAR`/`VARCHAR` 타입 차이와 암시적 형변환에 주의한다.

특히 인덱스가 걸린 코드성 `VARCHAR` 컬럼의 검색 성능을 확인한다.

---

## 16. Domain 상태 코드 규칙

DB 코드값을 업무 로직에 직접 사용하지 않는다.

금지:

```typescript
if (approvalStatus === 'Y') {
}
```

금지:

```typescript
if (status === 0) {
}
```

권장:

```typescript
if (ledger.isApproved()) {
}
```

또는:

```typescript
if (ledger.approvalStatus === ApprovalStatus.Approved) {
}
```

DB ↔ Domain 변환은 Mapper에서 담당한다.

---

## 17. 전표 Aggregate 규칙

`finance_ledger_head`와 `finance_ledger_detail`을 별개 업무 객체처럼 처리하지 않는다.

Application에서:

```text
Ledger
 └─ LedgerLine[]
```

형태로 저장한다.

전표 저장 시 다음 검증을 하나의 업무 트랜잭션으로 처리한다.

- Head 필수값
- Line 필수값
- 계정 사용 여부
- 관리항목 활성화 여부
- 차변/대변
- 금액
- 지급/입금일
- 은행/카드
- 차변 합계 = 대변 합계
- 승인 상태에 따른 수정 제한

---

## 18. 승인 정책

승인된 전표의 일반 수정/삭제를 Application 또는 Controller의 단순 `if`로만 처리하지 않는다.

권장:

```text
LedgerApprovalPolicy
LedgerModificationPolicy
LedgerDeletePolicy
```

또는 `Ledger` Entity 내부 메서드를 사용한다.

```typescript
ledger.approve(approverId);
ledger.changeLine(...);
ledger.deleteLine(...);
```

Entity가 현재 상태에서 허용되지 않는 행위를 거부하도록 한다.

---

## 19. 관리항목 Slot 규칙

FINANCE 관리항목 Slot 1~5는 과거 전표 데이터 의미를 보존해야 한다.

따라서 다음을 금지한다.

- Slot 재정렬
- 기존 Slot의 임의 재매핑
- 과거 데이터 존재 상태에서 Slot 의미 변경
- UI 표시 순서와 저장 Slot 번호를 다르게 처리

Domain/Application에서 Slot 번호를 명시적으로 관리한다.

```typescript
export type DimensionSlot = 1 | 2 | 3 | 4 | 5;
```

---

## 20. Soft Disable / Delete 규칙

참조 데이터가 존재하는 Master는 물리 삭제보다 비활성화를 우선한다.

예:

- SYSTEM 그룹/회사/조직
- PARTNER 고객사/거래처/지급정책
- FINANCE 계정과목
- FINANCE 관리항목
- 은행/카드

삭제 수행 전 Repository를 통해 참조 여부를 검증한다.

참조 중인 경우:

```text
DELETE 차단
   ↓
비활성 전환 안내
```

비활성 데이터는 신규 선택 Popup에서 제외하되 기존 데이터 조회/참조는 유지한다.

---

## 21. 공통 Lookup Popup

F2 / Enter 검색은 화면별로 중복 구현하지 않는다.

공통 Lookup 규칙:

```text
F2
→ 조건 범위 목록

Enter
→ Exact 검색
→ Exact 1건이면 즉시 선택
→ 미일치 또는 다건이면 Like Popup
```

상위 그룹/회사 조건이 필요한 Lookup은 상위 조건이 없으면 Popup을 열지 않는다.

---

## 22. 미저장 변경 보호

신규/수정 모드에서 사용자가 다음 행동을 시도하면 Dirty Check를 수행한다.

- 다른 Head 행 선택
- 재조회
- 메뉴 이동
- Browser 이동
- 취소
- 회사/그룹 조건 변경

공통 컴포넌트:

```text
<DirtyFormGuard />
```

가능한 선택:

```text
저장
무시
취소
```

---

## 23. API 설계 규칙

단순 CRUD URL보다 업무 행위를 명시하는 Endpoint를 사용한다.

실제 엔드포인트 `[as-built]` — 전표 (식별키가 `{ledgerDate}/{ledgerNo}` 복합키다):

```http
GET    /finance/ledgers                                    헤더 목록(Layer1)
GET    /finance/ledgers/{ledgerDate}/{ledgerNo}            헤더+라인+플래그
POST   /finance/ledgers                                    Head 등록(ledger_no 자동채번)
PUT    /finance/ledgers/{ledgerDate}/{ledgerNo}            Head 수정(미승인만)
PUT    /finance/ledgers/{ledgerDate}/{ledgerNo}/lines      라인 일괄 저장
POST   /finance/ledgers/{ledgerDate}/{ledgerNo}/approve    승인(APPROVER)
DELETE /finance/ledgers/{ledgerDate}/{ledgerNo}            삭제(미승인만)
POST   /finance/ledgers/preview-account-change             계정 변경 시 Layer3 충돌 미리보기
```

> ⚠ **`cancel-approval`(승인취소)은 구현되어 있지 않다.** 원본 프로시저 산출물에 해당 경로가
> 없다. 이 때문에 연도 회계마감을 해제해도 기존 승인 전표는 여전히 편집할 수 없다
> (설계서 §9.6 한계). 승인취소가 필요해지면 프로시저 신설이 선행되어야 한다.

초기이월 — 기수는 경로가 아니라 본문으로 받는다:

```http
GET  /finance/open-balances?company_year_id=…
PUT  /finance/open-balances            일괄 저장(미확정 행만)
POST /finance/open-balances/close      확정(APPROVER) — 차대 균형 검증
POST /finance/open-balances/reopen     확정해제(ADMIN)
```

연도 회계마감 — 초기이월 "확정"과 **다른 개념**이다(설계서 §9.4):

```http
GET  /finance/closings
GET  /finance/closings/{yearId}/status
POST /finance/closings/{yearId}/execute   마감 실행(ADMIN) — 오름차순 순차
POST /finance/closings/{yearId}/reopen    마감 해제(ADMIN) — 내림차순 순차
```

Pipeline — 스테이지 전환용 별도 엔드포인트는 두지 않았다. 전환도 수정이며,
`closed_date` 기록은 트리거가 담당하므로 행위 엔드포인트가 값을 더하지 않았다:

```http
PUT /sales/pipelines/{pipelineId}            stage 전환 포함
PUT /sales/pipelines/{pipelineId}/contract   계약 연결/해제
```

---

## 24. Transaction 규칙

다음 업무는 반드시 하나의 DB 트랜잭션으로 처리한다.

- Head + Detail 저장
- 전표번호 생성 + 전표 저장
- 승인 상태 변경 + 승인자/승인일 저장
- 초기이월 마감
- 표준 GL 재생성
- 여러 테이블을 함께 수정하는 업무

부분 성공을 허용하지 않는다.

---

## 25. Prisma 규칙

Prisma Datasource는 SQL Server를 사용한다.

```prisma
datasource db {
  provider = "sqlserver"
}
```

### 스키마는 손으로 쓰지 않는다 `[as-built]`

`prisma/schema.prisma` 는 `pnpm db:pull` 이 실제 DB 에서 역생성한 결과다. 원천은
`db/01~09` T-SQL 이므로 스키마 파일을 직접 고치면 다음 `db:pull` 에 덮어써진다.
따라서 `@map` 으로 camelCase 를 입히는 초판 권장안도 채택하지 않았다 —
역생성 결과는 DB 컬럼명을 그대로 쓴다.

```prisma
model system_company {
  company_id      String          @id(map: "PK_system_company") @db.VarChar(10)
  company_name    String          @db.NVarChar(50)
  company_name_ko String          @db.NVarChar(50)
  note            String?         @db.NVarChar(200)
  description     String?         @db.NVarChar(200)
  status          Boolean         @default(false, map: "DF_company_status")
  system_entity   system_entity[]
}
```

복합키 테이블은 `@@id([company_id, entity_id, …])` 로 표현된다(§9).

> ⚠ **`status` 극성이 테이블마다 반대다.** `bit` 은 Prisma 에서 `Boolean` 으로 매핑되지만
> 그 `true` 가 "사용중"을 뜻하는지는 테이블에 따라 다르다 — 원본 명세가 그렇게 굳어 있다.
>
> ```text
> 활성 = 0 : system_company · system_entity · system_pod · system_team · finance_bank_account
> 활성 = 1 : partner_term · partner_client · partner_vendor · finance_GL · finance_dimension
> ```
>
> 그래서 `status` 를 직접 비교하지 않는다. `@ax-bridge/shared-constants` 의
> `isActive(table, status)` / `toDbStatus(table, active)` 가 극성을 흡수한다.
> 새 테이블을 추가하면 `ACTIVE_WHEN_ZERO` / `ACTIVE_WHEN_ONE` 목록에 반드시 등록한다.

Prisma Model을 Domain Entity로 직접 사용하지 않는다.

다음 Mapper를 둔다.

```text
Prisma Model
    ↕
Domain Mapper
    ↕
Domain Entity
```

---

## 26. 테스트 규칙

FR/UC ID를 테스트명에 포함시키는 것을 권장한다.

예:

```typescript
describe('LedgerApprovalPolicy', () => {
  it('FR-Ledger-12: 승인된 전표는 일반 수정할 수 없다', () => {
  });
});
```

```typescript
describe('Pipeline', () => {
  it('FR-Pipe-07: Closed 전환 시 closedDate를 기록한다', () => {
  });
});
```

최소 테스트 범위:

- Domain Unit Test
- Application Service Test
- Repository Integration Test
- API E2E Test
- 주요 UI Playwright E2E

### 현황 `[as-built]` — Domain 단위 테스트만 있다

```text
apps/api   jest (jest.config.js)   4 suites · 97 tests   ✅
apps/web   vitest --passWithNoTests   테스트 파일 0개    ⬜
Repository Integration               미작성              ⬜
API E2E                              미작성              ⬜
Playwright                           미도입              ⬜
```

작성된 Domain 스펙 — 모두 DB·NestJS 컨텍스트 없이 돈다:

| 파일 | 다루는 규칙 |
|---|---|
| `finance/domain/ledger.spec.ts` | 라인 불변식(금액·차대·계정), 플래그↔값 정합, 계정변경 충돌 미리보기가 **값을 지우지 않는다**는 것, 차대 균형·승인·마감 가드의 검사 순서, `@lines_json` 직렬화 계약 |
| `partner/domain/payment-term.strategy.spec.ts` | EOM+N / CurM DD, 월말 보정과 윤년, 연도 경계, `CK_term_shape` 와 같은 조합 검증, DB 가 문자열로 돌려줄 때의 해석 |
| `sales/domain/pipeline.spec.ts` | 단계 전이, 수주 시 고객사 필수, 재오픈, 드롭다운 경로(`changeStage`), `closed_date` 를 Entity 가 만들지 않는다는 것 |
| `system/domain/employee-account.policy.spec.ts` | `user_yn` ↔ `user_id` ↔ 초기 비밀번호 조합, 수정 시 미입력은 기존 해시 유지, inactive 와 계정 공존 금지 |

> `apps/web` 의 `pnpm test` 가 초록인 것은 "테스트가 없다"는 뜻이지 "검증되었다"는 뜻이
> 아니다(`--passWithNoTests`). `apps/api` 는 이제 플래그를 뗐으므로 스펙이 사라지면 실패한다.

**다음 우선순위** — 프로시저를 실제로 태우는 Repository Integration Test 다. 마감·초기이월처럼
트리거와 `SESSION_CONTEXT` 플래그가 얽힌 경로는 단위 테스트로 대체할 수 없다. 특히
`usp_finance_closing_execute` → `usp_finance_closing_reopen` 왕복은 `source='CLOSING'` 회수가
정확한지 실제 DB 로만 확인할 수 있다.

---

## 27. Claude 구현 지침

Claude에게 한 번에 전체 도메인 구현을 맡기지 않는다.

금지 예:

```text
SYSTEM 전체를 구현해줘.
```

권장 예:

```text
이번 작업 범위는 그룹관리만이다.

대상 요구사항:
FR-Comp-01 ~ FR-Comp-09
UC-Comp-01 ~ UC-Comp-08

다음 순서로 구현한다.

1. Prisma Model 검토
2. Domain Entity
3. Value Object / Enum
4. Repository Interface
5. Prisma Repository
6. Application Command / Query
7. Controller
8. Unit Test
9. Integration Test
10. React 화면
11. Playwright E2E

범위 밖 기능은 구현하지 않는다.
```

Vertical Slice 단위로 개발한다.

---

## 28. Claude 작업 전 필수 확인 사항

Claude는 코드 작성 전에 다음을 확인한다.

1. 대상 도메인
2. 대상 화면 ID
3. 관련 FR
4. 관련 UC
5. 사용 테이블
6. PK / FK
7. CompanyScope
8. 삭제/비활성 정책
9. 상태 코드
10. Transaction 범위
11. 공통 UI 사용 여부
12. 기존 구현과 중복 여부

명세가 서로 충돌하면 임의로 결정하지 않고 TODO 또는 명세확인 항목으로 남긴다.

---

## 29. Claude 코드 생성 금지사항

Claude는 다음 행동을 하지 않는다.

- Controller에서 Prisma 직접 호출
- React Component에서 SQL/DB 개념 처리
- Domain에서 NestJS Decorator 사용
- Domain에서 Prisma 타입 사용
- 중복되는 Lookup Popup 신규 구현
- 화면별 Toolbar 중복 구현
- 승인/마감/삭제 규칙을 UI에서만 검증
- 다른 회사 데이터를 ID만으로 조회
- 회계 금액에 float 사용
- 비밀번호 평문 저장
- DB Y/N, 0/1 코드를 Domain 전체에 노출
- nullable 업무 FK를 Primary Key에 포함
- 전표번호를 UI에서 생성
- FR/UC 근거 없는 업무 규칙 임의 추가
- 요구되지 않은 대규모 리팩터링
- 필요하지 않은 Generic Repository 프레임워크 추가
- 필요하지 않은 Event Bus 또는 Microservice 도입

---

## 30. 구현 우선순위

권장 구현 순서:

```text
Phase 0
프로젝트 Bootstrap
DB / Prisma / Auth / Permission / Common Exception
        ↓
Phase 1
공통 UI
Toolbar / HeadDetail / Lookup / Dirty Guard
        ↓
Phase 2
SYSTEM
Group → Entity → Pod/Team → Employee → Fiscal Year
        ↓
Phase 3
PARTNER
Payment Term → Client → Vendor
        ↓
Phase 4
SALES
Pipeline → Activity → Contract
        ↓
Phase 5
FINANCE 기준정보
GL → Dimension → Bank Account
        ↓
Phase 6
FINANCE 핵심업무
Open Balance → Ledger → Approval
        ↓
Phase 7
통합 E2E / 성능 / 권한 / Audit
```

### 진행 현황 `[as-built]` (2026-08-14)

| Phase | 상태 | 비고 |
|---|---|---|
| 0 Bootstrap | ✅ | DB 01~09 · Prisma · JWT/Argon2id · RolesGuard · 전역 예외/응답/감사 |
| 1 공통 UI | ✅ | AppToolbar · HeadDetailLayout · ResizablePanes · LookupPopup · DirtyFormGuard · StatusBadge |
| 2 SYSTEM | ✅ | 6화면 · 28 엔드포인트 |
| 3 PARTNER | ✅ | 3화면 · 15 엔드포인트 |
| 4 SALES | ✅ | 2화면(액티비티는 파이프라인 하위 패널) · 15 엔드포인트 |
| 5 FINANCE 기준정보 | ✅ | 계정과목 · 관리항목 · 은행/카드 |
| 6 FINANCE 핵심업무 | ✅ | 초기이월 · 전표 3-Layer · 승인 · 마감/마감해제 |
| 7 통합 E2E / 성능 / Audit | 🔶 **일부** | Domain 단위 테스트 97건 작성(§26). Integration·E2E·성능은 미착수 |

합계 — 화면 17종 · API 94건 · 프로시저 75건 · 트리거 10건.

---

## 31. 최종 기술 방향

```text
Frontend
React + TypeScript + Vite
Ant Design (Table 포함 — 별도 그리드 라이브러리 없음)
TanStack Query + Zustand
React Hook Form + Zod

        ↓ REST /api/v1  (JWT Bearer)

Backend
NestJS + TypeScript
Guard: JwtAuth → Roles → Throttler
Interceptor: Audit → ApiResponse
Filter: AllExceptions (50xxx → AX-50xxx)

        ↓

Domain
SYSTEM / PARTNER / SALES / FINANCE
프레임워크 비의존 — 전표 Aggregate · 지급정책 · 스테이지 전이 · 계정 정책

        ↓

Application
Domain 판정 + Repository 조립

        ↓

Infrastructure
mssql   → 저장 프로시저 호출 (쓰기·대부분의 조회)
Prisma  → Query Service (D2 해당 건만: GET /finance/gl)

        ↓

Microsoft SQL Server
프로시저 75 · 트리거 10 — 업무 규칙의 최종 방어선
```

DB 기본 원칙 `[as-built]`:

```text
PK            → 복합 업무키 (company_id, entity_id, …)   ※ 기술 PK 미채택 — §9
Business Key  → PK 자체. 보조 유일성은 UNIQUE INDEX
업무 코드     → VARCHAR
명칭/한글     → NVARCHAR
Boolean       → BIT
금액          → NUMERIC(18,2)
날짜(업무일자) → DATE
일시(감사시각) → DATETIME2(0)   last_login · last_manual_edit_at · approved_date
Tenant Scope  → company_id + entity_id  (JWT claim 에서만 주입)
전표번호      → 프로시저가 (회사, 전표일자) 범위에서 동시성 안전 채번 — §12
삭제          → 참조 검증 후 Delete 또는 Disable. 트리거가 이중 방어
```

> `approved_date` 는 `09` 에서 `DATE → DATETIME2(0)` 로 넓혔다. 승인은 감사 대상 행위라
> 일 단위로는 부족하다. `insert_date` · `update_date` · `closed_date` · `closing_date` 는
> 업무일자이므로 `DATE` 를 유지한다.

---

## 32. Definition of Done

하나의 기능은 다음 조건을 모두 충족해야 완료로 본다.

| 조건 | 현황 `[as-built]` |
|---|---|
| 관련 FR 구현 완료 | ✅ |
| 관련 UC 정상/예외 흐름 구현 완료 | ✅ |
| CompanyScope 적용 | ✅ `@Scope()` + JwtAuthGuard |
| Domain Validation 적용 | ✅ `domain/` + `class-validator` DTO |
| DB Constraint 적용 | ✅ `01`~`09` (무결성 보강은 `09`) |
| Transaction 검토 | ✅ 프로시저 내부 TRY/CATCH + XACT_ABORT |
| Repository 분리 | ✅ |
| Swagger 문서 생성 | ✅ `/api/v1/docs` |
| Unit Test 통과 | ✅ Domain 4개 스펙 97건 (§26). Application/Query 계층은 아직 없다 |
| Integration Test 통과 | ⬜ **미작성** — 프로시저를 태우는 Repository 테스트 |
| 주요 E2E 통과 | ⬜ **미작성** |
| 공통 UI 사용 | ✅ |
| Error Message 처리 | ✅ 50xxx → AX-50xxx 한글 메시지 |
| 권한 처리 | ✅ `@MinRole` + RolesGuard |
| 미저장 변경 보호 | ✅ `DirtyFormGuard` |
| 코드 포맷/린트 통과 | ⚠ api 만 `eslint src`. web 의 `lint` 는 no-op |
| 요구사항 ID 추적 가능 | ✅ 코드 주석에 FR/UC ID 유지 |

> 아직 어떤 기능도 이 DoD 를 **완전히** 충족하지 않는다 — Integration·E2E 가 비어 있기 때문이다.
> 기능 구현은 끝났고 검증이 절반 남았다는 뜻으로 읽어야 한다.

---

## 33. 한 줄 아키텍처 원칙

> **DB 테이블 중심으로 코딩하지 말고 업무 도메인 중심으로 설계하며, MSSQL과 Prisma는 Infrastructure에 격리하고, 회사 범위·승인·마감·삭제·전표번호 같은 핵심 규칙은 Domain/Application에서 일관되게 관리한다.**
