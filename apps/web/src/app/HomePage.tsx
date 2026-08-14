/**
 * 메인 화면 — 외부 컨설팅 포털을 iframe 으로 임베드한다.
 *
 * 높이는 헤더(64) + Content 상하 패딩(32) 을 뺀 값으로 잡아 스크롤바가
 * 이중으로 생기지 않게 한다. 스크롤은 iframe 내부가 담당한다.
 */
const CONSULTING_URL =
  'https://ax-bridge-operating-core-v2.ctakjudah5.chatgpt.site/#consulting';

export function HomePage() {
  return (
    <iframe
      src={CONSULTING_URL}
      title="AX Bridge Operating Core"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100vh - 96px)',
        border: 0,
      }}
    />
  );
}
