# AX Bridge 시스템 설계서

> **문서 목적** — SYSTEM / PARTNER / SALES / FINANCE 4개 도메인으로 구성된 내부 ERP/CRM 성격 업무 시스템 *AX Bridge* 를 구현하기 위한 단일 통합 설계서.
> React + TypeScript + NestJS + Prisma + Microsoft SQL Server 스택 위에서 **Modular Monolith + DDD-lite + Clean Architecture** 로 구현한다.
>
> **근거 문서**
> - `AX_Bridge_MSSQL_Development_Guideline.md` (개발 지침 33개 절)
> - `AX_Bridge.xlsx` — 테이블 명세서 / FR(기능요구) / UC(유스케이스)
> - `AX_Bridge_DB_API_명세서.xlsx` — 저장 프로시저 74건 · 트리거 10건 · API 92건
> - `01~08_*.sql` — 실제 MSSQL DDL · 프로시저 · 트리거 · 표준 GL Seed · v3 개정분
> - 화면기획서 4종 (SYSTEM / PARTNER / SALES / FINANCE v3.0)
>
> **버전 기준** — DB/API 명세 v2.0 (FINANCE 화면기획서 v3.0 = 10차 개정, 마감관리·연도이월·초기이월 bank_id 반영). DB명 `AX_Bridge`.
>
> **설계서 버전** — v1.1 (2026-08-13). 원본 산출물 전량 교차검증 결과 반영:
> 사실 오류 정정, 확정 설계결정 D1~D8(§2.4) 반영, 누락 업무규칙 보강, 원본 SQL 결함을 [부록 C](#부록-c-09_ax_bridge_fixsql-스펙)로 문서화.
>
> **적용된 SQL 수정** — ① `01_AX_Bridge_Tables.sql` 의 FK 길이 불일치(배포 차단 결함)를 직접 수정했다([C.1](#c1-배포-차단-결함--01-에서-직접-수정함-d3-예외--적용-완료)). ② 나머지 결함·무결성 보강·마감해제 신설은 **`09_AX_Bridge_Fix.sql` 로 작성 완료**([부록 C](#부록-c-09_ax_bridge_fixsql-스펙)). `02~08` 은 미변경이다. 실제 DB 적용은 Phase 0에서 수행한다.

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [아키텍처 원칙](#2-아키텍처-원칙)
3. [기술 스택](#3-기술-스택)
4. [프로젝트 구조](#4-프로젝트-구조)
5. [멀티테넌시와 CompanyScope](#5-멀티테넌시와-companyscope)
6. [인증 · 권한 · 부트스트랩](#6-인증--권한--부트스트랩)
7. [도메인 모델](#7-도메인-모델)
8. [데이터 모델](#8-데이터-모델)
9. [핵심 업무 규칙](#9-핵심-업무-규칙)
10. [DB 오브젝트 ↔ 애플리케이션 계층 매핑 전략](#10-db-오브젝트--애플리케이션-계층-매핑-전략)
11. [API 설계](#11-api-설계)
12. [프론트엔드 설계](#12-프론트엔드-설계)
13. [트랜잭션 규칙](#13-트랜잭션-규칙-지침-24)
14. [요구사항 추적 매트릭스](#14-요구사항-추적-매트릭스)
15. [테스트 전략](#15-테스트-전략-지침-26)
16. [구현 로드맵](#16-구현-로드맵-지침-2730--vertical-slice)
17. [Definition of Done](#17-definition-of-done)
18. [부록 A. 코드값 사전](#부록-a-코드값-사전)
19. [부록 B. 오류코드 체계](#부록-b-오류코드-체계)
20. [부록 C. `09_AX_Bridge_Fix.sql` 스펙](#부록-c-09_ax_bridge_fixsql-스펙)

---

## 1. 시스템 개요

AX Bridge는 그룹/회사 단위로 조직·거래처·영업·회계를 통합 관리하는 내부 업무 시스템이다. 4개 도메인이 강하게 연결되어 있어 초기에는 마이크로서비스로 분리하지 않고 **모듈러 모놀리스**로 구현하되, 도메인 경계는 코드 수준에서 명확히 유지한다.

| 도메인 | 책임 | 주요 메뉴 |
|--------|------|-----------|
| **SYSTEM** | 조직 기준정보 · 인증/권한 기초 | 그룹, 회사, Pod, 부서, 직원, 회사 기수, 초기 Admin |
| **PARTNER** | 거래 상대 · 지급/수금 정책 | 고객사, 거래처, 지급정책(Payment Term) |
| **SALES** | 영업 파이프라인 · 활동 · 계약 | 파이프라인, 고객 액티비티, 계약 |
| **FINANCE** | 회계 기준정보 · 전표 · 마감 | 계정과목(GL), 관리항목(Dimension), 은행/카드, 초기이월, 전표(Ledger), 마감관리(Closing) |

**규모 요약** (원본 산출물 실측)

| 항목 | 수량 | 근거 |
|------|------|------|
| 업무 테이블 | **20종** (+ 표준 GL 원본 `finance_GL_seed` = **DDL 21종**) | `01` 20 CREATE TABLE + `08` `finance_closing` 1건. 테이블 명세서(xlsx)는 `finance_GL_seed` 를 다루지 않아 20종 |
| 저장 프로시저 | **74건** (+ 본 설계서 신설 `usp_finance_closing_reopen` = **75건**) | `02` 24 · `03` 12 · `04` 12 · `05` 23 = 71, `08`의 11개 CREATE 중 **신규 3건**(나머지 8건은 `05` 교체) |
| 트리거 | **10건** | `06` 9건 + `08` 신규 1건. `08`이 `06`의 3건을 교체 |
| REST 엔드포인트 | **92건** (+ 신설 마감해제 1건 = **93건**) | AUTH 3 · SYSTEM 28 · PARTNER 15 · SALES 15 · FINANCE 31 |
| FR | **179건** | COMMON 7 · SYSTEM 55 · PARTNER 24 · SALES 25 · FINANCE 68 |
| UC | **135건** | 20개 접두어. 최다 UC-Ledger 13건 |

> **단일통화 전제** — `partner_client`/`partner_vendor` 에 `default_billing_currency varchar(10)` 컬럼이 있으나 이를 사용하는 FR은 **0건**이고, `finance_ledger_detail`·`sales_contract` 에 통화 컬럼이 없다. 따라서 **다통화·환산은 본 설계 범위 외**로 하고 모든 금액을 단일 통화(원화)로 취급한다. 해당 컬럼은 거래처 참고 속성으로만 보존한다.

**도메인 간 의존 방향** (하위 → 상위 참조):

```
SYSTEM  (company / entity / pod / team / employee / year)
   ▲              ▲                    ▲
PARTNER        SALES               FINANCE
(client/vendor) (pipeline/         (GL·dimension·bank·
   ▲            activity/contract)  open_balance·ledger·closing)
   └──────────── FINANCE 전표 라인이 PARTNER/SALES/SYSTEM 코드를 참조
```

FINANCE 전표(`finance_ledger_detail`)는 SYSTEM(Team/Pod/직원), PARTNER(고객사/거래처), FINANCE(계정/은행·카드/관리항목)를 모두 참조하는 최말단 트랜잭션 데이터다.

---

## 2. 아키텍처 원칙

### 2.1 계층 의존성 (Clean Architecture)

```
Presentation (NestJS Controller / DTO)
      ↓
Application (Command / Query / Application Service / DTO)
      ↓
Domain (Entity / Value Object / Enum / Policy / Domain Service / Repository Interface)
      ↑ (구현)
Infrastructure (Prisma · MSSQL Repository · Query Service · Mapper)
```

**불변 규칙 (개발지침 §1, §29 준수)**

1. Domain 계층은 NestJS / Prisma / React 어떤 프레임워크에도 의존하지 않는다.
2. Controller에서 Prisma Client 또는 저장 프로시저를 **직접** 호출하지 않는다.
3. 모든 DB 접근은 Infrastructure Repository 를 통한다.
4. 저장/승인/마감/삭제 등 업무 규칙은 Domain Entity 또는 Domain Policy 에서 처리한다. UI/Controller 의 단순 `if` 로만 검증하지 않는다.
5. 복잡한 조회는 Domain 복원 없이 Query 전용 DTO 로 반환할 수 있다(CQRS-lite).
6. 4개 도메인의 경계를 유지한다. 도메인 간 참조는 명시적 Application 서비스 호출 또는 공유 식별자로만 한다.
7. 모든 회사 단위 데이터 접근에 `company_id + entity_id` 스코프를 적용한다.
8. 공통 UI 패턴을 재사용하고 화면별 중복 구현을 금지한다.
9. FR/UC ID 를 코드·테스트에서 추적 가능하게 남긴다.
10. 임의의 범용 CRUD 프레임워크 · Generic Repository · Event Bus · Microservice 를 도입하지 않는다.

### 2.2 한 줄 원칙

> **DB 테이블 중심이 아니라 업무 도메인 중심으로 설계하고, MSSQL/Prisma는 Infrastructure에 격리하며, 회사 범위·승인·마감·삭제·전표번호 같은 핵심 규칙은 Domain/Application에서 일관되게 관리한다.**
>
> — 개발지침 §33 「한 줄 아키텍처 원칙」

### 2.3 저장 프로시저 · 트리거와 DDD의 통합 (핵심 설계 결정)

납품물에는 완결된 **저장 프로시저 74건 + 트리거 10건** 이 포함되어 있고, 지침은 **NestJS+Prisma 기반 DDD** 를 요구한다. 본 설계서는 다음 전략으로 둘을 화해시킨다.

| 관심사 | 소유 위치 | 근거 |
|--------|-----------|------|
| 업무 규칙의 **1차 권위** (승인 가능 여부, 차대 균형, Slot 매핑, 마감 잠금 등) | Domain Entity / Policy | 지침 §17·§18·§19·§29 |
| 쓰기 트랜잭션의 **실행** | Infrastructure Repository → **제공된 저장 프로시저 호출** (TRY/CATCH·트랜잭션·THROW 50xxx 내장) | 명세의 `usp_*` |
| 조회 | Query Service → Prisma 또는 최적화 SELECT (또는 `usp_*_list/get` 호출) | 지침 §14·§15 |
| **DB 계층 이중 방어** | 트리거 (프로시저 우회 직접 DML 차단) | 명세 트리거 목록 |

즉, 저장 프로시저는 "잘 검증된 트랜잭션 실행 단위"로서 Infrastructure Repository의 구현 수단이 되고, Domain은 프로시저 호출 **이전에** 동일 규칙을 표현하여 코드 가독성·테스트성·오류 UX를 확보한다. 트리거는 애플리케이션을 우회한 DML(수동 SQL, 배치)에 대한 최후의 방어선이며 정상 경로는 `SESSION_CONTEXT` 플래그(`ax_ledger_approve`, `ax_openbal_admin`, `ax_bypass_gl_protect`)로 통과한다.

> **대안** — 프로시저를 사용하지 않고 Prisma `$transaction` 으로 동일 로직을 재구현할 수도 있다. 그러나 이미 검증된 프로시저(동시성 잠금·JSON 일괄처리·복잡 마감 계산 포함)를 재사용하는 편이 리스크가 낮으므로 **프로시저 재사용을 기본 채택**한다. 순수 Prisma 재구현은 단순 마스터(그룹/회사/Pod 등)에 한해 선택적으로 허용한다.

> **지침 §15와의 편차 (명시적 설계 결정)** — 지침 §15는 "Raw SQL을 Domain Entity 저장 로직의 **기본 수단**으로 사용하지 않는다"고 규정하고, §31의 아키텍처 그림에도 저장 프로시저가 등장하지 않는다. 본 설계서는 **쓰기 경로에 프로시저를 기본 수단으로 채택**하므로 이 조항에서 의도적으로 벗어난다. 근거: (1) 74건이 이미 TRY/CATCH·`XACT_ABORT`·`UPDLOCK,HOLDLOCK`·`OPENJSON`·마감 이월 계산까지 완결된 상태로 납품되었고, (2) 트리거 10건이 프로시저를 정상 경로로 전제(`SESSION_CONTEXT` 플래그)하므로 프로시저를 우회하면 트리거가 정상 쓰기를 차단한다. 대신 지침의 취지는 **Domain이 규칙의 1차 권위를 갖고 Repository 인터페이스 뒤에 프로시저를 격리**하는 방식으로 충족한다.

### 2.4 상위 설계 결정 (D1~D8)

원본 산출물 교차검증 결과 확정된 결정. 이하 각 절은 이 표를 참조한다.

| # | 결정 | 요지 | 상세 |
|---|------|------|------|
| **D1** | 프로시저 실행 = **node-mssql 병용** | 쓰기는 `mssql` 드라이버로 프로시저 직접 실행, 읽기는 Prisma | [§10.2](#102-프로시저-실행-계층-d1) |
| **D2** | 목록 조회는 **Query Service(Prisma/최적화 SELECT)** 로 전환 | 페이징·정렬은 애플리케이션이 담당. `usp_*_list` 는 Lookup 팝업 전용 | [§10.3](#103-command--query-분리와-조회페이징-전략-d2) |
| **D3** | **`09_AX_Bridge_Fix.sql` 신설** | `01~08` 은 납품 원본으로 동결, 모든 수정은 멱등한 `09` 에 집약. **예외 1건** — `01` 의 FK 길이 불일치는 테이블이 생성조차 되지 않아 `09` 로 고칠 수 없으므로 `01` 에서 직접 수정했다 | [부록 C](#부록-c-09_ax_bridge_fixsql-스펙) |
| **D4** | **연도 회계마감 해제 기능 추가** | `usp_finance_closing_reopen` + `POST /finance/closings/{yearId}/reopen`(ADMIN) | [§9.6](#96-연도-회계마감-해제-d4--신설) |
| **D5** | 09_fix 범위 = **버그 + 무결성만** | 배포 차단·데이터 오염 유발 제약만 추가. 단순 열거형 CHECK 8종은 Domain Enum + 프로시저 검증에 위임 | [부록 C](#부록-c-09_ax_bridge_fixsql-스펙) |
| **D6** | 정수형 컬럼 타입은 **DB 유지** | `numeric(10,2)` 그대로 두고 Mapper/DTO 경계에서 `number` 정규화 | [§8.1](#81-데이터-타입-기준-지침-8-9) |
| **D7** | 마감 이월 **음수 허용** | `amount >= 0` CHECK 를 추가하지 않고, 합계 집계·화면 표시가 음수를 상쇄하도록 보정 | [§9.5](#95-연도-회계마감-이월-계산-fr-close-0510) |
| **D8** | **`approved_date` 만 `datetime2(0)` 상향** | 나머지 업무일자는 `date` 유지, 세밀한 이력은 `common/audit` 로깅이 담당 | [§8.1](#81-데이터-타입-기준-지침-8-9) |

---

## 3. 기술 스택

### Frontend
React · TypeScript · Vite · Ant Design · **AG Grid**(Head/Detail 그리드) · TanStack Query · React Hook Form · **Zod**(스키마 검증) · Zustand · Vitest · Playwright

### Backend
NestJS · TypeScript · **Prisma ORM**(조회) · **`mssql`(node-mssql / tedious)**(쓰기 — 프로시저 실행, OUTPUT 파라미터·다중 결과셋) · Passport · JWT(Access 30분 / Refresh 14일) · **Argon2id**(비밀번호 해시) · OpenAPI/Swagger · Jest

> **D1** — Prisma 단독으로는 제공된 프로시저를 실행할 수 없어 `mssql` 드라이버를 병용한다. 근거와 구조는 [§10.2](#102-프로시저-실행-계층-d1) 참조. `@prisma/adapter-mssql` 은 Prisma 측 커넥션에만 사용한다.

### Database
Microsoft SQL Server 2016+ (OPENJSON · SESSION_CONTEXT 사용) · DB명 `AX_Bridge` · Prisma Migration + 필요 시 Custom T-SQL Migration

### Monorepo / Tooling
pnpm workspace · Turborepo · Docker Compose · ESLint · Prettier · VS Code · Claude

---

## 4. 프로젝트 구조

### 4.1 최상위 (모노레포)

```text
ax-bridge/
├─ apps/
│  ├─ web/                      # React 프론트엔드
│  └─ api/                      # NestJS 백엔드
├─ packages/
│  ├─ shared-types/             # FE/BE 공유 타입 (DTO, Enum)
│  ├─ shared-constants/         # 코드값 사전, 오류코드 매핑
│  └─ eslint-config/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed/standard-gl/         # 표준 GL Seed (07_AX_Bridge_Seed_GL.sql)
├─ db/                          # 원본 SQL 자산 (01~08) — 마이그레이션 소스
├─ docs/spec/{system,partner,sales,finance}/ · erd/ · api/
├─ docker-compose.yml · pnpm-workspace.yaml · turbo.json · prisma.config.ts
├─ CLAUDE.md · README.md
```

### 4.2 백엔드 (`apps/api/src`)

```text
main.ts · app.module.ts
common/
├─ auth/         # Passport/JWT, 로그인, 토큰
├─ permission/   # Role 가드 (VIEWER<EDITOR<APPROVER<ADMIN<SUPER)
├─ tenant/       # CompanyScope 추출/주입 (JWT claim → X-Company-Id/X-Entity-Id)
├─ database/     # PrismaService, MSSQL 커넥션, 프로시저 실행 헬퍼
├─ exception/    # THROW 50xxx → AX-50xxx → HTTP 매핑 필터
├─ transaction/  # 트랜잭션 경계 데코레이터/유닛오브워크
└─ audit/        # 쓰기 요청 감사 로깅 (비밀번호/카드번호 마스킹)
modules/
├─ system/  ├─ partner/  ├─ sales/  └─ finance/
```

각 도메인 모듈의 공통 구조:

```text
<domain>/
├─ domain/          entities/ value-objects/ enums/ policies/ services/ repositories/
├─ application/     commands/ queries/ dto/ services/
├─ infrastructure/  persistence/mssql/{prisma, repositories, queries, mappers}
├─ presentation/    http/{controllers, dto}
└─ <domain>.module.ts
```

### 4.3 프론트엔드 (`apps/web/src`)

```text
app/         router/ providers/ layout/
features/
├─ system/  {company, entity, team, pod, employee, year}
├─ partner/ {client, vendor, term}
├─ sales/   {pipeline, activity, contract}
└─ finance/ {gl, dimension, ledger, open-balance, bank-account, closing}
shared/
├─ ui/      AppToolbar/ SearchBar/ HeadDetailLayout/ LookupPopup/
│           DirtyFormGuard/ ConfirmDialog/ StatusBadge/
├─ hooks/  api/  constants/  utils/
```

---

## 5. 멀티테넌시와 CompanyScope

업무 테이블은 원칙적으로 `(company_id, entity_id, …)` 복합키를 갖는다. `company_id` = 그룹, `entity_id` = 회사로 해석한다.

> **원칙의 예외 2건 (DDL 실측)**
> - **`finance_GL_seed`** — 스코프 컬럼이 아예 없다. PK는 `(gl_id)` 단독이며 전 회사가 공유하는 **전역 표준 GL 원본**이다. 재생성 프로시저가 `company_id`/`entity_id` 를 세션값으로 치환하며 복제한다.
> - **`finance_open_balance`** — **PRIMARY KEY 가 없다**(현재 힙 테이블). 유일성은 `UX_open_balance` 유니크 인덱스로만 보장된다. → D3/D5에 따라 [부록 C](#부록-c-09_ax_bridge_fixsql-스펙)에서 PK를 추가한다.

**Value Object** — 반복 문자열 인자 대신 `CompanyScope` 를 사용한다.

```typescript
export class CompanyScope {
  constructor(
    public readonly companyId: string,   // 그룹코드 varchar(10)
    public readonly entityId: string,    // 회사코드 varchar(10)
  ) {}
}
```

Repository 인터페이스는 항상 `scope` 를 첫 인자로 받는다.

```typescript
export interface ClientRepository {
  findById(scope: CompanyScope, clientId: string): Promise<Client | null>;
  findAll(scope: CompanyScope, condition: ClientSearchCondition): Promise<Client[]>;
  save(scope: CompanyScope, client: Client): Promise<void>;
}
```

### 필수 규칙 (지침 §7, FR-Bank-08)

- **`company_id`/`entity_id` 는 요청 본문·쿼리로 받지 않는다.** API Gateway가 JWT claim에서 추출하여 헤더(`X-Company-Id` / `X-Entity-Id`)로 전달하고, 서버는 모든 프로시저 호출 시 재검증한다. 화면 조건만으로 권한을 판단하지 않는다.
- 회사 단위 테이블 조회 시 `company_id + entity_id` 필터를 누락하지 않는다.
- 다른 회사 데이터가 ID만으로 조회되지 않게 한다.
- 다른 회사의 FK를 연결하려는 요청은 저장 전에 차단한다.
- 표준 GL 재생성 등 대상 지정 기능도 사용자가 임의로 대상 회사를 바꿀 수 없고 세션 값으로 고정한다(FR-GL-11).

---

## 6. 인증 · 권한 · 부트스트랩

### 6.1 인증 흐름

```
POST /auth/login {user_id, password}
  → usp_auth_get_credential(@user_id)   # 인증서비스 전용(내부), user_pass 해시 포함
  → WAS가 Argon2id/bcrypt 로 검증        # 해시 검증은 애플리케이션이 수행
  → 성공 시 usp_auth_update_last_login
  → JWT 발급: Access 30분 / Refresh 14일
     claim = { user_id, employee_id, company_id, entity_id, roles[] }
POST /auth/refresh {refresh_token} → 새 Access
PUT  /auth/password  {current_password, new_password}   # 본인 변경
     → 현재 비밀번호 검증(WAS) → usp_auth_change_password(@new_pass_hash)
```

> `usp_auth_get_credential` 은 **전체 74개 프로시저 중 `user_pass` 를 반환하는 유일한 프로시저**이며 `user_yn=1 AND status<>'inactive'` 조건이 내장되어 있다. `usp_system_employee_list`/`_get` 은 해시를 컬럼 목록에서 명시적으로 제외한다.

**비밀번호 정책 (FR-Emp-04/05, FR-Admin-03)**
- `user_pass varchar(255)` 에는 Argon2id(권장)/bcrypt 해시만 저장. 평문·복호화 금지.
- 해시 생성·검증은 WAS(애플리케이션) 담당. `usp_auth_get_credential` 은 API 응답으로 절대 노출하지 않는다.
- 수정 시 비밀번호 미입력이면 기존 해시 유지, 입력 시 새 솔트로 재해시.
- `user_yn=N` 계정은 로그인 불가 — DB NOT NULL 충족용으로 `!LOCKED!<random>` 형태의 로그인 불가 해시를 저장.
- 로그·조회화면·API 응답 어디에도 user_pass / 카드번호 전체값을 포함하지 않는다.

### 6.2 권한(Role) 계층 (FR-UI-07)

```
VIEWER (조회) < EDITOR (등록/수정/삭제) < APPROVER (전표 승인·초기이월 확정)
             < ADMIN < SUPER (admin)
```

**ADMIN 전용 행위 5종** (API 명세 실측) — "마감해제"라는 한 단어에 **성질이 다른 두 기능**이 섞여 있어 다음과 같이 분리한다.

| 행위 | 엔드포인트 | 프로시저 |
|------|-----------|----------|
| **초기이월 확정해제** (`open_balance.closed` → 0) | `POST /finance/open-balances/reopen` | `usp_finance_openbalance_reopen` |
| **연도 회계마감 해제** (`finance_closing.closing` → 0) | `POST /finance/closings/{yearId}/reopen` | `usp_finance_closing_reopen` — **D4 신설**, [§9.6](#96-연도-회계마감-해제-d4--신설) |
| 연도 회계마감 실행 | `POST /finance/closings/{yearId}/execute` | `usp_finance_closing_execute` |
| 표준 GL 재생성 | `POST /finance/gl/generate-standard` | `usp_finance_gl_generate_standard` |
| 비밀번호 초기화 · 직원 삭제 | `PUT /system/employees/{employeeId}/password` · `DELETE /system/employees/{employeeId}` | `usp_auth_change_password` · `usp_system_employee_delete` |

- 조회전용 사용자는 편집 API 호출 시 403 (FR-UI-02·FR-UI-07).
- **계층 밖 3건** — `POST /auth/login` · `POST /auth/refresh` 는 **공개**, `PUT /auth/password` 는 **로그인 사용자 본인**(Role 무관).
- 엔드포인트별 최소 권한은 [§11 API 설계](#11-api-설계) 표에 명시. 실측 분포: EDITOR 53 · VIEWER 29 · ADMIN 5(+reopen 1) · APPROVER 2 · 공개 2 · 로그인 사용자 1.

### 6.3 초기 Admin 부트스트랩 (FR-Admin-01~06)

- `system_employee` 는 그룹/회사/Team 이 NOT NULL 이므로 조직 마스터와 인증 사이에 **순환 의존**이 발생한다.
- 해결: 설치 시 `SYSTEM/SYSTEM` 시스템 조직(company·entity·pod·team)과 `ADMIN` 직원(`user_id='admin'`, `user_yn=1`)을 함께 시드하여 FK 선행생성 요구를 제거한다(01 스크립트 Bootstrap 섹션).
- 초기 비밀번호 `admin` 은 **설치 프로그램(WAS)이 Argon2id 로 해시하여** `{ARGON2ID_HASH_OF_admin__SET_BY_INSTALLER}` 자리에 치환 저장한다.
- admin **물리 삭제**는 트리거 `trg_system_employee_protect_admin`(INSTEAD OF DELETE, THROW 51001)이 차단한다.
- **⚠ 미구현 규칙** — "비활성 전환 시 최소 1개의 활성 최고관리자 접근수단 유지"를 강제하는 코드는 DB에 **없다**. 트리거는 물리 DELETE만 막으므로 `admin` 행을 `status='inactive'` 또는 `user_yn=0` 으로 바꾸면 **최고관리자 접근수단이 사라진다**. 따라서 이 규칙은 **Application 계층(`Employee` 도메인 정책)에서 구현해야 하는 항목**이다: 활성 최고관리자가 1명이면 해당 계정의 `status`/`user_yn` 비활성 전환을 거부한다. DB 계층 이중 방어는 D5 범위 밖이므로 추가하지 않는다.

시드 값 (`01` Bootstrap 섹션, 전부 `WHERE NOT EXISTS` 가드):

| 테이블 | 값 |
|--------|----|
| `system_company` | `SYSTEM` / `System` / `시스템` / status 0 |
| `system_entity` | `SYSTEM`·`SYSTEM` / `System` / `시스템` / status 0 |
| `system_pod` | `SYS` / `System Pod` |
| `system_team` | `SYS` / `System` / owner=`ADMIN` · leader=`ADMIN` ← **직원 행보다 먼저 삽입**(owner/leader에 FK가 없어서 가능) |
| `system_employee` | `ADMIN` / `Built-in Admin` / status `active` / `user_yn=1` / `user_id='admin'` / `user_pass='{ARGON2ID_HASH_OF_admin__SET_BY_INSTALLER}'` |

---

## 7. 도메인 모델

각 도메인의 Aggregate·Entity·Value Object·Policy를 정의한다. 상태 코드는 DB 코드값(Y/N, 0/1)을 그대로 노출하지 않고 Enum으로 변환하며(지침 §16), 변환은 Mapper가 담당한다.

### 7.1 SYSTEM

```text
Company (그룹)
Entity (회사)  ── Company
Pod            ── Entity
Team (부서)    ── Entity, Pod, (owner/leader: Employee)
Employee       ── Team ; UserAccount(내포) 로 인증정보 분리
FiscalYear (회사 기수) ── Entity
```

**인증 관련 분리 (지침 §5)** — `EmployeeService` 하나에 몰아넣지 않고 다음으로 분리:
`Employee` · `UserAccount` · `Role` · `Permission` · `AuthenticationService` · `PasswordHasher`.

Employee 재직상태(Enum):
```typescript
enum EmploymentStatus { Planned, Probation, Active, OnLeave, LeavingSoon, Inactive }
```
- `Inactive` 는 인증 차단(FR-Emp-07). Inactive 전환 시 퇴사일 미입력이면 트리거가 당일로 보완.

### 7.2 PARTNER

```text
Client (고객사)  ── Entity, PaymentTerm(collecting_type)
Vendor (거래처)  ── Entity, PaymentTerm(payment_type)
PaymentTerm (지급/수금정책)
```

**지급정책은 단순 값이 아니라 전략(Strategy)으로 모델링한다 (지침 §5).**

```typescript
export interface PaymentTermStrategy {
  calculate(baseDate: Date): Date;   // 기준일 → 지급/입금일
}
// EOM+N  : 기준월 말일 + offset_days
export class EomPaymentTermStrategy implements PaymentTermStrategy { /* base_rule='EOM' */ }
// CurM DD: 기준월 DD일 (월말 초과 시 월말 보정)
export class CurrentMonthPaymentTermStrategy implements PaymentTermStrategy { /* base_rule='CURM' */ }
```

- 표시용 정책식 `term_condition` 은 트리거 `trg_partner_term_condition` 이 `EOM+{offset_days}` / `CurM{fixed_day}` 로 자동 구성한다(FR-Term-05).
- 정책 변경은 **변경 이후 신규 계산분에만** 적용하고 이미 확정된 지급일을 자동 재계산하지 않는다(FR-Term-07).

### 7.3 SALES

```text
Pipeline (파이프라인)  ── Entity, Employee(담당자), Client(client_name 문자열), Contract(연결)
  └─ Activity[] (sales_pipeline_detail)
Contract (계약)        ── Entity, Client, Pipeline(선택), Ledger(선택 연결)
```

**Stage 전환은 단순 속성 대입을 금지한다 (지침 §5).**

```typescript
// 금지: pipeline.stage = '5';
// 권장: 의미 있는 메서드 — 내부에서 날짜/검증/상태를 함께 처리
pipeline.moveToMeeting();
pipeline.moveToNegotiation();
pipeline.close();     // stage=Closed(5) → closed_date 기록
pipeline.cancel();    // stage=Canceled(6) → closed_date 기록
pipeline.reopen();    // closed_date 해제
```

Stage(Enum): `Lead(0) · QualifiedLead(1) · Suggest(2) · Meeting(3) · Nego(4) · Closed(5) · Canceled(6)` (FR-Pipe-07).
- 수정 시 `adjusted_date`, Closed/Canceled 진입 시 `closed_date` 를 트리거 `trg_sales_pipeline_audit` 가 관리. 재오픈 시 트리거가 `closed_date` 를 NULL로 해제한다.
- 계약 연결 시 파이프라인 `client_name` 과 계약 고객사명 일치 검증(FR-Pipe-08).
- **위 메서드는 Domain 표현일 뿐 별도 엔드포인트가 아니다.** stage 전환은 모두 `PUT /sales/pipelines/{pipelineId}` → `usp_sales_pipeline_save(U)` 로 수행된다([§11.3](#113-업무-행위-endpoint-지침-23) 참조).

**Activity 첨부 (FR-Act-06)** — `attached` 는 **파일 업로드가 아니라 URL/링크 문자열 필드**(`varchar(250)`)다. 업로드·스토리지 요구는 FR에 없다.
- `Activity` VO 로 링크 형식을 검증한다: 스킴 허용목록(`http`/`https`), 길이 250자 이내, 공백 문자 불허. 검증 실패 시 저장 거부.
- `activity_id` 는 미입력 시 프로시저가 자동 생성한다 — [§9.12](#912-식별자-자동생성-규칙) 참조.

### 7.4 FINANCE

FINANCE는 CRUD 중심으로 설계하지 않는다. 특히 **전표는 Head/Detail 테이블을 그대로 노출하지 않고 하나의 Aggregate(Ledger)로 다룬다** (지침 §17).

```text
GL (계정과목)            ── Entity ; Layer3 사용플래그 12종 내포
Dimension (관리항목)     ── Entity ; Slot 1~5 영속 매핑 ; DimensionValue[]
BankAccount (은행/카드)  ── Entity ; 계좌 XOR 카드
OpenBalance (초기이월)   ── FiscalYear ; GL/은행·카드/고객사/거래처 조합
Ledger (전표) [Aggregate Root]
  ├─ LedgerId (company_id, entity_id, ledger_date, ledger_no)
  ├─ ApprovalStatus
  └─ LedgerLine[]
       ├─ LineNo / Account(GL) / DebitCredit / Money(amount)
       └─ Layer3: bank/team/pod/employee/client/vendor/dimension1~5/due_date
Closing (연도 회계마감)  ── FiscalYear
```

**전표 Aggregate 권장 폴더 (지침 §5 — FINANCE 도메인 구성):**

```text
finance/ledger/domain/
├─ entities/       ledger.ts · ledger-line.ts
├─ value-objects/  money.ts · ledger-number.ts · debit-credit.ts
├─ policies/       ledger-approval.policy.ts · ledger-balance.policy.ts · ledger-delete.policy.ts
└─ repositories/   ledger.repository.ts
```

Enum 예:
```typescript
enum ApprovalStatus { Pending = 'PENDING', Approved = 'APPROVED' }   // DB bit 0/1
enum DebitCredit { Debit = '1', Credit = '2' }
type DimensionSlot = 1 | 2 | 3 | 4 | 5;
```

Entity가 현재 상태에서 허용되지 않는 행위를 거부한다:
```typescript
ledger.approve(approverId);   // 미승인 + 라인 존재 + 차대균형일 때만
ledger.changeLine(...);       // 승인/마감연도면 거부
ledger.deleteLine(...);
ledger.changeLineAccount(lineNo, newGl);  // ↓ Layer3 재검증을 내부에서 수행
```

**Layer3 값 재검증 (UC-Ledger-04 예외 — 필수 규칙)**
라인의 `gl_id` 를 변경하면 새 계정의 플래그 12종이 이전 계정과 달라질 수 있다. 플래그가 `Y→N` 으로 바뀐 항목의 기존 값을 그대로 남기면 프로시저 검증(50464~50466)에서 저장이 거부된다. 따라서:

```typescript
// Ledger Aggregate 내부
changeLineAccount(lineNo: LineNo, newGl: GlFlags): Layer3Diff {
  const line = this.lineOf(lineNo);
  const invalid = line.valuesNotAllowedBy(newGl);   // 플래그 N이 된 항목의 잔존값
  return { invalid };            // Application이 사용자 확인을 받은 뒤 clear() 호출
}
```

- Application은 `invalid` 가 비어 있지 않으면 **사용자 확인 후 해당 값을 초기화**한다(무단 폐기 금지).
- Slot 필드는 플래그뿐 아니라 **해당 Slot의 `finance_dimension_detail` 상세값 범위**도 함께 재검증한다.
- 프론트엔드 동작은 [§12.5](#125-도메인별-화면-구조) 전표 행 참조.

**GL 자기참조(`contra_gl`) 검증 규칙**
`finance_GL.contra_gl` 은 동일 회사 계정을 가리키는 **자기참조 컬럼**이다(차감계정, 예: 대손충당금 → 외상매출금). DDL에 자기참조 FK가 없어 전량 Domain/Application 검증 대상이다.

- `gl_detail = 1`(차감항목)일 때만 입력한다.
- **자기 자신을 지정할 수 없다** (`contra_gl <> gl_id`).
- 동일 회사(`company_id`+`entity_id`) 범위의 **사용중(`status=1`) 계정만** 선택 가능.
- **삭제 시 `contra_gl` 참조도 검증 대상에 포함한다** — 어떤 계정이 다른 계정의 `contra_gl` 로 참조되고 있으면 삭제를 차단하고 미사용 전환을 안내한다. 트리거 `trg_finance_gl_protect_delete` 는 `finance_open_balance`/`finance_ledger_detail` 참조만 검사하므로 이 검증은 **Application 계층에서만 수행된다**.

---

## 8. 데이터 모델

### 8.1 데이터 타입 기준 (지침 §8, §9)

| 종류 | 타입 | 예 |
|------|------|----|
| 업무 코드(영문/숫자) | `VARCHAR(10~20)` | company_id, gl_id, client_id |
| 사용자 표시 문자열(한글/이름/설명) | `NVARCHAR(50~1000)` | company_name_ko, gl_name, note |
| Boolean | `BIT` (Domain은 Enum) | status, approval_status, closed, user_yn |
| 금액 | `NUMERIC(18, 2)` — **float 금지** | amount, contract_amount |
| 날짜(업무일자) | `DATE` | ledger_date, due_date, start_date, insert_date, closing_date |
| 일시(감사) | `DATETIME2(0)` | last_login, last_manual_edit_at, **approved_date**(D8) |
| (신규 PK 권장) | `UNIQUEIDENTIFIER` + 업무 UNIQUE | — |

**명세 vs 지침 vs 납품 DDL 의 3중 편차** — 상충 시 **납품 DDL이 정본**이다. 테이블 명세서(xlsx) 값으로 되돌리지 말 것.

| 항목 | 지침 §8·§9·§11 | 테이블 명세서(xlsx) | **납품 DDL (정본)** | 본 설계서 |
|------|----------------|---------------------|---------------------|-----------|
| PK 전략 | `UNIQUEIDENTIFIER` 기술 PK + 업무 UNIQUE | 복합 업무 PK | **복합 업무 PK** | DDL 채택. 프로시저·트리거·API 92건이 모두 이 키에 의존. 향후 **신규** 테이블은 지침 전략 우선 검토 |
| 한글 표시 문자열 | `NVARCHAR` | `varchar` | **`nvarchar`** | DDL 채택 (지침과 일치, xlsx가 오기) |
| 금액 | `DECIMAL(19,2)` | `numeric(10,2)` | **`numeric(18,2)`** | DDL 채택. xlsx의 `(10,2)` 는 최대 99,999,999.99 로 원화 업무에 부족 — **DDL이 이미 18로 상향**했다. DDL에 `DECIMAL` 키워드는 0회, 전부 `numeric` |
| `ledger_no` | `INT` | `numeric(10,2)` | **`numeric(10,2)`** | **D6** — DB 유지, 경계에서 변환 (아래) |

> **D6 · 정수형 Decimal 정책** — `ledger_no`·`line_on`·`line_no`·`company_year`·`actual_year` 는 정수 의미인데 `numeric(10,2)` 로 선언되어 있다. 프로시저도 곳곳에서 `CONVERT(int, actual_year)` 로 되돌린다. PK/FK/유니크 인덱스와 74개 프로시저 시그니처가 전부 이 타입에 묶여 있으므로 **DB 타입은 변경하지 않는다.** 대신:
> - Prisma는 이 컬럼을 `Decimal` 로 매핑하며 **JSON 직렬화 시 문자열이 된다.** 그대로 API에 노출하면 프론트엔드에서 `"3"` vs `3` 혼선이 발생한다.
> - **Mapper/Query DTO 경계에서 반드시 `number` 로 정규화한다.** 반대로 프로시저 인자 바인딩 시 `sql.Numeric(10,2)` 로 되돌린다.
> - Domain VO(`LedgerNumber`, `LineNo`)는 정수만 허용하고, 소수부가 있는 값을 만나면 예외를 던진다(데이터 오염 탐지).

> **D8 · 감사 일시 정밀도** — `finance_ledger_head.insert_date`/`update_date`/`approved_date` 와 `closed_date`·`closing_date` 는 DDL에서 모두 `date` 다. 이 중 **전표일자·마감일자·계약일자 등은 업무일자이므로 `date` 가 정확**하며 유지한다. 그러나 **승인 시각은 감사 대상 행위**이므로 `approved_date` 만 `datetime2(0)` 으로 상향한다([부록 C](#부록-c-09_ax_bridge_fixsql-스펙)). `insert_date`/`update_date` 는 `date` 를 유지하고, 초 단위 행위 이력은 `common/audit` 의 쓰기 감사 로깅([§11.1](#111-공통-정책-gateway))이 담당한다.

> **CHECK 제약은 DDL에 5종만 존재한다 (D5)** — `CK_ld_drcr`/`CK_ob_drcr`(DRCR), `CK_emp_status`(재직상태 6종), `CK_term_rule`+`CK_term_shape`(EOM/CURM 정합), `CK_dim_slot`(1~5), `CK_ct_dates`+`CK_ct_ledger`(계약). 반면 `gl_type(0~10)`·`gl_detail`·`pipeline_type(0~4)`·`stage(0~6)`·activity `type(0~3)`·`contract_type(0~5)`·contract `status(0~2)`·`ledger_type(0~3)` 은 **CHECK 없이 프로시저의 `NOT IN` 검증에만 의존**한다. D5에 따라 이 8종 CHECK는 추가하지 않고 **Domain Enum + 프로시저 검증**에 위임한다. [§17 DoD](#17-definition-of-done) 의 "DB Constraint 이중 방어" 항목은 열거형이 아닌 **무결성 제약**(FK·유니크·XOR)을 뜻하는 것으로 해석한다.

### 8.2 SYSTEM 테이블

| 테이블 | PK | 주요 컬럼 | 비고 |
|--------|----|-----------|----|
| `system_company` | (company_id) | company_name, company_name_ko, status | 그룹. status 0:사용 1:미사용 |
| `system_entity` | (company_id, entity_id) | 회사명, 대표자, 사업자/법인번호, 주소, 설립일… | FK→company |
| `system_pod` | (company_id, entity_id, pod_id) | pod_name, status | pod_id varchar(4) |
| `system_team` | (…, Team_id) | team_name(_ko), owner, leader_user_id, pod_id | owner/leader = employee (순환참조로 FK 미적용, 프로시저 검증) |
| `system_employee` | (…, employee_Id) | 인사정보, status(CHECK 6종), user_yn, user_id, user_pass, last_login | user_id 전역 UNIQUE(WHERE user_id IS NOT NULL) |
| `system_year` | (…, company_year_id) | company_year, actual_year | UNIQUE(…, actual_year, company_year) |

### 8.3 PARTNER 테이블

| 테이블 | PK | 주요 컬럼 | 제약 |
|--------|----|-----------|----|
| `partner_term` | (…, term_id) | base_rule(EOM/CURM), fixed_day, offset_days, term_condition, status | CHECK: EOM→fixed_day NULL, CURM→fixed_day 1~31 & offset=0 |
| `partner_client` | (…, client_id) | client_name, collecting_type(→term), 사업자·은행·연락정보 | FK→entity, term |
| `partner_vendor` | (…, vendor_id) | vendor_name, payment_type(→term), 상동 | FK→entity, term |

status: 1=Y(active/사용), 0=N(pending).

### 8.4 SALES 테이블

| 테이블 | PK | 주요 컬럼 | 비고 |
|--------|----|-----------|----|
| `sales_pipeline` | (…, pipeline_id) | pipeline_type(0~4), client_name, stage(0~6), employee_Id, created/adjusted/closed_date, contract_id | FK→entity, employee |
| `sales_pipeline_detail` | (…, pipeline_id, activity_id) | type(0~3), content, incharge, attached | 액티비티 |
| `sales_contract` | (…, contract_id, contract_type) | client_id, pipeline_id, start/end_date, status(0~2), contract_amount, **ledger_date/ledger_no(NULL 허용)**, closed_date | CHECK: start≤end; ledger_date/no 둘 다 NULL or 둘 다 값 |

> **설계 결정** — `sales_contract` 의 `ledger_date/ledger_no` "PK" 원본 표기는 **선택적 전표 연결**로 해석하여 NULL 허용, PK 미포함, CHECK 제약으로 동시성 보장(FR-Contract-08). nullable 업무 FK를 PK에 포함하지 않는다는 지침 §10과 일치.

### 8.5 FINANCE 테이블

| 테이블 | PK | 주요 컬럼 | 비고 |
|--------|----|-----------|----|
| `finance_GL` | (…, gl_id) | gl_name, gl_type(0~10), gl_category1/2, vat_gl, gl_detail(0/1), contra_gl, status + **Layer3 플래그 12종(BIT)** | 플래그: bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id, dimension1~5, due_date |
| `finance_GL_seed` | (gl_id) | 상동(스코프 없음) | 표준 GL 원본, 설치 시 적재·보존(FR-GL-11) |
| `finance_dimension` | (…, dimension_id) | dimension_name, **slot_no(1~5)**, status | UNIQUE(…, slot_no); CHECK 1~5 |
| `finance_dimension_detail` | (…, dimension_id, line_no) | dimension_value | 동일 항목 내 값 중복 금지 |
| `finance_bank_account` | (…, bank_id) | bank_name, bank_account, card_number, status(0:사용) | CHECK: 계좌 XOR 카드 |
| `finance_open_balance` | **PK 없음 (힙)** | company_year_id, gl_id, DRCR(1/2), **bank_id**, client_id, vendor_id, amount, closed(0/1) | UNIQUE 인덱스 `UX_open_balance(…, gl_id, DRCR, bank_key, client_key, vendor_key)` 만 존재. NULL은 PERSISTED 계산컬럼 `bank_key`/`client_key`/`vendor_key = ISNULL(col,'-')` 로 대체 → **부록 C에서 PK 추가** |
| `finance_ledger_head` | (…, ledger_date, ledger_no) | ledger_name, ledger_type(0~3), employee_Id, approver_Id, insert/update/approved_date, approval_status | UNIQUE=PK. `employee_Id`/`approver_Id` 에 **FK 없음**(프로시저 검증). 일자 3종은 `date` — `approved_date` 만 D8로 상향 |
| `finance_ledger_detail` | (…, ledger_date, ledger_no, **line_on**) | gl_id, DRCR, amount, Layer3 실제값(bank/Team/pod/employee/client/vendor/dimension1~5/due_date) | FK→head, GL, bank **만**. Team/pod/employee/client/vendor/dimension1~5 는 **FK 없음**. `amount` 는 **NULL 허용** — `> 0` 검증은 프로시저/Domain 전담 |
| `finance_closing` | (…, company_year_id) | closing(0/1), closing_date | v3.0 신설. 행 없으면 미마감 간주 |

> **컬럼명 `line_on` vs `line_no`** — `finance_ledger_detail` 의 라인번호 컬럼은 **`line_on`**(명세서 원본의 오기로 추정되나 DDL·프로시저·PK가 모두 이 이름을 쓴다), `finance_dimension_detail` 은 **`line_no`** 다. 두 이름이 공존하므로 산문·코드·Prisma 매핑에서 혼용하지 않는다. Prisma는 각각 `lineOn` / `lineNo` 로 매핑한다.

> **⚠ `finance_closing.closing` 의 DEFAULT 는 `1`** 이다(`08`). "행이 없으면 미마감" 시맨틱과 결합되어 있어, `closing` 컬럼을 생략한 bare INSERT 는 **해당 연도를 즉시 마감 처리한다.** `finance_closing` 에 대한 모든 쓰기는 `usp_finance_closing_execute` / `usp_finance_closing_reopen` 만 수행하고 값을 항상 명시적으로 지정한다.

> **`estabilish_date`** (`system_entity`) 는 DDL의 오타이나 정본이므로 그대로 사용하고, Prisma `@map("estabilish_date")` 로 `establishDate` 로 노출한다.

> **설계 결정 (finance_GL Layer3 플래그)** — 원본 명세에서 `bank_id`~`due_date` 를 "PK"로 표기한 것은 오기로 판단하고, **전표 Layer3 입력영역 사용여부를 제어하는 Boolean 플래그**로 구현한다(FR-GL-06). `finance_GL.bank_id=Y` → 전표에서 은행/카드 선택 활성, `N` → 입력·저장 금지.

> **설계 결정 (Dimension Slot)** — 원본 테이블에 slot 컬럼이 없어 `slot_no` 를 보완 신설(FR-Dim-05). 최초 등록 순서로 사용된 적 없는 최소 Slot을 부여하고 **재정렬·재매핑하지 않는다**. `finance_GL.dimension1~5`, `finance_ledger_detail.dimension1~5` 가 Slot 1~5와 1:1 대응.

### 8.6 ERD 요지

```
company ─1:N─ entity ─1:N─┬─ pod ─1:N─ team ─1:N─ employee
                          ├─ year ─1:N─ open_balance / closing
                          ├─ (partner) term ─1:N─ client / vendor
                          ├─ (sales) pipeline ─1:N─ pipeline_detail ; contract
                          └─ (finance) GL ; dimension ─1:N─ dimension_detail ; bank_account
                                        ledger_head ─1:N─ ledger_detail
                                          └─ 참조: GL, bank, team, pod, employee, client, vendor, dimension_value
```

---

## 9. 핵심 업무 규칙

각 규칙은 Domain/Application이 1차 소유하고, 저장 프로시저가 실행하며, 트리거가 이중 방어한다.

### 9.1 전표 저장 검증 (하나의 트랜잭션, 지침 §17·§24)
전표 저장 시 다음을 **단일 업무 트랜잭션**으로 검증한다:
Head 필수값 · Line 필수값 · 계정 사용 여부(status=1) · 관리항목 활성 여부(GL 플래그) · 차변/대변 · 금액(>0) · 지급/입금일(due_date 플래그) · 은행/카드(status=0) · **차변 합계 = 대변 합계**(승인 시) · 승인/마감 상태에 따른 수정 제한.
- 프로시저: `usp_finance_ledger_head_save`(Head, ledger_no 자동), `usp_finance_ledger_detail_save`(라인 JSON 일괄 재적재), `usp_finance_ledger_approve`(차대 균형 후 승인).

> **⚠ `line_on` 은 매 저장마다 1부터 재부여된다 — `@lines_json` 배열 순서가 의미를 갖는다.**
> `usp_finance_ledger_detail_save` 는 `OPENJSON` 으로 라인을 읽어 `IDENTITY(1,1)` 테이블 변수에 담고, 그 순번(`rn`)을 그대로 `line_on` 으로 사용한다. 즉 **기존 라인 전체 DELETE → JSON 순서대로 재INSERT** 다. 결과:
> - 클라이언트가 보낸 배열 순서가 곧 화면상 라인 순서이자 저장된 `line_on` 이다. **부분 저장(단일 라인 PATCH)은 불가능**하며 항상 전체 라인 집합을 보내야 한다.
> - `line_on` 을 외부에서 참조·기억하면 안 된다(저장마다 바뀔 수 있음). Layer3 편집 화면의 "선택 라인"은 `line_on` 이 아니라 클라이언트측 임시 키로 추적한다.
> - Aggregate `Ledger` 가 라인 순서를 소유하고, Repository 는 `Ledger.lines` 순서대로 직렬화한다.

### 9.2 전표번호 생성 (지침 §12)
`IDENTITY` 를 쓰지 않고 **회사/일자별 순번**으로 관리한다.
```typescript
export interface LedgerNumberGenerator {
  next(scope: CompanyScope, ledgerDate: Date): Promise<number>;
}
```
- 구현은 프로시저 내부에서 아래와 같이 동시 저장 충돌을 방지한다. **UI/Controller에서 생성 금지.**

```sql
SELECT @ledger_no = ISNULL(MAX(ledger_no),0) + 1
FROM dbo.finance_ledger_head WITH (UPDLOCK, HOLDLOCK)
WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date;
```

- **채번 범위는 `(company_id, entity_id, ledger_date)`** — 회사별로 **매일 1번부터 다시 시작**한다.
- `@mode='I'` 일 때만 생성되고 `OUTPUT` 파라미터로 반환된다(결과셋 없음). `@mode='U'` 에서는 입력값이다. → OUTPUT 바인딩 필요, [§10.2](#102-프로시저-실행-계층-d1) 참조.

### 9.3 승인 정책 (지침 §18)
`LedgerApprovalPolicy` / `LedgerModificationPolicy` / `LedgerDeletePolicy` 또는 Entity 메서드로 처리.
- 승인 완료(approval_status=1) 전표는 일반 수정/삭제 불가.
- 트리거 `trg_finance_ledger_head_protect`(INSTEAD OF U/D), `trg_finance_ledger_detail_protect`(AFTER I/U/D)가 우회 DML 차단. 정상 승인 경로는 `SESSION_CONTEXT('ax_ledger_approve')` 로 통과.

### 9.4 초기이월 "확정"(closed) vs 연도 "회계마감"(closing) — v3.0 핵심 구분
| 개념 | 컬럼 | 의미 | 프로시저 |
|------|------|------|----------|
| **확정** | `finance_open_balance.closed` | 초기이월 입력 자체의 잠금(차대 균형 검증 후) | `usp_finance_openbalance_close`(APPROVER) / `_reopen`(ADMIN) |
| **회계마감** | `finance_closing.closing` | 연도 단위 회계 마감. 마감 시 차년도 이월 자동 생성 | `usp_finance_closing_execute`(ADMIN) |

- 연도마감으로 자동 생성된 차년도 초기이월은 `closed=Y` 로 저장하여 보호(FR-Close-08).
- 확정해제 불가 조건: ① 해당 연도 회계마감(closing=Y) ② 연도마감 자동생성분(전년도가 회계마감된 연도의 초기이월).

**초기이월 일괄 저장(`usp_finance_openbalance_save`)의 저장 시맨틱 — 화면 동작에 직접 영향**

`@rows_json`(`gl_id`, `DRCR`, `bank_id`, `client_id`, `vendor_id`, `amount`)을 `OPENJSON` 으로 읽어 처리한다.

1. **`closed=0`(미확정) 행만 DELETE** 후 재INSERT 한다. 확정(`closed=1`) 행과 연도마감 자동생성분은 손대지 않는다.
2. **`amount > 0` 행만 INSERT** 된다 — **0원 행은 조용히 소실**된다. 따라서 사용자가 기존 금액을 0으로 지우고 저장하면 그 행은 "0원으로 저장"이 아니라 **삭제**된다. 화면은 이 동작을 사용자에게 드러내야 한다(0 입력 = 행 제거).
3. `amount < 0` 은 거부(THROW 50433). 중복 조합 검사는 `gl_id`+`DRCR`+`ISNULL(bank_id,'-')`+`ISNULL(client_id,'-')`+`ISNULL(vendor_id,'-')` 5-way 로 수행된다.
4. 확정(`close`) 시 차대 균형을 `UPDLOCK, HOLDLOCK` 하에 검증하고 불일치면 차액을 담은 메시지로 거부(THROW 50441). **미확정 저장은 불일치를 허용**한다(FR-OpenBal-06, UC-OpenBal-04).

### 9.5 연도 회계마감 이월 계산 (FR-Close-05~10)
`usp_finance_closing_execute` 는 1개 연도 단위로 처리(복수 선택 시 API가 `actual_year` 오름차순 순차 호출). 단일 트랜잭션, 실패 시 전체 ROLLBACK.
- **선행검증 6종**: 대상 기수 존재 · 재마감 불가 · 선행연도 마감 완료 · 차년도 기수 존재 · 대상연도 미승인 전표 0건 · 차년도 초기이월 미존재.
- **이월 대상**: `gl_type` 0(자산)·1(부채)·2(자본)만. 3~10(수익/원가/비용/법인세)은 제외.
- **집계 단위**: `gl_id + bank_id + client_id + vendor_id`.
- **계산**: 자산 = (전년 이월 + 당해 차변 − 당해 대변) → 차변(DRCR=1) 이월. 부채·자본 = (전년 이월 + 당해 대변 − 당해 차변) → 대변(DRCR=2) 이월. **잔액계산은 승인(Y) 전표만.** 잔액 0 조합은 미생성.
- **집계 단위에 포함되지 않는 항목**: `Team_id`·`pod_id`·`employee_Id`·`dimension1~5` 는 이월되지 않는다. 즉 부서별/관리항목별 이월 잔액은 존재하지 않으며, 차년도에는 `gl_id`+`bank_id`+`client_id`+`vendor_id` 수준으로만 승계된다.
- 마감 완료 연도의 전표·초기이월은 조회만 가능(FR-Close-11, FR-Ledger-16). 공통 헬퍼 `usp_finance_check_year_open(@company_id, @entity_id, **@target_date**)` 이 전표 CUD/승인 프로시저 4건에서 **`BEGIN TRAN` 직후 첫 문장으로** 선행 호출되고(자체 트랜잭션을 열지 않음), **트리거 4건**이 우회 DML을 차단한다.

> **D7 · 이월 금액의 음수 허용** — `usp_finance_closing_execute` 는 산출 잔액이 `<> 0` 인 조합만 INSERT 하며 **부호를 그대로 저장**한다. 즉 자산 계정이 대변 초과이면 `DRCR=1` 행에 **음수 금액**이 들어간다(`finance_open_balance.amount` 에 `>= 0` CHECK 가 없어 허용됨). 수기 입력 경로는 음수를 거부(THROW 50433)하므로 **자동생성분만의 예외**다.
>
> 이 동작을 유지하되(부록 C에서 `amount >= 0` CHECK 를 **추가하지 않는다**), 다음을 보정한다:
> - **차/대변 합계 집계는 부호를 살려 계산한다** — `SUM(CASE WHEN DRCR='1' THEN amount ELSE -amount END)` 형태로 순액을 구해 차액을 판정한다. `DRCR` 별로 단순 `SUM(amount)` 만 하면 음수 행이 합계를 왜곡한다.
> - **화면은 음수 행을 명시적으로 표시**한다(색상·괄호 표기). 숨기거나 절대값으로 바꾸지 않는다.
> - Domain `Money` VO 는 초기이월 컨텍스트에서 음수를 허용하고, 전표 라인 컨텍스트에서는 `> 0` 을 강제한다(서로 다른 불변식).

### 9.6 연도 회계마감 해제 (D4 — 신설)

원본 산출물에는 **회계마감을 되돌리는 프로시저·API가 없다**(재마감 불가, 마감연도는 조회만). D4에 따라 신설한다.

**선결 조건 — 출처 구분 컬럼 신설**
`finance_open_balance` 에는 행의 출처를 구분하는 컬럼이 없다. FR-Close-09 도 *"출처 구분 컬럼이 없어 자동 덮어쓰기를 하지 않습니다"* 라고 명시한다. 어떤 행이 마감 자동생성분인지 식별할 수 없으면 해제 시 무엇을 회수해야 하는지 알 수 없다. 따라서:

- **`finance_open_balance.source varchar(10) NOT NULL DEFAULT 'MANUAL'`** 추가 (값: `MANUAL` | `CLOSING`) — [부록 C](#부록-c-09_ax_bridge_fixsql-스펙)
- `usp_finance_closing_execute` 가 자동생성 행에 `'CLOSING'` 을 기록하도록 개작
- 이로써 FR-Close-09가 근거로 든 제약도 함께 해소된다

**`usp_finance_closing_reopen(@company_id, @entity_id, @company_year_id)`** — ADMIN, 단일 트랜잭션

선행검증 (신규 오류코드 **50531~50535** — 505xx 대역 연장):

| 코드 | 검증 |
|------|------|
| 50531 | 대상 기수가 존재하지 않음 |
| 50532 | 대상 연도가 마감(`closing=1`) 상태가 아님 — 해제할 것이 없음 |
| 50533 | **후행 연도가 이미 마감되어 있음** — 마감이 `actual_year` 오름차순 순차이므로 **해제는 내림차순 순차**여야 한다 |
| 50534 | 차년도 초기이월에 `source='MANUAL'` 행이 존재 — 수기 입력분 유실 방지 |
| 50535 | 차년도에 전표가 존재 — 이월 잔액이 이미 사용됨 |

**실행 순서**

```
① finance_closing SET closing=0, closing_date=NULL
② sp_set_session_context 'ax_openbal_admin' = 1
③ DELETE finance_open_balance WHERE 차년도 AND source='CLOSING'
④ sp_set_session_context 'ax_openbal_admin' = NULL
   CATCH: ROLLBACK 후 ④ 를 반드시 재실행하고 THROW
```

**트리거 상호작용 — 정확한 관계**

- 회수 대상은 **차년도** 초기이월 행이다. 검증 3(50533)이 후행 연도의 미마감을 보장하므로 `trg_finance_open_balance_protect` 의 **마감연도 잠금(51054)은 애초에 발생하지 않는다.**
- 그러나 대상 행은 `closed=1` 이므로 **확정분 보호(51031)를 통과하려면 `ax_openbal_admin` 플래그가 반드시 필요하다.** 이것이 ②·④가 존재하는 이유다.
- ①을 먼저 두는 것은 **트리거가 강제하는 제약이 아니라 의도된 순서**다. 향후 대상연도 자신의 이월까지 손대는 확장이 생기면(그 연도는 아직 `closing=1` 이므로 51054가 발동한다) 비로소 순서가 강제된다.
- 이 프로시저는 `SESSION_CONTEXT` 를 쓰므로 **반드시 단일 커넥션에서 실행**해야 한다([§10.2](#102-프로시저-실행-계층-d1)).

- 엔드포인트: `POST /finance/closings/{yearId}/reopen` (ADMIN) → **API 총 93건**
- `closing=0` 이 되면 `trg_finance_ledger_head_closing_lock`·`_head_protect`·`_detail_protect` 의 마감연도 조건이 자동으로 풀린다. **별도 트리거 추가는 불필요하다.**

> **⚠ 한계 — 해제해도 승인 전표는 여전히 편집할 수 없다 (승인취소 기능 부재)**
> 마감 해제는 *마감연도 잠금*만 푼다. 그 연도의 전표는 대부분 `approval_status=1`(승인) 상태인데, **원본 산출물에는 승인취소 프로시저가 없다** — 전체 75건 중 승인 관련은 `usp_finance_ledger_approve` 하나뿐이다. 따라서 해제 후에도:
> - `usp_finance_ledger_head_save(@mode='U')` → **THROW 50452** (미승인 전표만 수정 가능)
> - 직접 UPDATE → **THROW 51012** (트리거)
>
> 즉 현재 마감 해제의 실질 효과는 **① 차년도 자동생성 이월 회수 ② 해당 연도에 신규 전표 등록 가능** 두 가지이고, **기존 승인 전표의 정정은 불가능**하다. 개발지침 §14는 Command 목록에 「승인취소」를 포함하지만 구현체가 없다.
>
> 승인 전표 정정까지 필요하면 `usp_finance_ledger_unapprove`(APPROVER/ADMIN, `ax_ledger_approve` 플래그로 `approval_status=0`·`approver_Id`/`approved_date` NULL 복원, 마감연도 차단)를 추가로 설계해야 한다. **본 설계 범위에는 포함하지 않는다.**

### 9.7 표준 계정과목(GL) 재생성 (FR-GL-11~14)
- 대상 = **로그인 세션 회사 고정**(사용자 임의 변경 불가).
- 전표가 1건이라도 있으면 실행 불가(승인여부·타입 무관). 화면 비활성 + 서버 재검증. 존재 확인은 `UPDLOCK, HOLDLOCK` 하에 수행되어 검증-실행 사이의 전표 등록을 막는다.
- 절차(단일 트랜잭션): 전표 존재 최종확인 → 기존 GL 전체 삭제(`ax_bypass_gl_protect` 플래그로 참조보호 트리거 통과) → `finance_GL_seed` 일괄 INSERT(company/entity만 세션값 치환). 실패 시 전체 ROLLBACK.
- **`finance_GL_seed` 는 전역 테이블**(스코프 컬럼 없음, 355행). `07` 스크립트가 `TRUNCATE` 후 적재하므로 **재실행 시 전량 교체**된다 — 커스터마이즈한 seed 는 `07` 재실행으로 소실된다([§16 Phase 0](#16-구현-로드맵-지침-2730--vertical-slice) 마이그레이션 정책 참조).
- **⚠ 반환값 결함** — 이 프로시저의 `inserted_count` 는 `@@ROWCOUNT` 를 `COMMIT` 이후에 읽어 **항상 무의미한 값**이다. 부록 C에서 수정한다. 그때까지 Application 은 이 값을 신뢰하지 말고 성공 여부만 판단한다.

### 9.8 관리항목 Slot 보존 (지침 §19)
Slot 1~5는 과거 전표 데이터 의미를 보존해야 하므로 재정렬·재매핑·의미 변경·표시순서 불일치 금지. 회사당 최대 5개. Domain/Application이 Slot 번호를 명시적으로 관리.
- Slot 부여는 **미사용 최소 번호**이며 `slot_no` 는 수정 불가. 중간 Slot이 비어도 후속 Slot을 당기지 않는다.
- **관리항목 상세값에 DELETE 경로가 없다** — 프로시저·엔드포인트 모두 등록/수정만 존재한다(`usp_finance_dimension_detail_save`). 개별 값 회수는 관리항목 전체 삭제(`usp_finance_dimension_delete`)로만 가능하고, 그조차 GL 플래그나 전표 참조가 있으면 차단된다. 따라서 **오타 상세값은 수정으로 정정**하는 것이 유일한 경로다. 화면은 이를 전제로 안내한다.

### 9.9 참조 무결성과 Soft Disable/Delete (지침 §20)
참조 데이터가 있는 Master는 물리 삭제 대신 **비활성화 우선**. 삭제 전 Repository로 참조 검증 → 참조 중이면 DELETE 차단 + 비활성 전환 안내. 비활성 데이터는 신규 선택 Popup(`active_only=1`)에서 제외하되 기존 조회/참조는 유지.
- 적용 대상: 그룹/회사/조직, 고객사/거래처/지급정책, 계정과목, 관리항목, 은행/카드.

> **⚠ `status` 극성이 도메인별로 반대다** — 코드에서 `status` 를 직접 비교하면 안 되는 이유다.
>
> | 활성 값 | 테이블 |
> |---------|--------|
> | **`status = 0`** | `system_company`, `system_entity`, `system_pod`, `system_team`, `finance_bank_account` |
> | **`status = 1`** | `partner_term`, `partner_client`, `partner_vendor`, `finance_GL`, `finance_dimension` |
> | 문자열 | `system_employee.status` — `varchar(20)`, `'active'`/`'inactive'` 등 6종 (`CK_emp_status`) |
>
> 프로시저는 `@active_only bit` 파라미터로 이 차이를 감추지만, **Query Service가 직접 SELECT 를 작성할 때(D2) 극성을 테이블별로 확인해야 한다.** Domain 은 `ActiveStatus` Enum 으로만 다루고 극성 변환은 Mapper 가 테이블별로 책임진다.

### 9.10 은행/카드 (FR-Bank)
- 계좌(bank_account) XOR 카드(card_number) — 동시 입력 금지, 둘 중 하나 필수.
  - **⚠ DDL의 `CK_bank_shape` 는 "둘 다 NOT NULL 금지" 뿐이므로 둘 다 NULL 인 행이 합법이다.** "둘 중 하나 필수"는 현재 프로시저 검증에만 존재 → 부록 C에서 CHECK 를 보강한다.
- 회사 내 계좌/카드번호 중복 금지. 식별키(bank_id) 수정 불가.
  - **⚠ 중복 금지도 DDL 제약이 없다**(유니크 인덱스 부재) → 부록 C에서 추가한다.
- 카드번호는 목록/응답에서 **뒤 4자리만** 노출(마스킹). `usp_finance_bank_list` 가 `card_number_masked` 컬럼으로 마스킹된 값만 반환하며, **원본 `card_number` 를 반환하는 조회 경로는 없다.** Query Service가 D2에 따라 직접 SELECT 할 때도 **동일한 마스킹을 반드시 적용**한다(마스킹 누락이 가장 쉬운 사고 지점).
- status 0=사용/1=미사용. 전표 참조 시 삭제 불가.

### 9.11 지급정책 계산과 전표 지급/입금일 (FR-Term-06, FR-Ledger-11)
- EOM+N: 기준월 말일 + offset_days → `DATEADD(DAY, @offset, EOMONTH(@base_date))`.
- CurM DD: 기준월 DD일, DD가 월말 초과 시 월말로 보정.
- 표시용 정책식 `term_condition` 은 트리거가 `EOM+{offset_days}` / `CurM{fixed_day}` 로 자동 구성한다. 프로시저는 `'-'` 를 넣고 트리거가 덮어쓴다.
- `usp_partner_term_calc_due(@term_id, @base_date, @due_date OUTPUT)` — **OUTPUT 파라미터와 1행 결과셋을 동시에 반환**한다([§10.2](#102-프로시저-실행-계층-d1)).

**전표 라인 `due_date` 의 산출 경로 (FR-Ledger-11, UC-Ledger-07)** — 지급정책은 미리보기용이 아니라 **전표 라인 값의 원천**이다.

1. 라인의 계정과목이 `due_date` 플래그 = `Y` 일 때만 입력영역이 활성화된다. `N` 이면 값을 저장하지 않는다(THROW 50466).
2. **원천 거래에 지급정책이 연결되어 있으면** — 고객사의 `collecting_type` 또는 거래처의 `payment_type` → `partner_term` 규칙(EOM+N / CurM DD)으로 **자동 계산**한다. 계산은 `PaymentTermStrategy`([§7.2](#72-partner))가 담당하고, 미리보기·검증은 `usp_partner_term_calc_due` 와 동일한 결과여야 한다(Domain 단위 테스트로 등가성 보장).
3. **정책이 연결되지 않은 경우** — 권한 있는 사용자가 직접 입력한다.
4. 정책 변경은 **변경 이후 신규 계산분에만** 적용되고, 이미 저장된 `due_date` 를 자동 재계산하지 않는다(FR-Term-07).

### 9.12 식별자 자동생성 규칙

`IDENTITY` 를 쓰지 않고 프로시저가 채번한다. 잠금 정책이 항목별로 다르다.

| 대상 | 방식 | 잠금 | 비고 |
|------|------|------|------|
| `finance_ledger_head.ledger_no` | `MAX+1`, 범위 = 회사+일자 | `UPDLOCK, HOLDLOCK` | [§9.2](#92-전표번호-생성-지침-12) |
| `finance_dimension_detail.line_no` | `MAX+1`, 범위 = dimension_id | `UPDLOCK, HOLDLOCK` | `@line_no` NULL⇒생성 / 非NULL⇒수정 (InOut) |
| `finance_dimension.slot_no` | 미사용 최소 Slot(1~5) | `UPDLOCK, HOLDLOCK` | [§9.8](#98-관리항목-slot-보존-지침-19) |
| `finance_ledger_detail.line_on` | JSON 배열 순서 재부여 | 없음(전량 재적재) | [§9.1](#91-전표-저장-검증-하나의-트랜잭션-지침-1724) |
| `sales_pipeline_detail.activity_id` | `'ACT' + yyMMddHHmmssff` | **없음** | **⚠ 아래** |

> **⚠ `activity_id` 채번은 동시성에 취약하다** — `'ACT'+FORMAT(SYSDATETIME(),'yyMMddHHmmssff')` 는 **1/100초 해상도이고 잠금이 없다.** 동일 100분의 1초에 두 요청이 들어오면 같은 ID가 생성되고 후속 `EXISTS` 검사에서 THROW 50323 으로 실패한다(데이터 오염은 없으나 사용자에게 무의미한 오류가 노출된다).
> → 부록 C에서 재시도 루프로 보강하고, Application 계층에서도 50323 을 **재시도 가능 오류**로 분류해 자동 재시도한다(최대 3회).

---

## 10. DB 오브젝트 ↔ 애플리케이션 계층 매핑 전략

### 10.1 Repository 규칙 (지침 §13, §25)
- Domain은 DB 구현체를 모른다. `LedgerRepository` 인터페이스만 안다.
- Infrastructure `PrismaLedgerRepository` / `MssqlLedgerRepository` 가 구현 — 쓰기는 제공된 `usp_*` 프로시저 호출, 조회는 Prisma 또는 최적화 SELECT.
- Prisma Model을 Domain Entity로 직접 사용하지 않고 Mapper를 둔다.

```prisma
model FinanceLedgerHead {
  companyId      String   @map("company_id") @db.VarChar(10)
  entityId       String   @map("entity_id")  @db.VarChar(10)
  ledgerDate     DateTime @map("ledger_date") @db.Date
  ledgerNo       Decimal  @map("ledger_no")  @db.Decimal(10,2)
  approvalStatus Boolean  @map("approval_status")
  @@id([companyId, entityId, ledgerDate, ledgerNo])
  @@map("finance_ledger_head")
}
```

### 10.2 프로시저 실행 계층 (D1)

**Prisma 단독으로는 제공된 프로시저를 실행할 수 없다.** 다음 두 가지가 `$queryRaw`/`$executeRaw` 로 불가능하다.

**(a) OUTPUT 파라미터 — 4종 5개소.** 이 중 3개는 **NULL⇒생성 / 非NULL⇒수정** 의 양방향 InOut 이라 단순 결과셋으로 대체할 수 없다.

| 프로시저 | 파라미터 | 성격 |
|----------|----------|------|
| `usp_finance_ledger_head_save` | `@ledger_no numeric(10,2)` | `@mode='I'` 시 생성, `'U'` 시 입력 |
| `usp_finance_dimension_detail_save` | `@line_no numeric(10,2)` | NULL⇒생성 / 非NULL⇒수정 |
| `usp_sales_activity_save` | `@activity_id varchar(20)` | NULL⇒생성 / 非NULL⇒수정 |
| `usp_partner_term_calc_due` | `@due_date date` | OUTPUT **+ 1행 결과셋** 동시 반환 |

**(b) 다중 결과셋 — 2건.**

| 프로시저 | 결과셋 1 | 결과셋 2 |
|----------|----------|----------|
| `usp_finance_ledger_get` | 전표 헤더 | 라인 + `gl_name`/`bank_name` + GL 플래그 12종(`f_bank`, `f_team`, … `f_due`) |
| `usp_finance_openbalance_list` | 초기이월 행 | `debit_total` / `credit_total` / `difference` |

**따라서 쓰기 경로는 `mssql`(tedious) 드라이버를 직접 사용한다.**

```text
common/database/
├─ prisma.service.ts        # 조회 전용 (D2)
├─ mssql-pool.service.ts    # node-mssql ConnectionPool (쓰기 + 다중 결과셋 조회)
└─ stored-proc.executor.ts  # exec(name, { in, out }) → { output, recordsets[] }
```

```typescript
// OUTPUT 파라미터 바인딩 — Prisma로는 표현 불가한 부분
const { output } = await this.proc.exec('usp_finance_ledger_head_save', {
  in:  { mode: 'I', company_id: scope.companyId, entity_id: scope.entityId,
         ledger_date: date, ledger_name: name, ledger_type: type, employee_id: empId },
  out: { ledger_no: sql.Numeric(10, 2) },
});
const ledgerNo = toInt(output.ledger_no);        // D6: 경계에서 number 정규화

// 다중 결과셋
const { recordsets } = await this.proc.exec('usp_finance_ledger_get', { in: { ... } });
const [head] = recordsets[0];
const lines  = recordsets[1];

// JSON 일괄 파라미터 — 배열 순서가 line_on 이 된다 (§9.1)
await this.proc.exec('usp_finance_ledger_detail_save', {
  in: { company_id: scope.companyId, entity_id: scope.entityId,
        ledger_date: date, ledger_no: no,
        lines_json: JSON.stringify(ledger.lines.map(toLineJson)) },
});
```

**트랜잭션 경계** — mssql `Transaction` 이 소유한다(지침 §24, [§13](#13-트랜잭션-규칙-지침-24)).
- 프로시저 1건 = 업무 트랜잭션 1건이 기본이다. 각 쓰기 프로시저가 이미 `SET XACT_ABORT ON` + `BEGIN TRAN` + `TRY/CATCH` + `ROLLBACK` + `THROW` 를 내장한다.
- `usp_finance_check_year_open` 은 **호출자 트랜잭션 안에서 `EXEC`** 되며 자체 트랜잭션을 열지 않는다. 프로시저를 외부 트랜잭션으로 감쌀 때는 내부 CATCH의 `IF @@TRANCOUNT>0 ROLLBACK` 이 **외부 트랜잭션까지 되돌린다**는 점을 고려해야 한다 → **여러 프로시저를 하나의 외부 트랜잭션으로 묶지 않는다.**
- **`SESSION_CONTEXT` 플래그는 커넥션 상태**이므로, 플래그를 쓰는 4개 프로시저(`ledger_approve`, `openbalance_close/reopen`, `gl_generate_standard`, 신설 `closing_reopen`)는 **반드시 단일 커넥션에서 실행**해야 한다. 풀에서 커넥션이 갈리면 트리거 우회가 실패한다.

**오류 매핑** — mssql 드라이버 오류의 `number` 에서 THROW 번호를 추출해 `AX-50xxx` 로 변환하고, `common/exception` 필터가 HTTP 상태로 매핑한다([부록 B](#부록-b-오류코드-체계)).

### 10.3 Command / Query 분리와 조회·페이징 전략 (D2)

- **Command**(등록/수정/삭제/승인/초기이월 확정·해제/연도마감·마감해제): Application → Domain Entity/Policy → Repository → `usp_*` (§10.2 경로).
- **Query**(검색조건/Head Grid/Detail/Lookup Popup/집계): Query Service → **Prisma 또는 최적화 SELECT** → Read DTO. Domain 복원 생략 가능.

> **D2 · 페이징은 애플리케이션이 소유한다** — **82개 프로시저 전체에 `OFFSET`/`FETCH NEXT`/`ROW_NUMBER()`/`TOP` 이 0건**이고 총건수 OUTPUT도 없다. 모든 `_list` 는 필터된 **전체 집합**을 반환한다. 반면 [§11.1](#111-공통-정책-gateway) 공통정책은 `page/size`(기본 1/50, 최대 500)를 규정한다. 이 간극을 다음과 같이 메운다.
>
> | 용도 | 구현 | 페이징 |
> |------|------|--------|
> | Head Grid · 검색 목록 | **Query Service (Prisma / 최적화 SELECT)** | `page`/`size`/`sort` 를 SQL 수준에서 처리 |
> | F2/Enter Lookup 팝업 · 소량 조회 | `usp_*_list` (`@search_mode`, `@active_only`) | 미적용 (결과 상한은 Query Service가 보호) |
> | 다중 결과셋 조회 2건 | `usp_finance_ledger_get`, `usp_finance_openbalance_list` — 프로시저 유지 | 미적용 (단일 전표/단일 기수 범위) |
>
> - `_get` 프로시저가 **없는 7개 엔티티**(`pod`, `team`, `year`, `dimension`, `bank_account`, `contract`, `closing`)의 상세 조회는 Prisma가 담당한다.
> - **`SELECT *` 를 쓰는 조회 프로시저 6건**(`entity_get`, `client_get`, `vendor_get`, `pipeline_get`, `gl_get` 의 `g.*`, `ledger_get` 헤더)은 DDL 변경에 취약하다. Query Service 전환 시 컬럼을 명시한다.
> - Query Service 로 직접 SELECT 를 작성할 때 **반드시 함께 옮겨야 하는 규칙**: `company_id`+`entity_id` 스코프([§5](#5-멀티테넌시와-companyscope)), `status` 극성([§9.9](#99-참조-무결성과-soft-disabledelete-지침-20)), **카드번호 마스킹**([§9.10](#910-은행카드-fr-bank)), `user_pass` 제외([§6.1](#61-인증-흐름)).

### 10.4 Raw SQL 규칙 (지침 §15)
복잡 Grid 조회·대량 집계·성능상 ORM 부적절·SQL Server 전용 기능에 한해 사용. `NVARCHAR`/`VARCHAR` 암시적 형변환과 코드성 VARCHAR 인덱스 검색 성능에 주의. 쓰기 경로에 프로시저를 채택한 근거는 [§2.3](#23-저장-프로시저--트리거와-ddd의-통합-핵심-설계-결정) 의 지침 §15 편차 항목 참조.

> **⚠ `LIKE` 이스케이프 누락** — 모든 `_list` 프로시저가 `LIKE '%' + @keyword + '%'` 를 `ESCAPE` 절 없이 사용한다. 사용자가 입력한 `%`·`_`·`[` 가 **와일드카드로 동작**한다. Query Service 전환(D2) 시 입력값을 이스케이프하고 `ESCAPE '\'` 를 명시한다. 프로시저를 계속 쓰는 Lookup 경로에서도 Application 이 사전 이스케이프한다.

### 10.5 트리거 (DB 계층 이중 방어)

총 **10건** — `06` 9건 + `08` 신규 1건. `08` 은 이 중 **3건(head_protect · detail_protect · open_balance_protect)을 교체**한다([§16 Phase 0](#16-구현-로드맵-지침-2730--vertical-slice) 실행순서 참조).

| 트리거 | 대상 | 시점/이벤트 | 방어 내용 | 오류코드 |
|--------|------|-------------|-----------|----------|
| `trg_system_employee_protect_admin` | employee | INSTEAD OF DELETE | built-in admin(`user_id='admin'`) 물리삭제 차단. 그 외 행은 정상 삭제 수행 | 51001 |
| `trg_system_employee_audit` | employee | AFTER UPDATE | 수동 편집 시 `last_manual_edit_at` 기록. `last_login` 단독 갱신은 제외, 재귀 방지 | — |
| `trg_system_employee_inactive` | employee | AFTER UPDATE | `inactive` 전환 시 퇴사일 미입력이면 당일로 자동 보완 | — |
| `trg_sales_pipeline_audit` | pipeline | AFTER UPDATE | `adjusted_date` 갱신, stage 5/6 진입 시 `closed_date` 설정, 재오픈 시 NULL 해제 | — |
| `trg_finance_ledger_head_protect` | ledger_head | INSTEAD OF U/D | **[마감연도]** + 승인 전표 헤더 보호. 미승인 삭제 시 라인 연쇄삭제. 승인 경로는 `ax_ledger_approve` 로 통과 | 51011 · 51012 · **51052** |
| `trg_finance_ledger_detail_protect` | ledger_detail | AFTER I/U/D | **[마감연도]** + 승인 전표 라인 변경 차단 | 51021 · **51053** |
| `trg_finance_open_balance_protect` | open_balance | AFTER I/U/D | **[마감연도]** 전면 잠금 + 확정(`closed=1`)분 보호. 확정/해제 프로시저는 `ax_openbal_admin` 으로 통과 | 51031 · **51054** |
| `trg_finance_gl_protect_delete` | GL | INSTEAD OF DELETE | 초기이월/전표 참조 계정 삭제 차단(재생성은 `ax_bypass_gl_protect` 로 통과) | 51041 |
| `trg_finance_ledger_head_closing_lock` | ledger_head | AFTER INSERT | **[마감연도]** 전표 신규 등록 차단 | **51051** |
| `trg_partner_term_condition` | term | AFTER I/U | 표시용 정책식 자동 구성(`EOM+{offset}` / `CurM{day}`), 재귀 방지 | — |

**[마감연도] 표시 = v3.0에서 추가된 마감연도 잠금 로직. 4건이다** (설계상 중요: 3건이 아니다).

> **⚠ 마감연도 잠금이 SESSION_CONTEXT 플래그보다 우선한다** — 실행 순서가 이렇다:
>
> ```
> trg_finance_open_balance_protect:
>   ① finance_closing.closing=1 검사 → THROW 51054     ← 먼저
>   ② IF SESSION_CONTEXT('ax_openbal_admin')=1 RETURN   ← 나중
>   ③ closed=1 행 보호 → THROW 51031
> ```
>
> 즉 **`ax_openbal_admin` 플래그로는 마감연도 잠금을 우회할 수 없다.** `trg_finance_ledger_head_protect` 도 동일하게 마감연도 검사가 `ax_ledger_approve` 면제보다 앞선다.
>
> 이 우선순위는 의도된 설계이며, [§9.6 회계마감 해제](#96-연도-회계마감-해제-d4--신설)의 실행 순서(`closing=0` 을 **먼저** UPDATE)가 강제되는 직접적 근거다.

**SESSION_CONTEXT 플래그 3종** — 프로시저가 쓰고(`sp_set_session_context`), 트리거가 읽는다. **프로시저는 읽지 않는다.**

| 키 | 설정 프로시저 | 읽는 트리거 |
|----|---------------|-------------|
| `ax_ledger_approve` | `usp_finance_ledger_approve` | `trg_finance_ledger_head_protect` |
| `ax_openbal_admin` | `usp_finance_openbalance_close` / `_reopen` (+ 신설 `usp_finance_closing_reopen`) | `trg_finance_open_balance_protect` |
| `ax_bypass_gl_protect` | `usp_finance_gl_generate_standard` | `trg_finance_gl_protect_delete` |

패턴: `=1` 설정 → 권한 DML → `=NULL` 리셋. **`BEGIN CATCH` 안에서도 `=NULL` 리셋을 반복**한 뒤 `THROW` 한다(플래그 누출 방지). 커넥션 고정 요구사항은 [§10.2](#102-프로시저-실행-계층-d1) 참조.

---

## 11. API 설계

### 11.1 공통 정책 (Gateway)
- **Base URL**: `https://api.axbridge.example.com/api/v1` → 도메인 서비스 라우팅(`/auth·/system`→system, `/partner`, `/sales`, `/finance`).
- **인증**: 로그인 성공 시 JWT. 이후 `Authorization: Bearer {token}`.
- **테넌트 격리**: company_id/entity_id 는 JWT claim에서 추출 → 헤더 주입. 클라이언트 입력값 미신뢰(FR-Bank-08).
- **공통 쿼리**: `search_mode=E|L`(F2/Enter, FR-UI-04) · `active_only=true`(신규 선택 팝업: 미사용/비활성 제외) · `page/size`(기본 1/50, 최대 500) — **페이징은 Query Service 가 구현한다. 프로시저는 지원하지 않는다**([§10.3](#103-command--query-분리와-조회페이징-전략-d2)).
- **응답 포맷**: `{ "success": bool, "data": …, "error": { "code": "AX-50xxx", "message": "한글 메시지" } }`.
- **HTTP 상태**: 200 조회/수정 · 201 등록 · 204 삭제 · 400 검증(50xxx) · 401 미인증 · 403 권한없음 · 404 대상없음 · 409 중복/참조충돌 · 429 Rate Limit(+ `Retry-After`) · 500 서버오류.
- **Rate Limit**: 사용자당 120 req/min.
- **감사 로깅**: 모든 쓰기 요청의 user_id·IP·경로·결과코드 기록. 비밀번호/카드번호 마스킹. **`approved_date` 를 제외한 업무일자가 일 단위이므로(D8), 초 단위 행위 이력은 이 로그가 유일한 근거다** — 보존기간을 감사 요건에 맞춰 설정한다.

### 11.2 엔드포인트 (도메인별 요약, 총 **93건** = 명세 92건 + D4 신설 1건)

**AUTH (3)** — `POST /auth/login` (공개) · `POST /auth/refresh` (공개) · `PUT /auth/password` (로그인 사용자)

**SYSTEM (28)**

| 리소스 | 엔드포인트 | 건수 |
|--------|-----------|------|
| `/system/companies` | GET 목록 · **GET 상세** · POST · PUT · DELETE | 5 |
| `/system/entities` | GET 목록 · **GET 상세** · POST · PUT · DELETE | 5 |
| `/system/pods` | GET 목록 · POST · PUT · DELETE | **4** |
| `/system/teams` | GET 목록 · POST · PUT · DELETE | **4** |
| `/system/employees` | GET 목록 · **GET 상세** · POST · PUT · `PUT …/{id}/password`(ADMIN) · DELETE(ADMIN) | 6 |
| `/system/years` | GET 목록 · POST · PUT · DELETE | **4** |

> **상세 GET 은 6개 리소스 중 3개에만 있다** — `pods`·`teams`·`years` 는 목록 조회만 제공한다(`usp_*_get` 프로시저 자체가 없다, [§10.3](#103-command--query-분리와-조회페이징-전략-d2)). 상세가 필요하면 Prisma 조회로 추가한다.

**PARTNER (15)** — `/partner/terms`(5, + `GET …/{termId}/due-date` 지급일 미리보기) · `/partner/clients`(5, 상세 GET 포함) · `/partner/vendors`(5, 상세 GET 포함)

**SALES (15)**
- `/sales/pipelines` (6): GET 목록 · GET 상세 · POST · **PUT `/{pipelineId}`** · `PUT …/{pipelineId}/contract`(계약 연결/해제) · DELETE
- `/sales/pipelines/{pipelineId}/activities` (4): GET · POST · `PUT …/{activityId}` · `DELETE …/{activityId}`
- `/sales/contracts` (5): GET 목록 · POST · **`PUT /{contractId}/{contractType}`** · **`PUT /{contractId}/{contractType}/ledger`**(전표 연결/해제) · **`DELETE /{contractId}/{contractType}`**
  → 계약은 PK가 `(contract_id, contract_type)` 복합키이므로 **경로에 두 세그먼트가 모두 필요하다.**

**FINANCE (31 + 1)**

| 메뉴 | 엔드포인트 |
|------|-----------|
| 계정과목 (6) | `/finance/gl` GET 목록·GET `/{glId}`·POST·PUT·DELETE + `POST /finance/gl/generate-standard`(ADMIN) |
| 관리항목 (7) | `GET /finance/dimensions` · `GET …/{dimensionId}/details` · POST · `PUT …/{dimensionId}` · `POST …/{dimensionId}/details` · `PUT …/{dimensionId}/details/{lineNo}` · `DELETE …/{dimensionId}` — **상세값 DELETE 없음**([§9.8](#98-관리항목-slot-보존-지침-19)) |
| 초기이월 (4) | `GET /finance/open-balances` · `PUT /finance/open-balances` · **`POST /finance/open-balances/close`**(APPROVER) · **`POST /finance/open-balances/reopen`**(ADMIN) — 경로에 기수 파라미터 없음, body 로 `company_year_id` 전달 |
| 전표 (7) | `GET /finance/ledgers` · `GET/PUT/DELETE …/{ledgerDate}/{ledgerNo}` · `POST /finance/ledgers` · `PUT …/{ledgerDate}/{ledgerNo}/lines` · `POST …/{ledgerDate}/{ledgerNo}/approve`(APPROVER) |
| 마감관리 (3 **+1**) | `GET /finance/closings` · `POST …/{yearId}/execute`(ADMIN) · `GET …/{yearId}/status` · **`POST …/{yearId}/reopen`(ADMIN) — D4 신설** |
| 은행/카드 (4) | `/finance/bank-accounts` GET 목록·POST·PUT·DELETE (상세 GET 없음) |

### 11.3 업무 행위 Endpoint (지침 §23)

단순 CRUD URL 대신 업무 행위를 명시한다. **아래가 실제 명세와 일치하는 전량이다.**

```
POST /finance/ledgers/{ledgerDate}/{ledgerNo}/approve     APPROVER
POST /finance/open-balances/close                          APPROVER   # body: {company_year_id}
POST /finance/open-balances/reopen                         ADMIN      # body: {company_year_id}
POST /finance/closings/{yearId}/execute                    ADMIN
POST /finance/closings/{yearId}/reopen                     ADMIN      # D4 신설
POST /finance/gl/generate-standard                         ADMIN
PUT  /sales/pipelines/{pipelineId}/contract                EDITOR     # 계약 연결/해제
PUT  /sales/contracts/{contractId}/{contractType}/ledger   EDITOR     # 전표 연결/해제
```

> **파이프라인 stage 전환은 별도 엔드포인트가 아니다** — 지침 §23의 예시에 `POST /sales/pipelines/{id}/close · /cancel · /reopen` 이 나오지만 **실제 API 명세에는 없다.** stage 전환은 `PUT /sales/pipelines/{pipelineId}` → `usp_sales_pipeline_save(U)` 로 수행되고, `adjusted_date`/`closed_date` 는 트리거 `trg_sales_pipeline_audit` 가 관리한다.
> [§7.3](#73-sales)의 `pipeline.close()`·`cancel()`·`reopen()` 은 **Domain 메서드로 유지**한다(속성 직접 대입 금지 원칙). Application 이 이 메서드를 호출한 뒤 단일 `save` 로 영속화한다. 엔드포인트를 추가로 만들지 않는다.

### 11.4 대표 프로시저 매핑 (발췌)
| API | 프로시저 | 권한 | FR |
|-----|----------|------|----|
| POST /finance/ledgers | usp_finance_ledger_head_save(I) | EDITOR | FR-Ledger-04/16 |
| PUT /finance/ledgers/{ledgerDate}/{ledgerNo}/lines | usp_finance_ledger_detail_save | EDITOR | FR-Ledger-05~09/15/16 |
| POST /finance/ledgers/{ledgerDate}/{ledgerNo}/approve | usp_finance_ledger_approve | APPROVER | FR-Ledger-10/13/16 |
| POST /finance/closings/{yearId}/execute | usp_finance_closing_execute | ADMIN | FR-Close-02~10 |
| **POST /finance/closings/{yearId}/reopen** | **usp_finance_closing_reopen** (D4 신설) | ADMIN | [§9.6](#96-연도-회계마감-해제-d4--신설) |
| POST /finance/gl/generate-standard | usp_finance_gl_generate_standard | ADMIN | FR-GL-11~14 |
| POST /finance/open-balances/close | usp_finance_openbalance_close | APPROVER | FR-OpenBal-07 |
| POST /finance/open-balances/reopen | usp_finance_openbalance_reopen | ADMIN | FR-OpenBal-08 |

(전체 74 프로시저 · 92 API 매핑은 `AX_Bridge_DB_API_명세서.xlsx` 를 정본으로 참조. 본 설계서가 추가하는 것은 **`usp_finance_closing_reopen` + `POST /finance/closings/{yearId}/reopen` 1건뿐**이며, 그 외에는 명세를 초과하지 않는다.)

---

## 12. 프론트엔드 설계

### 12.1 공통 UI 컴포넌트 (지침 §6 — 화면별 중복 구현 금지)
`<AppToolbar />` · `<SearchBar />` · `<HeadDetailLayout />` · `<LookupPopup />` · `<DirtyFormGuard />` · `<ConfirmDialog />` · `<StatusBadge />`

### 12.2 공통 화면 흐름 (FR-UI-01~07)
```
조회조건 입력 → 조회 → Head Grid → 행 선택 → Detail 표시
→ 신규/수정 → 검증 → 저장 트랜잭션 → Head 재조회 + 선택 유지
```
- **툴바 기본 순서**: 조회 → 신규 → 수정 → 저장 → 삭제 → 취소 (FR-UI-02). 승인 등 메뉴 고유 기능은 기본 버튼 뒤에 구분 배치. 조회 상태에서는 조회/신규만 활성, 저장/취소는 편집모드에서 활성.
- **조회조건바 순서**: 그룹 → 회사 → 메뉴별 주요조건 → 상태. 조회조건 초기화 제공(FR-UI-03). 상위조건 변경 시 하위조건·선택값 초기화.
- 조회전용 사용자는 편집 버튼 비활성(FR-UI-02·FR-UI-07).
- **툴바 예외 화면** — 마감관리(SCR-FIN-06)는 표준 6버튼이 아니라 **조회 · 마감 · 취소** 구성이다. `<AppToolbar />` 는 버튼 집합을 주입받는 구조여야 한다.

### 12.3 공통 Lookup Popup (F2/Enter, 지침 §21, FR-UI-04)
```
F2     → 조건 범위 목록 팝업
Enter  → Exact 검색 → 1건이면 즉시 선택 → 미일치/다건이면 Like 팝업
```
- 상위 그룹/회사 조건이 필요한 Lookup은 상위조건이 없으면 팝업을 열지 않고 선행 선택을 안내한다.
- 선택 후 코드+명칭을 함께 내부 보관.

> **⚠ 프로시저의 `@search_mode` 지원이 균일하지 않다** — 공통 규약은 전 화면 동일 동작을 전제하지만 실제 프로시저는 다음과 같이 갈린다.
>
> | 지원 수준 | 프로시저 |
> |-----------|----------|
> | `@search_mode` 정상 지원 | `_list` 14건 |
> | **미지원 — 무조건 `LIKE '%…%'`** | `usp_sales_contract_list`, `usp_finance_openbalance_list` |
> | **키워드 검색 자체 없음** | `usp_system_year_list`, `usp_sales_activity_list`, `usp_finance_closing_list` |
>
> D2에 따라 이 화면들의 목록 조회는 **Query Service 가 담당**하며, 거기서 Exact/Like 를 구현해 `<LookupPopup />` 규약을 균일하게 맞춘다. 프론트엔드는 화면별 예외 분기를 갖지 않는다.
> 입력값의 `%`·`_` 이스케이프는 [§10.4](#104-raw-sql-규칙-지침-15) 참조.

### 12.4 미저장 변경 보호 (지침 §22, FR-UI-06)
신규/수정 모드에서 다른 Head 행 선택·재조회·메뉴 이동·브라우저 이동·취소·회사/그룹 조건 변경 시 `<DirtyFormGuard />` 로 Dirty Check → 저장/무시/취소 선택.

### 12.5 도메인별 화면 구조

| 화면 | 구조 | 특이사항 |
|------|------|----------|
| SYSTEM 각 마스터 | 조회조건바 + Head/Detail | 그룹→회사→(부서) 종속 선택 |
| **직원등록** | 조회조건바 + Head/Detail, **Detail 은 2개 탭** | **기본정보(인사)** / **계정정보**(`user_yn`·`user_id`·비밀번호·마지막 로그인). 항목이 많아 탭 분리가 필수. 사번은 수정모드에서 읽기전용. 조직 이동 시 새 그룹·회사·부서 조합 유효성 검증. 비밀번호·해시는 **어느 탭에도 표시하지 않는다** |
| 계정과목(GL) | **2-Frame**: 좌 Head(계정구분·gl_id·gl_name 3열) / 우 Detail(전체 + Layer3 플래그 **7종 + 관리항목 1~5 = 12종** + Slot1~5 실제 관리항목명) | 「계정과목 생성」 버튼(전표 존재 시 비활성). `contra_gl` 은 `gl_detail=차감항목` 일 때 F2/Enter 로 동일 회사 사용중 계정 선택, 자기 자신 제외([§7.4](#74-finance)) |
| 관리항목 | Head(Slot·코드·명·상태) / Detail(상세값 목록) | 최대 5개, Slot 표시. 미등록 Slot 행은 `3~5 — (미등록)` 로 표시. **상세값 개별 삭제 UI를 두지 않는다**([§9.8](#98-관리항목-slot-보존-지침-19)) |
| 초기이월 | 조회조건(기수 필수) + 입력 그리드 + 하단 차/대변 합계 | bank_id·고객사·거래처 보조잔액, 확정/확정해제. **금액 0 입력 = 행 삭제**임을 명시([§9.4](#94-초기이월-확정closed-vs-연도-회계마감closing--v30-핵심-구분)). 합계는 부호를 살려 계산하고 음수 행을 명시 표시(D7) |
| **전표(Ledger)** | **3-Layer**: Layer1 헤더 목록 / Layer2 라인(라인번호·계정·차대·금액·고객사) **+ 상단에 DRCR별 합계·차액 실시간 표시** / Layer3 관리항목(계정 플래그 기반 활성/비활성) | 아래 상세 |
| 마감관리 | 기수·연도별 마감현황 그리드 + **조회·마감·취소** 툴바 | 미마감만 체크 가능, `actual_year` 오름차순 순차 마감. 선행연도 미마감이면 후행 체크 제한. **마감 해제는 내림차순 순차**(D4, [§9.6](#96-연도-회계마감-해제-d4--신설)) |

**전표 화면 상세**

- **Layer2 차대변 합계** — 라인 그리드 상단에 차변합계 · 대변합계 · **차액**을 실시간 표시한다. 승인은 차액 0 일 때만 가능하며, 불일치 시 세 값을 모두 담은 안내를 띄운다(FR-Ledger-10).
- **계정 선택 시 플래그 즉시 로드** — `gl_id` 확정 즉시 해당 계정의 플래그 12종을 로드해 Layer3 입력영역을 활성/비활성한다. Slot 필드의 **레이블은 실제 관리항목명**을 쓰고, 해당 Slot의 상세값만 선택 가능하다. 미등록 Slot·플래그 `N` 은 비활성.
- **계정 변경 시 기존 Layer3 값 재검증 (UC-Ledger-04 예외)** — 플래그가 `Y→N` 으로 바뀐 항목에 값이 남아 있으면 **저장이 서버에서 거부된다**(THROW 50464~50466). 따라서 계정 변경 시점에 `<ConfirmDialog />` 로 *"선택한 계정에서 사용하지 않는 관리항목 값이 있습니다. 초기화하시겠습니까?"* 를 확인받고 초기화한다. **사용자 확인 없이 값을 버리지 않는다.** 도메인 계약은 [§7.4](#74-finance) 참조.
- **지급/입금일** — 계정의 `due_date` 플래그 `Y` 인 라인만 활성. 원천거래에 지급정책이 연결되어 있으면 자동 계산값을 채우고, 없으면 권한자가 직접 입력한다([§9.11](#911-지급정책-계산과-전표-지급입금일-fr-term-06-fr-ledger-11)).
- **은행/카드** — 플래그 `Y` 이면 동일 회사의 **사용중(`status=0`)** 항목만 선택 가능하고, 카드번호는 **마스킹 표시**한다.
- **라인 순서가 저장 결과를 결정한다** — `line_on` 은 저장 시 배열 순서대로 재부여되므로([§9.1](#91-전표-저장-검증-하나의-트랜잭션-지침-1724)), 그리드의 행 순서를 그대로 전송한다. 선택 상태는 `line_on` 이 아니라 클라이언트 임시 키로 추적한다.
- **마감연도** — `GET /finance/closings/{yearId}/status` 로 진입 시 마감 여부를 확인해 신규/수정/삭제/승인 버튼을 일괄 비활성화한다. 서버도 동일 조건을 재검증한다(FR-Ledger-16).

### 12.6 상태 코드 표시
DB 코드값을 UI에 직접 쓰지 않고 Enum/라벨로 변환(`<StatusBadge />`). 예: approval_status(bit) → "미승인/승인", stage(0~6) → 라벨.

---

## 13. 트랜잭션 규칙 (지침 §24)

다음은 반드시 **하나의 DB 트랜잭션**으로 처리하고 부분 성공을 허용하지 않는다:
- Head + Detail 저장 (전표 라인 JSON 일괄 재적재)
- 전표번호 생성 + 전표 저장
- 승인 상태 변경 + 승인자/승인일 저장
- 초기이월 확정 / 확정해제
- 연도 회계마감(선행검증 → 이월산출 → 차년도 INSERT → closing 기록)
- **연도 회계마감 해제**(선행검증 → `closing=0` → 자동생성 이월 회수) — D4, [§9.6](#96-연도-회계마감-해제-d4--신설)
- 표준 GL 재생성 (기존 삭제 + seed 일괄 INSERT)
- 여러 테이블을 함께 수정하는 업무

**대부분의** 쓰기 프로시저는 `SET XACT_ABORT ON` + `TRY/CATCH` + `BEGIN TRAN`/`ROLLBACK` + `THROW` 로 구현되어 있다(27건).

> **⚠ 예외 17건 — 대부분 무해하나 1건은 실제 결함이다.**
>
> | 유형 | 건수 | 평가 |
> |------|------|------|
> | `SET NOCOUNT ON` 만 있고 트랜잭션·`XACT_ABORT`·TRY/CATCH 없음 (주로 `_delete`) | 13 | 대부분 **guard-EXISTS + 단일 `DELETE`** 이므로 원자성 문제 없음 |
> | `XACT_ABORT ON` 만 있고 TRY/CATCH·명시적 트랜잭션 없음 | 2 | 단일문이라 기능상 무해. 오류가 CATCH 재throw 없이 그대로 노출되는 스타일 차이 |
> | **`usp_finance_dimension_delete`** | 1 | **실제 결함** — `DELETE` **2회**(상세값 → 마스터)를 트랜잭션·`XACT_ABORT` 없이 실행한다. 두 번째가 실패하면 `finance_dimension_detail` 고아행이 남는다 → [부록 C](#부록-c-09_ax_bridge_fixsql-스펙)에서 표준 템플릿으로 재작성 |
> | `usp_auth_change_password` | 1 | UPDATE 후 THROW 구조. 현재는 단일문이라 무해하나 문장이 추가되면 위험 — 부록 C 대상에 포함 |
>
> **여러 프로시저를 하나의 외부 트랜잭션으로 묶지 않는다** — 내부 CATCH 의 `IF @@TRANCOUNT>0 ROLLBACK` 이 외부 트랜잭션까지 되돌린다([§10.2](#102-프로시저-실행-계층-d1)).

---

## 14. 요구사항 추적 매트릭스

FR/UC ID는 코드·테스트·주석에서 추적 가능해야 한다(지침 §26). 도메인별 요약:

전체 **FR 179건 · UC 135건**. 도메인별 실측 분포:

| 도메인 | FR (건) | UC (건) | FR 접두어 | 대표 API/프로시저 |
|--------|---------|---------|-----------|-------------------|
| COMMON | **7** | **5** | FR-UI-01~07 | 공통 UI/Gateway 정책 |
| SYSTEM | **55** | **50** | Comp 9 · Entity 9 · Dept 8 · Pod 7 · Emp 9 · Year 7 · Admin 6 | `usp_system_*`, `usp_auth_*` |
| PARTNER | **24** | **18** | Client 8 · Vendor 8 · Term 8 | `usp_partner_*` |
| SALES | **25** | **21** | Pipe 9 · Act 7 · Contract 9 | `usp_sales_*` |
| FINANCE | **68** | **41** | GL 14 · Dim 10 · Bank 8 · OpenBal 9 · Ledger 16 · Close 11 | `usp_finance_*` |
| **합계** | **179** | **135** | 20개 접두어 | 74(+1) 프로시저 |

FINANCE가 FR의 38%를 차지하고 UC-Ledger가 단일 접두어 최다(13건)이므로, [§16 로드맵](#16-구현-로드맵-지침-2730--vertical-slice)에서 FINANCE 핵심업무에 가장 큰 비중을 배분한다.

**추적 예시** (테스트명에 ID 포함):
```typescript
describe('LedgerApprovalPolicy', () => {
  it('FR-Ledger-13: 승인된 전표는 일반 수정할 수 없다', () => { /* ... */ });
  it('FR-Ledger-10: 차변합계 ≠ 대변합계면 승인 거부', () => { /* ... */ });
});
describe('Pipeline', () => {
  it('FR-Pipe-07: Closed 전환 시 closedDate를 기록한다', () => { /* ... */ });
});
describe('ClosingService', () => {
  it('FR-Close-04: 미승인 전표가 있으면 마감 불가', () => { /* ... */ });
  it('FR-Close-06: 자산계정 이월잔액 = 전년이월 + 차변 − 대변', () => { /* ... */ });
});
```

전체 FR ↔ UC ↔ API ↔ 프로시저 ↔ 트리거 매핑은 `AX_Bridge_DB_API_명세서.xlsx`(프로시저·트리거·API 시트) 및 `AX_Bridge.xlsx`(FR/UC 시트)를 정본으로 참조한다.

---

## 15. 테스트 전략 (지침 §26)

최소 테스트 범위:
1. **Domain Unit Test** — Entity/Policy/VO 규칙(승인·차대균형·Slot·지급정책 계산·마감 이월 계산).
2. **Application Service Test** — Command/Query 오케스트레이션, 트랜잭션 경계.
3. **Repository Integration Test** — 실제 MSSQL + 프로시저/트리거 동작(동시성 잠금, THROW 매핑, 참조보호).
4. **API E2E Test** — 인증/권한(403), 테넌트 격리(타 회사 접근 차단), 오류코드 매핑, 상태코드.
5. **주요 UI Playwright E2E** — Head/Detail 흐름, F2/Enter Lookup, DirtyGuard, 전표 3-Layer, 마감 순차 실행.

각 테스트명에 FR/UC ID를 포함하여 추적성을 확보한다.

---

## 16. 구현 로드맵 (지침 §27·§30 — Vertical Slice)

Claude/개발자에게 한 번에 전체 도메인을 맡기지 않고 **화면 단위 Vertical Slice**로 진행한다. 각 슬라이스는 다음 순서: Prisma Model 검토 → Domain Entity → VO/Enum → Repository Interface → Prisma/MSSQL Repository → Application Command/Query → Controller → Unit Test → Integration Test → React 화면 → Playwright E2E. 범위 밖 기능은 구현하지 않는다.

```
Phase 0  Bootstrap        : 모노레포, DB/Prisma + node-mssql(D1), Auth/Permission,
                            공통 Exception(THROW→AX 매핑), CompanyScope, 01~09 SQL 적용
Phase 1  공통 UI          : AppToolbar · HeadDetailLayout · LookupPopup · DirtyFormGuard · StatusBadge
Phase 2  SYSTEM           : 그룹 → 회사 → Pod/부서 → 직원 → 회사 기수 (+ Admin 부트스트랩)
Phase 3  PARTNER          : 지급정책 → 고객사 → 거래처
Phase 4  SALES            : 파이프라인 → 액티비티 → 계약
Phase 5  FINANCE 기준정보 : 계정과목(GL, 표준 재생성) → 관리항목(Slot) → 은행/카드
Phase 6  FINANCE 핵심업무 : 초기이월 → 전표(3-Layer, 승인) → 마감관리(연도이월)
Phase 7  통합             : E2E · 성능 · 권한 · Audit
```

의존성상 SYSTEM(조직·기수)이 선행되어야 PARTNER/SALES/FINANCE가 성립하며, FINANCE 기준정보(GL·Dimension·Bank)가 전표보다, 전표·초기이월이 마감보다 선행된다. FR 179건 중 FINANCE가 68건(38%)이므로 Phase 5~6에 가장 큰 비중을 배분한다.

### 16.1 SQL 마이그레이션 정책

**실행 순서를 반드시 지킨다: `01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09`**

| 스크립트 | 내용 | 재실행 |
|----------|------|--------|
| `01` | 테이블 20종 DDL + Bootstrap 시드. **FK 길이 결함 수정 적용됨**([C.1](#c1-배포-차단-결함--01-에서-직접-수정함-d3-예외--적용-완료)) | ❌ **파괴적** — 가드 없는 `CREATE TABLE`/`CREATE UNIQUE INDEX` (시드만 `WHERE NOT EXISTS` 가드) |
| `02`~`05` | 프로시저 71건 (`CREATE OR ALTER`) | ✅ |
| `06` | 트리거 9건 | ✅ |
| `07` | 표준 GL seed 355행 | ⚠️ **`TRUNCATE TABLE finance_GL_seed` 로 시작** — 전량 교체됨 |
| `08` | v3.0 개정 — `finance_closing` 신설, `open_balance.bank_id` 추가, **프로시저 3건 신규 + 8건 교체**, **트리거 1건 신규 + 3건 교체** | ✅ 완전 가드 |
| `09` | **D3 신설** — 결함 수정 + 무결성 보강 ([부록 C](#부록-c-09_ax_bridge_fixsql-스펙)) | ✅ 멱등 작성 필수 |

> **⚠ `08` 은 `05`/`06` 의 객체를 덮어쓴다.** 교체 대상: 프로시저 `usp_finance_openbalance_list/_save/_close/_reopen`, `usp_finance_ledger_head_save/_detail_save/_approve/_delete` 8건과 트리거 `trg_finance_ledger_head_protect`·`_detail_protect`·`trg_finance_open_balance_protect` 3건.
> **순서가 역전되면 v3.0의 마감연도 잠금이 전부 소실**된다(`08` 의 전표 프로시저 4건이 `usp_finance_check_year_open` 을 첫 문장으로 호출하는 부분이 사라진다). `08` 의 11개 CREATE 중 **진짜 신규는 3건**(`usp_finance_check_year_open`, `usp_finance_closing_list`, `usp_finance_closing_execute`)뿐이다.

**Prisma 와의 관계**
- **DDL 정본은 `db/01~09/*.sql`** 이다. Prisma Migration 이 스키마 변경의 주체가 **아니다.**
- `prisma db pull` 로 `schema.prisma` 를 DB에서 역생성하고, `@map`/`@@map` 으로 camelCase 를 부여한다([§10.1](#101-repository-규칙-지침-13-25)).
- `prisma/migrations/` 는 **사용하지 않거나**, 사용한다면 `db/*.sql` 을 그대로 담은 baseline 1건으로만 둔다. 이중 관리를 금지한다.
- 스키마 변경이 필요하면 **새 번호의 SQL 스크립트(`10`, `11`, …)를 추가**하고 `db pull` 을 다시 돌린다. `prisma migrate dev` 를 실행하지 않는다.

### 16.2 작업 착수 체크리스트 (지침 §28)

Claude/개발자가 **한 슬라이스를 시작하기 전에** 아래 12항목을 문서화한다. 하나라도 비어 있으면 착수하지 않는다.

- [ ] ① 대상 도메인 (SYSTEM / PARTNER / SALES / FINANCE)
- [ ] ② 화면 ID (`SCR-SYS-01` … `SCR-FIN-06`)
- [ ] ③ 관련 FR ID 전체
- [ ] ④ 관련 UC ID 전체 (**정상 흐름 + 예외 흐름**)
- [ ] ⑤ 사용 테이블
- [ ] ⑥ PK / FK 구조 (**복합 업무 PK 확인**, FK 부재 항목은 프로시저·Domain 검증으로 대체됨을 확인)
- [ ] ⑦ CompanyScope 적용 지점 (Repository·Query·프로시저 인자)
- [ ] ⑧ 삭제 / 비활성 정책 (**`status` 극성 확인** — [§9.9](#99-참조-무결성과-soft-disabledelete-지침-20))
- [ ] ⑨ 상태 코드 → Domain Enum 매핑
- [ ] ⑩ Transaction 범위 (프로시저 1건 = 트랜잭션 1건 원칙 확인)
- [ ] ⑪ 사용할 공통 UI 컴포넌트
- [ ] ⑫ 기존 구현과의 중복 여부

**명세 충돌 시 규약 (지침 §28)** — 임의로 결정하지 않고 코드에 다음 주석을 남기고 본 설계서에 이슈로 등록한다.

```typescript
// TODO(명세확인): FR-XXX-nn 과 SCR-XXX-nn 화면기획서가 상충.
//   화면: …  /  FR: …  /  잠정 채택: …  /  근거: …
```

정본 우선순위는 문서 말미의 「본 설계서의 정본 관계」를 따른다.

---

## 17. Definition of Done

하나의 기능은 다음을 모두 충족해야 완료로 본다(지침 §32):

- [ ] 관련 FR 구현 완료
- [ ] 관련 UC 정상/예외 흐름 구현 완료
- [ ] CompanyScope 적용 (타 회사 접근 차단 검증)
- [ ] Domain Validation 적용 (UI-only 검증 아님)
- [ ] DB Constraint / 트리거 이중 방어 적용 — **무결성 제약(FK·유니크·XOR) 기준.** 열거형 코드값은 D5에 따라 Domain Enum + 프로시저 검증으로 충족한 것으로 본다([§8.1](#81-데이터-타입-기준-지침-8-9))
- [ ] Transaction 경계 검토 (프로시저 1건 = 트랜잭션 1건, 외부 트랜잭션으로 묶지 않음)
- [ ] Repository 분리 (Controller에 Prisma/proc 직접 호출 없음)
- [ ] **조회 경로에 마스킹·스코프·`status` 극성이 함께 이관되었는지 확인** (D2 전환 시 최다 누락 지점 — [§10.3](#103-command--query-분리와-조회페이징-전략-d2))
- [ ] Swagger 문서 생성
- [ ] Unit / Integration / 주요 E2E 통과
- [ ] 공통 UI 사용 (중복 구현 없음)
- [ ] Error Message(한글, AX-코드) 처리
- [ ] 권한 처리 (Role별 403)
- [ ] 미저장 변경 보호(DirtyGuard)
- [ ] 코드 포맷/린트 통과
- [ ] FR/UC ID 추적 가능

**금지사항 재확인 (지침 §29)** — Controller Prisma 직접 호출, React에서 SQL/DB 개념 처리, Domain의 NestJS 데코레이터/Prisma 타입 사용, 중복 Lookup/Toolbar, UI-only 규칙 검증, ID만으로 타 회사 조회, 금액 float, 비밀번호 평문, Y/N·0/1 코드의 Domain 전면 노출, nullable 업무 FK의 PK 포함, UI 전표번호 생성, FR/UC 근거 없는 규칙 추가, 불필요한 대규모 리팩터링/Generic Repository/Event Bus/Microservice 도입.

---

## 부록 A. 코드값 사전

> **⚠ `status` 극성이 도메인별로 반대다.** 코드에서 리터럴을 직접 비교하지 말고 Mapper 를 경유한다 — [§9.9](#99-참조-무결성과-soft-disabledelete-지침-20).

| 항목 | 코드 | 의미 |
|------|------|------|
| status (company/entity/pod/team/bank) | 0 / 1 | **0:사용** / 1:미사용 |
| status (term/client/vendor/GL/dimension) | 1 / 0 | **1:Y 사용** / 0:N |
| user_yn | 1 / 0 | Y 사용자 / N |
| employee status | planned/probation/active/on_leave/leaving_soon/inactive | 재직상태 6종 |
| partner_term base_rule | EOM / CURM | 월말기준 / 당월기준 |
| pipeline_type | 0~4 | 대행/사입/리테일/마케팅/기타 |
| pipeline stage | 0~6 | Lead/QualifiedLead/Suggest/Meeting/Nego/Closed/Canceled |
| activity type | 0~3 | 메일/전화/미팅/기타 |
| contract_type | 0~5 | 계약 유형 |
| contract status | 0~2 | Active/Inactive/Suspend |
| gl_type | 0~10 | 자산/부채/자본/수익/매출원가/제조원가/용역원가/판매관리비/영업외수익/영업외비용/법인세 등 |
| gl_detail | 0 / 1 | 보통계정 / 차감항목 |
| vat_gl | 매입부가가치세 / 매출부가가치세 / NULL | 부가세 구분 |
| DRCR | 1 / 2 | 차변 / 대변 |
| ledger_type | 0~3 | 일반/매입/매출/결산 |
| approval_status | 0 / 1 | 미승인 / 승인 |
| open_balance.closed | 0 / 1 | 미확정 / 확정 |
| closing.closing | 0 / 1 | 미마감 / 회계마감 |
| Dimension slot_no | 1~5 | 관리항목 Slot |

## 부록 B. 오류코드 체계

번호 체계는 `50` + 도메인 숫자 + `xx` 이고, 오브젝트별로 10 단위 서브블록(`x01`, `x11`, `x21`…)을 쓴다.

| 범위 | 계층 | 실제 사용 코드 |
|------|------|----------------|
| 50001·50002 | AUTH | **2건뿐**, 둘 다 `usp_auth_change_password`(빈 해시 / 대상 없음·`user_yn=0`). `usp_auth_get_credential`·`_update_last_login` 은 THROW 하지 않는다 |
| 501xx | SYSTEM (프로시저) | company 50101~03 · entity 50111~14 · pod 50121~23 · team 50131~36 · employee 50141~47 · year 50151~56 |
| 502xx | PARTNER | term 50201~06 · client 50211~15 · vendor 50221~25 |
| 503xx | SALES | pipeline 50301~06 · link/delete 50311~15 · activity 50321~24 · contract 50331~37 · link_ledger/delete 50341~45 |
| 504xx | FINANCE (프로시저) | GL 50401~07 · generate_standard 50411~12 · dimension 50421~28 · openbalance_save 50431~37 · close/reopen 50441~43 · ledger_head 50451~52 · ledger_detail 50461~66 · approve 50471~73 · delete 50474~75 · bank 50481~87 |
| 505xx | FINANCE v3 (마감·초기이월) | check_year_open **50501** · closing_execute 50511~16 · openbalance v3 50521~24 · **closing_reopen 50531~35 (D4 신설)** |
| 51xxx | 트리거 (DB 계층 이중 방어) | 51001 · 51011 · 51012 · 51021 · 51031 · 51041 · **51051~51054**(v3 마감 잠금) |
| 59xxx | **마이그레이션 스크립트 전용** (`09`) | 59001 (제약 추가 전 기존 데이터 위반 검사). 런타임에 발생하지 않으므로 `AX-` 매핑 대상이 아니다 |

**⚠ 매핑 테이블 작성 시 주의할 3가지**

1. **`50443` 은 v3 이후 사문화되었다.** `05` 의 `usp_finance_openbalance_reopen` 에 있던 코드로, `08` 의 교체본에서 제거되고 **50523 / 50524** 로 대체되었다. 살아 있는 코드로 등록하면 안 된다.
2. **`50521` 이 두 프로시저에서 중복 사용된다** — `usp_finance_openbalance_save` 와 `usp_finance_openbalance_close`. 전체 코드베이스에서 유일한 비고유 코드다. HTTP 상태·사용자 안내를 코드만으로 분기하면 오작동하므로, 이 코드는 **호출 컨텍스트와 함께** 해석한다.
3. **v3에서 메시지가 바뀐 코드가 있다** — 「마감 → 확정」 용어 분리에 따라 50432(`마감된 기수의 초기이월은 수정할 수 없습니다` → `확정된 초기이월이 존재합니다…`), 50441(`…마감할 수 없습니다` → `…확정할 수 없습니다`), 트리거 51031(`마감된 초기이월` → `확정된 초기이월`)의 문구가 변경되었다. **`08` 의 문구가 정본**이다.

`THROW 50000` 은 주석에만 등장하고 실제 코드로는 쓰이지 않는다.

**재시도 분류** — `50323`(activity_id 중복)은 채번 경합에서 발생하므로 **재시도 가능 오류**로 분류해 최대 3회 자동 재시도한다([§9.12](#912-식별자-자동생성-규칙)). 그 외 50xxx 는 재시도하지 않는다.

애플리케이션은 mssql 드라이버 오류의 `number` 에서 THROW 번호를 추출해 `AX-50xxx` 로 매핑하고 한글 메시지를 그대로 전달하며, 예외 필터가 HTTP 상태(400/403/404/409 등)로 변환한다([§10.2](#102-프로시저-실행-계층-d1)).

---

## 부록 C. `09_AX_Bridge_Fix.sql` 스펙

**D3** — `01~08` 은 납품 원본으로 **동결**하고, 발견된 결함·무결성 보강을 **멱등한 `09`** 에 집약한다. 모든 항목은 `IF ... IS NULL` / `IF NOT EXISTS` 가드로 감싸 재실행 가능하게 작성한다. 실행 순서는 [§16.1](#161-sql-마이그레이션-정책) 참조.

> **동결 원칙의 예외는 [C.1](#c1-배포-차단-결함--01-에서-직접-수정함-d3-예외--적용-완료) 1건뿐**이다. 판별 기준: **`09` 시점에 대상 오브젝트가 존재하는가.** 존재하면 `09` 에서 `ALTER`/`CREATE OR ALTER` 로 고치고, 존재조차 하지 않으면(= `01` 이 실패하는 경우) 원본을 고치는 수밖에 없다.

**D5 범위 원칙** — 배포를 막거나 데이터를 오염시키는 것만 고친다. 단순 열거형 CHECK 8종은 추가하지 않는다.

### C.1 배포 차단 결함 2건 — **원본에서 직접 수정함 (D3 예외)** ✅ 적용 완료

D3의 "`01~08` 동결" 원칙에 대한 예외는 **"스크립트가 실행 자체를 완료하지 못하는 결함"** 2건이다. 판별 기준은 단순 존재 여부가 아니라 **`09` 가 그 수정을 표현할 수 있는가**다 — 테이블은 `ALTER` 대상이 존재해야 하고, 실행이 중단되면 뒤 배치가 아예 적용되지 않는다.

#### C.1-1 `01` — FK 길이 불일치

**증상** — `01` 은 원본 상태로 실행되지 않는다.

`FK_client_term` / `FK_vendor_term` 이 `varchar(50)` 컬럼(`partner_client.collecting_type`, `partner_vendor.payment_type`)에서 `partner_term.term_id varchar(10)` 을 참조했다. SQL Server 는 길이가 다른 컬럼 간 FK 를 거부하므로(**Msg 1753**) 해당 `CREATE TABLE` 이 실패한다.

**연쇄 범위 — 테이블 3개** (2개가 아니다)

```
partner_client  (01:137)  실패
partner_vendor  (01:154)  실패
   └─ sales_contract (01:203) 도 실패
        FK_ct_client (01:217) → partner_client 를 참조하므로 선행 테이블 부재
```

**이 결함만은 `09` 로 해결할 수 없다.** `09` 는 `01~08` 다음에 실행되는데, 이 시점에 세 테이블은 **존재하지 않는다**. `ALTER` 할 대상이 없으므로 `09` 가 세 테이블의 `CREATE TABLE` 을 다시 작성해야 하고, 이는 [§16.1](#161-sql-마이그레이션-정책) 이 금지하는 **DDL 이중 관리**를 초래한다.

**따라서 D3(`01~08` 동결)의 유일한 예외로 `01` 을 직접 최소 수정했다.**

```diff
  CREATE TABLE dbo.partner_client (
-     collecting_type varchar(50) NULL,              -- partner_term.term_id
+     collecting_type varchar(10) NULL,              -- partner_term.term_id (길이 일치 필수 — FK_client_term)

  CREATE TABLE dbo.partner_vendor (
-     payment_type varchar(50) NULL,                 -- partner_term.term_id
+     payment_type varchar(10) NULL,                 -- partner_term.term_id (길이 일치 필수 — FK_vendor_term)
```

- **변경 범위는 컬럼 선언 2행뿐**이다. FK 절·PK·다른 컬럼·프로시저·다른 스크립트는 손대지 않았다.
- **업무상 손실 없음** — 참조 대상 `partner_term.term_id` 가 `varchar(10)` 이므로, 10자를 초과하는 정책코드는 애초에 존재할 수 없다.
- 수정 후 `01` 의 **모든 FK 컬럼 길이가 정합**함을 재검증했다(`varchar(10)` 12종 · `pod_id varchar(4)` · `ledger_no numeric(10,2)` 전부 대상과 일치).

> **알려진 무해 불일치 (수정하지 않음)** — `usp_partner_client_save` 의 `@collecting_type` 과 `usp_partner_vendor_save` 의 `@payment_type` 은 여전히 `varchar(50)` 파라미터다. 컬럼이 `varchar(10)` 이므로 10자 초과 값은 INSERT 시 truncation 오류가 되지만, 두 프로시저는 **INSERT 전에 `partner_term` 존재 검증**(THROW 50211 / 50221)을 수행하므로 10자 초과 값이 그 지점에 도달할 수 없다. D5 범위(버그·무결성)에 해당하지 않아 `09` 에서 손대지 않는다.

#### C.1-2 `04` — T-SQL 구문 오류 (`usp_sales_contract_link_ledger`)

**증상** — `04` 의 271행이 컴파일되지 않아 `Msg 102: '<' 근처에 구문이 잘못되었습니다` 로 스크립트 실행이 중단된다.

```sql
-- 원본 (실행 불가)
IF (@ledger_date IS NULL) <> (@ledger_no IS NULL)
```

**T-SQL 에는 boolean 데이터 타입이 없어 두 술어(predicate)를 `<>` 로 비교할 수 없다.** 이 표현은 다른 DBMS 문법이다.

**연쇄 범위** — 컴파일 실패로 `usp_sales_contract_link_ledger` 가 생성되지 않고, 오류 중단(`sqlcmd -b`) 때문에 **바로 뒤 배치의 `usp_sales_contract_delete` 까지 생성되지 않는다**(프로시저 2건 누락 → 73/75).

```diff
- IF (@ledger_date IS NULL) <> (@ledger_no IS NULL)
+ IF (@ledger_date IS NULL AND @ledger_no IS NOT NULL)
+ OR (@ledger_date IS NOT NULL AND @ledger_no IS NULL)
      THROW 50341, N'전표일자와 전표번호는 둘 다 입력하거나 둘 다 비워야 합니다.', 1;
```

- 의미는 원본 의도(NULL 여부의 XOR, FR-Contract-08)와 동일하며 오류코드 `50341` 도 유지한다.
- `CREATE OR ALTER` 이므로 `09` 로도 고칠 수 있었으나, **원본을 그대로 두면 `04` 자체가 오류로 중단되어 뒤 배치가 유실**된다. 파이프라인에 실행 불가 스크립트를 남기지 않기 위해 원본을 수정했다.

### C.2 무결성 보강 (D5 범위)

| # | 대상 | 문제 | 조치 |
|---|------|------|------|
| 1 | `finance_open_balance` | **PRIMARY KEY 없음**(힙). 유일성은 `UX_open_balance` 인덱스로만 보장 | `UX_open_balance` 와 동일 컬럼 집합으로 PK 추가 |
| 2 | `finance_bank_account` | `CK_bank_shape` 가 "둘 다 NOT NULL 금지"뿐 → **둘 다 NULL 인 행이 합법**. "둘 중 하나 필수"는 프로시저에만 존재 | XOR 을 완성하는 CHECK 로 교체 |
| 3 | `finance_bank_account` | 회사 내 `bank_account`/`card_number` **중복 금지 DDL 없음** | 필터 유니크 인덱스 2건 추가 (`WHERE ... IS NOT NULL`) |
| 4 | `finance_dimension_detail` | 동일 항목 내 `dimension_value` **중복 금지 DDL 없음** | 유니크 인덱스 추가 |
| 5 | `finance_open_balance` | **출처 구분 컬럼 없음** → 회계마감 해제 불가([§9.6](#96-연도-회계마감-해제-d4--신설)) | `source varchar(10) NOT NULL DEFAULT 'MANUAL'` 추가 (`MANUAL` \| `CLOSING`) + CHECK |
| 6 | `finance_ledger_head` | `approved_date date` — 승인 시각이 일 단위 (**D8**) | `datetime2(0)` 으로 변경. **C.3 의 `usp_finance_ledger_approve` 수정과 반드시 동반** |

> **마이그레이션 전용 오류코드 `59xxx`** — `09` 는 제약을 추가하기 전에 기존 데이터가 새 제약을 위반하는지 검사하고, 위반 시 `THROW 59001` 로 중단한다(예: 계좌·카드가 모두 비어 있는 은행 행). 이 대역은 **스크립트 실행 시점에만** 쓰이며 런타임 업무 오류(`50xxx`)·트리거(`51xxx`)와 겹치지 않는다. Application 의 `AX-` 매핑 테이블에 등록하지 않는다.

```sql
-- (1) open_balance PK — UX_open_balance 와 동일 키
ALTER TABLE dbo.finance_open_balance ADD CONSTRAINT PK_finance_open_balance
  PRIMARY KEY (company_id, entity_id, company_year_id, gl_id, DRCR,
               bank_key, client_key, vendor_key);

-- (2) 은행/카드 XOR 완성 — 정확히 하나만 NOT NULL
ALTER TABLE dbo.finance_bank_account DROP CONSTRAINT CK_bank_shape;
ALTER TABLE dbo.finance_bank_account ADD CONSTRAINT CK_bank_one CHECK (
  (bank_account IS NOT NULL AND card_number IS NULL) OR
  (bank_account IS NULL     AND card_number IS NOT NULL));

-- (3) 회사 내 계좌·카드 중복 금지
CREATE UNIQUE INDEX UX_bank_account ON dbo.finance_bank_account
  (company_id, entity_id, bank_account) WHERE bank_account IS NOT NULL;
CREATE UNIQUE INDEX UX_bank_card    ON dbo.finance_bank_account
  (company_id, entity_id, card_number)  WHERE card_number  IS NOT NULL;

-- (4) 관리항목 상세값 중복 금지 — dimension_value 가 nullable 이므로 필터 인덱스
CREATE UNIQUE INDEX UX_dim_value ON dbo.finance_dimension_detail
  (company_id, entity_id, dimension_id, dimension_value) WHERE dimension_value IS NOT NULL;

-- (5) 초기이월 출처 구분 (D4 선결)
ALTER TABLE dbo.finance_open_balance ADD source varchar(10) NOT NULL
  CONSTRAINT DF_ob_source DEFAULT ('MANUAL');
ALTER TABLE dbo.finance_open_balance ADD CONSTRAINT CK_ob_source
  CHECK (source IN ('MANUAL','CLOSING'));

-- (6) 승인 시각 정밀도 (D8)
ALTER TABLE dbo.finance_ledger_head ALTER COLUMN approved_date datetime2(0) NULL;
```

**의도적으로 추가하지 않는 것**

- ❌ **`finance_open_balance.amount >= 0` CHECK** — **D7**에 따라 마감 자동생성분의 음수를 허용한다. 대신 합계 집계를 부호 기반으로 계산하고 화면이 음수를 명시 표시한다([§9.5](#95-연도-회계마감-이월-계산-fr-close-0510)).
- ❌ **열거형 CHECK 8종** (`gl_type`·`gl_detail`·`pipeline_type`·`stage`·activity `type`·`contract_type`·contract `status`·`ledger_type`) — **D5**에 따라 Domain Enum + 프로시저 검증에 위임한다. 코드값 확장 시 마이그레이션이 필요해지는 비용이 이득보다 크다고 판단.
- ❌ `finance_ledger_detail.amount` NOT NULL 화 — 기존 데이터 영향이 있고 프로시저가 이미 `> 0` 을 강제한다.
- ❌ `system_entity.estabilish_date` 오타 수정 — DDL 이 정본이며 Prisma `@map` 으로 흡수한다([§8.5](#85-finance-테이블) 각주).

### C.3 프로시저 결함 수정

| 프로시저 | 결함 | 조치 |
|----------|------|------|
| `usp_finance_dimension_delete` | `DELETE` 2회(상세값 → 마스터)를 트랜잭션·`XACT_ABORT` 없이 실행 → **비원자적**, 고아행 발생 가능 | 표준 템플릿(`SET XACT_ABORT ON` + `BEGIN TRY/TRAN` + `CATCH ROLLBACK; THROW`)으로 재작성 |
| `usp_finance_gl_generate_standard` | `SELECT @@ROWCOUNT AS inserted_count` 가 `sp_set_session_context`·`COMMIT` **뒤에** 있어 항상 무의미한 값 반환 | seed INSERT **직후** `DECLARE @n int = @@ROWCOUNT;` 로 포착한 뒤 마지막에 `SELECT @n AS inserted_count`. `usp_finance_closing_execute` 가 이미 올바른 패턴을 쓴다 |
| `usp_sales_activity_save` | `activity_id` = `'ACT'+yyMMddHHmmssff`, **잠금 없음 · 1/100초 해상도** → 동시 등록 시 충돌(THROW 50323) | 충돌 시 재시도 루프(최대 5회) 추가. Application 도 50323 을 재시도 가능 오류로 분류([§9.12](#912-식별자-자동생성-규칙)) |
| `usp_auth_change_password` | `XACT_ABORT`·TRY/CATCH 없음. 현재는 단일문이라 무해하나 확장 시 위험 | 표준 템플릿 적용 |
| **`usp_finance_ledger_approve`** | `approved_date = CONVERT(date, GETDATE())` — **C.2-6 으로 컬럼을 `datetime2(0)` 로 넓혀도 이 문장을 두면 자정 시각만 저장되어 D8이 무의미해진다** | `SYSDATETIME()` 으로 변경. **C.2-6 과 반드시 함께 적용** |
| `usp_finance_closing_execute` | 자동생성 이월 행에 출처 표시가 없어 회수 불가 | 차년도 INSERT 시 **`source='CLOSING'`** 기록 (C.2-5 선결) |

> **`trg_finance_ledger_head_protect` 는 수정 불필요** — INSTEAD OF UPDATE 경로에서 `approved_date=i.approved_date` 로 값을 그대로 복사하므로 타입 변경에 영향받지 않는다.
>
> **재작성 시 불변 조건** — 위 6건은 모두 `CREATE OR ALTER` 로 교체하되 **① 파라미터 시그니처와 ② THROW 오류코드 집합을 원본과 동일하게 유지**해야 한다(호출부·오류 매핑 테이블이 깨지지 않도록). 적용된 `09` 는 이 두 조건을 자동 검증했다.

### C.4 신규 프로시저 — `usp_finance_closing_reopen` (D4)

설계 상세·선행검증 5종·실행 순서는 [§9.6](#96-연도-회계마감-해제-d4--신설) 에 있다. 요지:

```sql
CREATE OR ALTER PROCEDURE dbo.usp_finance_closing_reopen
  @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRAN;
    -- 선행검증 50531~50535 (대상 존재 / 마감상태 / 후행연도 미마감 / 차년도 MANUAL 이월 없음 / 차년도 전표 없음)
    -- ① closing=0 을 먼저 UPDATE  ← 트리거의 마감연도 잠금이 세션 플래그보다 우선하므로 순서 강제
    -- ② ax_openbal_admin = 1
    -- ③ DELETE 차년도 open_balance WHERE source='CLOSING'
    -- ④ ax_openbal_admin = NULL
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;  -- 플래그 누출 방지
  THROW;
END CATCH
```

- 신규 오류코드 **50531~50535** (505xx 대역 연장) — [부록 B](#부록-b-오류코드-체계)
- 신규 트리거는 **불필요**하다. `closing=0` 이 되면 기존 마감연도 트리거 4건의 조건이 자동으로 풀린다.

### C.5 진행 상태 및 반영 후 수치

**전 항목 적용 완료.** 산출물: `Planning_Docs/09_AX_Bridge_Fix.sql` (멱등, 21 배치)

| 항목 | 상태 |
|------|------|
| **C.1-1** `01` FK 길이 불일치 | ✅ `01_AX_Bridge_Tables.sql` 직접 수정 (D3 예외) |
| **C.1-2** `04` T-SQL 구문 오류 | ✅ `04_AX_Bridge_Procs_SALES.sql` 직접 수정 (D3 예외) |
| **C.2** 무결성 보강 6건 | ✅ `09` §1 — PK · XOR CHECK · 유니크 3종 · `source` · `approved_date` |
| **C.3** 프로시저 결함 6건 | ✅ `09` §2 — dimension_delete · gl_generate_standard · activity_save · change_password · **ledger_approve** · closing_execute |
| **C.4** `usp_finance_closing_reopen` | ✅ `09` §3 — 검증 5종(50531~50535) 포함 |

**적용 후 검증 결과**

- 재작성 프로시저 6건 전부 **파라미터 시그니처가 원본과 byte-identical** — 호출부 변경 불필요
- 재작성 프로시저 6건 전부 **THROW 오류코드 집합이 원본과 동일** — 오류 매핑 테이블 변경 불필요
- BEGIN/END 블록 균형 21 배치 전부 정합

**갱신되는 수치**

| 항목 | 변경 |
|------|------|
| 저장 프로시저 | 74 → **75** (`usp_finance_closing_reopen` 신설) |
| REST 엔드포인트 | 92 → **93** (`POST /finance/closings/{yearId}/reopen`) |
| 트리거 | **10** (변동 없음 — 마감해제는 신규 트리거를 요구하지 않는다) |
| 테이블 | **21** (변동 없음. `finance_open_balance` 에 `source` 컬럼 1개 추가) |
| SQL 스크립트 | `01~08` → **`01~09`** |

### C.6 실 DB 적용 및 검증 결과 ✅

**환경** — SQL Server 2025 (17.0.1125.2), 인스턴스 `localhost\AX_BRIDGE`, DB `AX_BRIDGE`, 조합 `Korean_Wansung_CI_AS`.
스크립트는 UTF-8(BOM 없음)이므로 `sqlcmd -f 65001` 필수.

**개체 생성 결과 — 설계서 수치와 완전 일치**

| 항목 | 기대 | 실제 |
|------|------|------|
| 테이블 | 21 | **21** ✅ |
| 저장 프로시저 | 75 | **75** ✅ |
| 트리거 | 10 | **10** ✅ |
| 표준 GL seed | 355 | **355** ✅ |
| built-in admin | 1 | **1** ✅ |

무결성 제약 전수 확인: `PK_finance_open_balance` ✅ (**계산컬럼 PK 가 정상 생성되어 대체 인덱스는 불필요**) · `CK_bank_one` ✅ · `CK_bank_shape` 제거 ✅ · `UX_bank_account` ✅ · `UX_bank_card` ✅ · `UX_dim_value` ✅ · `open_balance.source varchar(10)` ✅ · `approved_date datetime2` ✅ · `FK_client_term`/`FK_vendor_term` ✅

**기능 검증 (FINANCE 라이프사이클 왕복)**

| # | 검증 | 결과 |
|---|------|------|
| 1 | Layer3 플래그 강제 — 플래그 Y 항목 누락 시 저장 거부 | ✅ 50464 |
| 2 | `line_on` JSON 배열 순서대로 1,2 재부여 | ✅ |
| 3 | 차대 불균형 승인 거부 (차액 메시지 포함) | ✅ 50473 |
| 4 | **D8 초 단위 승인시각** — `approved_date = 2026-08-13 23:10:22` | ✅ |
| 5 | 승인 전표 직접 UPDATE 차단 (트리거) | ✅ 51012 |
| 6 | 회계마감 → 차년도 이월 생성, **`source='CLOSING'`** | ✅ 4행 |
| 7 | 마감연도 전표 수정 차단 | ✅ 50501 |
| 8 | **회계마감 해제 (신규)** — 이월 4행 회수, `closing=0`, `closing_date=NULL` | ✅ |
| 9 | 미마감 연도 해제 거부 | ✅ 50532 |
| 10 | 재마감 왕복 — 이월 행·금액이 최초 마감과 동일 | ✅ 멱등 |
| 11 | 전표 존재 시 표준 GL 재생성 차단 | ✅ 50411 |
| 12 | 선행연도 미마감 시 후행 마감 거부 | ✅ 50513 |

**검증으로 확인된 설계 사실 2건**

1. **이월 집계는 보조키 조합별로 분리된다** — 초기이월(보조키 NULL)과 전표(bank·client·vendor 지정)가 같은 계정이어도 `gl_id + bank_key + client_key + vendor_key` 가 달라 **별개 행으로 이월**된다(1,000,000 / 500,000 각각). §9.5의 집계 단위 서술대로 동작한다.
2. **마감연도 잠금(51054)은 "행 자신의 기수"를 기준으로 판정한다** — 차년도 이월 행을 UPDATE 하면 51054가 아니라 **51031**(확정분 보호)이 발동한다. 차년도는 마감 상태가 아니기 때문이다. [§9.6](#96-연도-회계마감-해제-d4--신설)의 트리거 상호작용 분석과 일치한다.

**표준 GL seed 의 실측 특성 (구현 시 주의)** — 자산(`gl_type=0`)·자본(`2`) 계정 중 **Layer3 플래그가 전혀 없는 계정은 존재하지 않는다.** 최소 조합조차 자산은 `bank_id`+`client_id`+`vendor_id` 3종, 자본은 `client_id`+`vendor_id` 2종이 필수다. 따라서 **전표를 입력하려면 은행/카드·고객사·거래처 마스터가 반드시 선행 등록**되어야 한다. [§16 로드맵](#16-구현-로드맵-지침-2730--vertical-slice)의 Phase 5(기준정보) → Phase 6(전표) 순서가 선택이 아니라 **필수 제약**임을 뜻한다.

---

> **본 설계서의 정본 관계** — 업무 규칙·화면 요구는 `AX_Bridge.xlsx`(FR/UC)와 화면기획서, DB 구현은 `01~08_*.sql` **+ `09_AX_Bridge_Fix.sql`([부록 C](#부록-c-09_ax_bridge_fixsql-스펙))**, 프로시저·트리거·API 세부는 `AX_Bridge_DB_API_명세서.xlsx` 를 정본으로 한다. 본 문서는 이들을 구현 관점에서 통합한 상위 설계이며, 상충 시 각 정본과 개발 지침(`AX_Bridge_MSSQL_Development_Guideline.md`)을 우선한다.
>
> **단, 다음 항목은 본 설계서가 정본을 상회한다** — 원본 산출물의 결함을 검증으로 확인한 결과이기 때문이다.
> - 수량(테이블 21 · FR 179 · UC 135) — `AX_Bridge_DB_API_명세서.xlsx` 변경이력의 "테이블 21종"(v1.0 시점)과 설계서 초판의 "22종"은 모두 부정확했다.
> - [부록 C](#부록-c-09_ax_bridge_fixsql-스펙) 의 결함 목록 — SQL 원본을 직접 대조해 확인한 사항이다.
> - 오류코드 50443 사문화 · 50521 중복 — `AX_Bridge_DB_API_명세서.xlsx` 개요 시트는 505xx 대역 자체를 누락하고 있다.
> - 마감연도 잠금이 `SESSION_CONTEXT` 플래그보다 **우선**한다는 사실 — `08` 의 트리거 구현이 근거다.
