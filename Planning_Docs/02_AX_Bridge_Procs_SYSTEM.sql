/*==============================================================================
  AX Bridge - 02. Stored Procedures : AUTH + SYSTEM 도메인
  공통 규약
    - 모든 프로시저는 @company_id/@entity_id 를 세션(토큰) 기준으로 서버가 전달(FR-Bank-08).
    - 목록 프로시저 @search_mode : 'E'(Enter Exact) / 'L'(Like 팝업) / NULL(일반조회) → FR-UI-04.
    - 저장 프로시저 @mode : 'I' 신규 / 'U' 수정.
    - 오류 : THROW 50000번대 + 한글 메시지. 쓰기 작업은 TRY/CATCH + 트랜잭션.
    - user_pass 해시는 usp_auth_* 외부로 절대 반환하지 않는다(FR-Emp-04).
==============================================================================*/
USE AX_Bridge;
GO
/*=============================== AUTH =======================================*/
-- 인증 서비스 전용(내부). API 응답으로 노출 금지. 앱서버가 Argon2id/bcrypt 검증 수행.
CREATE OR ALTER PROCEDURE dbo.usp_auth_get_credential
    @user_id varchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT e.company_id, e.entity_id, e.employee_Id, e.employee_name,
           e.user_id, e.user_pass, e.user_yn, e.status
    FROM dbo.system_employee e
    WHERE e.user_id = @user_id
      AND e.user_yn = 1
      AND e.status <> 'inactive';        -- FR-Emp-07 : inactive 인증 차단
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_auth_update_last_login
    @user_id varchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.system_employee SET last_login = SYSDATETIME() WHERE user_id = @user_id;
END
GO
-- 새 해시는 앱서버에서 생성 후 전달(UC-Emp-05, UC-Admin-03). 기존 해시 반환/표시 금지.
CREATE OR ALTER PROCEDURE dbo.usp_auth_change_password
    @company_id varchar(10), @entity_id varchar(10), @employee_id varchar(10),
    @new_pass_hash varchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    IF NULLIF(LTRIM(RTRIM(@new_pass_hash)),'') IS NULL
        THROW 50001, N'새 비밀번호 해시가 비어 있습니다.', 1;
    UPDATE dbo.system_employee
       SET user_pass = @new_pass_hash, last_manual_edit_at = SYSDATETIME()
     WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id
       AND user_yn = 1;                  -- user_yn=N 이면 변경 기능 제공 안 함(FR-Emp-05)
    IF @@ROWCOUNT = 0 THROW 50002, N'대상 사용자 계정이 없거나 사용자 여부가 N 입니다.', 1;
END
GO

/*============================ system_company ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_system_company_list
    @company_name nvarchar(50) = NULL, @status bit = NULL, @search_mode char(1) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, company_name, company_name_ko, note, description, status
    FROM dbo.system_company
    WHERE (@status IS NULL OR status = @status)
      AND (@company_name IS NULL
           OR (@search_mode = 'E' AND (company_name = @company_name OR company_name_ko = @company_name))
           OR (ISNULL(@search_mode,'L') <> 'E' AND (company_name LIKE '%'+@company_name+'%' OR company_name_ko LIKE '%'+@company_name+'%')))
    ORDER BY company_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_company_get @company_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, company_name, company_name_ko, note, description, status
    FROM dbo.system_company WHERE company_id = @company_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_company_save
    @mode char(1), @company_id varchar(10), @company_name nvarchar(50), @company_name_ko nvarchar(50),
    @note nvarchar(200)=NULL, @description nvarchar(200)=NULL, @status bit=0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @mode = 'I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.system_company WHERE company_id=@company_id)
                THROW 50101, N'이미 존재하는 그룹코드입니다.', 1;   -- FR-Comp-06
            INSERT dbo.system_company (company_id, company_name, company_name_ko, note, description, status)
            VALUES (@company_id, @company_name, @company_name_ko, @note, @description, @status);
        END
        ELSE
        BEGIN  -- 그룹코드는 수정 불가(FR-Comp-07)
            UPDATE dbo.system_company
               SET company_name=@company_name, company_name_ko=@company_name_ko,
                   note=@note, description=@description, status=@status
             WHERE company_id=@company_id;
            IF @@ROWCOUNT = 0 THROW 50102, N'수정 대상 그룹이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_company_delete @company_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF EXISTS (SELECT 1 FROM dbo.system_entity WHERE company_id=@company_id)
        THROW 50103, N'하위 회사가 존재하여 삭제할 수 없습니다. 미사용 전환을 이용하세요.', 1; -- FR-Comp-09
    DELETE dbo.system_company WHERE company_id=@company_id;
END
GO

/*============================= system_entity ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_system_entity_list
    @company_id varchar(10), @entity_name nvarchar(50)=NULL, @status bit=NULL, @search_mode char(1)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, entity_name, entity_name_ko, status
    FROM dbo.system_entity
    WHERE company_id=@company_id
      AND (@status IS NULL OR status=@status)
      AND (@entity_name IS NULL
           OR (@search_mode='E' AND (entity_name=@entity_name OR entity_name_ko=@entity_name))
           OR (ISNULL(@search_mode,'L')<>'E' AND (entity_name LIKE '%'+@entity_name+'%' OR entity_name_ko LIKE '%'+@entity_name+'%')))
    ORDER BY entity_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_entity_get @company_id varchar(10), @entity_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM dbo.system_entity WHERE company_id=@company_id AND entity_id=@entity_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_entity_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10),
    @entity_name nvarchar(50), @entity_name_ko nvarchar(50),
    @RepName nvarchar(100)=NULL, @RegNum varchar(20)=NULL, @BizNum varchar(20)=NULL,
    @BizIndustry nvarchar(100)=NULL, @BizCategory nvarchar(100)=NULL, @Address nvarchar(255)=NULL,
    @estabilish_date date=NULL, @PhoneNumber varchar(30)=NULL, @FaxNumber varchar(30)=NULL,
    @note nvarchar(200)=NULL, @description nvarchar(200)=NULL, @status bit=0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.system_company WHERE company_id=@company_id AND status=0)
            THROW 50111, N'유효한(사용중) 그룹이 아닙니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.system_entity WHERE company_id=@company_id AND entity_id=@entity_id)
                THROW 50112, N'이미 존재하는 회사코드입니다.', 1;
            INSERT dbo.system_entity (company_id, entity_id, entity_name, entity_name_ko, RepName, RegNum, BizNum,
                BizIndustry, BizCategory, Address, estabilish_date, PhoneNumber, FaxNumber, note, description, status)
            VALUES (@company_id, @entity_id, @entity_name, @entity_name_ko, @RepName, @RegNum, @BizNum,
                @BizIndustry, @BizCategory, @Address, @estabilish_date, @PhoneNumber, @FaxNumber, @note, @description, @status);
        END
        ELSE
        BEGIN
            UPDATE dbo.system_entity
               SET entity_name=@entity_name, entity_name_ko=@entity_name_ko, RepName=@RepName, RegNum=@RegNum,
                   BizNum=@BizNum, BizIndustry=@BizIndustry, BizCategory=@BizCategory, Address=@Address,
                   estabilish_date=@estabilish_date, PhoneNumber=@PhoneNumber, FaxNumber=@FaxNumber,
                   note=@note, description=@description, status=@status
             WHERE company_id=@company_id AND entity_id=@entity_id;
            IF @@ROWCOUNT=0 THROW 50113, N'수정 대상 회사가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_entity_delete @company_id varchar(10), @entity_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.system_team WHERE company_id=@company_id AND entity_id=@entity_id)
       OR EXISTS (SELECT 1 FROM dbo.system_pod WHERE company_id=@company_id AND entity_id=@entity_id)
       OR EXISTS (SELECT 1 FROM dbo.system_employee WHERE company_id=@company_id AND entity_id=@entity_id)
        THROW 50114, N'부서/Pod/직원 등 하위 데이터가 존재하여 삭제할 수 없습니다.', 1; -- FR-Entity-09
    DELETE dbo.system_entity WHERE company_id=@company_id AND entity_id=@entity_id;
END
GO

/*=============================== system_pod =================================*/
CREATE OR ALTER PROCEDURE dbo.usp_system_pod_list
    @company_id varchar(10), @entity_id varchar(10),
    @pod_keyword nvarchar(200)=NULL, @status bit=NULL, @search_mode char(1)=NULL,
    @active_only bit = 0          -- 1: 신규 선택 팝업용(미사용 제외, FR-Pod-05)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, pod_id, pod_name, status
    FROM dbo.system_pod
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@status IS NULL OR status=@status)
      AND (@active_only=0 OR status=0)
      AND (@pod_keyword IS NULL
           OR (@search_mode='E' AND (pod_id=@pod_keyword OR pod_name=@pod_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (pod_id LIKE '%'+@pod_keyword+'%' OR pod_name LIKE '%'+@pod_keyword+'%')))
    ORDER BY pod_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_pod_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10),
    @pod_id varchar(4), @pod_name nvarchar(200), @status bit=0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.system_pod WHERE company_id=@company_id AND entity_id=@entity_id AND pod_id=@pod_id)
                THROW 50121, N'이미 존재하는 Pod 코드입니다.', 1;
            INSERT dbo.system_pod (company_id, entity_id, pod_id, pod_name, status)
            VALUES (@company_id, @entity_id, @pod_id, @pod_name, @status);
        END
        ELSE
        BEGIN
            UPDATE dbo.system_pod SET pod_name=@pod_name, status=@status
             WHERE company_id=@company_id AND entity_id=@entity_id AND pod_id=@pod_id;
            IF @@ROWCOUNT=0 THROW 50122, N'수정 대상 Pod가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_pod_delete
    @company_id varchar(10), @entity_id varchar(10), @pod_id varchar(4)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.system_team WHERE company_id=@company_id AND entity_id=@entity_id AND pod_id=@pod_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND pod_id=@pod_id)
        THROW 50123, N'부서 또는 전표에서 참조 중인 Pod는 삭제할 수 없습니다.', 1; -- FR-Pod-06
    DELETE dbo.system_pod WHERE company_id=@company_id AND entity_id=@entity_id AND pod_id=@pod_id;
END
GO

/*=============================== system_team ================================*/
CREATE OR ALTER PROCEDURE dbo.usp_system_team_list
    @company_id varchar(10), @entity_id varchar(10),
    @team_keyword nvarchar(200)=NULL, @status bit=NULL, @search_mode char(1)=NULL, @active_only bit=0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.company_id, t.entity_id, t.Team_id, t.team_name, t.team_name_ko,
           t.owner, o.employee_name AS owner_name,
           t.leader_user_id, l.employee_name AS leader_name,
           t.pod_id, p.pod_name, t.note, t.status
    FROM dbo.system_team t
    LEFT JOIN dbo.system_employee o ON o.company_id=t.company_id AND o.entity_id=t.entity_id AND o.employee_Id=t.owner
    LEFT JOIN dbo.system_employee l ON l.company_id=t.company_id AND l.entity_id=t.entity_id AND l.employee_Id=t.leader_user_id
    LEFT JOIN dbo.system_pod p ON p.company_id=t.company_id AND p.entity_id=t.entity_id AND p.pod_id=t.pod_id
    WHERE t.company_id=@company_id AND t.entity_id=@entity_id
      AND (@status IS NULL OR t.status=@status)
      AND (@active_only=0 OR t.status=0)
      AND (@team_keyword IS NULL
           OR (@search_mode='E' AND (t.Team_id=@team_keyword OR t.team_name=@team_keyword OR t.team_name_ko=@team_keyword))
           OR (ISNULL(@search_mode,'L')<>'E' AND (t.Team_id LIKE '%'+@team_keyword+'%' OR t.team_name LIKE '%'+@team_keyword+'%' OR t.team_name_ko LIKE '%'+@team_keyword+'%')))
    ORDER BY t.Team_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_team_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @team_id varchar(10),
    @team_name nvarchar(200)=NULL, @team_name_ko nvarchar(200)=NULL,
    @owner varchar(20), @leader_user_id varchar(20), @pod_id varchar(4)=NULL,
    @note nvarchar(200)=NULL, @status bit=0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- 오너/리더/Pod 소속 검증(FR-Dept-04)
        IF NOT EXISTS (SELECT 1 FROM dbo.system_employee WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@owner)
            THROW 50131, N'오너는 동일 그룹/회사 소속 직원이어야 합니다.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.system_employee WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@leader_user_id)
            THROW 50132, N'리더는 동일 그룹/회사 소속 직원이어야 합니다.', 1;
        IF @pod_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM dbo.system_pod WHERE company_id=@company_id AND entity_id=@entity_id AND pod_id=@pod_id AND status=0)
            THROW 50133, N'Pod는 동일 회사의 사용중 Pod만 선택할 수 있습니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.system_team WHERE company_id=@company_id AND entity_id=@entity_id AND Team_id=@team_id)
                THROW 50134, N'이미 존재하는 Team 코드입니다.', 1;
            INSERT dbo.system_team (company_id, entity_id, Team_id, team_name, team_name_ko, owner, leader_user_id, pod_id, note, status)
            VALUES (@company_id, @entity_id, @team_id, @team_name, @team_name_ko, @owner, @leader_user_id, @pod_id, @note, @status);
        END
        ELSE
        BEGIN
            UPDATE dbo.system_team
               SET team_name=@team_name, team_name_ko=@team_name_ko, owner=@owner,
                   leader_user_id=@leader_user_id, pod_id=@pod_id, note=@note, status=@status
             WHERE company_id=@company_id AND entity_id=@entity_id AND Team_id=@team_id;
            IF @@ROWCOUNT=0 THROW 50135, N'수정 대상 부서가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_team_delete
    @company_id varchar(10), @entity_id varchar(10), @team_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.system_employee WHERE company_id=@company_id AND entity_id=@entity_id AND Team_id=@team_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND Team_id=@team_id)
        THROW 50136, N'직원 또는 전표에서 참조 중인 부서는 삭제할 수 없습니다.', 1; -- FR-Dept-07
    DELETE dbo.system_team WHERE company_id=@company_id AND entity_id=@entity_id AND Team_id=@team_id;
END
GO

/*============================ system_employee ===============================*/
CREATE OR ALTER PROCEDURE dbo.usp_system_employee_list
    @company_id varchar(10), @entity_id varchar(10), @team_id varchar(10)=NULL,
    @employee_id varchar(10)=NULL, @employee_name nvarchar(40)=NULL,
    @emp_status varchar(20)=NULL, @user_yn bit=NULL, @search_mode char(1)=NULL,
    @active_only bit=0             -- 1: 담당자/승인자 선택 팝업(비활성 제외)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, Team_id, employee_Id, employee_name, english_name, email,
           title, title_abbr, employment_type, status, start_date, departure_date,
           user_yn, user_id, last_login, last_manual_edit_at   -- user_pass 반환 금지(FR-Emp-02)
    FROM dbo.system_employee
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@team_id IS NULL OR Team_id=@team_id)
      AND (@employee_id IS NULL OR employee_Id=@employee_id)
      AND (@emp_status IS NULL OR status=@emp_status)
      AND (@user_yn IS NULL OR user_yn=@user_yn)
      AND (@active_only=0 OR status NOT IN ('inactive'))
      AND (@employee_name IS NULL
           OR (@search_mode='E' AND employee_name=@employee_name)
           OR (ISNULL(@search_mode,'L')<>'E' AND employee_name LIKE '%'+@employee_name+'%'))
    ORDER BY employee_Id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_employee_get
    @company_id varchar(10), @entity_id varchar(10), @employee_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, Team_id, employee_Id, employee_name, email, english_name,
           title, title_abbr, employment_type, status, departure_date, start_date, timezone,
           phone, birthday, profile_image_url, slack_user_id, slack_handle, social_buddy,
           user_yn, user_id, last_login, last_manual_edit_at   -- user_pass 제외(FR-Emp-04)
    FROM dbo.system_employee
    WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_employee_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10), @team_id varchar(10),
    @employee_id varchar(10), @employee_name nvarchar(40),
    @email varchar(40)=NULL, @english_name nvarchar(40)=NULL, @title nvarchar(40)=NULL,
    @title_abbr nvarchar(40)=NULL, @employment_type nvarchar(40)=NULL, @emp_status varchar(20)='active',
    @departure_date date=NULL, @start_date date=NULL, @timezone varchar(20)=NULL,
    @phone varchar(20)=NULL, @birthday date=NULL, @profile_image_url varchar(200)=NULL,
    @slack_user_id varchar(200)=NULL, @slack_handle varchar(200)=NULL, @social_buddy nvarchar(200)=NULL,
    @user_yn bit=0, @user_id varchar(20)=NULL,
    @init_pass_hash varchar(255)=NULL   -- 신규 & user_yn=1 : 필수 / 수정 : NULL이면 기존 해시 유지(FR-Emp-05)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.system_team WHERE company_id=@company_id AND entity_id=@entity_id AND Team_id=@team_id)
            THROW 50141, N'유효한 그룹/회사/부서 조합이 아닙니다.', 1;   -- FR-Emp-06
        IF @user_yn=1 AND NULLIF(@user_id,'') IS NULL
            THROW 50142, N'사용자 여부가 Y인 경우 사용자ID는 필수입니다.', 1;
        IF @user_yn=1 AND EXISTS (SELECT 1 FROM dbo.system_employee
                                   WHERE user_id=@user_id AND NOT (company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id))
            THROW 50143, N'이미 사용 중인 사용자ID입니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.system_employee WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id)
                THROW 50144, N'이미 존재하는 사번입니다.', 1;
            IF @user_yn=1 AND NULLIF(@init_pass_hash,'') IS NULL
                THROW 50145, N'사용자 계정 신규 등록 시 초기 비밀번호(해시)가 필요합니다.', 1;
            INSERT dbo.system_employee (company_id, entity_id, Team_id, employee_Id, employee_name, email, english_name,
                title, title_abbr, employment_type, status, departure_date, start_date, timezone, phone, birthday,
                profile_image_url, slack_user_id, slack_handle, social_buddy, user_yn, user_id, user_pass, last_manual_edit_at)
            VALUES (@company_id, @entity_id, @team_id, @employee_id, @employee_name, @email, @english_name,
                @title, @title_abbr, @employment_type, @emp_status, @departure_date, @start_date, @timezone, @phone, @birthday,
                @profile_image_url, @slack_user_id, @slack_handle, @social_buddy, @user_yn, @user_id,
                -- user_yn=N 이면 로그인 불가 임의 자격증명 해시 저장(FR-Emp-05)
                COALESCE(NULLIF(@init_pass_hash,''), '!LOCKED!' + CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varchar(36), NEWID())), 2)),
                SYSDATETIME());
        END
        ELSE
        BEGIN
            UPDATE dbo.system_employee
               SET Team_id=@team_id, employee_name=@employee_name, email=@email, english_name=@english_name,
                   title=@title, title_abbr=@title_abbr, employment_type=@employment_type, status=@emp_status,
                   departure_date=@departure_date, start_date=@start_date, timezone=@timezone, phone=@phone,
                   birthday=@birthday, profile_image_url=@profile_image_url, slack_user_id=@slack_user_id,
                   slack_handle=@slack_handle, social_buddy=@social_buddy, user_yn=@user_yn, user_id=@user_id,
                   user_pass = COALESCE(NULLIF(@init_pass_hash,''), user_pass),  -- 미입력 시 기존 해시 유지
                   last_manual_edit_at = SYSDATETIME()
             WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id;
            IF @@ROWCOUNT=0 THROW 50146, N'수정 대상 직원이 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_employee_delete
    @company_id varchar(10), @entity_id varchar(10), @employee_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    -- FR-Emp-08 : 조직/영업/전표 참조 검증. built-in admin 물리삭제는 트리거가 추가 차단(FR-Admin-06)
    IF EXISTS (SELECT 1 FROM dbo.system_team WHERE company_id=@company_id AND entity_id=@entity_id AND (owner=@employee_id OR leader_user_id=@employee_id))
       OR EXISTS (SELECT 1 FROM dbo.sales_pipeline WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id)
       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_head WHERE company_id=@company_id AND entity_id=@entity_id AND (employee_Id=@employee_id OR approver_Id=@employee_id))
       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id)
        THROW 50147, N'참조 중인 직원은 삭제할 수 없습니다. inactive 전환을 이용하세요.', 1;
    DELETE dbo.system_employee WHERE company_id=@company_id AND entity_id=@entity_id AND employee_Id=@employee_id;
END
GO

/*============================== system_year =================================*/
CREATE OR ALTER PROCEDURE dbo.usp_system_year_list
    @company_id varchar(10), @entity_id varchar(10),
    @company_year_id varchar(10)=NULL, @company_year numeric(10,2)=NULL, @actual_year numeric(10,2)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT company_id, entity_id, company_year_id, company_year, actual_year
    FROM dbo.system_year
    WHERE company_id=@company_id AND entity_id=@entity_id
      AND (@company_year_id IS NULL OR company_year_id=@company_year_id)
      AND (@company_year IS NULL OR company_year=@company_year)
      AND (@actual_year IS NULL OR actual_year=@actual_year)
    ORDER BY actual_year, company_year;
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_year_save
    @mode char(1), @company_id varchar(10), @entity_id varchar(10),
    @company_year_id varchar(10), @company_year numeric(10,2), @actual_year numeric(10,2)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        -- FR-Year-04 : 기수 1 이상 정수, 실제연도 4자리 YYYY
        IF @company_year < 1 OR @company_year <> FLOOR(@company_year)
            THROW 50151, N'기수는 1 이상의 정수여야 합니다.', 1;
        IF @actual_year NOT BETWEEN 1000 AND 9999 OR @actual_year <> FLOOR(@actual_year)
            THROW 50152, N'실제연도는 4자리 정수(YYYY)여야 합니다.', 1;
        IF @mode='I'
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.system_year WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id)
                THROW 50153, N'이미 존재하는 기수코드입니다.', 1;
            INSERT dbo.system_year (company_id, entity_id, company_year_id, company_year, actual_year)
            VALUES (@company_id, @entity_id, @company_year_id, @company_year, @actual_year);
        END
        ELSE
        BEGIN
            -- FR-Year-05 : 회계 데이터 참조 시 수정 제한
            IF EXISTS (SELECT 1 FROM dbo.finance_open_balance WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id)
                THROW 50154, N'기초잔액에서 참조 중인 기수는 수정할 수 없습니다.', 1;
            UPDATE dbo.system_year SET company_year=@company_year, actual_year=@actual_year
             WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
            IF @@ROWCOUNT=0 THROW 50155, N'수정 대상 기수가 없습니다.', 1;
        END
        COMMIT;
    END TRY
    BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_system_year_delete
    @company_id varchar(10), @entity_id varchar(10), @company_year_id varchar(10)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.finance_open_balance WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id)
        THROW 50156, N'기초잔액에서 참조 중인 기수는 삭제할 수 없습니다.', 1; -- FR-Year-06
    DELETE dbo.system_year WHERE company_id=@company_id AND entity_id=@entity_id AND company_year_id=@company_year_id;
END
GO
