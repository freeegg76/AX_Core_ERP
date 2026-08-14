/**
 * Domain 단위 테스트용 설정 (지침 §26).
 *
 * `src` 안의 `*.spec.ts` 만 돌린다. Domain 계층은 NestJS·Prisma·DB 에 의존하지
 * 않으므로 이 테스트들은 SQL Server 없이 실행된다. 프로시저를 실제로 태우는
 * Repository Integration Test 는 별도 설정으로 분리한다.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['**/domain/**/*.ts', '!**/*.spec.ts'],
};
