/*==============================================================================
  AX Bridge - 01. Table DDL (MSSQL / SQL Server 2016+)
  근거 : AX_Bridge.xlsx (SYSTEM/Partner/Sales/Finance 시트) + 화면기획서 4종
  설계 결정(명세서 '개요' 시트 참조)
    - 멀티테넌시 : 모든 업무 테이블 PK는 (company_id, entity_id, ...) 복합키.
      원본 명세의 단일 PK 표기는 회사 내 식별 기준으로 해석(FR-GL-13 준용).
    - finance_GL의 bank_id~due_date 'PK' 표기는 오기로 판단, Boolean 플래그 처리(FR-GL-06).
    - sales_contract의 ledger_date/no 'PK' 표기는 선택적 전표 연결로 해석(NULL 허용, FR-Contract-08).
    - Boolean : BIT 사용. 원본 코드값(Y/N, 0/1)은 CHECK/기본값 주석으로 유지.
==============================================================================*/
IF DB_ID(N'AX_Bridge') IS NULL CREATE DATABASE AX_Bridge;
GO
USE AX_Bridge;
GO

/*------------------------------------------------------------ SYSTEM 도메인 */
CREATE TABLE dbo.system_company (
    company_id      varchar(10)  NOT NULL,
    company_name    nvarchar(50) NOT NULL,
    company_name_ko nvarchar(50) NOT NULL,
    note            nvarchar(200) NULL,
    description     nvarchar(200) NULL,
    status          bit          NOT NULL CONSTRAINT DF_company_status DEFAULT (0), -- 0:사용 1:미사용
    CONSTRAINT PK_system_company PRIMARY KEY (company_id)
);
GO
CREATE TABLE dbo.system_entity (
    company_id      varchar(10)  NOT NULL,
    entity_id       varchar(10)  NOT NULL,
    entity_name     nvarchar(50) NOT NULL,
    entity_name_ko  nvarchar(50) NOT NULL,
    RepName         nvarchar(100) NULL,
    RegNum          varchar(20)  NULL,
    BizNum          varchar(20)  NULL,
    BizIndustry     nvarchar(100) NULL,
    BizCategory     nvarchar(100) NULL,
    Address         nvarchar(255) NULL,
    estabilish_date date         NULL,
    PhoneNumber     varchar(30)  NULL,
    FaxNumber       varchar(30)  NULL,
    note            nvarchar(200) NULL,
    description     nvarchar(200) NULL,
    status          bit          NOT NULL CONSTRAINT DF_entity_status DEFAULT (0),
    CONSTRAINT PK_system_entity PRIMARY KEY (company_id, entity_id),
    CONSTRAINT FK_entity_company FOREIGN KEY (company_id) REFERENCES dbo.system_company(company_id)
);
GO
CREATE TABLE dbo.system_pod (
    company_id varchar(10) NOT NULL,
    entity_id  varchar(10) NOT NULL,
    pod_id     varchar(4)  NOT NULL,
    pod_name   nvarchar(200) NOT NULL,
    status     bit NOT NULL CONSTRAINT DF_pod_status DEFAULT (0),
    CONSTRAINT PK_system_pod PRIMARY KEY (company_id, entity_id, pod_id),
    CONSTRAINT FK_pod_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id)
);
GO
CREATE TABLE dbo.system_team (
    company_id     varchar(10) NOT NULL,
    entity_id      varchar(10) NOT NULL,
    Team_id        varchar(10) NOT NULL,
    team_name      nvarchar(200) NULL,
    team_name_ko   nvarchar(200) NULL,
    owner          varchar(20) NOT NULL,  -- system_employee.employee_Id (순환참조로 FK 미적용, 프로시저 검증)
    leader_user_id varchar(20) NOT NULL,  -- system_employee.employee_Id
    note           nvarchar(200) NULL,
    status         bit NOT NULL CONSTRAINT DF_team_status DEFAULT (0),
    pod_id         varchar(4) NULL,
    CONSTRAINT PK_system_team PRIMARY KEY (company_id, entity_id, Team_id),
    CONSTRAINT FK_team_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT FK_team_pod FOREIGN KEY (company_id, entity_id, pod_id) REFERENCES dbo.system_pod(company_id, entity_id, pod_id)
);
GO
CREATE TABLE dbo.system_employee (
    company_id        varchar(10) NOT NULL,
    entity_id         varchar(10) NOT NULL,
    Team_id           varchar(10) NOT NULL,
    employee_Id       varchar(10) NOT NULL,
    employee_name     nvarchar(40) NOT NULL,
    email             varchar(40)  NULL,
    english_name      nvarchar(40) NULL,
    title             nvarchar(40) NULL,
    title_abbr        nvarchar(40) NULL,
    employment_type   nvarchar(40) NULL,
    status            varchar(20)  NULL
        CONSTRAINT CK_emp_status CHECK (status IN ('planned','probation','active','on_leave','leaving_soon','inactive')),
    departure_date    date NULL,
    start_date        date NULL,
    timezone          varchar(20) NULL,
    phone             varchar(20) NULL,
    birthday          date NULL,
    profile_image_url varchar(200) NULL,
    slack_user_id     varchar(200) NULL,
    slack_handle      varchar(200) NULL,
    social_buddy      nvarchar(200) NULL,
    user_yn           bit NOT NULL CONSTRAINT DF_emp_user_yn DEFAULT (0), -- 0:n 1:y
    user_id           varchar(20) NULL,
    user_pass         varchar(255) NOT NULL, -- Argon2id/bcrypt 해시 전용. 평문 저장 금지(FR-Emp-04)
    last_login        datetime2(0) NULL,
    last_manual_edit_at datetime2(0) NULL,
    CONSTRAINT PK_system_employee PRIMARY KEY (company_id, entity_id, employee_Id),
    CONSTRAINT FK_emp_team FOREIGN KEY (company_id, entity_id, Team_id) REFERENCES dbo.system_team(company_id, entity_id, Team_id)
);
GO
-- 사용자ID는 시스템 전역 유일(user_yn=1 인 경우, FR-Emp-06)
CREATE UNIQUE INDEX UX_system_employee_user_id ON dbo.system_employee(user_id) WHERE user_id IS NOT NULL;
GO
CREATE TABLE dbo.system_year (
    company_id      varchar(10) NOT NULL,
    entity_id       varchar(10) NOT NULL,
    company_year_id varchar(10) NOT NULL,
    company_year    numeric(10,2) NOT NULL,
    actual_year     numeric(10,2) NOT NULL,
    CONSTRAINT PK_system_year PRIMARY KEY (company_id, entity_id, company_year_id),
    CONSTRAINT FK_year_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT UQ_year_actual UNIQUE (company_id, entity_id, actual_year, company_year) -- FR-Year-04
);
GO

/*----------------------------------------------------------- PARTNER 도메인 */
CREATE TABLE dbo.partner_term (
    company_id     varchar(10) NOT NULL,
    entity_id      varchar(10) NOT NULL,
    term_id        varchar(10) NOT NULL,
    term_condition varchar(20) NOT NULL,           -- 표시용: EOM+15 / CurM25 (트리거 자동 구성)
    base_rule      varchar(10) NOT NULL CONSTRAINT CK_term_rule CHECK (base_rule IN ('EOM','CURM')),
    fixed_day      numeric(2,0) NULL,              -- CURM 전용 1~31
    offset_days    numeric(3,0) NOT NULL CONSTRAINT DF_term_offset DEFAULT (0), -- EOM 전용
    status         bit NOT NULL CONSTRAINT DF_term_status DEFAULT (1), -- 1:Y 사용, 0:N
    CONSTRAINT PK_partner_term PRIMARY KEY (company_id, entity_id, term_id),
    CONSTRAINT FK_term_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT CK_term_shape CHECK (
        (base_rule = 'EOM'  AND fixed_day IS NULL AND offset_days >= 0) OR
        (base_rule = 'CURM' AND fixed_day BETWEEN 1 AND 31 AND offset_days = 0))
);
GO
CREATE TABLE dbo.partner_client (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    client_id  varchar(10) NOT NULL,
    client_name nvarchar(50) NOT NULL,
    collecting_type varchar(10) NULL,              -- partner_term.term_id (길이 일치 필수 — FK_client_term)
    status     bit NOT NULL CONSTRAINT DF_client_status DEFAULT (1), -- 1:y active, 0:n pending
    vat_id     varchar(20) NULL, NickName nvarchar(50) NULL, RepName nvarchar(50) NULL,
    RegNum     varchar(50) NULL, BizIndustry nvarchar(50) NULL, BizCategory nvarchar(50) NULL,
    client_Address nvarchar(200) NULL, PhoneNumber varchar(20) NULL, FaxNumber varchar(20) NULL,
    BankCode   nvarchar(50) NULL, BankBranch nvarchar(50) NULL, BankAccount varchar(50) NULL,
    BankHolder nvarchar(50) NULL, website varchar(200) NULL, logo_url varchar(200) NULL,
    industry   nvarchar(200) NULL, notes nvarchar(200) NULL, default_billing_currency varchar(10) NULL,
    CONSTRAINT PK_partner_client PRIMARY KEY (company_id, entity_id, client_id),
    CONSTRAINT FK_client_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT FK_client_term FOREIGN KEY (company_id, entity_id, collecting_type) REFERENCES dbo.partner_term(company_id, entity_id, term_id)
);
GO
CREATE TABLE dbo.partner_vendor (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    vendor_id  varchar(10) NOT NULL,
    vendor_name nvarchar(50) NOT NULL,
    payment_type varchar(10) NULL,                 -- partner_term.term_id (길이 일치 필수 — FK_vendor_term)
    status     bit NOT NULL CONSTRAINT DF_vendor_status DEFAULT (1),
    vat_id     varchar(20) NULL, NickName nvarchar(50) NULL, RepName nvarchar(50) NULL,
    RegNum     varchar(50) NULL, BizIndustry nvarchar(50) NULL, BizCategory nvarchar(50) NULL,
    vendor_Address nvarchar(200) NULL, PhoneNumber varchar(20) NULL, FaxNumber varchar(20) NULL,
    BankCode   nvarchar(50) NULL, BankBranch nvarchar(50) NULL, BankAccount varchar(50) NULL,
    BankHolder nvarchar(50) NULL, website varchar(200) NULL, logo_url varchar(200) NULL,
    industry   nvarchar(200) NULL, notes nvarchar(200) NULL, default_billing_currency varchar(10) NULL,
    CONSTRAINT PK_partner_vendor PRIMARY KEY (company_id, entity_id, vendor_id),
    CONSTRAINT FK_vendor_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT FK_vendor_term FOREIGN KEY (company_id, entity_id, payment_type) REFERENCES dbo.partner_term(company_id, entity_id, term_id)
);
GO

/*------------------------------------------------------------- SALES 도메인 */
CREATE TABLE dbo.sales_pipeline (
    company_id  varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    pipeline_id varchar(10) NOT NULL,
    pipeline_type varchar(40) NULL CONSTRAINT DF_pipe_type DEFAULT ('0'), -- 0대행 1사입 2리테일 3마케팅 4기타
    client_name nvarchar(100) NULL,
    stage       varchar(40) NULL CONSTRAINT DF_pipe_stage DEFAULT ('0'),  -- 0~6
    employee_Id varchar(10) NULL,
    note        nvarchar(255) NULL,
    created_date  date NULL,
    adjusted_date date NULL,
    closed_date   date NULL,
    contract_id   varchar(20) NULL,
    CONSTRAINT PK_sales_pipeline PRIMARY KEY (company_id, entity_id, pipeline_id),
    CONSTRAINT FK_pipe_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT FK_pipe_emp FOREIGN KEY (company_id, entity_id, employee_Id) REFERENCES dbo.system_employee(company_id, entity_id, employee_Id)
);
GO
CREATE TABLE dbo.sales_pipeline_detail (
    company_id  varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    pipeline_id varchar(10) NOT NULL,
    activity_id varchar(20) NOT NULL,
    created_date date NULL,
    [type]      varchar(30) NOT NULL CONSTRAINT DF_act_type DEFAULT ('0'), -- 0메일 1전화 2미팅 3기타
    content     nvarchar(250) NULL,
    incharge    nvarchar(100) NULL,
    attached    varchar(250) NULL,
    CONSTRAINT PK_sales_pipeline_detail PRIMARY KEY (company_id, entity_id, pipeline_id, activity_id),
    CONSTRAINT FK_act_pipe FOREIGN KEY (company_id, entity_id, pipeline_id) REFERENCES dbo.sales_pipeline(company_id, entity_id, pipeline_id)
);
GO
CREATE TABLE dbo.sales_contract (
    company_id  varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    client_id   varchar(10) NOT NULL,
    contract_id varchar(20) NOT NULL,
    contract_type varchar(5) NOT NULL CONSTRAINT DF_ct_type DEFAULT ('0'), -- 0~5
    pipeline_id varchar(10) NULL,
    start_date  date NOT NULL,
    end_date    date NOT NULL,
    status      varchar(10) NOT NULL CONSTRAINT DF_ct_status DEFAULT ('0'), -- 0 Active 1 Inactive 2 Suspend
    contract_amount numeric(18,2) NULL,
    ledger_date date NULL,          -- 전표 연결(선택). 둘 다 입력 or 둘 다 NULL (FR-Contract-08)
    ledger_no   numeric(10,2) NULL,
    closed_date date NULL,
    CONSTRAINT PK_sales_contract PRIMARY KEY (company_id, entity_id, contract_id, contract_type),
    CONSTRAINT FK_ct_client FOREIGN KEY (company_id, entity_id, client_id) REFERENCES dbo.partner_client(company_id, entity_id, client_id),
    CONSTRAINT CK_ct_dates  CHECK (start_date <= end_date),
    CONSTRAINT CK_ct_ledger CHECK ((ledger_date IS NULL AND ledger_no IS NULL) OR (ledger_date IS NOT NULL AND ledger_no IS NOT NULL))
);
GO

/*----------------------------------------------------------- FINANCE 도메인 */
CREATE TABLE dbo.finance_GL (
    company_id  varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    gl_id       varchar(10) NOT NULL,
    gl_name     nvarchar(100) NULL,
    gl_type     varchar(50) NULL,   -- 0자산~10법인세등
    gl_category1 nvarchar(50) NULL,
    gl_category2 nvarchar(50) NULL,
    vat_gl      nvarchar(50) NULL,  -- 매입부가가치세/매출부가가치세/NULL
    gl_detail   varchar(10) NULL CONSTRAINT DF_gl_detail DEFAULT ('0'), -- 0보통 1차감
    contra_gl   varchar(10) NULL,
    status      bit NOT NULL CONSTRAINT DF_gl_status DEFAULT (1),       -- 1:Y 사용
    -- 이하 전표 Layer3 입력영역 사용 플래그(Boolean, FR-GL-06)
    bank_id bit NOT NULL DEFAULT (0), Team_id bit NOT NULL DEFAULT (0), pod_id bit NOT NULL DEFAULT (0),
    employee_Id bit NOT NULL DEFAULT (0), client_id bit NOT NULL DEFAULT (0), vendor_id bit NOT NULL DEFAULT (0),
    dimension1 bit NOT NULL DEFAULT (0), dimension2 bit NOT NULL DEFAULT (0), dimension3 bit NOT NULL DEFAULT (0),
    dimension4 bit NOT NULL DEFAULT (0), dimension5 bit NOT NULL DEFAULT (0), due_date bit NOT NULL DEFAULT (0),
    CONSTRAINT PK_finance_GL PRIMARY KEY (company_id, entity_id, gl_id),
    CONSTRAINT FK_gl_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id)
);
GO
-- 표준 GL seed (설치 시 GL 시트 데이터 적재·보존, FR-GL-11)
CREATE TABLE dbo.finance_GL_seed (
    gl_id varchar(10) NOT NULL PRIMARY KEY,
    gl_name nvarchar(100) NULL, gl_type varchar(50) NULL,
    gl_category1 nvarchar(50) NULL, gl_category2 nvarchar(50) NULL, vat_gl nvarchar(50) NULL,
    gl_detail varchar(10) NULL, contra_gl varchar(10) NULL, status bit NOT NULL DEFAULT (1),
    bank_id bit NOT NULL DEFAULT (0), Team_id bit NOT NULL DEFAULT (0), pod_id bit NOT NULL DEFAULT (0),
    employee_Id bit NOT NULL DEFAULT (0), client_id bit NOT NULL DEFAULT (0), vendor_id bit NOT NULL DEFAULT (0),
    dimension1 bit NOT NULL DEFAULT (0), dimension2 bit NOT NULL DEFAULT (0), dimension3 bit NOT NULL DEFAULT (0),
    dimension4 bit NOT NULL DEFAULT (0), dimension5 bit NOT NULL DEFAULT (0), due_date bit NOT NULL DEFAULT (0)
);
GO
CREATE TABLE dbo.finance_dimension (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    dimension_id varchar(10) NOT NULL,
    dimension_name nvarchar(100) NULL,
    slot_no tinyint NOT NULL,   -- Slot 1~5 영속 매핑(FR-Dim-05, 명세 보완 컬럼)
    status bit NOT NULL CONSTRAINT DF_dim_status DEFAULT (1),
    CONSTRAINT PK_finance_dimension PRIMARY KEY (company_id, entity_id, dimension_id),
    CONSTRAINT FK_dim_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT UQ_dim_slot UNIQUE (company_id, entity_id, slot_no),
    CONSTRAINT CK_dim_slot CHECK (slot_no BETWEEN 1 AND 5)
);
GO
CREATE TABLE dbo.finance_dimension_detail (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    dimension_id varchar(10) NOT NULL,
    line_no numeric(10,2) NOT NULL,
    dimension_value nvarchar(200) NULL,
    CONSTRAINT PK_finance_dimension_detail PRIMARY KEY (company_id, entity_id, dimension_id, line_no),
    CONSTRAINT FK_dimd_dim FOREIGN KEY (company_id, entity_id, dimension_id) REFERENCES dbo.finance_dimension(company_id, entity_id, dimension_id)
);
GO
CREATE TABLE dbo.finance_bank_account (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    bank_id varchar(10) NOT NULL,
    bank_name nvarchar(50) NULL,
    bank_account varchar(50) NULL,
    card_number varchar(50) NULL,
    status bit NOT NULL CONSTRAINT DF_bank_status DEFAULT (0), -- 0:사용 1:미사용
    CONSTRAINT PK_finance_bank_account PRIMARY KEY (company_id, entity_id, bank_id),
    CONSTRAINT FK_bank_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id),
    CONSTRAINT CK_bank_shape CHECK (NOT (bank_account IS NOT NULL AND card_number IS NOT NULL)) -- 상호배타(FR-Bank-05)
);
GO
CREATE TABLE dbo.finance_open_balance (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    company_year_id varchar(10) NOT NULL,
    gl_id varchar(10) NOT NULL,
    DRCR varchar(10) NOT NULL CONSTRAINT CK_ob_drcr CHECK (DRCR IN ('1','2')), -- 1차변 2대변
    client_id varchar(10) NULL,
    vendor_id varchar(10) NULL,
    amount numeric(18,2) NOT NULL CONSTRAINT DF_ob_amount DEFAULT (0),
    closed bit NOT NULL CONSTRAINT DF_ob_closed DEFAULT (0),  -- 1:Y 마감
    CONSTRAINT FK_ob_year FOREIGN KEY (company_id, entity_id, company_year_id) REFERENCES dbo.system_year(company_id, entity_id, company_year_id),
    CONSTRAINT FK_ob_gl FOREIGN KEY (company_id, entity_id, gl_id) REFERENCES dbo.finance_GL(company_id, entity_id, gl_id)
);
GO
-- 동일 회사/기수/계정/거래상대 조합 중복 금지(FR-OpenBal-04). NULL 상대 포함 유일성은 계산컬럼으로 처리.
ALTER TABLE dbo.finance_open_balance ADD
    client_key AS ISNULL(client_id,'-') PERSISTED,
    vendor_key AS ISNULL(vendor_id,'-') PERSISTED;
GO
CREATE UNIQUE INDEX UX_open_balance ON dbo.finance_open_balance(company_id, entity_id, company_year_id, gl_id, DRCR, client_key, vendor_key);
GO
CREATE TABLE dbo.finance_ledger_head (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    ledger_date date NOT NULL,
    ledger_no numeric(10,2) NOT NULL,
    ledger_name nvarchar(100) NULL,
    ledger_type varchar(10) NULL CONSTRAINT DF_lh_type DEFAULT ('0'), -- 0일반 1매입 2매출 3결산
    employee_Id varchar(10) NULL,
    approver_Id varchar(10) NULL,
    insert_date date NULL,
    update_date date NULL,
    approved_date date NULL,
    approval_status bit NOT NULL CONSTRAINT DF_lh_appr DEFAULT (0), -- 1:Y 승인
    CONSTRAINT PK_finance_ledger_head PRIMARY KEY (company_id, entity_id, ledger_date, ledger_no),
    CONSTRAINT FK_lh_entity FOREIGN KEY (company_id, entity_id) REFERENCES dbo.system_entity(company_id, entity_id)
);
GO
CREATE TABLE dbo.finance_ledger_detail (
    company_id varchar(10) NOT NULL, entity_id varchar(10) NOT NULL,
    ledger_date date NOT NULL,
    ledger_no numeric(10,2) NOT NULL,
    line_on numeric(10,2) NOT NULL,
    gl_id varchar(10) NOT NULL,
    DRCR varchar(10) NULL CONSTRAINT CK_ld_drcr CHECK (DRCR IN ('1','2')),
    amount numeric(18,2) NULL,
    bank_id varchar(10) NULL,
    Team_id varchar(10) NULL,
    pod_id varchar(4) NULL,
    employee_Id varchar(10) NULL,
    client_id varchar(10) NULL,
    vendor_id varchar(10) NULL,
    dimension1 varchar(10) NULL, dimension2 varchar(10) NULL, dimension3 varchar(10) NULL,
    dimension4 varchar(10) NULL, dimension5 varchar(10) NULL,
    due_date date NULL,
    CONSTRAINT PK_finance_ledger_detail PRIMARY KEY (company_id, entity_id, ledger_date, ledger_no, line_on),
    CONSTRAINT FK_ld_head FOREIGN KEY (company_id, entity_id, ledger_date, ledger_no) REFERENCES dbo.finance_ledger_head(company_id, entity_id, ledger_date, ledger_no),
    CONSTRAINT FK_ld_gl FOREIGN KEY (company_id, entity_id, gl_id) REFERENCES dbo.finance_GL(company_id, entity_id, gl_id),
    CONSTRAINT FK_ld_bank FOREIGN KEY (company_id, entity_id, bank_id) REFERENCES dbo.finance_bank_account(company_id, entity_id, bank_id)
);
GO

/*---------------------------------------------- Bootstrap : built-in admin */
-- FR-Admin-01~03 : 설치 시 조직 마스터 순환의존 제거를 위해 SYSTEM/SYSTEM 시스템 조직과
--                  built-in admin 계정을 함께 시드한다. (표준 GL seed의 SYSTEM/SYSTEM 과 동일 스코프)
-- ※ user_pass 는 반드시 설치 프로그램(WAS)이 Argon2id/bcrypt 로 'admin' 을 해시하여 치환 저장한다.
INSERT INTO dbo.system_company (company_id, company_name, company_name_ko, status)
SELECT 'SYSTEM', 'System', N'시스템', 0
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_company WHERE company_id='SYSTEM');
INSERT INTO dbo.system_entity (company_id, entity_id, entity_name, entity_name_ko, status)
SELECT 'SYSTEM','SYSTEM','System',N'시스템',0
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_entity WHERE company_id='SYSTEM' AND entity_id='SYSTEM');
INSERT INTO dbo.system_pod (company_id, entity_id, pod_id, pod_name, status)
SELECT 'SYSTEM','SYSTEM','SYS',N'System Pod',0
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_pod WHERE company_id='SYSTEM' AND entity_id='SYSTEM' AND pod_id='SYS');
INSERT INTO dbo.system_team (company_id, entity_id, Team_id, team_name, team_name_ko, owner, leader_user_id, status)
SELECT 'SYSTEM','SYSTEM','SYS','System',N'시스템','ADMIN','ADMIN',0
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_team WHERE company_id='SYSTEM' AND entity_id='SYSTEM' AND Team_id='SYS');
INSERT INTO dbo.system_employee (company_id, entity_id, Team_id, employee_Id, employee_name, status, user_yn, user_id, user_pass)
SELECT 'SYSTEM','SYSTEM','SYS','ADMIN',N'Built-in Admin','active',1,'admin','{ARGON2ID_HASH_OF_admin__SET_BY_INSTALLER}'
WHERE NOT EXISTS (SELECT 1 FROM dbo.system_employee WHERE user_id='admin');
GO
