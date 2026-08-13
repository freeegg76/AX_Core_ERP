#!/usr/bin/env node
/**
 * 설치 프로그램 역할 — built-in admin 의 초기 비밀번호 해시를 심는다 (설계서 §6.3).
 *
 * `01_AX_Bridge_Tables.sql` 의 Bootstrap 은 `user_pass` 에 리터럴 플레이스홀더
 * `{ARGON2ID_HASH_OF_admin__SET_BY_INSTALLER}` 를 넣어둔다. Argon2 형식이 아니므로
 * 검증이 항상 실패한다 — 즉 이 스크립트를 돌리기 전에는 로그인이 불가능하다.
 *
 * 사용: node scripts/seed-admin.mjs [평문비밀번호]   (기본값 admin)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import sql from 'mssql';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const plain = process.argv[2] ?? 'admin';
const PLACEHOLDER = '{ARGON2ID_HASH_OF_admin__SET_BY_INSTALLER}';

const hash = await argon2.hash(plain, {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});
if (hash.length > 255) throw new Error('해시가 user_pass varchar(255) 를 초과한다');

const pool = await new sql.ConnectionPool({
  server: env.MSSQL_SERVER || 'localhost',
  port: Number(env.MSSQL_PORT || 1433),
  database: env.MSSQL_DATABASE || 'AX_BRIDGE',
  user: env.MSSQL_USER,
  password: env.MSSQL_PASSWORD,
  options: { encrypt: env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
}).connect();

try {
  const cur = await pool
    .request()
    .query(`SELECT company_id, entity_id, employee_Id, user_pass FROM dbo.system_employee WHERE user_id='admin'`);
  const row = cur.recordset[0];
  if (!row) throw new Error("user_id='admin' 행이 없다 — 01 스크립트 Bootstrap 이 적용되지 않았다");

  const wasPlaceholder = row.user_pass === PLACEHOLDER;
  console.log(`현재 상태: ${wasPlaceholder ? '플레이스홀더(로그인 불가)' : '해시 설정됨'}`);

  // usp_auth_change_password 를 그대로 쓴다 — 설계 경로와 동일하게(트리거·감사 포함).
  const r = pool.request();
  r.input('company_id', sql.VarChar(10), row.company_id);
  r.input('entity_id', sql.VarChar(10), row.entity_id);
  r.input('employee_id', sql.VarChar(10), row.employee_Id);
  r.input('new_pass_hash', sql.VarChar(255), hash);
  await r.execute('dbo.usp_auth_change_password');

  const after = await pool
    .request()
    .query(`SELECT LEFT(user_pass, 22) AS head, LEN(user_pass) AS len FROM dbo.system_employee WHERE user_id='admin'`);
  console.log(`완료 — user_pass = ${after.recordset[0].head}… (${after.recordset[0].len}자)`);
  console.log(`admin / ${plain} 으로 로그인 가능하다. 최초 로그인 후 변경을 권장한다(FR-Admin-03).`);
} finally {
  await pool.close();
}
