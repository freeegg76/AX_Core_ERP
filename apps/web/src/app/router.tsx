import { Card, Typography } from 'antd';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { LoginPage } from './LoginPage';
import { PasswordPage } from './PasswordPage';
import {
  CompanyScreen,
  EmployeeScreen,
  EntityScreen,
  PodScreen,
  TeamScreen,
  YearScreen,
} from '../features/system.screens';
import { ClientScreen, TermScreen, VendorScreen } from '../features/partner.screens';
import { BankScreen, ClosingScreen, DimensionScreen, GlScreen } from '../features/finance.screens';
import { LedgerScreen } from '../features/LedgerScreen';
import { ContractScreen, PipelineScreen } from '../features/sales.screens';
import { OpenBalanceScreen } from '../features/OpenBalanceScreen';

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <Card size="small" title={title}>
      <Typography.Paragraph type="secondary">{note}</Typography.Paragraph>
    </Card>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/system/companies" replace /> },
      { path: 'account/password', element: <PasswordPage /> },

      { path: 'system/companies', element: <CompanyScreen /> },
      { path: 'system/entities', element: <EntityScreen /> },
      { path: 'system/pods', element: <PodScreen /> },
      { path: 'system/teams', element: <TeamScreen /> },
      { path: 'system/employees', element: <EmployeeScreen /> },
      { path: 'system/years', element: <YearScreen /> },

      { path: 'partner/terms', element: <TermScreen /> },
      { path: 'partner/clients', element: <ClientScreen /> },
      { path: 'partner/vendors', element: <VendorScreen /> },

      { path: 'sales/pipelines', element: <PipelineScreen /> },
      { path: 'sales/contracts', element: <ContractScreen /> },

      { path: 'finance/gl', element: <GlScreen /> },
      { path: 'finance/dimensions', element: <DimensionScreen /> },
      { path: 'finance/bank-accounts', element: <BankScreen /> },
      { path: 'finance/open-balances', element: <OpenBalanceScreen /> },
      { path: 'finance/ledgers', element: <LedgerScreen /> },
      { path: 'finance/closings', element: <ClosingScreen /> },

      {
        path: '*',
        element: <Placeholder title="준비 중" note="해당 화면은 아직 구현되지 않았습니다." />,
      },
    ],
  },
]);
