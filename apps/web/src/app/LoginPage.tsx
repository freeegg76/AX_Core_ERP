import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './auth.store';

/**
 * 로그인 (설계서 §6.1 · SYSTEM 화면기획서 5-7-A).
 * 초기 계정은 admin / admin — 최초 로그인 후 변경을 권장한다(FR-Admin-03).
 */
export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          AX Bridge 로그인
        </Typography.Title>
        {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
        <Form
          layout="vertical"
          initialValues={{ user_id: 'admin', password: '' }}
          onFinish={async (v) => {
            setErr(null);
            setBusy(true);
            try {
              await login(v.user_id, v.password);
              nav('/system/companies');
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item label="아이디" name="user_id" rules={[{ required: true, message: '아이디를 입력하세요.' }]}>
            <Input autoFocus autoComplete="username" />
          </Form.Item>
          <Form.Item label="비밀번호" name="password" rules={[{ required: true, message: '비밀번호를 입력하세요.' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>
            로그인
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          비밀번호는 Argon2id 해시로만 저장되며 평문은 DB·로그 어디에도 기록되지 않습니다.
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
