import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { PythonTestTool } from './PythonTestTool';

interface PythonTestToolPageProps {
  isActive?: boolean;
}

/**
 * Python 产测工具页面外壳。
 *
 * 与其它工具页一致，套一层 PageContainer 提供统一标题栏 + 内容区。
 * 标题文字取自 i18n 键 `tools.pythonTestTool.name`，支持多语言切换。
 */
export const PythonTestToolPage: React.FC<PythonTestToolPageProps> = () => {
  const { t } = useTranslation();
  return (
    <div className="serial-tool-page-root">
      <PageContainer title={t('tools.pythonTestTool.name', 'Python Test Tool')}>
        <PythonTestTool />
      </PageContainer>
    </div>
  );
};
