/* eslint-disable */
/**
 * AX Bridge — 오류코드 카탈로그 (자동 생성, 직접 수정하지 말 것)
 *
 * 생성기: scripts/gen-error-catalog.mjs — db/0*.sql 의 THROW 를 전량 추출한다.
 * 스크립트가 바뀌면 재생성한다.
 *
 * 총 144건 · HTTP 매핑 규칙
 *   409 중복 / 참조충돌 / 상태충돌(마감·확정·승인) + 트리거 51xxx 전부
 *   404 대상 없음
 *   400 그 외 검증 오류
 *   500 59xxx — 09 마이그레이션 실행 전용이며 런타임에 발생하지 않는다
 *
 * 분포: 400=50 · 404=35 · 409=58 · 500=1
 */

export interface ErrorCatalogEntry {
  /** DB THROW 번호 */
  code: number;
  /** 매핑되는 HTTP 상태 */
  http: number;
  /** 프로시저/트리거가 만든 한글 메시지 — 서버가 다시 쓰지 않고 그대로 전달한다 */
  message: string;
  /** 정의된 스크립트 번호 */
  source: string;
}

export const ERROR_CATALOG: Readonly<Record<number, ErrorCatalogEntry>> = {
  50001: { code: 50001, http: 400, source: '02', message: '새 비밀번호 해시가 비어 있습니다.' },
  50002: { code: 50002, http: 400, source: '02', message: '대상 사용자 계정이 없거나 사용자 여부가 N 입니다.' },
  50101: { code: 50101, http: 409, source: '02', message: '이미 존재하는 그룹코드입니다.' },
  50102: { code: 50102, http: 404, source: '02', message: '수정 대상 그룹이 없습니다.' },
  50103: { code: 50103, http: 409, source: '02', message: '하위 회사가 존재하여 삭제할 수 없습니다. 미사용 전환을 이용하세요.' },
  50111: { code: 50111, http: 400, source: '02', message: '유효한(사용중) 그룹이 아닙니다.' },
  50112: { code: 50112, http: 409, source: '02', message: '이미 존재하는 회사코드입니다.' },
  50113: { code: 50113, http: 404, source: '02', message: '수정 대상 회사가 없습니다.' },
  50114: { code: 50114, http: 409, source: '02', message: '부서/Pod/직원 등 하위 데이터가 존재하여 삭제할 수 없습니다.' },
  50121: { code: 50121, http: 409, source: '02', message: '이미 존재하는 Pod 코드입니다.' },
  50122: { code: 50122, http: 404, source: '02', message: '수정 대상 Pod가 없습니다.' },
  50123: { code: 50123, http: 409, source: '02', message: '부서 또는 전표에서 참조 중인 Pod는 삭제할 수 없습니다.' },
  50131: { code: 50131, http: 400, source: '02', message: '오너는 동일 그룹/회사 소속 직원이어야 합니다.' },
  50132: { code: 50132, http: 400, source: '02', message: '리더는 동일 그룹/회사 소속 직원이어야 합니다.' },
  50133: { code: 50133, http: 400, source: '02', message: 'Pod는 동일 회사의 사용중 Pod만 선택할 수 있습니다.' },
  50134: { code: 50134, http: 409, source: '02', message: '이미 존재하는 Team 코드입니다.' },
  50135: { code: 50135, http: 404, source: '02', message: '수정 대상 부서가 없습니다.' },
  50136: { code: 50136, http: 409, source: '02', message: '직원 또는 전표에서 참조 중인 부서는 삭제할 수 없습니다.' },
  50141: { code: 50141, http: 400, source: '02', message: '유효한 그룹/회사/부서 조합이 아닙니다.' },
  50142: { code: 50142, http: 400, source: '02', message: '사용자 여부가 Y인 경우 사용자ID는 필수입니다.' },
  50143: { code: 50143, http: 400, source: '02', message: '이미 사용 중인 사용자ID입니다.' },
  50144: { code: 50144, http: 409, source: '02', message: '이미 존재하는 사번입니다.' },
  50145: { code: 50145, http: 400, source: '02', message: '사용자 계정 신규 등록 시 초기 비밀번호(해시)가 필요합니다.' },
  50146: { code: 50146, http: 404, source: '02', message: '수정 대상 직원이 없습니다.' },
  50147: { code: 50147, http: 409, source: '02', message: '참조 중인 직원은 삭제할 수 없습니다. inactive 전환을 이용하세요.' },
  50151: { code: 50151, http: 400, source: '02', message: '기수는 1 이상의 정수여야 합니다.' },
  50152: { code: 50152, http: 400, source: '02', message: '실제연도는 4자리 정수(YYYY)여야 합니다.' },
  50153: { code: 50153, http: 409, source: '02', message: '이미 존재하는 기수코드입니다.' },
  50154: { code: 50154, http: 409, source: '02', message: '기초잔액에서 참조 중인 기수는 수정할 수 없습니다.' },
  50155: { code: 50155, http: 404, source: '02', message: '수정 대상 기수가 없습니다.' },
  50156: { code: 50156, http: 409, source: '02', message: '기초잔액에서 참조 중인 기수는 삭제할 수 없습니다.' },
  50201: { code: 50201, http: 404, source: '03', message: 'EOM 정책은 고정일자를 입력할 수 없습니다.' },
  50202: { code: 50202, http: 400, source: '03', message: 'CURM 정책의 고정일자는 1~31 이어야 합니다.' },
  50203: { code: 50203, http: 409, source: '03', message: '이미 존재하는 정책코드입니다.' },
  50204: { code: 50204, http: 404, source: '03', message: '수정 대상 정책이 없습니다.' },
  50205: { code: 50205, http: 409, source: '03', message: '고객사/거래처에서 참조 중인 정책은 삭제할 수 없습니다. 미사용 전환을 이용하세요.' },
  50206: { code: 50206, http: 404, source: '03', message: '존재하지 않는 지급정책입니다.' },
  50211: { code: 50211, http: 400, source: '03', message: '수금정책은 동일 회사의 사용중 정책만 선택할 수 있습니다.' },
  50212: { code: 50212, http: 400, source: '03', message: '사업자등록번호 형식이 올바르지 않습니다.' },
  50213: { code: 50213, http: 409, source: '03', message: '이미 존재하는 고객사 코드입니다.' },
  50214: { code: 50214, http: 404, source: '03', message: '수정 대상 고객사가 없습니다.' },
  50215: { code: 50215, http: 409, source: '03', message: '계약/전표/기초잔액에서 참조 중인 고객사는 삭제할 수 없습니다.' },
  50221: { code: 50221, http: 400, source: '03', message: '지급정책은 동일 회사의 사용중 정책만 선택할 수 있습니다.' },
  50222: { code: 50222, http: 400, source: '03', message: '사업자등록번호 형식이 올바르지 않습니다.' },
  50223: { code: 50223, http: 409, source: '03', message: '이미 존재하는 거래처 코드입니다.' },
  50224: { code: 50224, http: 404, source: '03', message: '수정 대상 거래처가 없습니다.' },
  50225: { code: 50225, http: 409, source: '03', message: '전표/기초잔액에서 참조 중인 거래처는 삭제할 수 없습니다. 비활성 전환을 이용하세요.' },
  50301: { code: 50301, http: 400, source: '04', message: '허용되지 않은 파이프라인 유형입니다.' },
  50302: { code: 50302, http: 400, source: '04', message: '허용되지 않은 스테이지입니다.' },
  50303: { code: 50303, http: 400, source: '04', message: '담당자는 동일 회사의 활성 직원만 선택할 수 있습니다.' },
  50304: { code: 50304, http: 400, source: '04', message: '고객사명은 동일 회사에 등록된 고객사에서 선택해야 합니다.' },
  50305: { code: 50305, http: 409, source: '04', message: '이미 존재하는 파이프라인 코드입니다.' },
  50306: { code: 50306, http: 404, source: '04', message: '수정 대상 파이프라인이 없습니다.' },
  50311: { code: 50311, http: 400, source: '04', message: '동일 그룹/회사의 계약이 아닙니다.' },
  50312: { code: 50312, http: 400, source: '04', message: '파이프라인 고객사명과 계약 고객사가 일치하지 않습니다.' },
  50313: { code: 50313, http: 404, source: '04', message: '대상 파이프라인이 없습니다.' },
  50314: { code: 50314, http: 409, source: '04', message: '하위 액티비티가 존재하여 삭제할 수 없습니다.' },
  50315: { code: 50315, http: 409, source: '04', message: '계약이 연결된 파이프라인은 삭제할 수 없습니다.' },
  50321: { code: 50321, http: 400, source: '04', message: '허용되지 않은 활동 타입입니다.' },
  50322: { code: 50322, http: 404, source: '04', message: '대상 파이프라인이 존재하지 않습니다.' },
  50323: { code: 50323, http: 409, source: '04', message: '이미 존재하는 액티비티 코드입니다.' },
  50324: { code: 50324, http: 404, source: '04', message: '수정 대상 액티비티가 없습니다.' },
  50331: { code: 50331, http: 400, source: '04', message: '허용되지 않은 계약 유형입니다.' },
  50332: { code: 50332, http: 400, source: '04', message: '허용되지 않은 계약 상태입니다.' },
  50333: { code: 50333, http: 404, source: '04', message: '계약 시작일은 종료일보다 늦을 수 없습니다.' },
  50334: { code: 50334, http: 400, source: '04', message: '동일 회사의 활성 고객사만 선택할 수 있습니다.' },
  50335: { code: 50335, http: 400, source: '04', message: '파이프라인 고객사명과 계약 고객사가 일치하지 않습니다.' },
  50336: { code: 50336, http: 409, source: '04', message: '이미 존재하는 계약(계약코드+유형)입니다.' },
  50337: { code: 50337, http: 404, source: '04', message: '수정 대상 계약이 없습니다.' },
  50341: { code: 50341, http: 400, source: '04', message: '전표일자와 전표번호는 둘 다 입력하거나 둘 다 비워야 합니다.' },
  50342: { code: 50342, http: 404, source: '04', message: '동일 그룹/회사에 존재하지 않는 전표입니다.' },
  50343: { code: 50343, http: 404, source: '04', message: '대상 계약이 없습니다.' },
  50344: { code: 50344, http: 409, source: '04', message: '파이프라인이 연결된 계약은 삭제할 수 없습니다.' },
  50345: { code: 50345, http: 409, source: '04', message: '전표가 연결된 계약은 삭제할 수 없습니다.' },
  50401: { code: 50401, http: 400, source: '05', message: '허용되지 않은 계정구분입니다. (0~10)' },
  50402: { code: 50402, http: 400, source: '05', message: '허용되지 않은 계정성격입니다. (0 보통계정 / 1 차감항목)' },
  50403: { code: 50403, http: 400, source: '05', message: '허용되지 않은 부가가치세 구분입니다.' },
  50404: { code: 50404, http: 400, source: '05', message: '차감계정코드는 동일 그룹/회사의 유효한 계정이어야 합니다.' },
  50405: { code: 50405, http: 409, source: '05', message: '동일 회사 내 중복된 계정코드입니다.' },
  50406: { code: 50406, http: 404, source: '05', message: '수정 대상 계정과목이 없습니다.' },
  50407: { code: 50407, http: 409, source: '05', message: '기초잔액/전표에서 참조 중인 계정은 삭제할 수 없습니다. 미사용 전환을 이용하세요.' },
  50411: { code: 50411, http: 409, source: '05', message: '전표가 존재하는 회사는 계정과목 생성 기능을 사용할 수 없습니다.' },
  50412: { code: 50412, http: 400, source: '05', message: '표준 GL seed 데이터가 준비되어 있지 않습니다.' },
  50421: { code: 50421, http: 400, source: '05', message: '관리항목은 회사당 최대 5개까지 등록할 수 있습니다.' },
  50422: { code: 50422, http: 409, source: '05', message: '이미 존재하는 관리항목코드입니다.' },
  50423: { code: 50423, http: 404, source: '05', message: '수정 대상 관리항목이 없습니다.' },
  50424: { code: 50424, http: 404, source: '05', message: '대상 관리항목이 존재하지 않습니다.' },
  50425: { code: 50425, http: 409, source: '05', message: '동일 관리항목에 같은 값이 이미 등록되어 있습니다.' },
  50426: { code: 50426, http: 404, source: '05', message: '수정 대상 상세값이 없습니다.' },
  50427: { code: 50427, http: 404, source: '05', message: '대상 관리항목이 없습니다.' },
  50428: { code: 50428, http: 409, source: '05', message: '계정과목/전표에서 참조 중인 관리항목은 삭제할 수 없습니다. 미사용 전환을 이용하세요.' },
  50431: { code: 50431, http: 400, source: '05', message: '등록되지 않은 회사 기수입니다. 회사 기수 등록 후 진행하세요.' },
  50432: { code: 50432, http: 409, source: '05', message: '마감된 기수의 초기이월은 수정할 수 없습니다.' },
  50433: { code: 50433, http: 400, source: '05', message: '차대구분(1/2) 또는 금액(0 이상)이 유효하지 않은 행이 있습니다.' },
  50434: { code: 50434, http: 400, source: '05', message: '사용중이 아닌 계정코드가 포함되어 있습니다.' },
  50435: { code: 50435, http: 400, source: '05', message: '유효하지 않은 고객사가 포함되어 있습니다.' },
  50436: { code: 50436, http: 400, source: '05', message: '유효하지 않은 거래처가 포함되어 있습니다.' },
  50437: { code: 50437, http: 409, source: '05', message: '동일 계정/차대/거래상대 조합이 중복된 행이 있습니다.' },
  50442: { code: 50442, http: 404, source: '05', message: '대상 기수가 없습니다.' },
  50443: { code: 50443, http: 409, source: '05', message: '해당 기수에 회계전표가 존재하여 마감을 해제할 수 없습니다.' },
  50451: { code: 50451, http: 400, source: '05', message: '허용되지 않은 전표 타입입니다.' },
  50452: { code: 50452, http: 404, source: '05', message: '수정 대상 미승인 전표가 없습니다.' },
  50461: { code: 50461, http: 404, source: '05', message: '미승인 전표가 아니거나 전표가 존재하지 않습니다.' },
  50462: { code: 50462, http: 400, source: '05', message: '계정코드/차대구분은 필수이며 금액은 0보다 커야 합니다.' },
  50463: { code: 50463, http: 400, source: '05', message: '미사용 또는 타 회사 계정이 포함되어 있습니다.' },
  50464: { code: 50464, http: 400, source: '05', message: '은행/카드 입력 규칙 위반 라인이 있습니다. (플래그 Y: 사용중 계좌 필수 / N: 입력 불가)' },
  50465: { code: 50465, http: 404, source: '05', message: '지급/입금일 미사용 계정 라인에 due_date를 저장할 수 없습니다.' },
  50466: { code: 50466, http: 404, source: '05', message: '계정과목에서 비활성화된 관리항목에 값을 저장할 수 없습니다.' },
  50471: { code: 50471, http: 404, source: '05', message: '승인 대상 미승인 전표가 없습니다.' },
  50472: { code: 50472, http: 409, source: '05', message: '전표 라인이 없어 승인할 수 없습니다.' },
  50474: { code: 50474, http: 400, source: '05', message: '미승인 전표만 삭제할 수 있습니다.' },
  50475: { code: 50475, http: 409, source: '05', message: '계약에 연결된 전표는 삭제할 수 없습니다.' },
  50481: { code: 50481, http: 404, source: '05', message: '은행계좌와 카드번호는 동시에 입력할 수 없습니다.' },
  50482: { code: 50482, http: 400, source: '05', message: '은행계좌 또는 카드번호 중 하나는 입력해야 합니다.' },
  50483: { code: 50483, http: 409, source: '05', message: '동일 회사에 이미 등록된 계좌번호입니다.' },
  50484: { code: 50484, http: 409, source: '05', message: '동일 회사에 이미 등록된 카드번호입니다.' },
  50485: { code: 50485, http: 409, source: '05', message: '이미 존재하는 은행/카드 코드입니다.' },
  50486: { code: 50486, http: 404, source: '05', message: '수정 대상 은행/카드가 없습니다.' },
  50487: { code: 50487, http: 409, source: '05', message: '전표에서 참조 중인 은행/카드는 삭제할 수 없습니다. 미사용(status=1) 전환을 이용하세요.' },
  50501: { code: 50501, http: 409, source: '08', message: '회계마감(closing=Y)된 연도의 전표는 신규/수정/삭제/승인할 수 없습니다. 조회만 가능합니다.' },
  50511: { code: 50511, http: 404, source: '08', message: '대상 기수가 존재하지 않습니다.' },
  50512: { code: 50512, http: 409, source: '08', message: '이미 마감된 연도입니다. 재마감할 수 없습니다.' },
  50513: { code: 50513, http: 400, source: '08', message: '선행연도가 미마감 상태입니다. 이른 연도부터 순차로 마감하세요.' },
  50514: { code: 50514, http: 400, source: '08', message: '차년도 기수(system_year)가 등록되어 있지 않습니다. 차년도 기수 등록 후 실행하세요.' },
  50516: { code: 50516, http: 409, source: '08', message: '차년도에 초기이월 데이터가 이미 존재합니다. 기존 데이터 확인/정리 후 다시 실행하세요.' },
  50521: { code: 50521, http: 409, source: '08', message: '회계마감된 연도의 초기이월은 변경할 수 없습니다.' },
  50522: { code: 50522, http: 400, source: '08', message: '유효하지 않거나 미사용인 은행/카드가 포함되어 있습니다.' },
  50523: { code: 50523, http: 409, source: '08', message: '회계마감(closing=Y)된 연도의 초기이월은 확정해제할 수 없습니다.' },
  50524: { code: 50524, http: 409, source: '08', message: '연도마감으로 자동 생성된 초기이월은 확정해제할 수 없습니다.' },
  50531: { code: 50531, http: 404, source: '09', message: '대상 기수가 존재하지 않습니다.' },
  50532: { code: 50532, http: 404, source: '09', message: '마감되지 않은 연도입니다. 해제할 대상이 없습니다.' },
  50533: { code: 50533, http: 400, source: '09', message: '후행 연도가 마감된 상태입니다. 늦은 연도부터 순차로 해제하세요.' },
  50534: { code: 50534, http: 409, source: '09', message: '차년도 초기이월에 수기 입력분이 존재하여 해제할 수 없습니다. 해당 데이터를 먼저 정리하세요.' },
  51001: { code: 51001, http: 409, source: '06', message: 'built-in admin 계정은 물리 삭제할 수 없습니다.' },
  51011: { code: 51011, http: 409, source: '06', message: '승인 완료 전표는 삭제할 수 없습니다.' },
  51012: { code: 51012, http: 409, source: '06', message: '승인 완료 전표는 수정할 수 없습니다.' },
  51021: { code: 51021, http: 409, source: '06', message: '승인 완료 전표의 라인은 변경/삭제할 수 없습니다.' },
  51031: { code: 51031, http: 409, source: '06', message: '마감된 초기이월은 수정/삭제할 수 없습니다. 관리자 마감해제 후 진행하세요.' },
  51041: { code: 51041, http: 409, source: '06', message: '기초잔액/전표에서 참조 중인 계정은 삭제할 수 없습니다.' },
  51051: { code: 51051, http: 409, source: '08', message: '회계마감된 연도에는 전표를 등록할 수 없습니다.' },
  51052: { code: 51052, http: 409, source: '08', message: '회계마감된 연도의 전표는 수정/삭제할 수 없습니다. 조회만 가능합니다.' },
  51053: { code: 51053, http: 409, source: '08', message: '회계마감된 연도의 전표 라인은 변경할 수 없습니다.' },
  51054: { code: 51054, http: 409, source: '08', message: '회계마감된 연도의 초기이월은 변경할 수 없습니다.' },
  59001: { code: 59001, http: 500, source: '09', message: '[09] finance_bank_account 에 계좌·카드가 모두 비어 있는 행이 있습니다. 정리 후 다시 실행하세요.' },
};

/** 카탈로그에 없는 코드는 400 으로 본다 — 신규 프로시저 추가 시의 안전 기본값. */
export function httpStatusOf(sqlErrorNumber: number): number {
  return ERROR_CATALOG[sqlErrorNumber]?.http ?? 400;
}

/** 카탈로그에 등재된 코드 수 — 검증용 */
export const ERROR_CATALOG_SIZE = 144;
