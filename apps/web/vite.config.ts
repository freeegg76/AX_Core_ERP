import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      /**
       * 공유 패키지를 **TS 소스로** 해석한다.
       *
       * `packages/shared-constants` 는 NestJS(CommonJS)를 위해 CJS 로 빌드되는데,
       * CJS 의 `export *` 는 rollup 이 정적 분석하지 못해 `"SearchMode" is not exported`
       * 로 빌드가 깨진다. Vite 는 TS 를 직접 처리하므로 소스를 가리키는 것이 가장 단순하고
       * 트리셰이킹에도 유리하다(빌드 산출물 이중 관리도 피한다).
       */
      '@ax-bridge/shared-constants': fileURLToPath(
        new URL('../../packages/shared-constants/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 개발 중에는 프록시로 붙여 CORS·토큰 전달을 단순화한다.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
