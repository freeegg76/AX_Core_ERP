import { App, Button, Card, Form, Input, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { ApiError, http } from '../shared/api/client';

/** 본인 비밀번호 변경 (설계서 §6.1 · 화면기획서 5-5-B) */
export function PasswordPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const change = useMutation({
    mutationFn: (v: { current_password: string; new_password: string }) =>
      http.put('/auth/password', v),
    onSuccess: () => {
      message.success('비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.');
      form.resetFields();
    },
    onError: (e) => message.error((e as ApiError).message),
  });

  return (
    <Card size="small" title="비밀번호 변경" style={{ maxWidth: 480 }}>
      <Form form={form} layout="vertical" onFinish={(v) => change.mutate(v)}>
        <Form.Item label="현재 비밀번호" name="current_password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="새 비밀번호"
          name="new_password"
          rules={[{ required: true, min: 8, message: '8자 이상 입력하세요.' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="새 비밀번호 확인"
          name="confirm"
          dependencies={['new_password']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                !v || getFieldValue('new_password') === v
                  ? Promise.resolve()
                  : Promise.reject(new Error('새 비밀번호가 일치하지 않습니다.')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={change.isPending}>
          변경
        </Button>
      </Form>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        비밀번호는 서버에서 Argon2id 로 해시되어 저장됩니다. 평문·해시는 응답·로그에 남지 않습니다.
      </Typography.Paragraph>
    </Card>
  );
}
