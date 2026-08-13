/*==============================================================================
  AX Bridge - 08. FINANCE v3.0 개정 반영 Update Script (MSSQL / DB명 : AX_Bridge)
  근거 : AX_Bridge_FINANCE_화면기획서 v3.0 (10차 개정 — 마감관리·연도이월·초기이월 bank_id)
  변경 요약
    [DDL]  ① finance_closing 신설 (연도 회계마감 : closing Y/N, closing_date)
           ② finance_open_balance.bank_id 추가 (은행/카드 보조잔액, FR-OpenBal-05)
              → 유일성 조합 확장 : 회사/기수/계정/차대/은행·카드/고객사/거래처
    [PROC] 신규   usp_finance_closing_list      (FR-Close-01, UC-Close-01)
           신규   usp_finance_closing_execute   (FR-Close-02~10, UC-Close-02~06)
           수정   usp_finance_openbalance_list / save / close / reopen
                  (bank_id 반영 · 확정 개념 분리 · 마감연도/자동생성분 해제 불가)
           수정   usp_finance_ledger_head_save / detail_save / approve / delete
                  (마감연도 전표 신규/수정/삭제/승인 차단, FR-Ledger-16)
    [TRG]  신규   trg_finance_ledger_head_closing_lock (마감연도 헤더 INSERT 차단)
           교체   trg_finance_ledger_detail_protect    (마감연도 라인 DML 차단 추가)
           교체   trg_finance_open_balance_protect     (마감연도 초기이월 잠금 추가)
    선행조건 : 01~07 스크립트 적용 완료 상태에서 실행
==============================================================================*/
USE AX_Bridge;
GO

/*============================== 1. DDL 변경 =================================*/
-- 1-1. finance_closing 신설 (행 없으면 미마감으로 간주, FR-Close-01)
IF OBJECT_ID(N'dbo.finance_closing') IS NULL
BEGIN
    CREATE TABLE dbo.finance_closing (
        company_id      varchar(10) NOT NULL,
        entity_id       varchar(10) NOT NULL,
        company_year_id varchar(10) NOT NULL,
        closing         bit NOT NULL CONSTRAINT DF_closing DEFAULT (1), -- 1:Y 마감, 0:N
        closing_date    date NULL,                                      -- 마감 실행 서버일자(FR-Close-10)
        CONSTRAINT PK_finance_closing PRIMARY KEY (company_id, entity_id, company_year_id),
        CONSTRAINT FK_closing_year FOREIGN KEY (company_id, entity_id, company_year_id)
            REFERENCES dbo.system_year(company_id, entity_id, company_year_id)
    );
END
GO
-- 1-2. finance_open_balance.bank_id 추가 + 유일성 조합 확장 (FR-OpenBal-05)
IF COL_LENGTH('dbo.finance_open_balance','bank_id') IS NULL
BEGIN
    ALTER TABLE dbo.finance_open_balance ADD bank_id varchar(10) NULL;
END
GO
IF COL_LENGTH('dbo.finance_open_balance','bank_key') IS NULL
BEGIN
    ALTER TABLE dbo.finance_open_balance ADD bank_key AS ISNULL(bank_id,'-') PERSISTED;
END
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_open_balance' AND object_id=OBJECT_ID('dbo.finance_open_balance'))
    DROP INDEX UX_open_balance ON dbo.finance_open_balance;
GO
CREATE UNIQUE INDEX UX_open_balance
    ON dbo.finance_open_balance(company_id, entity_id, company_year_id, gl_id, DRCR, bank_key, client_key, vendor_key);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_ob_bank')
    ALTER TABLE dbo.finance_open_balance ADD CONSTRAINT FK_ob_bank
        FOREIGN KEY (company_id, entity_id, bank_id) REFERENCES dbo.finance_bank_account(company_id, entity_id, bank_id);
GO

/*=================== 2. 공통 헬퍼 : 마감연도 검증 (FR-Ledger-16) =============*/
-- 전표일자(또는 연도)가 회계마감(closing=Y)이면 THROW. 전표 CUD/승인 프로시저에서 공통 호출.
CREATE OR ALTER PROCEDURE dbo.usp_finance_check_year_open
    @company_id varchar(10), @entity_id varchar(10), @target_date date
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1
               FROM dbo.finance_closing c
               JOIN dbo.system_year y
                 ON y.company_id=c.company_id AND y.entity_id=c.entity_id AND y.company_year_id=c.company_year_id
               WHERE c.company_id=@company_id AND c.entity_id=@entity_id
                 AND c.closing=1 AND CONVERT(int, y.actual_year)=YEAR(@target_date))
        THROW 50501, N'회계마감(closing=Y)된 연도의 전표는 신규/수정/삭제/승인할 수 없습니다. 조회만 가능합니다.', 1;
END
GO

/*==================== 3. 마감관리 신규 프로시저 (SCR-FIN-06) =================*/
-- FR-Close-01 / UC-Close-01 : 기수·연도별 회계마감 현황 (행 없으면 N·공란)
CREATE OR ALTER PROCEDURE dbo.usp_finance_closing_list
    @company_id varchar(10), @entity_id varchar(10),
    @closing bit = NULL           -- NULL:전체, 1:마감, 0:미마감
AS
BEGIN
    SET NOCOUNT ON;
    SELECT y.company_year_id, y.company_year, y.actual_year,
           ISNULL(c.closing, 0) AS closing,
           c.closing_date,
           -- 후행 마감 제한 표시용 : 더 이른 연도 중 미마감 존재 여부(FR-Close-03)
           CASE WHEN EXISTS (SELECT 1 FROM dbo.system_year p
                             LEFT JOIN dbo.finance_closing pc
                               ON pc.company_id=p.company_id AND pc.entity_id=p.entity_id AND pc.company_year_id=p.company_year_id
                             WHERE p.company_id=y.company_id AND p.entity_id=y.entity_id
                               AND p.actual_year < y.actual_year AND ISNULL(pc.closing,0)=0)
                THEN 1 ELSE 0 END AS prior_year_open
    FROM dbo.system_year y
    LEFT JOIN dbo.finance_closing c
      ON c.company_id=y.company_id AND c.entity_id=y.entity_id AND c.company_year_id=y.company_year_id
    WHERE y.company_id=@company_id AND y.entity_id=@entity_id
      AND (@closing IS NULL OR ISNULL(c.closing,0)=@closing)
    ORDER BY y.actual_year;
END
GO
-- FR-Close-02~10 / UC-Close-02~06 : 연도 회계마감 실행 (1개 연도 단위)
--   복수 연도 체크 시 API 계층이 actual_year 오름차순으로 순차 호출(FR-Close-02).
--   순서 위반은 본 프로시저의 선행연도 검증이 서버에서 차단한다.
--   처리 : 선행검증 → 조합별 잔액산출 → 차년도 open_balance INSERT(closed=Y)
--          → finance_closing(closing=Y, closing_date) 를 단일 트랜잭션(실패 시 전체 ROLLBACK)
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

        -- [검증6] 차년도 초기이월 미존재 — 출처 구분이 없어 자동 덮어쓰기 금지 (FR-Close-09)
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
        INSERT dbo.finance_open_balance (company_id, entity_id, company_year_id, gl_id, DRCR, bank_id, client_id, vendor_id, amount, closed)
        SELECT @company_id, @entity_id, @next_year_id, m.gl_id,
               CASE WHEN g.t=0 THEN '1' ELSE '2' END,                              -- 자산=차변 / 부채·자본=대변
               NULLIF(m.bank_key,'-'), NULLIF(m.client_key,'-'), NULLIF(m.vendor_key,'-'),
               CASE WHEN g.t=0 THEN m.net_dr ELSE -m.net_dr END,                   -- 이월 방향 기준 잔액
               1                                                                    -- 자동생성분 closed=Y 보호(FR-Close-08)
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

/*================ 4. 초기이월 프로시저 개정 (bank_id · 확정 분리) ============*/
-- FR-OpenBal-01/03/06 : bank_id 보조잔액 표시 추가
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_list
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10),
    @gl_keyword nvarchar(100)=NULL, @DRCR varchar(10)=NULL, @closed bit=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT g.gl_id, g.gl_name, ob.DRCR,
           ob.bank_id, ba.bank_name,
           ob.client_id, pc.client_name, ob.vendor_id, pv.vendor_name,
           ob.amount, ob.closed
    FROM dbo.finance_GL g
    LEFT JOIN dbo.finance_open_balance ob
        ON ob.company_id=g.company_id AND ob.entity_id=g.entity_id AND ob.gl_id=g.gl_id
       AND ob.company_year_id=@company_year_id
    LEFT JOIN dbo.finance_bank_account ba ON ba.company_id=g.company_id AND ba.entity_id=g.entity_id AND ba.bank_id=ob.bank_id
    LEFT JOIN dbo.partner_client pc ON pc.company_id=g.company_id AND pc.entity_id=g.entity_id AND pc.client_id=ob.client_id
    LEFT JOIN dbo.partner_vendor pv ON pv.company_id=g.company_id AND pv.entity_id=g.entity_id AND pv.vendor_id=ob.vendor_id
    WHERE g.company_id=@company_id AND g.entity_id=@entity_id AND g.status=1
      AND (@DRCR IS NULL OR ob.DRCR=@DRCR)
      AND (@closed IS NULL OR ob.closed=@closed)
      AND (@gl_keyword IS NULL OR g.gl_id LIKE '%'+@gl_keyword+'%' OR g.gl_name LIKE '%'+@gl_keyword+'%')
    ORDER BY g.gl_id, ob.DRCR, ob.bank_key, ob.client_key, ob.vendor_key;

    SELECT SUM(CASE WHEN DRCR='1' THEN amount ELSE 0 END) AS debit_total,
           SUM(CASE WHEN DRCR='2' THEN amount ELSE 0 END) AS credit_total,
           SUM(CASE WHEN DRCR='1' THEN amount ELSE -amount END) AS difference
    FROM dbo.finance_open_balance
    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
END
GO
-- FR-OpenBal-02/04/05/07/09 : bank_id 포함 일괄저장. 확정(closed=Y)분·마감연도 보호.
-- @rows_json 예 : [{"gl_id":"1010000","DRCR":"1","bank_id":"B001","client_id":null,"vendor_id":null,"amount":1000000}, ...]
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_save
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10),
    @rows_json nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @yy int;
        SELECT @yy = CONVERT(int, actual_year) FROM dbo.system_year
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        IF @yy IS NULL
            THROW 50431, N'등록되지 않은 회사 기수입니다. 회사 기수 등록 후 진행하세요.', 1;
        -- [신규] 회계마감 연도의 초기이월 변경 잠금 (FR-Close-11)
        IF EXISTS (SELECT 1 FROM dbo.finance_closing
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closing=1)
            THROW 50521, N'회계마감된 연도의 초기이월은 변경할 수 없습니다.', 1;
        -- 확정(closed=Y)분 존재 시 일반 저장 차단 — 수기 확정분·연도마감 자동생성분 모두 보호(FR-OpenBal-07, FR-Close-08)
        IF EXISTS (SELECT 1 FROM dbo.finance_open_balance
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closed=1)
            THROW 50432, N'확정된 초기이월이 존재합니다. 확정해제 후 수정하세요.', 1;

        DECLARE @rows TABLE (gl_id varchar(10), DRCR varchar(10), bank_id varchar(10),
                             client_id varchar(10), vendor_id varchar(10), amount numeric(18,2));
        INSERT @rows SELECT gl_id, DRCR, bank_id, client_id, vendor_id, amount
        FROM OPENJSON(@rows_json)
        WITH (gl_id varchar(10), DRCR varchar(10), bank_id varchar(10),
              client_id varchar(10), vendor_id varchar(10), amount numeric(18,2));

        IF EXISTS (SELECT 1 FROM @rows WHERE DRCR NOT IN ('1','2') OR amount < 0)
            THROW 50433, N'차대구분(1/2) 또는 금액(0 이상)이 유효하지 않은 행이 있습니다.', 1;
        IF EXISTS (SELECT 1 FROM @rows r LEFT JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=r.gl_id AND g.status=1
                    WHERE g.gl_id IS NULL)
            THROW 50434, N'사용중이 아닌 계정코드가 포함되어 있습니다.', 1;
        -- [신규] 은행/카드 보조잔액 : 동일 회사·사용중(status=0)만 (FR-OpenBal-05/09)
        IF EXISTS (SELECT 1 FROM @rows r WHERE r.bank_id IS NOT NULL AND NOT EXISTS
                    (SELECT 1 FROM dbo.finance_bank_account
                      WHERE company_id=@company_id AND entity_id=@entity_id AND bank_id=r.bank_id AND status=0))
            THROW 50522, N'유효하지 않거나 미사용인 은행/카드가 포함되어 있습니다.', 1;
        IF EXISTS (SELECT 1 FROM @rows r WHERE r.client_id IS NOT NULL AND NOT EXISTS
                    (SELECT 1 FROM dbo.partner_client WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=r.client_id AND status=1))
            THROW 50435, N'유효하지 않은 고객사가 포함되어 있습니다.', 1;
        IF EXISTS (SELECT 1 FROM @rows r WHERE r.vendor_id IS NOT NULL AND NOT EXISTS
                    (SELECT 1 FROM dbo.partner_vendor WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=r.vendor_id AND status=1))
            THROW 50436, N'유효하지 않은 거래처가 포함되어 있습니다.', 1;
        -- 중복 조합 확장 : 계정/차대/은행·카드/고객사/거래처 (FR-OpenBal-04)
        IF EXISTS (SELECT gl_id, DRCR, ISNULL(bank_id,'-'), ISNULL(client_id,'-'), ISNULL(vendor_id,'-') FROM @rows
                    GROUP BY gl_id, DRCR, ISNULL(bank_id,'-'), ISNULL(client_id,'-'), ISNULL(vendor_id,'-') HAVING COUNT(*)>1)
            THROW 50437, N'동일 계정/차대/은행·카드/고객사/거래처 조합이 중복된 행이 있습니다.', 1;

        DELETE dbo.finance_open_balance
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closed=0;

        INSERT dbo.finance_open_balance (company_id, entity_id, company_year_id, gl_id, DRCR, bank_id, client_id, vendor_id, amount, closed)
        SELECT @company_id, @entity_id, @company_year_id, gl_id, DRCR, bank_id, client_id, vendor_id, amount, 0
        FROM @rows WHERE amount > 0;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
-- FR-OpenBal-06/07 : [확정] — 차대변 일치 검증 후 closed=Y (연도 회계마감과 별개 개념)
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_close
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM dbo.finance_closing
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closing=1)
            THROW 50521, N'회계마감된 연도의 초기이월은 변경할 수 없습니다.', 1;
        DECLARE @dr numeric(18,2), @cr numeric(18,2);
        SELECT @dr = ISNULL(SUM(CASE WHEN DRCR='1' THEN amount END),0),
               @cr = ISNULL(SUM(CASE WHEN DRCR='2' THEN amount END),0)
        FROM dbo.finance_open_balance WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        IF @dr <> @cr
        BEGIN
            DECLARE @msg nvarchar(200) = N'차변합계와 대변합계가 일치하지 않아 확정할 수 없습니다. 차액: ' + FORMAT(@dr-@cr, 'N2');
            THROW 50441, @msg, 1;
        END
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = 1;
        UPDATE dbo.finance_open_balance SET closed=1
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;
        THROW;
    END CATCH
END
GO
-- FR-OpenBal-08 개정 : [확정해제] — 관리자 전용.
--   해제 불가 조건 ① 해당 연도 회계마감(closing=Y) ② 연도마감 자동생성분(= 전년도가 회계마감된 연도의 초기이월)
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_reopen
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @yy int = (SELECT CONVERT(int, actual_year) FROM dbo.system_year
                            WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id);
        IF @yy IS NULL THROW 50442, N'대상 기수가 없습니다.', 1;
        IF EXISTS (SELECT 1 FROM dbo.finance_closing
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closing=1)
            THROW 50523, N'회계마감(closing=Y)된 연도의 초기이월은 확정해제할 수 없습니다.', 1;
        -- 전년도가 회계마감이면 본 연도 초기이월은 연도마감 자동생성분 → 해제 불가(FR-Close-08)
        IF EXISTS (SELECT 1 FROM dbo.finance_closing c
                   JOIN dbo.system_year p
                     ON p.company_id=c.company_id AND p.entity_id=c.entity_id AND p.company_year_id=c.company_year_id
                   WHERE c.company_id=@company_id AND c.entity_id=@entity_id
                     AND c.closing=1 AND CONVERT(int, p.actual_year)=@yy-1)
            THROW 50524, N'연도마감으로 자동 생성된 초기이월은 확정해제할 수 없습니다.', 1;
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = 1;
        UPDATE dbo.finance_open_balance SET closed=0
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        EXEC sys.sp_set_session_context @key = N'ax_openbal_admin', @value = NULL;
        THROW;
    END CATCH
END
GO

/*============ 5. 전표 프로시저 개정 : 마감연도 잠금 (FR-Ledger-16) ============*/
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_head_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10),
    @ledger_date date, @ledger_no numeric(10,2) = NULL OUTPUT,
    @ledger_name nvarchar(100)=NULL, @ledger_type varchar(10)='0',
    @employee_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        EXEC dbo.usp_finance_check_year_open @company_id, @entity_id, @ledger_date;  -- [신규] FR-Ledger-16
        IF @ledger_type NOT IN ('0','1','2','3') THROW 50451, N'허용되지 않은 전표 타입입니다.', 1;
        IF @mode='I'
        BEGIN
            SELECT @ledger_no = ISNULL(MAX(ledger_no),0) + 1
            FROM dbo.finance_ledger_head WITH (UPDLOCK, HOLDLOCK)
            WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date;
            INSERT dbo.finance_ledger_head (company_id, entity_id, ledger_date, ledger_no, ledger_name, ledger_type,
                                            employee_Id, insert_date, approval_status)
            VALUES (@company_id, @entity_id, @ledger_date, @ledger_no, @ledger_name, @ledger_type,
                    @employee_id, CONVERT(date, GETDATE()), 0);
        END
        ELSE
        BEGIN
            UPDATE dbo.finance_ledger_head
               SET ledger_name=@ledger_name, ledger_type=@ledger_type, update_date=CONVERT(date, GETDATE())
             WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no
               AND approval_status=0;
            IF @@ROWCOUNT=0 THROW 50452, N'수정 대상 미승인 전표가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_detail_save
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2),
    @lines_json nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        EXEC dbo.usp_finance_check_year_open @company_id, @entity_id, @ledger_date;  -- [신규] FR-Ledger-16
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_ledger_head WITH (UPDLOCK)
                        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no
                          AND approval_status=0)
            THROW 50461, N'미승인 전표가 아니거나 전표가 존재하지 않습니다.', 1;

        DECLARE @lines TABLE (rn int IDENTITY(1,1), gl_id varchar(10), DRCR varchar(10), amount numeric(18,2),
            bank_id varchar(10), Team_id varchar(10), pod_id varchar(4), employee_Id varchar(10),
            client_id varchar(10), vendor_id varchar(10),
            dimension1 varchar(10), dimension2 varchar(10), dimension3 varchar(10), dimension4 varchar(10), dimension5 varchar(10),
            due_date date);
        INSERT @lines (gl_id, DRCR, amount, bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
                       dimension1, dimension2, dimension3, dimension4, dimension5, due_date)
        SELECT gl_id, DRCR, amount, bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
               dimension1, dimension2, dimension3, dimension4, dimension5, due_date
        FROM OPENJSON(@lines_json)
        WITH (gl_id varchar(10), DRCR varchar(10), amount numeric(18,2), bank_id varchar(10),
              Team_id varchar(10), pod_id varchar(4), employee_Id varchar(10), client_id varchar(10), vendor_id varchar(10),
              dimension1 varchar(10), dimension2 varchar(10), dimension3 varchar(10), dimension4 varchar(10), dimension5 varchar(10),
              due_date date);

        IF EXISTS (SELECT 1 FROM @lines WHERE gl_id IS NULL OR DRCR NOT IN ('1','2') OR ISNULL(amount,0) <= 0)
            THROW 50462, N'계정코드/차대구분은 필수이며 금액은 0보다 커야 합니다.', 1;
        IF EXISTS (SELECT 1 FROM @lines l LEFT JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id AND g.status=1
                    WHERE g.gl_id IS NULL)
            THROW 50463, N'미사용 또는 타 회사 계정이 포함되어 있습니다.', 1;
        IF EXISTS (SELECT 1 FROM @lines l JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id
                    WHERE (g.bank_id=1 AND (l.bank_id IS NULL OR NOT EXISTS
                              (SELECT 1 FROM dbo.finance_bank_account b
                                WHERE b.company_id=@company_id AND b.entity_id=@entity_id AND b.bank_id=l.bank_id AND b.status=0)))
                       OR (g.bank_id=0 AND l.bank_id IS NOT NULL))
            THROW 50464, N'은행/카드 입력 규칙 위반 라인이 있습니다. (플래그 Y: 사용중 계좌 필수 / N: 입력 불가)', 1;
        IF EXISTS (SELECT 1 FROM @lines l JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id
                    WHERE g.due_date=0 AND l.due_date IS NOT NULL)
            THROW 50465, N'지급/입금일 미사용 계정 라인에 due_date를 저장할 수 없습니다.', 1;
        IF EXISTS (SELECT 1 FROM @lines l JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id
                    WHERE (g.Team_id=0 AND l.Team_id IS NOT NULL) OR (g.pod_id=0 AND l.pod_id IS NOT NULL)
                       OR (g.employee_Id=0 AND l.employee_Id IS NOT NULL) OR (g.client_id=0 AND l.client_id IS NOT NULL)
                       OR (g.vendor_id=0 AND l.vendor_id IS NOT NULL)
                       OR (g.dimension1=0 AND l.dimension1 IS NOT NULL) OR (g.dimension2=0 AND l.dimension2 IS NOT NULL)
                       OR (g.dimension3=0 AND l.dimension3 IS NOT NULL) OR (g.dimension4=0 AND l.dimension4 IS NOT NULL)
                       OR (g.dimension5=0 AND l.dimension5 IS NOT NULL))
            THROW 50466, N'계정과목에서 비활성화된 관리항목에 값을 저장할 수 없습니다.', 1;

        DELETE dbo.finance_ledger_detail
        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;
        INSERT dbo.finance_ledger_detail (company_id, entity_id, ledger_date, ledger_no, line_on, gl_id, DRCR, amount,
            bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
            dimension1, dimension2, dimension3, dimension4, dimension5, due_date)
        SELECT @company_id, @entity_id, @ledger_date, @ledger_no, rn, gl_id, DRCR, amount,
            bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
            dimension1, dimension2, dimension3, dimension4, dimension5, due_date
        FROM @lines;

        UPDATE dbo.finance_ledger_head SET update_date = CONVERT(date, GETDATE())
        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_approve
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2),
    @approver_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        EXEC dbo.usp_finance_check_year_open @company_id, @entity_id, @ledger_date;  -- [신규] 마감연도 승인 불가(FR-Ledger-16)
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
           SET approval_status=1, approver_Id=@approver_id, approved_date=CONVERT(date, GETDATE())
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
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_delete
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        EXEC dbo.usp_finance_check_year_open @company_id, @entity_id, @ledger_date;  -- [신규] FR-Ledger-16
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_ledger_head WITH (UPDLOCK)
                        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no
                          AND approval_status=0)
            THROW 50474, N'미승인 전표만 삭제할 수 있습니다.', 1;
        IF EXISTS (SELECT 1 FROM dbo.sales_contract
                    WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no)
            THROW 50475, N'계약에 연결된 전표는 삭제할 수 없습니다.', 1;
        DELETE dbo.finance_ledger_detail
        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;
        DELETE dbo.finance_ledger_head
        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO

/*==================== 6. 트리거 신규/교체 : 마감연도 잠금 =====================*/
-- 마감연도 판정 공용 조건은 각 트리거 내 EXISTS 서브쿼리로 처리.
-- [신규] TRG-10 : 마감연도 전표 헤더 신규 등록 차단 (프로시저 우회 INSERT 방어)
CREATE OR ALTER TRIGGER dbo.trg_finance_ledger_head_closing_lock
ON dbo.finance_ledger_head
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i
               JOIN dbo.finance_closing c
                 ON c.company_id=i.company_id AND c.entity_id=i.entity_id AND c.closing=1
               JOIN dbo.system_year y
                 ON y.company_id=c.company_id AND y.entity_id=c.entity_id AND y.company_year_id=c.company_year_id
               WHERE CONVERT(int, y.actual_year)=YEAR(i.ledger_date))
        THROW 51051, N'회계마감된 연도에는 전표를 등록할 수 없습니다.', 1;
END
GO
-- [교체] TRG-04 : 승인 전표 보호 + 마감연도 헤더 수정/삭제 차단 추가
CREATE OR ALTER TRIGGER dbo.trg_finance_ledger_head_protect
ON dbo.finance_ledger_head
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @is_approve_flow bit = CASE WHEN SESSION_CONTEXT(N'ax_ledger_approve') = 1 THEN 1 ELSE 0 END;
    DECLARE @is_delete bit = CASE WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN 1 ELSE 0 END;

    -- [신규] 마감연도 잠금 (FR-Close-11, FR-Ledger-16)
    IF EXISTS (SELECT 1 FROM deleted d
               JOIN dbo.finance_closing c
                 ON c.company_id=d.company_id AND c.entity_id=d.entity_id AND c.closing=1
               JOIN dbo.system_year y
                 ON y.company_id=c.company_id AND y.entity_id=c.entity_id AND y.company_year_id=c.company_year_id
               WHERE CONVERT(int, y.actual_year)=YEAR(d.ledger_date))
        THROW 51052, N'회계마감된 연도의 전표는 수정/삭제할 수 없습니다. 조회만 가능합니다.', 1;

    IF @is_delete = 1
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted WHERE approval_status = 1)
            THROW 51011, N'승인 완료 전표는 삭제할 수 없습니다.', 1;
        DELETE ld FROM dbo.finance_ledger_detail ld
        JOIN deleted d ON d.company_id=ld.company_id AND d.entity_id=ld.entity_id
                      AND d.ledger_date=ld.ledger_date AND d.ledger_no=ld.ledger_no;
        DELETE h FROM dbo.finance_ledger_head h
        JOIN deleted d ON d.company_id=h.company_id AND d.entity_id=h.entity_id
                      AND d.ledger_date=h.ledger_date AND d.ledger_no=h.ledger_no;
        RETURN;
    END
    IF @is_approve_flow = 0 AND EXISTS (SELECT 1 FROM deleted WHERE approval_status = 1)
        THROW 51012, N'승인 완료 전표는 수정할 수 없습니다.', 1;
    UPDATE h SET ledger_name=i.ledger_name, ledger_type=i.ledger_type,
                 employee_Id=i.employee_Id, approver_Id=i.approver_Id,
                 insert_date=i.insert_date, update_date=i.update_date,
                 approved_date=i.approved_date, approval_status=i.approval_status
    FROM dbo.finance_ledger_head h
    JOIN inserted i ON i.company_id=h.company_id AND i.entity_id=h.entity_id
                   AND i.ledger_date=h.ledger_date AND i.ledger_no=h.ledger_no;
END
GO
-- [교체] TRG-05 : 승인 전표 라인 보호 + 마감연도 라인 DML 차단 추가
CREATE OR ALTER TRIGGER dbo.trg_finance_ledger_detail_protect
ON dbo.finance_ledger_detail
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM (SELECT company_id, entity_id, ledger_date, ledger_no FROM inserted
              UNION SELECT company_id, entity_id, ledger_date, ledger_no FROM deleted) x
        JOIN dbo.finance_ledger_head h
          ON h.company_id=x.company_id AND h.entity_id=x.entity_id
         AND h.ledger_date=x.ledger_date AND h.ledger_no=x.ledger_no
        WHERE h.approval_status = 1)
        THROW 51021, N'승인 완료 전표의 라인은 변경/삭제할 수 없습니다.', 1;
    -- [신규] 마감연도 잠금 (FR-Close-11)
    IF EXISTS (
        SELECT 1
        FROM (SELECT company_id, entity_id, ledger_date FROM inserted
              UNION SELECT company_id, entity_id, ledger_date FROM deleted) x
        JOIN dbo.finance_closing c
          ON c.company_id=x.company_id AND c.entity_id=x.entity_id AND c.closing=1
        JOIN dbo.system_year y
          ON y.company_id=c.company_id AND y.entity_id=c.entity_id AND y.company_year_id=c.company_year_id
        WHERE CONVERT(int, y.actual_year)=YEAR(x.ledger_date))
        THROW 51053, N'회계마감된 연도의 전표 라인은 변경할 수 없습니다.', 1;
END
GO
-- [교체] TRG-06 : 확정(closed=Y) 보호 + 마감연도 초기이월 전면 잠금 추가
--   마감연도 잠금은 ax_openbal_admin(확정/해제 프로시저)보다 우선한다.
CREATE OR ALTER TRIGGER dbo.trg_finance_open_balance_protect
ON dbo.finance_open_balance
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- [신규] 마감연도 초기이월 변경 잠금 (FR-Close-11) — 세션 플래그와 무관하게 차단
    IF EXISTS (
        SELECT 1
        FROM (SELECT company_id, entity_id, company_year_id FROM inserted
              UNION SELECT company_id, entity_id, company_year_id FROM deleted) x
        JOIN dbo.finance_closing c
          ON c.company_id=x.company_id AND c.entity_id=x.entity_id
         AND c.company_year_id=x.company_year_id AND c.closing=1)
        THROW 51054, N'회계마감된 연도의 초기이월은 변경할 수 없습니다.', 1;
    -- 기존 : 확정분 보호 (확정/해제 프로시저만 상태 전환)
    IF SESSION_CONTEXT(N'ax_openbal_admin') = 1 RETURN;
    IF EXISTS (SELECT 1 FROM deleted WHERE closed = 1)
        THROW 51031, N'확정된 초기이월은 수정/삭제할 수 없습니다. 관리자 확정해제 후 진행하세요.', 1;
END
GO
