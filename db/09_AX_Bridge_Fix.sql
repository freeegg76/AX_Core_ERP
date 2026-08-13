/*==============================================================================
  AX Bridge - 09. 결함 수정 · 무결성 보강 Script (MSSQL / DB명 : AX_Bridge)
  근거 : AX_Bridge_시스템_설계서.md 부록 C (설계결정 D3 · D5 · D7 · D8)

  적용 원칙
    · 01~08 은 납품 원본으로 동결한다. 모든 수정은 본 스크립트에 집약한다.
      예외 1건 — 01 의 FK 길이 불일치(partner_client.collecting_type /
      partner_vendor.payment_type varchar(50)→varchar(10))는 테이블이 생성조차
      되지 않아 여기서 ALTER 할 대상이 없으므로 01 에서 직접 수정했다.
    · 본 스크립트는 멱등(idempotent)하다. 반복 실행해도 안전하다.
    · D5 범위 = 버그 + 무결성만. 단순 열거형 CHECK 8종(gl_type·gl_detail·
      pipeline_type·stage·activity type·contract_type·contract status·ledger_type)은
      Domain Enum + 프로시저 검증에 위임하며 추가하지 않는다.
    · D7 에 따라 finance_open_balance.amount 에 >= 0 CHECK 를 추가하지 않는다
      (연도마감 자동생성 이월은 음수가 될 수 있다).

  변경 요약
    [DDL]  1-1 finance_open_balance PRIMARY KEY 신설 (기존 힙 → PK)
           1-2 finance_bank_account 계좌 XOR 카드 CHECK 완성 (둘 다 NULL 금지)
           1-3 finance_bank_account 회사 내 계좌·카드번호 중복 금지
           1-4 finance_dimension_detail 동일 항목 내 값 중복 금지
           1-5 finance_open_balance.source 신설 (MANUAL / CLOSING) — 마감해제 선결
           1-6 finance_ledger_head.approved_date → datetime2(0) (D8)
    [PROC] 2-1 usp_finance_dimension_delete      비원자적 DELETE 2회 → 트랜잭션화
           2-2 usp_finance_gl_generate_standard  @@ROWCOUNT 포착 위치 오류 수정
           2-3 usp_sales_activity_save           activity_id 채번 경합 방지
           2-4 usp_auth_change_password          표준 트랜잭션 템플릿 적용
           2-5 usp_finance_ledger_approve        approved_date 초 단위 기록 (1-6 동반)
           2-6 usp_finance_closing_execute       자동생성 이월에 source='CLOSING' 기록
    [NEW]  3-1 usp_finance_closing_reopen        연도 회계마감 해제 (ADMIN, D4)
                                                 오류코드 50531~50535

  선행조건 : 01~08 스크립트 적용 완료 상태에서 실행
==============================================================================*/
USE AX_Bridge;
GO
SET NOCOUNT ON;
GO

/*==================== 1. DDL 무결성 보강 (D5 범위) ==========================*/

-- 1-1. finance_open_balance PRIMARY KEY 신설
--   원본 01 은 이 테이블에 PK 를 선언하지 않아 힙(heap)이며, 유일성은 08 이 만든
--   UX_open_balance 유니크 인덱스로만 보장된다. 동일 컬럼 집합을 PK 로 승격한다.
--   (bank_key/client_key/vendor_key 는 ISNULL(...,'-') PERSISTED 계산컬럼 —
--    결정적이며 NULL 이 될 수 없어 PK 구성이 가능하다.)
--   ※ 환경 제약으로 계산컬럼 PK 가 거부되면 아래를 대신 사용한다:
--     CREATE UNIQUE CLUSTERED INDEX UX_open_balance ON dbo.finance_open_balance
--       (company_id, entity_id, company_year_id, gl_id, DRCR, bank_key, client_key, vendor_key);
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints
               WHERE name = 'PK_finance_open_balance'
                 AND parent_object_id = OBJECT_ID('dbo.finance_open_balance'))
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_open_balance'
                 AND object_id = OBJECT_ID('dbo.finance_open_balance'))
        DROP INDEX UX_open_balance ON dbo.finance_open_balance;

    ALTER TABLE dbo.finance_open_balance ADD CONSTRAINT PK_finance_open_balance
        PRIMARY KEY CLUSTERED (company_id, entity_id, company_year_id, gl_id, DRCR,
                               bank_key, client_key, vendor_key);
END
GO

-- 1-2. finance_bank_account : 계좌 XOR 카드 완성 (FR-Bank-05)
--   원본 CK_bank_shape = NOT (둘 다 NOT NULL) → "둘 다 NULL" 이 합법이었다.
--   "둘 중 하나 필수" 는 프로시저 검증에만 존재했으므로 DDL 로 승격한다.
IF EXISTS (SELECT 1 FROM dbo.finance_bank_account
           WHERE bank_account IS NULL AND card_number IS NULL)
    THROW 59001, N'[09] finance_bank_account 에 계좌·카드가 모두 비어 있는 행이 있습니다. 정리 후 다시 실행하세요.', 1;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_bank_shape' AND parent_object_id = OBJECT_ID('dbo.finance_bank_account'))
    ALTER TABLE dbo.finance_bank_account DROP CONSTRAINT CK_bank_shape;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_bank_one' AND parent_object_id = OBJECT_ID('dbo.finance_bank_account'))
    ALTER TABLE dbo.finance_bank_account ADD CONSTRAINT CK_bank_one CHECK (
        (bank_account IS NOT NULL AND card_number IS NULL) OR
        (bank_account IS NULL     AND card_number IS NOT NULL));
GO

-- 1-3. finance_bank_account : 회사 내 계좌번호·카드번호 중복 금지 (FR-Bank-03·04)
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_bank_account' AND object_id = OBJECT_ID('dbo.finance_bank_account'))
    CREATE UNIQUE INDEX UX_bank_account ON dbo.finance_bank_account
        (company_id, entity_id, bank_account) WHERE bank_account IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_bank_card' AND object_id = OBJECT_ID('dbo.finance_bank_account'))
    CREATE UNIQUE INDEX UX_bank_card ON dbo.finance_bank_account
        (company_id, entity_id, card_number) WHERE card_number IS NOT NULL;
GO

-- 1-4. finance_dimension_detail : 동일 관리항목 내 값 중복 금지 (FR-Dim-09)
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UX_dim_value' AND object_id = OBJECT_ID('dbo.finance_dimension_detail'))
    CREATE UNIQUE INDEX UX_dim_value ON dbo.finance_dimension_detail
        (company_id, entity_id, dimension_id, dimension_value) WHERE dimension_value IS NOT NULL;
GO

-- 1-5. finance_open_balance.source 신설 — 연도 회계마감 해제(3-1)의 선결 조건
--   원본에는 행의 출처를 구분하는 컬럼이 없어(FR-Close-09 가 명시) 마감 자동생성분을
--   식별할 수 없었다. 이 컬럼이 있어야 해제 시 회수 대상을 특정할 수 있다.
--   기존 행은 DEFAULT 'MANUAL' 로 채워진다 — 안전한 방향이다. 컬럼 도입 전에
--   생성된 자동생성분은 MANUAL 로 남아 해제가 50534 로 차단되며, 조용히 삭제되지 않는다.
IF COL_LENGTH('dbo.finance_open_balance', 'source') IS NULL
    ALTER TABLE dbo.finance_open_balance ADD source varchar(10) NOT NULL
        CONSTRAINT DF_ob_source DEFAULT ('MANUAL');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_ob_source' AND parent_object_id = OBJECT_ID('dbo.finance_open_balance'))
    ALTER TABLE dbo.finance_open_balance ADD CONSTRAINT CK_ob_source
        CHECK (source IN ('MANUAL', 'CLOSING'));
GO

-- 1-6. finance_ledger_head.approved_date → datetime2(0)  (D8)
--   승인은 감사 대상 행위이므로 일 단위로는 부족하다. 업무일자인 insert_date /
--   update_date / closed_date / closing_date 는 date 를 유지한다.
--   date → datetime2 는 확장 변환이므로 기존 데이터는 자정 시각으로 보존된다.
--   ※ 2-5 (usp_finance_ledger_approve) 를 반드시 함께 적용해야 초 단위가 실제로 기록된다.
IF EXISTS (SELECT 1 FROM sys.columns c
           JOIN sys.types t ON t.user_type_id = c.user_type_id
           WHERE c.object_id = OBJECT_ID('dbo.finance_ledger_head')
             AND c.name = 'approved_date' AND t.name = 'date')
    ALTER TABLE dbo.finance_ledger_head ALTER COLUMN approved_date datetime2(0) NULL;
GO


/*==================== 2. 프로시저 결함 수정 =================================*/

-- 2-1. usp_finance_dimension_delete : 비원자성 수정
--   원본은 DELETE 2회(상세값 → 마스터)를 트랜잭션·XACT_ABORT 없이 실행했다.
--   두 번째가 실패하면 finance_dimension_detail 고아행이 남는다.
--   검증 로직(50427/50428)은 원본과 동일하게 유지한다.
CREATE OR ALTER PROCEDURE dbo.usp_finance_dimension_delete
    @company_id varchar(10), @entity_id varchar(10), @dimension_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-Dim-09 : 계정/전표 참조 시 물리삭제 금지(해당 Slot 플래그 사용 여부 확인)
        DECLARE @slot tinyint = (SELECT slot_no FROM dbo.finance_dimension WITH (UPDLOCK, HOLDLOCK)
                                  WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id);
        IF @slot IS NULL THROW 50427, N'대상 관리항목이 없습니다.', 1;
        IF EXISTS (SELECT 1 FROM dbo.finance_GL
                    WHERE company_id=@company_id AND entity_id=@entity_id
                      AND ((@slot=1 AND dimension1=1) OR (@slot=2 AND dimension2=1) OR (@slot=3 AND dimension3=1)
                        OR (@slot=4 AND dimension4=1) OR (@slot=5 AND dimension5=1)))
           OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail
                    WHERE company_id=@company_id AND entity_id=@entity_id
                      AND ((@slot=1 AND dimension1 IS NOT NULL) OR (@slot=2 AND dimension2 IS NOT NULL)
                        OR (@slot=3 AND dimension3 IS NOT NULL) OR (@slot=4 AND dimension4 IS NOT NULL)
                        OR (@slot=5 AND dimension5 IS NOT NULL)))
            THROW 50428, N'계정과목/전표에서 참조 중인 관리항목은 삭제할 수 없습니다. 미사용 전환을 이용하세요.', 1;
        DELETE dbo.finance_dimension_detail WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id;
        DELETE dbo.finance_dimension        WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO

-- 2-2. usp_finance_gl_generate_standard : inserted_count 오류 수정
--   원본은 SELECT @@ROWCOUNT 를 sp_set_session_context 와 COMMIT 뒤에서 실행해
--   항상 무의미한 값을 반환했다. INSERT 직후에 포착하도록 바꾼다.
--   그 외 로직(전표 존재 차단 50411 / seed 부재 50412 / bypass 플래그 / 트랜잭션)은 원본과 동일.
CREATE OR ALTER PROCEDURE dbo.usp_finance_gl_generate_standard
    @company_id varchar(10), @entity_id varchar(10)   -- 반드시 로그인 세션 값(서버 주입). 임의 대상 실행 금지(FR-GL-11)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @inserted int = 0;
    BEGIN TRY
        BEGIN TRAN;
        -- 1) 전표 존재 최종확인(승인여부·타입 무관, FR-GL-12)
        IF EXISTS (SELECT 1 FROM dbo.finance_ledger_head WITH (UPDLOCK, HOLDLOCK)
                    WHERE company_id=@company_id AND entity_id=@entity_id)
            THROW 50411, N'전표가 존재하는 회사는 계정과목 생성 기능을 사용할 수 없습니다.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_GL_seed)
            THROW 50412, N'표준 GL seed 데이터가 준비되어 있지 않습니다.', 1;
        -- 2) 기존 계정과목 전체 삭제 (참조보호 트리거 우회 플래그 : 전표 없음이 확인된 상태)
        EXEC sys.sp_set_session_context @key = N'ax_bypass_gl_protect', @value = 1;
        DELETE dbo.finance_GL WHERE company_id=@company_id AND entity_id=@entity_id;
        -- 3) 표준 GL seed 일괄 INSERT — company/entity 만 로그인 세션 값으로 치환(FR-GL-13)
        INSERT dbo.finance_GL (company_id, entity_id, gl_id, gl_name, gl_type, gl_category1, gl_category2, vat_gl,
            gl_detail, contra_gl, status, bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
            dimension1, dimension2, dimension3, dimension4, dimension5, due_date)
        SELECT @company_id, @entity_id, gl_id, gl_name, gl_type, gl_category1, gl_category2, vat_gl,
            gl_detail, contra_gl, status, bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
            dimension1, dimension2, dimension3, dimension4, dimension5, due_date
        FROM dbo.finance_GL_seed;
        SET @inserted = @@ROWCOUNT;          -- [수정] INSERT 직후에 포착
        EXEC sys.sp_set_session_context @key = N'ax_bypass_gl_protect', @value = NULL;
        COMMIT;   -- 실패 시 CATCH 에서 전체 ROLLBACK → 기존 계정과목 보존(FR-GL-14)
        SELECT @inserted AS inserted_count;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        EXEC sys.sp_set_session_context @key = N'ax_bypass_gl_protect', @value = NULL;
        THROW;
    END CATCH
END
GO

-- 2-3. usp_sales_activity_save : activity_id 채번 경합 방지
--   원본은 'ACT'+FORMAT(SYSDATETIME(),'yyMMddHHmmssff') 를 잠금 없이 1회 생성하고
--   충돌 시 THROW 50323 으로 실패했다. 해상도가 1/100초여서 동시 등록이 겹칠 수 있다.
--   → 충돌 시 2자리 일련번호를 덧붙여 재시도한다(15자 + 2자 = 17자, varchar(20) 이내).
--     WAITFOR 를 쓰지 않으므로 트랜잭션 내 잠금 보유시간이 늘지 않는다.
--   사용자가 activity_id 를 직접 지정한 경우의 중복 오류(50323)는 원본 동작을 유지한다.
CREATE OR ALTER PROCEDURE dbo.usp_sales_activity_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10),
    @activity_id varchar(20) = NULL OUTPUT,   -- NULL : 시스템 생성(FR-Act-03)
    @type varchar(30)='0', @content nvarchar(250)=NULL,
    @incharge nvarchar(100)=NULL, @attached varchar(250)=NULL, @created_date date=NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @type NOT IN ('0','1','2','3') THROW 50321, N'허용되지 않은 활동 타입입니다.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.sales_pipeline WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id)
            THROW 50322, N'대상 파이프라인이 존재하지 않습니다.', 1;
        IF @mode='I'
        BEGIN
            IF @activity_id IS NULL
            BEGIN   -- [수정] 시스템 생성 : 충돌 시 일련번호 덧붙여 재시도
                DECLARE @base varchar(20) = 'ACT' + FORMAT(SYSDATETIME(), 'yyMMddHHmmssff');
                DECLARE @try  int = 0;
                SET @activity_id = @base;
                WHILE EXISTS (SELECT 1 FROM dbo.sales_pipeline_detail WITH (UPDLOCK, HOLDLOCK)
                               WHERE company_id=@company_id AND entity_id=@entity_id
                                 AND pipeline_id=@pipeline_id AND activity_id=@activity_id)
                BEGIN
                    SET @try += 1;
                    IF @try > 99
                        THROW 50323, N'액티비티 코드 채번에 실패했습니다. 잠시 후 다시 시도하세요.', 1;
                    SET @activity_id = @base + RIGHT('0' + CONVERT(varchar(2), @try), 2);
                END
            END
            ELSE IF EXISTS (SELECT 1 FROM dbo.sales_pipeline_detail
                             WHERE company_id=@company_id AND entity_id=@entity_id
                               AND pipeline_id=@pipeline_id AND activity_id=@activity_id)
                THROW 50323, N'이미 존재하는 액티비티 코드입니다.', 1;
            INSERT dbo.sales_pipeline_detail (company_id, entity_id, pipeline_id, activity_id, created_date, [type], content, incharge, attached)
            VALUES (@company_id, @entity_id, @pipeline_id, @activity_id,
                    ISNULL(@created_date, CONVERT(date, GETDATE())), @type, @content, @incharge, @attached); -- FR-Act-04
        END
        ELSE
        BEGIN  -- activity_id/상위 파이프라인 수정 불가(FR-Act-05)
            UPDATE dbo.sales_pipeline_detail
               SET [type]=@type, content=@content, incharge=@incharge, attached=@attached
             WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id AND activity_id=@activity_id;
            IF @@ROWCOUNT=0 THROW 50324, N'수정 대상 액티비티가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO

-- 2-4. usp_auth_change_password : 표준 트랜잭션 템플릿 적용
--   원본은 XACT_ABORT·TRY/CATCH 없이 UPDATE 후 THROW 하는 구조였다. 현재는 단일문이라
--   무해하지만 문장이 추가되면 부분 커밋 위험이 생긴다. 검증·오류코드는 원본과 동일.
CREATE OR ALTER PROCEDURE dbo.usp_auth_change_password
    @company_id varchar(10), @entity_id varchar(10), @employee_id varchar(10),
    @new_pass_hash varchar(255)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF NULLIF(LTRIM(RTRIM(@new_pass_hash)),'') IS NULL
            THROW 50001, N'새 비밀번호 해시가 비어 있습니다.', 1;
        UPDATE dbo.system_employee
           SET user_pass = @new_pass_hash, last_manual_edit_at = SYSDATETIME()
         WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id
           AND user_yn = 1;                  -- user_yn=N 이면 변경 기능 제공 안 함(FR-Emp-05)
        IF @@ROWCOUNT = 0 THROW 50002, N'대상 사용자 계정이 없거나 사용자 여부가 N 입니다.', 1;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO

-- 2-5. usp_finance_ledger_approve : approved_date 초 단위 기록 (1-6 동반 필수)
--   원본은 approved_date=CONVERT(date, GETDATE()) 였다. 1-6 으로 컬럼을 datetime2(0) 로
--   넓혀도 이 문장을 그대로 두면 자정 시각만 저장되어 D8 의 의미가 사라진다.
--   그 외 로직(마감연도 검증 / 50471·50472·50473 / ax_ledger_approve 플래그)은 08 과 동일.
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_approve
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2),
    @approver_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        EXEC dbo.usp_finance_check_year_open @company_id, @entity_id, @ledger_date;  -- 마감연도 승인 불가(FR-Ledger-16)
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_ledger_head WITH (UPDLOCK)
                        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no
                          AND approval_status=0)
            THROW 50471, N'승인 대상 미승인 전표가 없습니다.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_ledger_detail
                        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no)
            THROW 50472, N'전표 라인이 없어 승인할 수 없습니다.', 1;
        DECLARE @dr numeric(18,2), @cr numeric(18,2);
        SELECT @dr = ISNULL(SUM(CASE WHEN DRCR='1' THEN amount END),0),
               @cr = ISNULL(SUM(CASE WHEN DRCR='2' THEN amount END),0)
        FROM dbo.finance_ledger_detail
        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;
        IF @dr <> @cr
        BEGIN
            DECLARE @msg nvarchar(200) = N'차변합계와 대변합계가 일치하지 않습니다. 차액: ' + FORMAT(@dr-@cr, 'N2');
            THROW 50473, @msg, 1;
        END
        EXEC sys.sp_set_session_context @key = N'ax_ledger_approve', @value = 1;
        UPDATE dbo.finance_ledger_head
           SET approval_status=1, approver_Id=@approver_id, approved_date=SYSDATETIME()   -- [수정] 초 단위 기록(D8)
         WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;
        EXEC sys.sp_set_session_context @key = N'ax_ledger_approve', @value = NULL;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        EXEC sys.sp_set_session_context @key = N'ax_ledger_approve', @value = NULL;
        THROW;
    END CATCH
END
GO

-- 2-6. usp_finance_closing_execute : 자동생성 이월에 source='CLOSING' 기록
--   3-1 (마감해제)이 회수 대상을 특정할 수 있게 하는 유일한 근거다.
--   선행검증 6종(50511~50516)·이월 계산식·MERGE·반환 결과셋은 08 과 완전히 동일하다.
--   변경점은 INSERT 의 컬럼 목록에 source 를 추가하고 'CLOSING' 을 넣는 것뿐이다.
CREATE OR ALTER PROCEDURE dbo.usp_finance_closing_execute
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @yy int, @next_year_id varchar(10), @msg nvarchar(300);

        -- [검증1] 대상 기수 존재 (FR-Close-03)
        SELECT @yy = CONVERT(int, actual_year)
        FROM dbo.system_year WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        IF @yy IS NULL THROW 50511, N'대상 기수가 존재하지 않습니다.', 1;

        -- [검증2] 재마감 불가 (FR-Close-02)
        IF EXISTS (SELECT 1 FROM dbo.finance_closing
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closing=1)
            THROW 50512, N'이미 마감된 연도입니다. 재마감할 수 없습니다.', 1;

        -- [검증3] 선행연도 마감 완료 (FR-Close-03 : 이른 연도부터 순차)
        IF EXISTS (SELECT 1 FROM dbo.system_year p
                   LEFT JOIN dbo.finance_closing pc
                     ON pc.company_id=p.company_id AND pc.entity_id=p.entity_id AND pc.company_year_id=p.company_year_id
                   WHERE p.company_id=@company_id AND p.entity_id=@entity_id
                     AND CONVERT(int, p.actual_year) < @yy AND ISNULL(pc.closing,0)=0)
            THROW 50513, N'선행연도가 미마감 상태입니다. 이른 연도부터 순차로 마감하세요.', 1;

        -- [검증4] 차년도 기수 존재 (FR-Close-03)
        SELECT @next_year_id = company_year_id
        FROM dbo.system_year
        WHERE company_id=@company_id AND entity_id=@entity_id AND CONVERT(int, actual_year)=@yy+1;
        IF @next_year_id IS NULL
            THROW 50514, N'차년도 기수(system_year)가 등록되어 있지 않습니다. 차년도 기수 등록 후 실행하세요.', 1;

        -- [검증5] 대상연도 미승인 전표 없음 — 잔액계산은 승인(Y) 전표만 포함 (FR-Close-04)
        DECLARE @open_cnt int = (SELECT COUNT(*) FROM dbo.finance_ledger_head
                                  WHERE company_id=@company_id AND entity_id=@entity_id
                                    AND YEAR(ledger_date)=@yy AND approval_status=0);
        IF @open_cnt > 0
        BEGIN
            SET @msg = FORMAT(@yy,'0') + N'년에 미승인 전표 ' + CONVERT(nvarchar(10), @open_cnt)
                     + N'건이 존재하여 마감할 수 없습니다. 승인 또는 정리 후 다시 실행하세요.';
            THROW 50515, @msg, 1;
        END

        -- [검증6] 차년도 초기이월 미존재 (FR-Close-09)
        IF EXISTS (SELECT 1 FROM dbo.finance_open_balance
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@next_year_id)
            THROW 50516, N'차년도에 초기이월 데이터가 이미 존재합니다. 기존 데이터 확인/정리 후 다시 실행하세요.', 1;

        -- [산출] 조합별 이월잔액 (FR-Close-05~08)
        --   자산(gl_type=0)      : 전년 이월 + 당해 차변 − 당해 대변 → DRCR=1 이월
        --   부채(1)·자본(2)      : 전년 이월 + 당해 대변 − 당해 차변 → DRCR=2 이월
        --   수익~법인세(3~10)   : 이월 제외 / 잔액 0 조합 미생성
        --   집계 단위            : gl_id + bank_id + client_id + vendor_id
        ;WITH gl AS (
            SELECT gl_id, TRY_CONVERT(int, gl_type) AS t
            FROM dbo.finance_GL
            WHERE company_id=@company_id AND entity_id=@entity_id AND TRY_CONVERT(int, gl_type) BETWEEN 0 AND 2
        ),
        prior AS (   -- 전년(=당해연도) 초기이월
            SELECT ob.gl_id, ob.bank_key, ob.client_key, ob.vendor_key,
                   SUM(CASE WHEN ob.DRCR='1' THEN ob.amount ELSE -ob.amount END) AS net_dr
            FROM dbo.finance_open_balance ob
            JOIN gl ON gl.gl_id=ob.gl_id
            WHERE ob.company_id=@company_id AND ob.entity_id=@entity_id AND ob.company_year_id=@company_year_id
            GROUP BY ob.gl_id, ob.bank_key, ob.client_key, ob.vendor_key
        ),
        cur AS (     -- 당해연도 승인 전표 합계
            SELECT d.gl_id, ISNULL(d.bank_id,'-') AS bank_key, ISNULL(d.client_id,'-') AS client_key, ISNULL(d.vendor_id,'-') AS vendor_key,
                   SUM(CASE WHEN d.DRCR='1' THEN d.amount ELSE -d.amount END) AS net_dr
            FROM dbo.finance_ledger_detail d
            JOIN dbo.finance_ledger_head h
              ON h.company_id=d.company_id AND h.entity_id=d.entity_id AND h.ledger_date=d.ledger_date AND h.ledger_no=d.ledger_no
            JOIN gl ON gl.gl_id=d.gl_id
            WHERE d.company_id=@company_id AND d.entity_id=@entity_id
              AND YEAR(d.ledger_date)=@yy AND h.approval_status=1
            GROUP BY d.gl_id, ISNULL(d.bank_id,'-'), ISNULL(d.client_id,'-'), ISNULL(d.vendor_id,'-')
        ),
        merged AS (
            SELECT COALESCE(p.gl_id, c.gl_id) AS gl_id,
                   COALESCE(p.bank_key, c.bank_key) AS bank_key,
                   COALESCE(p.client_key, c.client_key) AS client_key,
                   COALESCE(p.vendor_key, c.vendor_key) AS vendor_key,
                   ISNULL(p.net_dr,0) + ISNULL(c.net_dr,0) AS net_dr   -- 차변(+)/대변(−) 순액
            FROM prior p
            FULL OUTER JOIN cur c
              ON c.gl_id=p.gl_id AND c.bank_key=p.bank_key AND c.client_key=p.client_key AND c.vendor_key=p.vendor_key
        )
        INSERT dbo.finance_open_balance (company_id, entity_id, company_year_id, gl_id, DRCR, bank_id, client_id, vendor_id, amount, closed, source)
        SELECT @company_id, @entity_id, @next_year_id, m.gl_id,
               CASE WHEN g.t=0 THEN '1' ELSE '2' END,                              -- 자산=차변 / 부채·자본=대변
               NULLIF(m.bank_key,'-'), NULLIF(m.client_key,'-'), NULLIF(m.vendor_key,'-'),
               CASE WHEN g.t=0 THEN m.net_dr ELSE -m.net_dr END,                   -- 이월 방향 기준 잔액(D7 : 음수 허용)
               1,                                                                   -- 자동생성분 closed=Y 보호(FR-Close-08)
               'CLOSING'                                                            -- [수정] 출처 기록 — 마감해제 시 회수 대상 식별
        FROM merged m
        JOIN gl g ON g.gl_id=m.gl_id
        WHERE CASE WHEN g.t=0 THEN m.net_dr ELSE -m.net_dr END <> 0;               -- 0 잔액 조합 미생성

        DECLARE @carried int = @@ROWCOUNT;

        -- [확정] finance_closing 기록 (FR-Close-10)
        MERGE dbo.finance_closing AS tgt
        USING (SELECT @company_id a, @entity_id b, @company_year_id c) src ON tgt.company_id=src.a AND tgt.entity_id=src.b AND tgt.company_year_id=src.c
        WHEN MATCHED THEN UPDATE SET closing=1, closing_date=CONVERT(date, GETDATE())
        WHEN NOT MATCHED THEN INSERT (company_id, entity_id, company_year_id, closing, closing_date)
                              VALUES (@company_id, @entity_id, @company_year_id, 1, CONVERT(date, GETDATE()));
        COMMIT;
        SELECT @company_year_id AS closed_year_id, @next_year_id AS next_year_id, @carried AS carried_rows;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO


/*============== 3. 신규 : 연도 회계마감 해제 (D4, ADMIN 전용) ================*/

-- 3-1. usp_finance_closing_reopen
--   원본 산출물에는 회계마감을 되돌리는 경로가 없었다(재마감 불가·마감연도 조회만).
--   마감은 actual_year 오름차순 순차이므로 해제는 내림차순 순차여야 한다.
--
--   트리거 상호작용 (06/08 trg_finance_open_balance_protect)
--     · 회수 대상은 "차년도" 초기이월 행이다. 검증 50533 이 후행 연도의 미마감을
--       보장하므로 마감연도 잠금(51054)은 발생하지 않는다.
--     · 그러나 대상 행은 closed=1 이므로 확정분 보호(51031)를 통과하려면
--       ax_openbal_admin 플래그가 반드시 필요하다.
--     · closing=0 을 먼저 UPDATE 하는 것은 트리거 요구사항이 아니라 의도된 순서다
--       (대상연도 자신의 이월까지 손대는 확장이 생기면 그때는 순서가 강제된다).
--
--   ※ 이 프로시저는 ax_openbal_admin 을 사용하므로 반드시 단일 커넥션에서 실행해야 한다.
CREATE OR ALTER PROCEDURE dbo.usp_finance_closing_reopen
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @yy int, @next_year_id varchar(10), @msg nvarchar(300), @removed int = 0;

        -- [검증1] 대상 기수 존재
        SELECT @yy = CONVERT(int, actual_year)
        FROM dbo.system_year WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        IF @yy IS NULL THROW 50531, N'대상 기수가 존재하지 않습니다.', 1;

        -- [검증2] 마감 상태여야 해제 가능
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_closing WITH (UPDLOCK, HOLDLOCK)
                        WHERE company_id=@company_id AND entity_id=@entity_id
                          AND company_year_id=@company_year_id AND closing=1)
            THROW 50532, N'마감되지 않은 연도입니다. 해제할 대상이 없습니다.', 1;

        -- [검증3] 후행 연도가 마감되어 있으면 해제 불가 (해제는 늦은 연도부터 내림차순 순차)
        IF EXISTS (SELECT 1 FROM dbo.system_year n
                   JOIN dbo.finance_closing nc
                     ON nc.company_id=n.company_id AND nc.entity_id=n.entity_id AND nc.company_year_id=n.company_year_id
                   WHERE n.company_id=@company_id AND n.entity_id=@entity_id
                     AND CONVERT(int, n.actual_year) > @yy AND nc.closing=1)
            THROW 50533, N'후행 연도가 마감된 상태입니다. 늦은 연도부터 순차로 해제하세요.', 1;

        SELECT @next_year_id = company_year_id
        FROM dbo.system_year
        WHERE company_id=@company_id AND entity_id=@entity_id AND CONVERT(int, actual_year)=@yy+1;

        IF @next_year_id IS NOT NULL
        BEGIN
            -- [검증4] 차년도에 수기 입력 초기이월이 있으면 해제 불가 (수기분 유실 방지)
            IF EXISTS (SELECT 1 FROM dbo.finance_open_balance
                        WHERE company_id=@company_id AND entity_id=@entity_id
                          AND company_year_id=@next_year_id AND source='MANUAL')
                THROW 50534, N'차년도 초기이월에 수기 입력분이 존재하여 해제할 수 없습니다. 해당 데이터를 먼저 정리하세요.', 1;

            -- [검증5] 차년도에 전표가 있으면 해제 불가 (이월 잔액이 이미 사용됨)
            DECLARE @next_ledger int = (SELECT COUNT(*) FROM dbo.finance_ledger_head
                                         WHERE company_id=@company_id AND entity_id=@entity_id
                                           AND YEAR(ledger_date)=@yy+1);
            IF @next_ledger > 0
            BEGIN
                SET @msg = FORMAT(@yy+1,'0') + N'년에 전표 ' + CONVERT(nvarchar(10), @next_ledger)
                         + N'건이 존재하여 마감을 해제할 수 없습니다. 차년도 전표를 먼저 정리하세요.';
                THROW 50535, @msg, 1;
            END
        END

        -- ① 마감 해제 (선행) — 이 시점에 대상연도의 전표·초기이월 잠금이 풀린다
        UPDATE dbo.finance_closing
           SET closing = 0, closing_date = NULL
         WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;

        -- ②~④ 차년도 자동생성 이월 회수 (closed=1 보호를 통과하기 위해 플래그 필요)
        IF @next_year_id IS NOT NULL
        BEGIN
            EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = 1;
            DELETE dbo.finance_open_balance
             WHERE company_id=@company_id AND entity_id=@entity_id
               AND company_year_id=@next_year_id AND source='CLOSING';
            SET @removed = @@ROWCOUNT;
            EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;
        END

        COMMIT;
        SELECT @company_year_id AS reopened_year_id, @next_year_id AS next_year_id, @removed AS removed_rows;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;   -- 플래그 누출 방지
        THROW;
    END CATCH
END
GO

PRINT N'[09_AX_Bridge_Fix] 적용 완료 — DDL 6건 · 프로시저 수정 6건 · 신규 1건';
GO
