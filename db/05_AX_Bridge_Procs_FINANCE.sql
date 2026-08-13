/*==============================================================================
  AX Bridge - 05. Stored Procedures : FINANCE 도메인
  (계정과목 finance_GL · 관리항목 finance_dimension(+detail) · 초기이월 finance_open_balance
   · 전표 finance_ledger_head/detail · 은행/카드 finance_bank_account)
==============================================================================*/
USE AX_Bridge;
GO
/*=============================== finance_GL =================================*/
CREATE OR ALTER PROCEDURE dbo.usp_finance_gl_list
    @company_id varchar(10), @entity_id varchar(10),
    @gl_keyword nvarchar(100)=NULL, @gl_type varchar(50)=NULL,
    @gl_category1 nvarchar(50)=NULL, @gl_category2 nvarchar(50)=NULL, @vat_gl nvarchar(50)=NULL,
    @status bit=NULL, @search_mode char(1)=NULL, @active_only bit=0
AS
BEGIN
    SET NOCOUNT ON;   -- 좌측 Head : gl_id, gl_name 만 표시(FR-GL-01) — 나머지 컬럼은 Detail 화면에서 usp_finance_gl_get 사용
    SELECT gl_id, gl_name
    FROM dbo.finance_GL
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@gl_type IS NULL OR gl_type=@gl_type)
      AND (@gl_category1 IS NULL OR gl_category1=@gl_category1)
      AND (@gl_category2 IS NULL OR gl_category2=@gl_category2)
      AND (@vat_gl IS NULL OR vat_gl=@vat_gl)
      AND (@status IS NULL OR status=@status)
      AND (@active_only=0 OR status=1)   -- 신규 전표 계정 선택 팝업 : 미사용 제외(FR-GL-09)
      AND (@gl_keyword IS NULL
           OR (@search_mode='E' AND (gl_id=@gl_keyword OR gl_name=@gl_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (gl_id LIKE '%'+@gl_keyword+'%' OR gl_name LIKE '%'+@gl_keyword+'%')))
    ORDER BY gl_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_gl_get
    @company_id varchar(10), @entity_id varchar(10), @gl_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;   -- 우측 Detail + Layer 3 플래그 로딩(FR-GL-01, FR-Ledger-06)
    SELECT g.*, d1.dimension_name AS slot1_name, d2.dimension_name AS slot2_name,
           d3.dimension_name AS slot3_name, d4.dimension_name AS slot4_name, d5.dimension_name AS slot5_name
    FROM dbo.finance_GL g
    LEFT JOIN dbo.finance_dimension d1 ON d1.company_id=g.company_id AND d1.entity_id=g.entity_id AND d1.slot_no=1
    LEFT JOIN dbo.finance_dimension d2 ON d2.company_id=g.company_id AND d2.entity_id=g.entity_id AND d2.slot_no=2
    LEFT JOIN dbo.finance_dimension d3 ON d3.company_id=g.company_id AND d3.entity_id=g.entity_id AND d3.slot_no=3
    LEFT JOIN dbo.finance_dimension d4 ON d4.company_id=g.company_id AND d4.entity_id=g.entity_id AND d4.slot_no=4
    LEFT JOIN dbo.finance_dimension d5 ON d5.company_id=g.company_id AND d5.entity_id=g.entity_id AND d5.slot_no=5
    WHERE g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=@gl_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_gl_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @gl_id varchar(10),
    @gl_name nvarchar(100), @gl_type varchar(50), @gl_category1 nvarchar(50)=NULL, @gl_category2 nvarchar(50)=NULL,
    @vat_gl nvarchar(50)=NULL, @gl_detail varchar(10)='0', @contra_gl varchar(10)=NULL, @status bit=1,
    @f_bank bit=0, @f_team bit=0, @f_pod bit=0, @f_employee bit=0, @f_client bit=0, @f_vendor bit=0,
    @f_dim1 bit=0, @f_dim2 bit=0, @f_dim3 bit=0, @f_dim4 bit=0, @f_dim5 bit=0, @f_due bit=0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-GL-05 : 코드체계 검증
        IF TRY_CONVERT(int, @gl_type) IS NULL OR TRY_CONVERT(int, @gl_type) NOT BETWEEN 0 AND 10
            THROW 50401, N'허용되지 않은 계정구분입니다. (0~10)', 1;
        IF @gl_detail NOT IN ('0','1') THROW 50402, N'허용되지 않은 계정성격입니다. (0 보통계정 / 1 차감항목)', 1;
        IF @vat_gl IS NOT NULL AND @vat_gl NOT IN (N'매입부가가치세', N'매출부가가치세')
            THROW 50403, N'허용되지 않은 부가가치세 구분입니다.', 1;
        IF @contra_gl IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.finance_GL WHERE company_id=@company_id AND entity_id=@entity_id AND gl_id=@contra_gl)
            THROW 50404, N'차감계정코드는 동일 그룹/회사의 유효한 계정이어야 합니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.finance_GL WHERE company_id=@company_id AND entity_id=@entity_id AND gl_id=@gl_id)
                THROW 50405, N'동일 회사 내 중복된 계정코드입니다.', 1; -- FR-GL-04
            INSERT dbo.finance_GL (company_id, entity_id, gl_id, gl_name, gl_type, gl_category1, gl_category2, vat_gl,
                gl_detail, contra_gl, status, bank_id, Team_id, pod_id, employee_Id, client_id, vendor_id,
                dimension1, dimension2, dimension3, dimension4, dimension5, due_date)
            VALUES (@company_id, @entity_id, @gl_id, @gl_name, @gl_type, @gl_category1, @gl_category2, @vat_gl,
                @gl_detail, @contra_gl, @status, @f_bank, @f_team, @f_pod, @f_employee, @f_client, @f_vendor,
                @f_dim1, @f_dim2, @f_dim3, @f_dim4, @f_dim5, @f_due);
        END
        ELSE
        BEGIN  -- gl_id/상위조직 수정 불가(FR-GL-08)
            UPDATE dbo.finance_GL
               SET gl_name=@gl_name, gl_type=@gl_type, gl_category1=@gl_category1, gl_category2=@gl_category2,
                   vat_gl=@vat_gl, gl_detail=@gl_detail, contra_gl=@contra_gl, status=@status,
                   bank_id=@f_bank, Team_id=@f_team, pod_id=@f_pod, employee_Id=@f_employee,
                   client_id=@f_client, vendor_id=@f_vendor,
                   dimension1=@f_dim1, dimension2=@f_dim2, dimension3=@f_dim3, dimension4=@f_dim4, dimension5=@f_dim5,
                   due_date=@f_due
             WHERE company_id=@company_id AND entity_id=@entity_id AND gl_id=@gl_id;
            IF @@ROWCOUNT=0 THROW 50406, N'수정 대상 계정과목이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_gl_delete
    @company_id varchar(10), @entity_id varchar(10), @gl_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.finance_open_balance WHERE company_id=@company_id AND entity_id=@entity_id AND gl_id=@gl_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND gl_id=@gl_id)
        THROW 50407, N'기초잔액/전표에서 참조 중인 계정은 삭제할 수 없습니다. 미사용 전환을 이용하세요.', 1; -- FR-GL-09
    DELETE dbo.finance_GL WHERE company_id=@company_id AND entity_id=@entity_id AND gl_id=@gl_id;
END
GO
-- FR-GL-11~14 / UC-GL-07·08 : 표준 계정과목 일괄 생성/재생성 (전표 존재 시 서버 재검증 후 차단, 원자적 처리)
CREATE OR ALTER PROCEDURE dbo.usp_finance_gl_generate_standard
    @company_id varchar(10), @entity_id varchar(10)   -- 반드시 로그인 세션 값(서버 주입). 임의 대상 실행 금지(FR-GL-11)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
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
        EXEC sys.sp_set_session_context @key = N'ax_bypass_gl_protect', @value = NULL;
        COMMIT;   -- 실패 시 CATCH 에서 전체 ROLLBACK → 기존 계정과목 보존(FR-GL-14)
        SELECT @@ROWCOUNT AS inserted_count;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        EXEC sys.sp_set_session_context @key = N'ax_bypass_gl_protect', @value = NULL;
        THROW;
    END CATCH
END
GO

/*=========================== finance_dimension ==============================*/
CREATE OR ALTER PROCEDURE dbo.usp_finance_dimension_list
    @company_id varchar(10), @entity_id varchar(10),
    @dim_keyword nvarchar(100)=NULL, @status bit=NULL, @search_mode char(1)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- Head : 관리항목 마스터(Slot 포함, FR-Dim-01)
    SELECT company_id, entity_id, dimension_id, dimension_name, slot_no, status
    FROM dbo.finance_dimension
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@status IS NULL OR status=@status)
      AND (@dim_keyword IS NULL
           OR (@search_mode='E' AND (dimension_id=@dim_keyword OR dimension_name=@dim_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (dimension_id LIKE '%'+@dim_keyword+'%' OR dimension_name LIKE '%'+@dim_keyword+'%')))
    ORDER BY slot_no;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_dimension_detail_list
    @company_id varchar(10), @entity_id varchar(10), @dimension_id varchar(10),
    @value_keyword nvarchar(200)=NULL, @search_mode char(1)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, dimension_id, line_no, dimension_value
    FROM dbo.finance_dimension_detail
    WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id
      AND (@value_keyword IS NULL
           OR (@search_mode='E' AND dimension_value=@value_keyword)
           OR (ISNULL(@search_mode,'L')<>'E' AND dimension_value LIKE '%'+@value_keyword+'%'))
    ORDER BY line_no;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_dimension_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10),
    @dimension_id varchar(10), @dimension_name nvarchar(100), @status bit=1
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @mode='I'
        BEGIN
            DECLARE @cnt int = (SELECT COUNT(*) FROM dbo.finance_dimension WITH (UPDLOCK, HOLDLOCK)
                                 WHERE company_id=@company_id AND entity_id=@entity_id);
            IF @cnt >= 5 THROW 50421, N'관리항목은 회사당 최대 5개까지 등록할 수 있습니다.', 1; -- FR-Dim-03
            IF EXISTS (SELECT 1 FROM dbo.finance_dimension WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id)
                THROW 50422, N'이미 존재하는 관리항목코드입니다.', 1;
            -- FR-Dim-04/05 : 최초 등록 순서로 Slot 순차 부여. 미사용/삭제 후에도 재매핑 없음 → 사용된 적 없는 최소 Slot 부여
            DECLARE @slot tinyint = (SELECT MIN(s.n) FROM (VALUES (1),(2),(3),(4),(5)) s(n)
                                      WHERE NOT EXISTS (SELECT 1 FROM dbo.finance_dimension d
                                                         WHERE d.company_id=@company_id AND d.entity_id=@entity_id AND d.slot_no=s.n));
            INSERT dbo.finance_dimension (company_id, entity_id, dimension_id, dimension_name, slot_no, status)
            VALUES (@company_id, @entity_id, @dimension_id, @dimension_name, @slot, @status);
        END
        ELSE
        BEGIN  -- dimension_id / Slot 수정 불가(FR-Dim-08)
            UPDATE dbo.finance_dimension SET dimension_name=@dimension_name, status=@status
             WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id;
            IF @@ROWCOUNT=0 THROW 50423, N'수정 대상 관리항목이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_dimension_detail_save
    @company_id varchar(10), @entity_id varchar(10), @dimension_id varchar(10),
    @line_no numeric(10,2) = NULL OUTPUT,   -- NULL : 다음 순번 자동부여(FR-Dim-07)
    @dimension_value nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_dimension WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id)
            THROW 50424, N'대상 관리항목이 존재하지 않습니다.', 1;
        -- FR-Dim-09 : 동일 관리항목 내 중복값 금지
        IF EXISTS (SELECT 1 FROM dbo.finance_dimension_detail
                    WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id
                      AND dimension_value=@dimension_value
                      AND (@line_no IS NULL OR line_no<>@line_no))
            THROW 50425, N'동일 관리항목에 같은 값이 이미 등록되어 있습니다.', 1;
        IF @line_no IS NULL
        BEGIN
            SELECT @line_no = ISNULL(MAX(line_no),0) + 1
            FROM dbo.finance_dimension_detail WITH (UPDLOCK, HOLDLOCK)
            WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id;
            INSERT dbo.finance_dimension_detail (company_id, entity_id, dimension_id, line_no, dimension_value)
            VALUES (@company_id, @entity_id, @dimension_id, @line_no, @dimension_value);
        END
        ELSE
        BEGIN
            UPDATE dbo.finance_dimension_detail SET dimension_value=@dimension_value
             WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id AND line_no=@line_no;
            IF @@ROWCOUNT=0 THROW 50426, N'수정 대상 상세값이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_dimension_delete
    @company_id varchar(10), @entity_id varchar(10), @dimension_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    -- FR-Dim-09 : 계정/전표 참조 시 물리삭제 금지(해당 Slot 플래그 사용 여부 확인)
    DECLARE @slot tinyint = (SELECT slot_no FROM dbo.finance_dimension
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
    DELETE dbo.finance_dimension WHERE company_id=@company_id AND entity_id=@entity_id AND dimension_id=@dimension_id;
END
GO

/*========================= finance_open_balance =============================*/
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_list
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10),
    @gl_keyword nvarchar(100)=NULL, @DRCR varchar(10)=NULL, @closed bit=NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- FR-OpenBal-03 : 사용중 계정과목 기준 + 저장값 로드 / 하단에 차대변 합계(FR-OpenBal-06)
    SELECT g.gl_id, g.gl_name, ob.DRCR,
           ob.client_id, pc.client_name, ob.vendor_id, pv.vendor_name,
           ob.amount, ob.closed
    FROM dbo.finance_GL g
    LEFT JOIN dbo.finance_open_balance ob
        ON ob.company_id=g.company_id AND ob.entity_id=g.entity_id AND ob.gl_id=g.gl_id
       AND ob.company_year_id=@company_year_id
    LEFT JOIN dbo.partner_client pc ON pc.company_id=g.company_id AND pc.entity_id=g.entity_id AND pc.client_id=ob.client_id
    LEFT JOIN dbo.partner_vendor pv ON pv.company_id=g.company_id AND pv.entity_id=g.entity_id AND pv.vendor_id=ob.vendor_id
    WHERE g.company_id=@company_id AND g.entity_id=@entity_id AND g.status=1
      AND (@DRCR IS NULL OR ob.DRCR=@DRCR)
      AND (@closed IS NULL OR ob.closed=@closed)
      AND (@gl_keyword IS NULL OR g.gl_id LIKE '%'+@gl_keyword+'%' OR g.gl_name LIKE '%'+@gl_keyword+'%')
    ORDER BY g.gl_id, ob.DRCR;

    SELECT SUM(CASE WHEN DRCR='1' THEN amount ELSE 0 END) AS debit_total,
           SUM(CASE WHEN DRCR='2' THEN amount ELSE 0 END) AS credit_total,
           SUM(CASE WHEN DRCR='1' THEN amount ELSE -amount END) AS difference
    FROM dbo.finance_open_balance
    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
END
GO
-- FR-OpenBal-04/07 : 미마감 상태 일괄 저장(JSON 배열). 기존 미마감 행 삭제 후 재적재.
-- @rows_json 예 : [{"gl_id":"1010000","DRCR":"1","client_id":null,"vendor_id":null,"amount":1000000}, ...]
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_save
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10),
    @rows_json nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.system_year WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id)
            THROW 50431, N'등록되지 않은 회사 기수입니다. 회사 기수 등록 후 진행하세요.', 1; -- FR-OpenBal-02
        IF EXISTS (SELECT 1 FROM dbo.finance_open_balance
                    WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closed=1)
            THROW 50432, N'마감된 기수의 초기이월은 수정할 수 없습니다.', 1;               -- FR-OpenBal-07

        DECLARE @rows TABLE (gl_id varchar(10), DRCR varchar(10), client_id varchar(10), vendor_id varchar(10), amount numeric(18,2));
        INSERT @rows SELECT gl_id, DRCR, client_id, vendor_id, amount
        FROM OPENJSON(@rows_json)
        WITH (gl_id varchar(10), DRCR varchar(10), client_id varchar(10), vendor_id varchar(10), amount numeric(18,2));

        IF EXISTS (SELECT 1 FROM @rows WHERE DRCR NOT IN ('1','2') OR amount < 0)
            THROW 50433, N'차대구분(1/2) 또는 금액(0 이상)이 유효하지 않은 행이 있습니다.', 1; -- FR-OpenBal-04
        IF EXISTS (SELECT 1 FROM @rows r LEFT JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=r.gl_id AND g.status=1
                    WHERE g.gl_id IS NULL)
            THROW 50434, N'사용중이 아닌 계정코드가 포함되어 있습니다.', 1;
        IF EXISTS (SELECT 1 FROM @rows r WHERE r.client_id IS NOT NULL AND NOT EXISTS
                    (SELECT 1 FROM dbo.partner_client WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=r.client_id AND status=1))
            THROW 50435, N'유효하지 않은 고객사가 포함되어 있습니다.', 1;                  -- FR-OpenBal-05
        IF EXISTS (SELECT 1 FROM @rows r WHERE r.vendor_id IS NOT NULL AND NOT EXISTS
                    (SELECT 1 FROM dbo.partner_vendor WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=r.vendor_id AND status=1))
            THROW 50436, N'유효하지 않은 거래처가 포함되어 있습니다.', 1;
        IF EXISTS (SELECT gl_id, DRCR, ISNULL(client_id,'-'), ISNULL(vendor_id,'-') FROM @rows
                    GROUP BY gl_id, DRCR, ISNULL(client_id,'-'), ISNULL(vendor_id,'-') HAVING COUNT(*)>1)
            THROW 50437, N'동일 계정/차대/거래상대 조합이 중복된 행이 있습니다.', 1;

        DELETE dbo.finance_open_balance
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id AND closed=0;

        INSERT dbo.finance_open_balance (company_id, entity_id, company_year_id, gl_id, DRCR, client_id, vendor_id, amount, closed)
        SELECT @company_id, @entity_id, @company_year_id, gl_id, DRCR, client_id, vendor_id, amount, 0
        FROM @rows WHERE amount > 0;   -- 0원 행 저장 제외(FR-OpenBal-04)
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
-- FR-OpenBal-06/07 / UC-OpenBal-05 : 차대변 일치 검증 후 마감
CREATE OR ALTER PROCEDURE dbo.usp_finance_openbalance_close
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @dr numeric(18,2), @cr numeric(18,2);
        SELECT @dr = ISNULL(SUM(CASE WHEN DRCR='1' THEN amount END),0),
               @cr = ISNULL(SUM(CASE WHEN DRCR='2' THEN amount END),0)
        FROM dbo.finance_open_balance WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
        IF @dr <> @cr
        BEGIN
            DECLARE @msg nvarchar(200) = N'차변합계와 대변합계가 일치하지 않아 마감할 수 없습니다. 차액: ' + FORMAT(@dr-@cr, 'N2');
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
-- FR-OpenBal-08 / UC-OpenBal-06 : 관리자 마감 해제(후속 전표 존재 시 제한)
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
        IF EXISTS (SELECT 1 FROM dbo.finance_ledger_head
                    WHERE company_id=@company_id AND entity_id=@entity_id AND YEAR(ledger_date)=@yy)
            THROW 50443, N'해당 기수에 회계전표가 존재하여 마감을 해제할 수 없습니다.', 1;
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

/*============================ finance_ledger ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_list
    @company_id varchar(10), @entity_id varchar(10),
    @date_from date=NULL, @date_to date=NULL, @ledger_no numeric(10,2)=NULL,
    @ledger_type varchar(10)=NULL, @employee_id varchar(10)=NULL, @approval_status bit=NULL
AS
BEGIN
    SET NOCOUNT ON;   -- Layer 1 전표 헤더(FR-Ledger-02)
    SELECT h.company_id, h.entity_id, h.ledger_date, h.ledger_no, h.ledger_name, h.ledger_type,
           h.employee_Id, e.employee_name AS employee_name,
           h.approver_Id, a.employee_name AS approver_name,
           h.insert_date, h.update_date, h.approved_date, h.approval_status
    FROM dbo.finance_ledger_head h
    LEFT JOIN dbo.system_employee e ON e.company_id=h.company_id AND e.entity_id=h.entity_id AND e.employee_Id=h.employee_Id
    LEFT JOIN dbo.system_employee a ON a.company_id=h.company_id AND a.entity_id=h.entity_id AND a.employee_Id=h.approver_Id
    WHERE h.company_id=@company_id AND h.entity_id=@entity_id
      AND (@date_from IS NULL OR h.ledger_date >= @date_from)
      AND (@date_to IS NULL OR h.ledger_date <= @date_to)
      AND (@ledger_no IS NULL OR h.ledger_no=@ledger_no)
      AND (@ledger_type IS NULL OR h.ledger_type=@ledger_type)
      AND (@employee_id IS NULL OR h.employee_Id=@employee_id)
      AND (@approval_status IS NULL OR h.approval_status=@approval_status)
    ORDER BY h.ledger_date DESC, h.ledger_no DESC;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_get
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2)
AS
BEGIN
    SET NOCOUNT ON;
    -- RS1 : 헤더 / RS2 : 라인(Layer 2) + Layer 3 관리항목 + 선택 계정의 사용플래그(FR-Ledger-03/06)
    SELECT * FROM dbo.finance_ledger_head
    WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no;

    SELECT d.line_on, d.gl_id, g.gl_name, d.DRCR, d.amount,
           d.bank_id, b.bank_name, d.Team_id, d.pod_id, d.employee_Id, d.client_id, d.vendor_id,
           d.dimension1, d.dimension2, d.dimension3, d.dimension4, d.dimension5, d.due_date,
           g.bank_id AS f_bank, g.Team_id AS f_team, g.pod_id AS f_pod, g.employee_Id AS f_employee,
           g.client_id AS f_client, g.vendor_id AS f_vendor,
           g.dimension1 AS f_dim1, g.dimension2 AS f_dim2, g.dimension3 AS f_dim3,
           g.dimension4 AS f_dim4, g.dimension5 AS f_dim5, g.due_date AS f_due
    FROM dbo.finance_ledger_detail d
    JOIN dbo.finance_GL g ON g.company_id=d.company_id AND g.entity_id=d.entity_id AND g.gl_id=d.gl_id
    LEFT JOIN dbo.finance_bank_account b ON b.company_id=d.company_id AND b.entity_id=d.entity_id AND b.bank_id=d.bank_id
    WHERE d.company_id=@company_id AND d.entity_id=@entity_id AND d.ledger_date=@ledger_date AND d.ledger_no=@ledger_no
    ORDER BY d.line_on;
END
GO
-- FR-Ledger-04 / UC-Ledger-02 : 신규 전표 Head. ledger_no 는 동시성 안전하게 다음 번호 부여.
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
        IF @ledger_type NOT IN ('0','1','2','3') THROW 50451, N'허용되지 않은 전표 타입입니다.', 1;
        IF @mode='I'
        BEGIN
            SELECT @ledger_no = ISNULL(MAX(ledger_no),0) + 1
            FROM dbo.finance_ledger_head WITH (UPDLOCK, HOLDLOCK)   -- 동시 등록 번호 충돌 방지(UC-Ledger-02 예외흐름)
            WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date;
            INSERT dbo.finance_ledger_head (company_id, entity_id, ledger_date, ledger_no, ledger_name, ledger_type,
                                            employee_Id, insert_date, approval_status)
            VALUES (@company_id, @entity_id, @ledger_date, @ledger_no, @ledger_name, @ledger_type,
                    @employee_id, CONVERT(date, GETDATE()), 0);
        END
        ELSE
        BEGIN  -- 미승인 전표만 수정(승인 전표는 트리거가 추가 차단). update_date 갱신(FR-Ledger-12)
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
-- FR-Ledger-05~09 : 전표라인 일괄 저장(JSON). 계정 플래그 기반 Layer 3 검증 포함.
-- @lines_json 예 : [{"gl_id":"1010000","DRCR":"1","amount":100000,"bank_id":"B001","Team_id":null,...,"due_date":null}, ...]
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_detail_save
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2),
    @lines_json nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.finance_ledger_head WITH (UPDLOCK)
                        WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no
                          AND approval_status=0)
            THROW 50461, N'미승인 전표가 아니거나 전표가 존재하지 않습니다.', 1; -- FR-Ledger-12

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

        -- FR-Ledger-09 : 필수값·금액 검증
        IF EXISTS (SELECT 1 FROM @lines WHERE gl_id IS NULL OR DRCR NOT IN ('1','2') OR ISNULL(amount,0) <= 0)
            THROW 50462, N'계정코드/차대구분은 필수이며 금액은 0보다 커야 합니다.', 1;
        -- 사용중 계정만(FR-Ledger-05)
        IF EXISTS (SELECT 1 FROM @lines l LEFT JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id AND g.status=1
                    WHERE g.gl_id IS NULL)
            THROW 50463, N'미사용 또는 타 회사 계정이 포함되어 있습니다.', 1;
        -- bank_id : 플래그 Y → 사용중 계좌 필수 / 플래그 N → 저장 금지(FR-Ledger-07/15)
        IF EXISTS (SELECT 1 FROM @lines l JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id
                    WHERE (g.bank_id=1 AND (l.bank_id IS NULL OR NOT EXISTS
                              (SELECT 1 FROM dbo.finance_bank_account b
                                WHERE b.company_id=@company_id AND b.entity_id=@entity_id AND b.bank_id=l.bank_id AND b.status=0)))
                       OR (g.bank_id=0 AND l.bank_id IS NOT NULL))
            THROW 50464, N'은행/카드 입력 규칙 위반 라인이 있습니다. (플래그 Y: 사용중 계좌 필수 / N: 입력 불가)', 1;
        -- due_date : 플래그 N 저장 금지(FR-Ledger-11)
        IF EXISTS (SELECT 1 FROM @lines l JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id
                    WHERE g.due_date=0 AND l.due_date IS NOT NULL)
            THROW 50465, N'지급/입금일 미사용 계정 라인에 due_date를 저장할 수 없습니다.', 1;
        -- 비활성 관리항목 값 저장 금지 + Slot 값 유효성(FR-Ledger-08/09)
        IF EXISTS (SELECT 1 FROM @lines l JOIN dbo.finance_GL g
                     ON g.company_id=@company_id AND g.entity_id=@entity_id AND g.gl_id=l.gl_id
                    WHERE (g.Team_id=0 AND l.Team_id IS NOT NULL) OR (g.pod_id=0 AND l.pod_id IS NOT NULL)
                       OR (g.employee_Id=0 AND l.employee_Id IS NOT NULL) OR (g.client_id=0 AND l.client_id IS NOT NULL)
                       OR (g.vendor_id=0 AND l.vendor_id IS NOT NULL)
                       OR (g.dimension1=0 AND l.dimension1 IS NOT NULL) OR (g.dimension2=0 AND l.dimension2 IS NOT NULL)
                       OR (g.dimension3=0 AND l.dimension3 IS NOT NULL) OR (g.dimension4=0 AND l.dimension4 IS NOT NULL)
                       OR (g.dimension5=0 AND l.dimension5 IS NOT NULL))
            THROW 50466, N'계정과목에서 비활성화된 관리항목에 값을 저장할 수 없습니다.', 1;

        -- 전체 라인 재적재(편집상태 일괄 반영, line_on 1부터 순차 부여 : FR-Ledger-05)
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
-- FR-Ledger-10/13 / UC-Ledger-11 : 차대변 균형 검증 후 승인
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_approve
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2),
    @approver_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
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
            THROW 50473, @msg, 1;   -- FR-Ledger-10
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
-- FR-Ledger-12 / UC-Ledger-10 : 미승인 전표 삭제(라인+헤더 단일 트랜잭션)
CREATE OR ALTER PROCEDURE dbo.usp_finance_ledger_delete
    @company_id varchar(10), @entity_id varchar(10), @ledger_date date, @ledger_no numeric(10,2)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
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

/*========================= finance_bank_account =============================*/
CREATE OR ALTER PROCEDURE dbo.usp_finance_bank_list
    @company_id varchar(10), @entity_id varchar(10),
    @bank_keyword nvarchar(50)=NULL, @status bit=NULL, @search_mode char(1)=NULL,
    @active_only bit=0            -- 1: 전표 선택 팝업(status=0 만, FR-Bank-07)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, bank_id, bank_name, bank_account,
           -- FR-Bank-02 : 카드번호 마스킹(뒤 4자리만 노출)
           CASE WHEN card_number IS NULL THEN NULL
                WHEN LEN(card_number) <= 4 THEN card_number
                ELSE REPLICATE('*', LEN(card_number)-4) + RIGHT(card_number, 4) END AS card_number_masked,
           status
    FROM dbo.finance_bank_account
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@status IS NULL OR status=@status)
      AND (@active_only=0 OR status=0)
      AND (@bank_keyword IS NULL
           OR (@search_mode='E' AND (bank_id=@bank_keyword OR bank_name=@bank_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (bank_id LIKE '%'+@bank_keyword+'%' OR bank_name LIKE '%'+@bank_keyword+'%')))
    ORDER BY bank_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_bank_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @bank_id varchar(10),
    @bank_name nvarchar(50), @bank_account varchar(50)=NULL, @card_number varchar(50)=NULL, @status bit=0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-Bank-03/04/05 : 계좌·카드 상호배타, 회사 내 계좌/카드번호 중복 금지
        IF @bank_account IS NOT NULL AND @card_number IS NOT NULL
            THROW 50481, N'은행계좌와 카드번호는 동시에 입력할 수 없습니다.', 1;
        IF @bank_account IS NULL AND @card_number IS NULL
            THROW 50482, N'은행계좌 또는 카드번호 중 하나는 입력해야 합니다.', 1;
        IF @bank_account IS NOT NULL AND EXISTS
            (SELECT 1 FROM dbo.finance_bank_account
              WHERE company_id=@company_id AND entity_id=@entity_id AND bank_account=@bank_account AND bank_id<>@bank_id)
            THROW 50483, N'동일 회사에 이미 등록된 계좌번호입니다.', 1;
        IF @card_number IS NOT NULL AND EXISTS
            (SELECT 1 FROM dbo.finance_bank_account
              WHERE company_id=@company_id AND entity_id=@entity_id AND card_number=@card_number AND bank_id<>@bank_id)
            THROW 50484, N'동일 회사에 이미 등록된 카드번호입니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.finance_bank_account WHERE company_id=@company_id AND entity_id=@entity_id AND bank_id=@bank_id)
                THROW 50485, N'이미 존재하는 은행/카드 코드입니다.', 1;
            INSERT dbo.finance_bank_account (company_id, entity_id, bank_id, bank_name, bank_account, card_number, status)
            VALUES (@company_id, @entity_id, @bank_id, @bank_name, @bank_account, @card_number, @status);
        END
        ELSE
        BEGIN  -- 식별키 수정 불가(FR-Bank-05)
            UPDATE dbo.finance_bank_account
               SET bank_name=@bank_name, bank_account=@bank_account, card_number=@card_number, status=@status
             WHERE company_id=@company_id AND entity_id=@entity_id AND bank_id=@bank_id;
            IF @@ROWCOUNT=0 THROW 50486, N'수정 대상 은행/카드가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_finance_bank_delete
    @company_id varchar(10), @entity_id varchar(10), @bank_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND bank_id=@bank_id)
        THROW 50487, N'전표에서 참조 중인 은행/카드는 삭제할 수 없습니다. 미사용(status=1) 전환을 이용하세요.', 1; -- FR-Bank-06
    DELETE dbo.finance_bank_account WHERE company_id=@company_id AND entity_id=@entity_id AND bank_id=@bank_id;
END
GO
