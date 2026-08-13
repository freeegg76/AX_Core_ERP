/*==============================================================================
  AX Bridge - 04. Stored Procedures : SALES 도메인
  (파이프라인 sales_pipeline · 액티비티 sales_pipeline_detail · 계약 sales_contract)
==============================================================================*/
USE AX_Bridge;
GO
/*============================ sales_pipeline ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_sales_pipeline_list
    @company_id varchar(10), @entity_id varchar(10),
    @pipeline_id varchar(10)=NULL, @client_name nvarchar(100)=NULL,
    @pipeline_type varchar(40)=NULL, @stage varchar(40)=NULL, @employee_id varchar(10)=NULL,
    @created_from date=NULL, @created_to date=NULL, @closed_from date=NULL, @closed_to date=NULL,
    @search_mode char(1)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.company_id, p.entity_id, p.pipeline_id, p.pipeline_type, p.client_name,
           p.stage, p.employee_Id, e.employee_name, p.note,
           p.created_date, p.adjusted_date, p.closed_date, p.contract_id
    FROM dbo.sales_pipeline p
    LEFT JOIN dbo.system_employee e ON e.company_id=p.company_id AND e.entity_id=p.entity_id AND e.employee_Id=p.employee_Id
    WHERE p.company_id=@company_id AND p.entity_id=@entity_id
      AND (@pipeline_id IS NULL OR p.pipeline_id=@pipeline_id)
      AND (@pipeline_type IS NULL OR p.pipeline_type=@pipeline_type)
      AND (@stage IS NULL OR p.stage=@stage)
      AND (@employee_id IS NULL OR p.employee_Id=@employee_id)
      AND (@created_from IS NULL OR p.created_date >= @created_from)
      AND (@created_to IS NULL OR p.created_date <= @created_to)
      AND (@closed_from IS NULL OR p.closed_date >= @closed_from)
      AND (@closed_to IS NULL OR p.closed_date <= @closed_to)
      AND (@client_name IS NULL
           OR (@search_mode='E' AND p.client_name=@client_name)
           OR (ISNULL(@search_mode,'L')<>'E' AND p.client_name LIKE '%'+@client_name+'%'))
    ORDER BY p.created_date DESC, p.pipeline_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_sales_pipeline_get
    @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.sales_pipeline
    WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_sales_pipeline_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10),
    @pipeline_type varchar(40)='0', @client_name nvarchar(100)=NULL, @stage varchar(40)='0',
    @employee_id varchar(10)=NULL, @note nvarchar(255)=NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @pipeline_type NOT IN ('0','1','2','3','4') THROW 50301, N'허용되지 않은 파이프라인 유형입니다.', 1;
        IF @stage NOT IN ('0','1','2','3','4','5','6') THROW 50302, N'허용되지 않은 스테이지입니다.', 1;
        -- FR-Pipe-05 : 담당자는 동일 회사 소속·비활성 제외
        IF @employee_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.system_employee
              WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id AND status<>'inactive')
            THROW 50303, N'담당자는 동일 회사의 활성 직원만 선택할 수 있습니다.', 1;
        -- FR-Pipe-04 : 고객사명은 동일 회사 고객사 목록에서 선택한 문자열 저장
        IF @client_name IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.partner_client WHERE company_id=@company_id AND entity_id=@entity_id AND client_name=@client_name)
            THROW 50304, N'고객사명은 동일 회사에 등록된 고객사에서 선택해야 합니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.sales_pipeline WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id)
                THROW 50305, N'이미 존재하는 파이프라인 코드입니다.', 1;
            INSERT dbo.sales_pipeline (company_id, entity_id, pipeline_id, pipeline_type, client_name, stage,
                                       employee_Id, note, created_date)
            VALUES (@company_id, @entity_id, @pipeline_id, @pipeline_type, @client_name, @stage,
                    @employee_id, @note, CONVERT(date, GETDATE()));   -- created_date 자동(FR-Pipe-03)
        END
        ELSE
        BEGIN  -- pipeline_id/상위조직 수정 불가. adjusted_date/closed_date 는 트리거가 갱신(FR-Pipe-06/07)
            UPDATE dbo.sales_pipeline
               SET pipeline_type=@pipeline_type, client_name=@client_name, stage=@stage,
                   employee_Id=@employee_id, note=@note
             WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id;
            IF @@ROWCOUNT=0 THROW 50306, N'수정 대상 파이프라인이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
-- FR-Pipe-08 / UC-Pipe-07 : 계약 연결(고객사명 일치 검증 포함)
CREATE OR ALTER PROCEDURE dbo.usp_sales_pipeline_link_contract
    @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10),
    @contract_id varchar(20) = NULL   -- NULL : 연결 해제
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @contract_id IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.sales_contract
                            WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id)
                THROW 50311, N'동일 그룹/회사의 계약이 아닙니다.', 1;
            IF NOT EXISTS (SELECT 1
                             FROM dbo.sales_pipeline p
                             JOIN dbo.sales_contract sc ON sc.company_id=p.company_id AND sc.entity_id=p.entity_id AND sc.contract_id=@contract_id
                             JOIN dbo.partner_client pc ON pc.company_id=sc.company_id AND pc.entity_id=sc.entity_id AND pc.client_id=sc.client_id
                            WHERE p.company_id=@company_id AND p.entity_id=@entity_id AND p.pipeline_id=@pipeline_id
                              AND p.client_name = pc.client_name)
                THROW 50312, N'파이프라인 고객사명과 계약 고객사가 일치하지 않습니다.', 1;
        END
        UPDATE dbo.sales_pipeline SET contract_id=@contract_id
         WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id;
        IF @@ROWCOUNT=0 THROW 50313, N'대상 파이프라인이 없습니다.', 1;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_sales_pipeline_delete
    @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    -- FR-Pipe-09 : 하위 액티비티 또는 계약 연결 시 삭제 제한
    IF EXISTS (SELECT 1 FROM dbo.sales_pipeline_detail WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id)
        THROW 50314, N'하위 액티비티가 존재하여 삭제할 수 없습니다.', 1;
    IF EXISTS (SELECT 1 FROM dbo.sales_pipeline WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id AND contract_id IS NOT NULL)
        THROW 50315, N'계약이 연결된 파이프라인은 삭제할 수 없습니다.', 1;
    DELETE dbo.sales_pipeline WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id;
END
GO

/*======================== sales_pipeline_detail =============================*/
CREATE OR ALTER PROCEDURE dbo.usp_sales_activity_list
    @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, pipeline_id, activity_id, created_date, [type], content, incharge, attached
    FROM dbo.sales_pipeline_detail
    WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id
    ORDER BY created_date DESC, activity_id;
END
GO
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
                SET @activity_id = 'ACT' + FORMAT(SYSDATETIME(), 'yyMMddHHmmssff'); -- 시스템 생성 규칙
            IF EXISTS (SELECT 1 FROM dbo.sales_pipeline_detail
                        WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id AND activity_id=@activity_id)
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
CREATE OR ALTER PROCEDURE dbo.usp_sales_activity_delete
    @company_id varchar(10), @entity_id varchar(10), @pipeline_id varchar(10), @activity_id varchar(20)
AS
BEGIN
    SET NOCOUNT ON;   -- FR-Act-07 : 액티비티 단위 삭제, 파이프라인 유지
    DELETE dbo.sales_pipeline_detail
    WHERE company_id=@company_id AND entity_id=@entity_id AND pipeline_id=@pipeline_id AND activity_id=@activity_id;
END
GO

/*============================ sales_contract ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_sales_contract_list
    @company_id varchar(10), @entity_id varchar(10),
    @client_id varchar(10)=NULL, @contract_id varchar(20)=NULL, @contract_type varchar(5)=NULL,
    @status varchar(10)=NULL, @start_from date=NULL, @end_to date=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT sc.company_id, sc.entity_id, sc.client_id, pc.client_name,
           sc.contract_id, sc.contract_type, sc.pipeline_id,
           sc.start_date, sc.end_date, sc.status, sc.contract_amount,
           sc.ledger_date, sc.ledger_no, sc.closed_date
    FROM dbo.sales_contract sc
    LEFT JOIN dbo.partner_client pc ON pc.company_id=sc.company_id AND pc.entity_id=sc.entity_id AND pc.client_id=sc.client_id
    WHERE sc.company_id=@company_id AND sc.entity_id=@entity_id
      AND (@client_id IS NULL OR sc.client_id=@client_id)
      AND (@contract_id IS NULL OR sc.contract_id LIKE '%'+@contract_id+'%')
      AND (@contract_type IS NULL OR sc.contract_type=@contract_type)
      AND (@status IS NULL OR sc.status=@status)
      AND (@start_from IS NULL OR sc.start_date >= @start_from)
      AND (@end_to IS NULL OR sc.end_date <= @end_to)
    ORDER BY sc.start_date DESC, sc.contract_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_sales_contract_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10),
    @client_id varchar(10), @contract_id varchar(20), @contract_type varchar(5),
    @pipeline_id varchar(10)=NULL, @start_date date, @end_date date,
    @status varchar(10)='0', @contract_amount numeric(18,2)=NULL, @closed_date date=NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @contract_type NOT IN ('0','1','2','3','4','5') THROW 50331, N'허용되지 않은 계약 유형입니다.', 1;
        IF @status NOT IN ('0','1','2') THROW 50332, N'허용되지 않은 계약 상태입니다.', 1;
        IF @start_date > @end_date THROW 50333, N'계약 시작일은 종료일보다 늦을 수 없습니다.', 1; -- FR-Contract-06
        -- FR-Contract-04 : 활성 고객사만
        IF NOT EXISTS (SELECT 1 FROM dbo.partner_client
                        WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id AND status=1)
            THROW 50334, N'동일 회사의 활성 고객사만 선택할 수 있습니다.', 1;
        -- FR-Contract-05 : 파이프라인 연결 시 고객사명 일치 검증
        IF @pipeline_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.sales_pipeline p
              JOIN dbo.partner_client pc ON pc.company_id=p.company_id AND pc.entity_id=p.entity_id AND pc.client_id=@client_id
             WHERE p.company_id=@company_id AND p.entity_id=@entity_id AND p.pipeline_id=@pipeline_id
               AND p.client_name = pc.client_name)
            THROW 50335, N'파이프라인 고객사명과 계약 고객사가 일치하지 않습니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.sales_contract
                        WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id AND contract_type=@contract_type)
                THROW 50336, N'이미 존재하는 계약(계약코드+유형)입니다.', 1;
            INSERT dbo.sales_contract (company_id, entity_id, client_id, contract_id, contract_type, pipeline_id,
                                       start_date, end_date, status, contract_amount, closed_date)
            VALUES (@company_id, @entity_id, @client_id, @contract_id, @contract_type, @pipeline_id,
                    @start_date, @end_date, @status, @contract_amount, @closed_date);
        END
        ELSE
        BEGIN  -- 식별키(contract_id, contract_type)/상위조직 수정 불가(FR-Contract-09)
            UPDATE dbo.sales_contract
               SET client_id=@client_id, pipeline_id=@pipeline_id, start_date=@start_date, end_date=@end_date,
                   status=@status, contract_amount=@contract_amount, closed_date=@closed_date
             WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id AND contract_type=@contract_type;
            IF @@ROWCOUNT=0 THROW 50337, N'수정 대상 계약이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
-- FR-Contract-08 / UC-Contract-06 : 계약-전표 연결 (둘 다 입력 or 둘 다 해제)
CREATE OR ALTER PROCEDURE dbo.usp_sales_contract_link_ledger
    @company_id varchar(10), @entity_id varchar(10),
    @contract_id varchar(20), @contract_type varchar(5),
    @ledger_date date = NULL, @ledger_no numeric(10,2) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-Contract-08 : 둘 다 입력 or 둘 다 NULL
        -- T-SQL 에는 boolean 타입이 없어 (expr IS NULL) <> (expr IS NULL) 형태로 비교할 수 없다(Msg 102).
        IF (@ledger_date IS NULL AND @ledger_no IS NOT NULL)
        OR (@ledger_date IS NOT NULL AND @ledger_no IS NULL)
            THROW 50341, N'전표일자와 전표번호는 둘 다 입력하거나 둘 다 비워야 합니다.', 1;
        IF @ledger_date IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.finance_ledger_head
              WHERE company_id=@company_id AND entity_id=@entity_id AND ledger_date=@ledger_date AND ledger_no=@ledger_no)
            THROW 50342, N'동일 그룹/회사에 존재하지 않는 전표입니다.', 1;
        UPDATE dbo.sales_contract SET ledger_date=@ledger_date, ledger_no=@ledger_no
         WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id AND contract_type=@contract_type;
        IF @@ROWCOUNT=0 THROW 50343, N'대상 계약이 없습니다.', 1;
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_sales_contract_delete
    @company_id varchar(10), @entity_id varchar(10), @contract_id varchar(20), @contract_type varchar(5)
AS
BEGIN
    SET NOCOUNT ON;
    -- FR-Contract-09 : 연결된 파이프라인 또는 전표가 있으면 삭제 제한
    IF EXISTS (SELECT 1 FROM dbo.sales_pipeline WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id)
        THROW 50344, N'파이프라인이 연결된 계약은 삭제할 수 없습니다.', 1;
    IF EXISTS (SELECT 1 FROM dbo.sales_contract
                WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id AND contract_type=@contract_type
                  AND ledger_date IS NOT NULL)
        THROW 50345, N'전표가 연결된 계약은 삭제할 수 없습니다.', 1;
    DELETE dbo.sales_contract
    WHERE company_id=@company_id AND entity_id=@entity_id AND contract_id=@contract_id AND contract_type=@contract_type;
END
GO
