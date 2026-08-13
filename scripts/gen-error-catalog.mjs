#!/usr/bin/env node
/**
 * 오류코드 카탈로그 생성기.
 *
 * `db/0*.sql` 의 `THROW <code>, N'<message>'` 를 전량 추출해
 * `packages/shared-constants/src/error-catalog.generated.ts` 를 만든다.
 *
 * 매핑을 수작업으로 추측하지 않기 위한 것이다 — 초기에 손으로 적었던 목록은
 * 실제 코드와 절반 이상 어긋나 있었다(예: 중복 등록이 409 대신 400).
 *
 * 사용: node scripts/gen-error-catalog.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = resolve(root, 'db');
const outFile = resolve(root, 'packages/shared-constants/src/error-catalog.generated.ts');

const found = new Map(); // code -> { message, source }
for (const f of readdirSync(dbDir).filter((n) => /^\d\d_.*\.sql$/.test(n)).sort()) {
  const text = readFileSync(resolve(dbDir, f), 'utf8');
  const re = /THROW\s+(\d{5})\s*,\s*N'((?:[^']|'')*)'/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const code = m[1];
    if (!found.has(code)) found.set(code, { message: m[2].replace(/''/g, "'"), source: f.slice(0, 2) });
  }
}

function httpOf(code, msg) {
  if (code.startsWith('59')) return 500; // 09 마이그레이션 실행 전용
  if (code.startsWith('51')) return 409; // 트리거는 전부 상태/참조 보호

  // 1) 중복 — 같은 키가 이미 있다
  if (/이미 존재|이미 등록|이미 마감|재마감|중복/.test(msg)) return 409;

  // 2) 상태·참조 충돌 — "…이 존재하여/참조 중이어서 …할 수 없다"
  //    "…할 수 없습니다" 는 그 자체로 404 처럼 보이지만(없습니다), 원인이
  //    존재/참조/상태이면 충돌이다. 예: 50411 "전표가 존재하는 회사는 … 사용할 수 없습니다."
  const blocked = /(할 수 없|불가|제한|차단)/.test(msg);
  const cause = /(존재|참조|연결|마감|확정|승인|잠금)/.test(msg);
  if (blocked && cause) return 409;

  // 3) 대상 없음 — 수정/삭제/승인 대상이 조회되지 않는다
  if (/(대상|계정|기수|사용자|전표|라인|정책|고객사|거래처|파이프라인|계약|관리항목|은행)[^.]*없습니다/.test(msg))
    return 404;
  if (/존재하지 않/.test(msg)) return 404;

  // 4) 그 외 — 형식·범위·필수값 검증
  return 400;
}

const rows = [...found.entries()]
  .map(([code, v]) => ({ code, http: httpOf(code, v.message), ...v }))
  .sort((a, b) => a.code.localeCompare(b.code));

const counts = rows.reduce((acc, r) => ((acc[r.http] = (acc[r.http] ?? 0) + 1), acc), {});

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const lines = [
  '/* eslint-disable */',
  '/**',
  ' * AX Bridge — 오류코드 카탈로그 (자동 생성, 직접 수정하지 말 것)',
  ' *',
  " * 생성기: scripts/gen-error-catalog.mjs — db/0*.sql 의 THROW 를 전량 추출한다.",
  ' * 스크립트가 바뀌면 재생성한다.',
  ' *',
  ` * 총 ${rows.length}건 · HTTP 매핑 규칙`,
  ' *   409 중복 / 참조충돌 / 상태충돌(마감·확정·승인) + 트리거 51xxx 전부',
  ' *   404 대상 없음',
  ' *   400 그 외 검증 오류',
  ' *   500 59xxx — 09 마이그레이션 실행 전용이며 런타임에 발생하지 않는다',
  ' *',
  ` * 분포: ${Object.keys(counts).sort().map((k) => `${k}=${counts[k]}`).join(' · ')}`,
  ' */',
  '',
  'export interface ErrorCatalogEntry {',
  '  /** DB THROW 번호 */',
  '  code: number;',
  '  /** 매핑되는 HTTP 상태 */',
  '  http: number;',
  '  /** 프로시저/트리거가 만든 한글 메시지 — 서버가 다시 쓰지 않고 그대로 전달한다 */',
  '  message: string;',
  '  /** 정의된 스크립트 번호 */',
  '  source: string;',
  '}',
  '',
  'export const ERROR_CATALOG: Readonly<Record<number, ErrorCatalogEntry>> = {',
  ...rows.map(
    (r) => `  ${r.code}: { code: ${r.code}, http: ${r.http}, source: '${r.source}', message: '${esc(r.message)}' },`,
  ),
  '};',
  '',
  '/** 카탈로그에 없는 코드는 400 으로 본다 — 신규 프로시저 추가 시의 안전 기본값. */',
  'export function httpStatusOf(sqlErrorNumber: number): number {',
  '  return ERROR_CATALOG[sqlErrorNumber]?.http ?? 400;',
  '}',
  '',
  '/** 카탈로그에 등재된 코드 수 — 검증용 */',
  `export const ERROR_CATALOG_SIZE = ${rows.length};`,
  '',
];

writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`생성 완료 — ${rows.length}건 → ${outFile}`);
for (const k of Object.keys(counts).sort()) console.log(`  HTTP ${k}: ${counts[k]}건`);
