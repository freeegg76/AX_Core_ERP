# AX Bridge 개발 지침

> 목적: VS Code + Claude를 활용하여 AX Bridge를 구현할 때 사용할 공통 개발 규칙  
> 대상 스택: React + TypeScript + NestJS + Prisma + Microsoft SQL Server  
> 아키텍처 방향: Modular Monolith + DDD-lite + Clean Architecture

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

## 2. 권장 기술 스택

### Frontend

- React
- TypeScript
- Vite
- Ant Design
- AG Grid
- TanStack Query
- React Hook Form
- Zod
- Zustand
- Vitest
- Playwright

### Backend

- NestJS
- TypeScript
- Prisma ORM
- `@prisma/adapter-mssql`
- Passport
- JWT 또는 Session
- Argon2id
- OpenAPI / Swagger
- Jest

### Database

- Microsoft SQL Server
- SQL Server Developer Edition 또는 운영 환경에 맞는 SQL Server
- Prisma Migration
- 필요 시 Custom T-SQL Migration

### Monorepo / Tooling

- pnpm workspace
- Turborepo
- Docker Compose
- ESLint
- Prettier
- VS Code
- Claude

---

## 3. 프로젝트 최상위 폴더 구조

```text
ax-bridge/
├─ apps/
│  ├─ web/
│  └─ api/
│
├─ packages/
│  ├─ shared-types/
│  ├─ shared-constants/
│  └─ eslint-config/
│
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed/
│     └─ standard-gl/
│
├─ docs/
│  ├─ spec/
│  │  ├─ system/
│  │  ├─ partner/
│  │  ├─ sales/
│  │  └─ finance/
│  ├─ erd/
│  └─ api/
│
├─ docker-compose.yml
├─ pnpm-workspace.yaml
├─ turbo.json
├─ prisma.config.ts
├─ CLAUDE.md
└─ README.md
```

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

### 기본 구조

```text
apps/api/src/
├─ main.ts
├─ app.module.ts
│
├─ common/
│  ├─ auth/
│  ├─ permission/
│  ├─ tenant/
│  ├─ database/
│  ├─ exception/
│  ├─ transaction/
│  └─ audit/
│
└─ modules/
   ├─ system/
   ├─ partner/
   ├─ sales/
   └─ finance/
```

### 각 도메인의 공통 구조

```text
<domain>/
├─ domain/
│  ├─ entities/
│  ├─ value-objects/
│  ├─ enums/
│  ├─ policies/
│  ├─ services/
│  └─ repositories/
│
├─ application/
│  ├─ commands/
│  ├─ queries/
│  ├─ dto/
│  └─ services/
│
├─ infrastructure/
│  ├─ persistence/
│  │  └─ mssql/
│  │     ├─ prisma/
│  │     ├─ repositories/
│  │     ├─ queries/
│  │     └─ mappers/
│  └─ mapper/
│
├─ presentation/
│  └─ http/
│     ├─ controllers/
│     └─ dto/
│
└─ <domain>.module.ts
```

---

## 5. 도메인 구성

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
├─ app/
│  ├─ router/
│  ├─ providers/
│  └─ layout/
│
├─ features/
│  ├─ system/
│  │  ├─ company/
│  │  ├─ entity/
│  │  ├─ team/
│  │  ├─ pod/
│  │  └─ employee/
│  │
│  ├─ partner/
│  │  ├─ client/
│  │  ├─ vendor/
│  │  └─ term/
│  │
│  ├─ sales/
│  │  ├─ pipeline/
│  │  ├─ activity/
│  │  └─ contract/
│  │
│  └─ finance/
│     ├─ gl/
│     ├─ dimension/
│     ├─ ledger/
│     ├─ open-balance/
│     └─ bank-account/
│
└─ shared/
   ├─ ui/
   │  ├─ AppToolbar/
   │  ├─ SearchBar/
   │  ├─ HeadDetailLayout/
   │  ├─ LookupPopup/
   │  ├─ ConfirmDialog/
   │  └─ StatusBadge/
   ├─ hooks/
   ├─ api/
   ├─ constants/
   └─ utils/
```

### 공통 UI 컴포넌트

다음 컴포넌트는 화면별로 중복 구현하지 않는다.

```text
<AppToolbar />
<SearchBar />
<HeadDetailLayout />
<LookupPopup />
<DirtyFormGuard />
<ConfirmDialog />
<StatusBadge />
```

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

## 9. Primary Key / Business Key 설계

AX Bridge 신규 DB에서는 **기술 PK + 업무 Unique Key** 전략을 우선 검토한다.

권장 기술 PK:

```sql
UNIQUEIDENTIFIER
```

예:

```text
company_pk
entity_pk
client_pk
vendor_pk
contract_pk
ledger_pk
ledger_detail_pk
```

Prisma에서는 UUID를 사용한다.

예:

```prisma
id String @id @default(uuid()) @db.UniqueIdentifier
```

업무 코드에는 별도 UNIQUE 제약조건을 둔다.

예:

```sql
UNIQUE (
  company_id,
  entity_id,
  client_id
)
```

### 원칙

```text
DB Primary Key = 기술 식별자
Business Key   = UNIQUE INDEX / UNIQUE CONSTRAINT
```

복합 업무 PK가 꼭 필요한 경우에는 예외적으로 Composite PK를 사용할 수 있으나, 선택 가능한 nullable 컬럼을 Primary Key에 포함하지 않는다.

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

Infrastructure에서 MSSQL/Prisma 구현체를 제공한다.

```text
infrastructure/
└─ persistence/
   └─ mssql/
      ├─ prisma/
      ├─ repositories/
      ├─ queries/
      └─ mappers/
```

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
승인취소
마감
마감해제
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

예:

```http
POST   /finance/ledgers
GET    /finance/ledgers
GET    /finance/ledgers/{id}
PUT    /finance/ledgers/{id}
DELETE /finance/ledgers/{id}

POST   /finance/ledgers/{id}/approve
POST   /finance/ledgers/{id}/cancel-approval
```

기초잔액:

```http
POST /finance/open-balances/{fiscalYearId}/close
POST /finance/open-balances/{fiscalYearId}/reopen
```

Pipeline:

```http
POST /sales/pipelines/{id}/close
POST /sales/pipelines/{id}/cancel
POST /sales/pipelines/{id}/reopen
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

DB 컬럼명을 기존 명세와 유지하고 TypeScript 이름은 camelCase로 사용할 경우 `@map`을 활용한다.

```prisma
model SystemCompany {
  id            String @id @default(uuid()) @db.UniqueIdentifier

  companyId     String @map("company_id") @db.VarChar(10)

  companyName   String @map("company_name") @db.NVarChar(100)

  companyNameKo String @map("company_name_ko") @db.NVarChar(100)

  @@unique([companyId])
  @@map("system_company")
}
```

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

---

## 31. 최종 기술 방향

```text
Frontend
React + TypeScript + Vite
Ant Design + AG Grid
TanStack Query
React Hook Form + Zod

        ↓ REST API

Backend
NestJS + TypeScript

        ↓

Domain
SYSTEM / PARTNER / SALES / FINANCE

        ↓

Application
Command / Query / DTO

        ↓

Infrastructure
Prisma
MSSQL Repository
Query Service

        ↓

Microsoft SQL Server
```

DB 기본 원칙:

```text
PK            → UNIQUEIDENTIFIER 기술키 우선
Business Key  → UNIQUE CONSTRAINT / INDEX
업무 코드     → VARCHAR
명칭/한글     → NVARCHAR
Boolean       → BIT
금액          → DECIMAL
날짜          → DATE
일시          → DATETIME2
Tenant Scope  → company_id + entity_id
전표번호      → 별도 Number Generator
삭제          → 참조 검증 후 Delete 또는 Disable
```

---

## 32. Definition of Done

하나의 기능은 다음 조건을 모두 충족해야 완료로 본다.

- 관련 FR 구현 완료
- 관련 UC 정상/예외 흐름 구현 완료
- CompanyScope 적용
- Domain Validation 적용
- DB Constraint 적용
- Transaction 검토
- Repository 분리
- Swagger 문서 생성
- Unit Test 통과
- Integration Test 통과
- 주요 E2E 통과
- 공통 UI 사용
- Error Message 처리
- 권한 처리
- 미저장 변경 보호
- 코드 포맷/린트 통과
- 요구사항 ID 추적 가능

---

## 33. 한 줄 아키텍처 원칙

> **DB 테이블 중심으로 코딩하지 말고 업무 도메인 중심으로 설계하며, MSSQL과 Prisma는 Infrastructure에 격리하고, 회사 범위·승인·마감·삭제·전표번호 같은 핵심 규칙은 Domain/Application에서 일관되게 관리한다.**
