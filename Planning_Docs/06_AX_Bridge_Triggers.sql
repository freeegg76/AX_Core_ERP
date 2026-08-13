/*==============================================================================
  AX Bridge - 06. Triggers
  트리거는 프로시저를 우회한 직접 DML 로부터 핵심 업무규칙을 이중 방어한다.
  프로시저 내 정상 처리 경로는 SESSION_CONTEXT 플래그로 통과한다.
    ax_ledger_approve      : 전표 승인 프로시저의 approval 필드 갱신 허용
    ax_openbal_admin       : 초기이월 마감/해제 프로시저의 closed 갱신 허용
    ax_bypass_gl_protect   : 표준 GL 재생성 프로시저의 전체 삭제 허용(전표 없음 검증 후)
==============================================================================*/
USE AX_Bridge;
GO
/*---------------------------------------------------------------------------
 TRG-01. system_employee : built-in admin 물리 삭제 차단 (FR-Admin-06)
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_system_employee_protect_admin
ON dbo.system_employee
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted WHERE user_id = 'admin')
        THROW 51001, N'built-in admin 계정은 물리 삭제할 수 없습니다.', 1;
    DELETE e FROM dbo.system_employee e
    JOIN deleted d ON d.company_id=e.company_id AND d.entity_id=e.entity_id AND d.employee_Id=e.employee_Id;
END
GO
/*---------------------------------------------------------------------------
 TRG-02. system_employee : 인적정보 수동 편집 감사 (last_manual_edit_at, UC-Emp-04)
         last_login 만 변경되는 로그인 갱신은 제외
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_system_employee_audit
ON dbo.system_employee
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(last_login) AND NOT (UPDATE(employee_name) OR UPDATE(Team_id) OR UPDATE(status)
        OR UPDATE(user_id) OR UPDATE(user_pass) OR UPDATE(email) OR UPDATE(title))
        RETURN;
    IF UPDATE(last_manual_edit_at) RETURN;  -- 프로시저가 이미 기록한 경우 재귀 방지
    UPDATE e SET last_manual_edit_at = SYSDATETIME()
    FROM dbo.system_employee e
    JOIN inserted i ON i.company_id=e.company_id AND i.entity_id=e.entity_id AND i.employee_Id=e.employee_Id;
END
GO
/*---------------------------------------------------------------------------
 TRG-03. sales_pipeline : 수정 시 adjusted_date 갱신 + 스테이지 종료/재오픈 시
         closed_date 자동 설정/해제 (FR-Pipe-06, FR-Pipe-07)
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_sales_pipeline_audit
ON dbo.sales_pipeline
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(adjusted_date) AND NOT (UPDATE(stage) OR UPDATE(pipeline_type) OR UPDATE(client_name)
        OR UPDATE(employee_Id) OR UPDATE(note) OR UPDATE(contract_id))
        RETURN;
    UPDATE p
       SET adjusted_date = CONVERT(date, GETDATE()),
           closed_date = CASE
               WHEN i.stage IN ('5','6') AND (d.stage NOT IN ('5','6') OR p.closed_date IS NULL)
                    THEN CONVERT(date, GETDATE())                       -- Closed/Canceled 진입 시 설정
               WHEN i.stage NOT IN ('5','6') AND d.stage IN ('5','6')
                    THEN NULL                                           -- 재오픈 시 해제(UC-Pipe-06)
               ELSE p.closed_date END
    FROM dbo.sales_pipeline p
    JOIN inserted i ON i.company_id=p.company_id AND i.entity_id=p.entity_id AND i.pipeline_id=p.pipeline_id
    JOIN deleted  d ON d.company_id=p.company_id AND d.entity_id=p.entity_id AND d.pipeline_id=p.pipeline_id;
END
GO
/*---------------------------------------------------------------------------
 TRG-04. finance_ledger_head : 승인 전표 보호 + 헤더 삭제 시 라인 연쇄 삭제
         (FR-Ledger-12, FR-Ledger-13)
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_finance_ledger_head_protect
ON dbo.finance_ledger_head
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @is_approve_flow bit = CASE WHEN SESSION_CONTEXT(N'ax_ledger_approve') = 1 THEN 1 ELSE 0 END;
    DECLARE @is_delete bit = CASE WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN 1 ELSE 0 END;

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
    -- UPDATE : 승인완료 전표는 승인 프로시저 흐름 외 일반 수정 금지
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
/*---------------------------------------------------------------------------
 TRG-05. finance_ledger_detail : 승인 전표 라인 변경/삭제 차단 (FR-Ledger-13)
----------------------------------------------------------------------------*/
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
END
GO
/*---------------------------------------------------------------------------
 TRG-06. finance_open_balance : 마감된 초기이월 보호 (FR-OpenBal-07)
         마감/해제 프로시저(ax_openbal_admin)만 closed 상태를 전환할 수 있다.
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_finance_open_balance_protect
ON dbo.finance_open_balance
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF SESSION_CONTEXT(N'ax_openbal_admin') = 1 RETURN;
    IF EXISTS (SELECT 1 FROM deleted WHERE closed = 1)
        THROW 51031, N'마감된 초기이월은 수정/삭제할 수 없습니다. 관리자 마감해제 후 진행하세요.', 1;
END
GO
/*---------------------------------------------------------------------------
 TRG-07. finance_GL : 참조 중 계정 삭제 이중 방어 (FR-GL-09)
         표준 GL 재생성 프로시저(ax_bypass_gl_protect)는 전표 없음 검증 후 통과.
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_finance_gl_protect_delete
ON dbo.finance_GL
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF SESSION_CONTEXT(N'ax_bypass_gl_protect') <> 1 OR SESSION_CONTEXT(N'ax_bypass_gl_protect') IS NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM deleted d
                    WHERE EXISTS (SELECT 1 FROM dbo.finance_open_balance ob
                                   WHERE ob.company_id=d.company_id AND ob.entity_id=d.entity_id AND ob.gl_id=d.gl_id)
                       OR EXISTS (SELECT 1 FROM dbo.finance_ledger_detail ld
                                   WHERE ld.company_id=d.company_id AND ld.entity_id=d.entity_id AND ld.gl_id=d.gl_id))
            THROW 51041, N'기초잔액/전표에서 참조 중인 계정은 삭제할 수 없습니다.', 1;
    END
    DELETE g FROM dbo.finance_GL g
    JOIN deleted d ON d.company_id=g.company_id AND d.entity_id=g.entity_id AND d.gl_id=g.gl_id;
END
GO
/*---------------------------------------------------------------------------
 TRG-08. partner_term : 표시용 정책식(term_condition) 자동 구성 및 정합성 유지
         (FR-Term-05 : EOM 정책 → EOM+{offset_days}, CURM 정책 → CurM{fixed_day})
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_partner_term_condition
ON dbo.partner_term
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF TRIGGER_NESTLEVEL(OBJECT_ID('dbo.trg_partner_term_condition')) > 1 RETURN;  -- 자기갱신 재귀 방지
    UPDATE t
       SET term_condition = CASE t.base_rule
                                WHEN 'EOM'  THEN 'EOM+' + CONVERT(varchar(3), CONVERT(int, t.offset_days))
                                WHEN 'CURM' THEN 'CurM' + CONVERT(varchar(2), CONVERT(int, t.fixed_day))
                            END
    FROM dbo.partner_term t
    JOIN inserted i ON i.company_id=t.company_id AND i.entity_id=t.entity_id AND i.term_id=t.term_id
    WHERE t.term_condition <> CASE t.base_rule
                                WHEN 'EOM'  THEN 'EOM+' + CONVERT(varchar(3), CONVERT(int, t.offset_days))
                                WHEN 'CURM' THEN 'CurM' + CONVERT(varchar(2), CONVERT(int, t.fixed_day))
                              END;
END
GO
/*---------------------------------------------------------------------------
 TRG-09. system_employee : 재직상태 inactive 전환 시 로그인 차단 보조 처리
         (FR-Emp-07 — 인증 프로시저가 status<>'inactive' 를 검증하므로 별도 필드
          변경은 없으며, 퇴사일 미입력 시 자동 보완만 수행)
----------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER dbo.trg_system_employee_inactive
ON dbo.system_employee
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(status) RETURN;
    UPDATE e SET departure_date = ISNULL(e.departure_date, CONVERT(date, GETDATE()))
    FROM dbo.system_employee e
    JOIN inserted i ON i.company_id=e.company_id AND i.entity_id=e.entity_id AND i.employee_Id=e.employee_Id
    JOIN deleted  d ON d.company_id=e.company_id AND d.entity_id=e.entity_id AND d.employee_Id=e.employee_Id
    WHERE i.status='inactive' AND d.status<>'inactive';
END
GO
