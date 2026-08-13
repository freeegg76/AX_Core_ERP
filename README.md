# AX Bridge

SYSTEM / PARTNER / SALES / FINANCE 4개 도메인 내부 ERP/CRM 업무 시스템.

설계 근거는 [`AX_Bridge_시스템_설계서.md`](AX_Bridge_시스템_설계서.md), 원본 산출물은 [`Planning_Docs/`](Planning_Docs/) 를 정본으로 한다.

```
apps/api    NestJS  — 쓰기=저장프로시저(node-mssql) / 조회=Prisma  (설계서 D1·D2)
apps/web    React + Vite + Ant Design + TanStack Query + Zustand
packages/   shared-constants (코드값 사전 · 오류코드 카탈로그 자동생성)
prisma/     schema.prisma — db pull 로 역생성한다(마이그레이션 주체가 아니다)
db/         01~09 SQL — **DDL 정본**
scripts/    enable-tcp.ps1 · apply-db.mjs · seed-admin.mjs · gen-error-catalog.mjs
```

---

# 설치 (새 PC)

## 0. 사전 준비물

| 항목 | 버전 | 확인 |
|------|------|------|
| Node.js | **20 이상** | `node -v` |
| pnpm | 9 이상 | `npm i -g pnpm` → `pnpm -v` |
| SQL Server | **2016 이상** (OPENJSON · SESSION_CONTEXT 사용) | Developer/Express 판 무료 |
| sqlcmd | ODBC 18 이상 동반 설치 | `sqlcmd -?` |
| Git | — | `git --version` |

> SQL Server Express 도 동작한다. `sqlcmd` 가 없으면
> [Microsoft ODBC Driver / SQL Server 명령줄 도구](https://learn.microsoft.com/sql/tools/sqlcmd/sqlcmd-utility)를 설치한다.

## 1. 소스 받기

```bash
git clone https://github.com/freeegg76/AX_Core_ERP.git
cd AX_Core_ERP
pnpm install
```

## 2. ⚠ SQL Server TCP/IP 활성화 — 건너뛰면 반드시 실패한다

**Node 드라이버(Prisma · node-mssql)는 TCP 만 지원한다.** 공유 메모리·이름있는 파이프로는 붙지 못한다.
`sqlcmd` 는 로컬에서 공유 메모리로 잘 붙기 때문에 **DB 는 정상인데 애플리케이션만 실패**하는 형태로 드러난다.

**관리자 권한 PowerShell** 에서:

```powershell
# 명명된 인스턴스 (예: AX_BRIDGE)
.\scripts\enable-tcp.ps1 -Instance AX_BRIDGE -Port 1433

# 기본 인스턴스
.\scripts\enable-tcp.ps1
```

스크립트가 하는 일 — 인스턴스의 레지스트리 키를 **조회**해서(버전마다 `MSSQL15/16/17...` 로 다르다)
`Tcp.Enabled=1`, `IPAll.TcpPort=1433`, `TcpDynamicPorts=''` 를 설정하고 서비스를 재시작한 뒤 포트 응답을 확인한다.

GUI 를 선호하면 **SQL Server 구성 관리자** → SQL Server 네트워크 구성 → 해당 인스턴스의 프로토콜 →
TCP/IP «사용» → IP 주소 탭에서 IPAll 의 TCP 포트를 1433, 동적 포트를 비움 → 서비스 재시작.

## 3. 환경변수

```bash
cp .env.example .env
```

`.env` 를 열어 실제 값으로 바꾼다. **`.env` 는 `.gitignore` 대상이다 — 비밀번호를 `.env.example` 에 적지 않는다.**

```ini
DATABASE_URL="sqlserver://localhost:1433;database=AX_BRIDGE;user=sa;password=실제비밀번호;encrypt=true;trustServerCertificate=true"
MSSQL_SERVER=localhost
MSSQL_PORT=1433
MSSQL_DATABASE=AX_BRIDGE
MSSQL_USER=sa
MSSQL_PASSWORD=실제비밀번호

JWT_ACCESS_SECRET=...   # openssl rand -base64 48
JWT_REFRESH_SECRET=...
```

- **명명된 인스턴스라도 `localhost:포트` 형태로 쓴다.** Prisma 는 `localhost\INSTANCE` 표기를 파싱하지 못해 `P1013` 으로 실패한다.
- `sa` 대신 최소 권한 계정을 쓰려면 대상 DB 의 `db_owner` 가 필요하다(프로시저·트리거 생성 때문).

## 4. DB 구축

```bash
pnpm db:apply        # db/01 → 09 순차 적용
```

- **DB 를 미리 만들 필요 없다.** `01` 이 `IF DB_ID(N'AX_Bridge') IS NULL CREATE DATABASE` 로 직접 만든다.
  (그래서 러너는 `master` 로 접속한다.)
- **순서가 중요하다.** `08` 이 `05` 의 프로시저 8건과 `06` 의 트리거 3건을 교체한다 —
  순서가 뒤바뀌면 v3 마감연도 잠금이 소실된다.
- **재실행 주의**: `01` 은 가드 없는 `CREATE TABLE`, `07` 은 `TRUNCATE` 로 시작한다. `08`·`09` 만 멱등하다.
  이미 구축된 DB 에 일부만 다시 적용하려면 범위를 지정한다: `node scripts/apply-db.mjs --from 08 --to 09`

적용 후 기대값 — **테이블 21 · 프로시저 75 · 트리거 10 · 표준 GL seed 355행**.

```bash
sqlcmd -S localhost,1433 -d AX_BRIDGE -U sa -P '비밀번호' -C -h-1 -W -Q "SET NOCOUNT ON;
SELECT 'tables='+CAST(COUNT(*) AS varchar) FROM sys.tables;
SELECT 'procs='+CAST(COUNT(*) AS varchar) FROM sys.procedures;
SELECT 'triggers='+CAST(COUNT(*) AS varchar) FROM sys.triggers WHERE is_ms_shipped=0;"
```

## 5. 관리자 비밀번호 심기 — **필수**

```bash
node scripts/seed-admin.mjs admin
```

`01` 의 Bootstrap 은 `user_pass` 에 리터럴 플레이스홀더
`{ARGON2ID_HASH_OF_admin__SET_BY_INSTALLER}` 를 넣어 둔다. Argon2 형식이 아니라 검증이 항상 실패하므로
**이 단계를 건너뛰면 로그인이 불가능하다**(설계서 §6.3 — 설치 프로그램이 해시를 심는 것이 원래 설계다).

인자를 바꾸면 다른 초기 비밀번호를 쓸 수 있다: `node scripts/seed-admin.mjs 'S3cure!Pass'`

## 6. Prisma 클라이언트 생성

```bash
pnpm db:pull        # DB → schema.prisma 역생성
pnpm db:generate    # 클라이언트 생성
```

`prisma migrate` 는 **쓰지 않는다.** DDL 정본은 `db/*.sql` 이다(설계서 §16.1).
스키마를 바꿀 일이 있으면 새 번호의 SQL(`10`, `11`…)을 추가하고 `db:pull` 을 다시 돌린다.

## 7. 빌드 · 실행

```bash
pnpm build      # shared-constants → api → web 순서로 빌드된다(turbo 가 의존성 처리)

# API (터미널 1)
node apps/api/dist/main.js

# Web (터미널 2)
pnpm --filter @ax-bridge/web dev
```

| | 주소 |
|---|---|
| API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/v1/docs |
| Web | http://localhost:5173 |

로그인 — **`admin` / `admin`** (5단계에서 바꿨다면 그 값). 최초 로그인 후 변경을 권장한다(FR-Admin-03).

## 8. 설치 확인

1. 로그인된다
2. **FINANCE → 계정과목** 에 355건이 보인다
3. **SYSTEM → 회사 기수** 에서 기수를 등록한다(전표·초기이월의 선행 조건)
4. **FINANCE → 은행/카드 · PARTNER → 고객사 · 거래처** 를 먼저 등록한다

> ⚠ 4번은 선택이 아니다. 표준 GL 의 **자산·자본 계정에는 Layer3 플래그가 없는 계정이 하나도 없다** —
> 자산은 은행/카드+고객사+거래처 3종, 자본은 고객사+거래처 2종이 필수다(설계서 부록 C.6).
> 이 마스터 없이는 전표 라인을 저장할 수 없다.

---

# 문제 해결

| 증상 | 원인과 조치 |
|------|------------|
| `P1013 The provided database string is invalid` | `DATABASE_URL` 에 `localhost\INSTANCE` 를 썼다. `localhost:1433` 형태로 바꾼다. |
| API 기동 시 `ESOCKET` / `Failed to connect` | TCP/IP 미활성. 2단계를 수행한다. |
| 로그인이 계속 401 | 5단계(`seed-admin.mjs`)를 건너뛰었다. |
| `@prisma/client did not initialize yet` | `pnpm db:generate` 미실행. `prisma/schema.prisma` 의 `generator` 에 커스텀 `output` 을 넣지 않는다(pnpm 가상 스토어와 어긋난다). |
| SQL 적용 시 한글이 `?` 로 깨짐 | `sqlcmd -f 65001` 이 빠졌다. 스크립트는 UTF-8(BOM 없음)이다. `pnpm db:apply` 는 이미 지정한다. |
| 서비스 재시작이 «액세스가 거부되었습니다» | 관리자 권한 PowerShell 이 아니다. |
| 한글 입력이 `???` 로 저장됨 (curl 테스트) | **애플리케이션 문제가 아니다.** Git Bash 가 native 바이너리에 argv 를 넘길 때 UTF-8 을 깨뜨린다. 본문을 파일로 보낸다: `--data-binary @body.json` |

DB 조합(collation)은 서버 기본값을 따른다. 모든 표시 문자열이 `nvarchar` 이므로 한글 저장에는 영향이 없다.
다만 `LIKE` 정렬·비교 동작은 조합에 따라 달라진다.

---

# 아키텍처 핵심

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

---

# 알려진 제약

- **승인취소 기능이 없다** — 원본 75개 프로시저에 승인 관련은 `approve` 하나뿐이다. 따라서 연도 회계마감을 해제해도 기존 승인 전표는 편집할 수 없다(설계서 §9.6).
- **관리항목 상세값 개별 삭제 경로가 없다** — 수정으로만 정정한다(§9.8).
- **계약 화면은 등록·조회만 제공한다** — PK 가 복합키(`contract_id`+`contract_type`)라 공통 `MasterScreen` 의 단일키 규약과 맞지 않는다. 전용 화면이 필요하다.
- **다통화 미지원** — `default_billing_currency` 는 참고 속성이고 전표·계약에 통화 컬럼이 없다.
- **테스트 코드 미작성** — 설계서 §15 의 테스트 전략은 구조만 잡혀 있다.
