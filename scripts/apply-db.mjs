#!/usr/bin/env node
/**
 * AX Bridge — DB 스크립트 적용기
 * 설계서 §16.1 : 01 → 02 → … → 09 순서를 강제한다.
 *   · 08 이 05 의 프로시저 8건과 06 의 트리거 3건을 교체하므로 순서 역전 시 v3 마감 잠금이 소실된다.
 *   · 01 은 가드가 없어 재실행이 파괴적이고, 07 은 TRUNCATE 로 시작한다. 08·09 만 멱등.
 *   · 스크립트는 UTF-8(BOM 없음)이므로 sqlcmd -f 65001 이 필수다.
 *
 * 사용: node scripts/apply-db.mjs [--from 01] [--to 09]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = resolve(root, 'db');

// .env 최소 파서 (dotenv 의존성 없이 동작)
const env = {};
if (existsSync(resolve(root, '.env'))) {
  const txt = await import('node:fs').then((fs) => fs.readFileSync(resolve(root, '.env'), 'utf8'));
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const SERVER = env.MSSQL_INSTANCE
  ? `${env.MSSQL_SERVER || 'localhost'}\\${env.MSSQL_INSTANCE}`
  : env.MSSQL_SERVER || 'localhost';
const DB = env.MSSQL_DATABASE || 'AX_BRIDGE';
const USER = env.MSSQL_USER || 'sa';
const PASS = env.MSSQL_PASSWORD || '';

const args = process.argv.slice(2);
const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : '01';
const to = args.includes('--to') ? args[args.indexOf('--to') + 1] : '99';

const files = readdirSync(dbDir)
  .filter((f) => /^\d\d_.*\.sql$/.test(f))
  .sort()
  .filter((f) => f.slice(0, 2) >= from && f.slice(0, 2) <= to);

if (!files.length) {
  console.error(`적용할 스크립트가 없다 (from=${from} to=${to})`);
  process.exit(1);
}

console.log(
  `서버 ${SERVER} / 대상 DB ${DB} (master 로 접속 — 01 이 DB 를 생성한다) — ${files.length}개 스크립트 적용\n`,
);
let failed = 0;
for (const f of files) {
  process.stdout.write(f.padEnd(38));
  try {
    execFileSync(
      'sqlcmd',
      /*
       * ⚠ `master` 로 접속한다 (대상 DB 가 아니다).
       *
       * 01 스크립트가 `IF DB_ID(N'AX_Bridge') IS NULL CREATE DATABASE` 로 DB 를
       * 직접 만들기 때문에, 신규 PC 에서 `-d AX_BRIDGE` 로 붙으면 "DB 가 없다"로
       * 접속 자체가 실패해 부트스트랩이 불가능하다.
       * 모든 스크립트가 자체 `USE AX_Bridge;` 를 갖고 있어 master 접속으로 충분하다.
       */
      ['-S', SERVER, '-d', 'master', '-U', USER, '-P', PASS, '-C', '-b', '-f', '65001', '-I', '-i', f],
      { cwd: dbDir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log('OK');
  } catch (e) {
    failed++;
    console.log('FAIL');
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    console.log(
      out
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .slice(0, 8)
        .map((l) => `    ${l}`)
        .join('\n'),
    );
  }
}
console.log(failed ? `\n${failed}건 실패` : '\n전체 적용 완료');
process.exit(failed ? 1 : 0);
