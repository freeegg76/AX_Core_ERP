/*==============================================================================
  AX Bridge - 03. Stored Procedures : PARTNER 도메인
  (고객사 partner_client · 거래처 partner_vendor · 수금/지급정책 partner_term)
==============================================================================*/
USE AX_Bridge;
GO
/*============================= partner_term =================================*/
CREATE OR ALTER PROCEDURE dbo.usp_partner_term_list
    @company_id varchar(10), @entity_id varchar(10),
    @term_keyword varchar(20)=NULL, @status bit=NULL, @search_mode char(1)=NULL,
    @active_only bit=0            -- 1: 고객사/거래처 정책 선택 팝업(status=Y 만, FR-Client-04/FR-Vendor-04)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, term_id, term_condition, base_rule, fixed_day, offset_days, status
    FROM dbo.partner_term
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@status IS NULL OR status=@status)
      AND (@active_only=0 OR status=1)
      AND (@term_keyword IS NULL
           OR (@search_mode='E' AND (term_id=@term_keyword OR term_condition=@term_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (term_id LIKE '%'+@term_keyword+'%' OR term_condition LIKE '%'+@term_keyword+'%')))
    ORDER BY term_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_term_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @term_id varchar(10),
    @base_rule varchar(10), @fixed_day numeric(2,0)=NULL, @offset_days numeric(3,0)=0, @status bit=1
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-Term-03/04 : EOM ↔ fixed_day NULL, CURM ↔ fixed_day 1~31 & offset 0
        IF @base_rule='EOM' AND @fixed_day IS NOT NULL
            THROW 50201, N'EOM 정책은 고정일자를 입력할 수 없습니다.', 1;
        IF @base_rule='CURM' AND (@fixed_day IS NULL OR @fixed_day NOT BETWEEN 1 AND 31)
            THROW 50202, N'CURM 정책의 고정일자는 1~31 이어야 합니다.', 1;
        IF @base_rule='CURM' SET @offset_days = 0;
        -- term_condition 은 트리거(trg_partner_term_condition)가 표준식으로 자동 구성(FR-Term-05)
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.partner_term WHERE company_id=@company_id AND entity_id=@entity_id AND term_id=@term_id)
                THROW 50203, N'이미 존재하는 정책코드입니다.', 1;
            INSERT dbo.partner_term (company_id, entity_id, term_id, term_condition, base_rule, fixed_day, offset_days, status)
            VALUES (@company_id, @entity_id, @term_id, '-', @base_rule, @fixed_day, @offset_days, @status);
        END
        ELSE
        BEGIN  -- 정책코드는 수정 불가(FR-Term-07)
            UPDATE dbo.partner_term
               SET base_rule=@base_rule, fixed_day=@fixed_day, offset_days=@offset_days, status=@status
             WHERE company_id=@company_id AND entity_id=@entity_id AND term_id=@term_id;
            IF @@ROWCOUNT=0 THROW 50204, N'수정 대상 정책이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_term_delete
    @company_id varchar(10), @entity_id varchar(10), @term_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.partner_client WHERE company_id=@company_id AND entity_id=@entity_id AND collecting_type=@term_id)
       OR EXISTS (SELECT 1 FROM dbo.partner_vendor WHERE company_id=@company_id AND entity_id=@entity_id AND payment_type=@term_id)
        THROW 50205, N'고객사/거래처에서 참조 중인 정책은 삭제할 수 없습니다. 미사용 전환을 이용하세요.', 1; -- FR-Term-08
    DELETE dbo.partner_term WHERE company_id=@company_id AND entity_id=@entity_id AND term_id=@term_id;
END
GO
-- FR-Term-06 / UC-Term-04 : 기준일 → 지급/입금일 계산 미리보기.
-- EOM : 기준월 말일 + offset_days. CURM : 기준월 fixed_day (해당 월 말일 초과 시 월말 보정)
CREATE OR ALTER PROCEDURE dbo.usp_partner_term_calc_due
    @company_id varchar(10), @entity_id varchar(10), @term_id varchar(10),
    @base_date date,
    @due_date date OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @rule varchar(10), @fixed numeric(2,0), @offset numeric(3,0), @eom date;
    SELECT @rule=base_rule, @fixed=fixed_day, @offset=offset_days
    FROM dbo.partner_term
    WHERE company_id=@company_id AND entity_id=@entity_id AND term_id=@term_id;
    IF @rule IS NULL THROW 50206, N'존재하지 않는 지급정책입니다.', 1;

    SET @eom = EOMONTH(@base_date);
    IF @rule='EOM'
        SET @due_date = DATEADD(DAY, CONVERT(int,@offset), @eom);
    ELSE  -- CURM
        SET @due_date = CASE WHEN @fixed > DAY(@eom) THEN @eom
                             ELSE DATEFROMPARTS(YEAR(@base_date), MONTH(@base_date), CONVERT(int,@fixed)) END;
    SELECT @due_date AS due_date;
END
GO

/*============================ partner_client ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_partner_client_list
    @company_id varchar(10), @entity_id varchar(10),
    @client_keyword nvarchar(50)=NULL, @status bit=NULL, @search_mode char(1)=NULL,
    @active_only bit=0            -- 1: 계약/전표 선택 팝업(비활성 제외, FR-Client-06)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT c.company_id, c.entity_id, c.client_id, c.client_name, c.NickName,
           c.collecting_type, t.term_condition, c.status, c.vat_id, c.default_billing_currency
    FROM dbo.partner_client c
    LEFT JOIN dbo.partner_term t ON t.company_id=c.company_id AND t.entity_id=c.entity_id AND t.term_id=c.collecting_type
    WHERE c.company_id=@company_id AND c.entity_id=@entity_id
      AND (@status IS NULL OR c.status=@status)
      AND (@active_only=0 OR c.status=1)
      AND (@client_keyword IS NULL
           OR (@search_mode='E' AND (c.client_id=@client_keyword OR c.client_name=@client_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (c.client_id LIKE '%'+@client_keyword+'%' OR c.client_name LIKE '%'+@client_keyword+'%')))
    ORDER BY c.client_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_client_get
    @company_id varchar(10), @entity_id varchar(10), @client_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.partner_client
    WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_client_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @client_id varchar(10),
    @client_name nvarchar(50), @collecting_type varchar(50)=NULL, @status bit=1,
    @vat_id varchar(20)=NULL, @NickName nvarchar(50)=NULL, @RepName nvarchar(50)=NULL,
    @RegNum varchar(50)=NULL, @BizIndustry nvarchar(50)=NULL, @BizCategory nvarchar(50)=NULL,
    @client_Address nvarchar(200)=NULL, @PhoneNumber varchar(20)=NULL, @FaxNumber varchar(20)=NULL,
    @BankCode nvarchar(50)=NULL, @BankBranch nvarchar(50)=NULL, @BankAccount varchar(50)=NULL,
    @BankHolder nvarchar(50)=NULL, @website varchar(200)=NULL, @logo_url varchar(200)=NULL,
    @industry nvarchar(200)=NULL, @notes nvarchar(200)=NULL, @default_billing_currency varchar(10)=NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-Client-04 : 수금정책은 동일 회사·사용중 정책만
        IF @collecting_type IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.partner_term WHERE company_id=@company_id AND entity_id=@entity_id AND term_id=@collecting_type AND status=1)
            THROW 50211, N'수금정책은 동일 회사의 사용중 정책만 선택할 수 있습니다.', 1;
        -- FR-Client-08 : 사업자등록번호 형식(입력 시 숫자/하이픈 허용)
        IF @vat_id IS NOT NULL AND @vat_id LIKE '%[^0-9-]%'
            THROW 50212, N'사업자등록번호 형식이 올바르지 않습니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.partner_client WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id)
                THROW 50213, N'이미 존재하는 고객사 코드입니다.', 1;
            INSERT dbo.partner_client (company_id, entity_id, client_id, client_name, collecting_type, status, vat_id,
                NickName, RepName, RegNum, BizIndustry, BizCategory, client_Address, PhoneNumber, FaxNumber,
                BankCode, BankBranch, BankAccount, BankHolder, website, logo_url, industry, notes, default_billing_currency)
            VALUES (@company_id, @entity_id, @client_id, @client_name, @collecting_type, @status, @vat_id,
                @NickName, @RepName, @RegNum, @BizIndustry, @BizCategory, @client_Address, @PhoneNumber, @FaxNumber,
                @BankCode, @BankBranch, @BankAccount, @BankHolder, @website, @logo_url, @industry, @notes, @default_billing_currency);
        END
        ELSE
        BEGIN  -- 고객사 코드/상위조직 수정 불가(FR-Client-05)
            UPDATE dbo.partner_client
               SET client_name=@client_name, collecting_type=@collecting_type, status=@status, vat_id=@vat_id,
                   NickName=@NickName, RepName=@RepName, RegNum=@RegNum, BizIndustry=@BizIndustry, BizCategory=@BizCategory,
                   client_Address=@client_Address, PhoneNumber=@PhoneNumber, FaxNumber=@FaxNumber,
                   BankCode=@BankCode, BankBranch=@BankBranch, BankAccount=@BankAccount, BankHolder=@BankHolder,
                   website=@website, logo_url=@logo_url, industry=@industry, notes=@notes,
                   default_billing_currency=@default_billing_currency
             WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id;
            IF @@ROWCOUNT=0 THROW 50214, N'수정 대상 고객사가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_client_delete
    @company_id varchar(10), @entity_id varchar(10), @client_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.sales_contract WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_open_balance WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id)
        THROW 50215, N'계약/전표/기초잔액에서 참조 중인 고객사는 삭제할 수 없습니다.', 1; -- FR-Client-07
    DELETE dbo.partner_client WHERE company_id=@company_id AND entity_id=@entity_id AND client_id=@client_id;
END
GO

/*============================ partner_vendor ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_partner_vendor_list
    @company_id varchar(10), @entity_id varchar(10),
    @vendor_keyword nvarchar(50)=NULL, @status bit=NULL, @search_mode char(1)=NULL, @active_only bit=0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT v.company_id, v.entity_id, v.vendor_id, v.vendor_name, v.NickName,
           v.payment_type, t.term_condition, v.status, v.vat_id, v.default_billing_currency
    FROM dbo.partner_vendor v
    LEFT JOIN dbo.partner_term t ON t.company_id=v.company_id AND t.entity_id=v.entity_id AND t.term_id=v.payment_type
    WHERE v.company_id=@company_id AND v.entity_id=@entity_id
      AND (@status IS NULL OR v.status=@status)
      AND (@active_only=0 OR v.status=1)
      AND (@vendor_keyword IS NULL
           OR (@search_mode='E' AND (v.vendor_id=@vendor_keyword OR v.vendor_name=@vendor_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (v.vendor_id LIKE '%'+@vendor_keyword+'%' OR v.vendor_name LIKE '%'+@vendor_keyword+'%')))
    ORDER BY v.vendor_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_vendor_get
    @company_id varchar(10), @entity_id varchar(10), @vendor_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.partner_vendor
    WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=@vendor_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_vendor_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @vendor_id varchar(10),
    @vendor_name nvarchar(50), @payment_type varchar(50)=NULL, @status bit=1,
    @vat_id varchar(20)=NULL, @NickName nvarchar(50)=NULL, @RepName nvarchar(50)=NULL,
    @RegNum varchar(50)=NULL, @BizIndustry nvarchar(50)=NULL, @BizCategory nvarchar(50)=NULL,
    @vendor_Address nvarchar(200)=NULL, @PhoneNumber varchar(20)=NULL, @FaxNumber varchar(20)=NULL,
    @BankCode nvarchar(50)=NULL, @BankBranch nvarchar(50)=NULL, @BankAccount varchar(50)=NULL,
    @BankHolder nvarchar(50)=NULL, @website varchar(200)=NULL, @logo_url varchar(200)=NULL,
    @industry nvarchar(200)=NULL, @notes nvarchar(200)=NULL, @default_billing_currency varchar(10)=NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @payment_type IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.partner_term WHERE company_id=@company_id AND entity_id=@entity_id AND term_id=@payment_type AND status=1)
            THROW 50221, N'지급정책은 동일 회사의 사용중 정책만 선택할 수 있습니다.', 1; -- FR-Vendor-04
        IF @vat_id IS NOT NULL AND @vat_id LIKE '%[^0-9-]%'
            THROW 50222, N'사업자등록번호 형식이 올바르지 않습니다.', 1;               -- FR-Vendor-08
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.partner_vendor WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=@vendor_id)
                THROW 50223, N'이미 존재하는 거래처 코드입니다.', 1;
            INSERT dbo.partner_vendor (company_id, entity_id, vendor_id, vendor_name, payment_type, status, vat_id,
                NickName, RepName, RegNum, BizIndustry, BizCategory, vendor_Address, PhoneNumber, FaxNumber,
                BankCode, BankBranch, BankAccount, BankHolder, website, logo_url, industry, notes, default_billing_currency)
            VALUES (@company_id, @entity_id, @vendor_id, @vendor_name, @payment_type, @status, @vat_id,
                @NickName, @RepName, @RegNum, @BizIndustry, @BizCategory, @vendor_Address, @PhoneNumber, @FaxNumber,
                @BankCode, @BankBranch, @BankAccount, @BankHolder, @website, @logo_url, @industry, @notes, @default_billing_currency);
        END
        ELSE
        BEGIN
            UPDATE dbo.partner_vendor
               SET vendor_name=@vendor_name, payment_type=@payment_type, status=@status, vat_id=@vat_id,
                   NickName=@NickName, RepName=@RepName, RegNum=@RegNum, BizIndustry=@BizIndustry, BizCategory=@BizCategory,
                   vendor_Address=@vendor_Address, PhoneNumber=@PhoneNumber, FaxNumber=@FaxNumber,
                   BankCode=@BankCode, BankBranch=@BankBranch, BankAccount=@BankAccount, BankHolder=@BankHolder,
                   website=@website, logo_url=@logo_url, industry=@industry, notes=@notes,
                   default_billing_currency=@default_billing_currency
             WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=@vendor_id;
            IF @@ROWCOUNT=0 THROW 50224, N'수정 대상 거래처가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_partner_vendor_delete
    @company_id varchar(10), @entity_id varchar(10), @vendor_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    -- FR-Vendor-07 : 현재 확정된 직접 FK는 전표/기초잔액 관리항목 참조
    IF EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=@vendor_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_open_balance WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=@vendor_id)
        THROW 50225, N'전표/기초잔액에서 참조 중인 거래처는 삭제할 수 없습니다. 비활성 전환을 이용하세요.', 1;
    DELETE dbo.partner_vendor WHERE company_id=@company_id AND entity_id=@entity_id AND vendor_id=@vendor_id;
END
GO
