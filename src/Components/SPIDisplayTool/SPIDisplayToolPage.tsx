import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../CoreUI';
import { SPIDisplayTool } from './SPIDisplayTool';

interface SPIDisplayToolPageProps {
  isActive?: boolean;
}

/**
 * SPI 点屏工具页面外壳。
 *
 * 与 SPIToolPage 模式一致，套一层 PageContainer 提供统一的标题栏 + 内容区。
 * 通过 i18n 键 `tools.spiDisplayTool.name` 获取标题文字，支持多语言切换。
 */
export const SPIDisplayToolPage: React.FC<SPIDisplayToolPageProps> = () => {
  const { t } = useTranslation();
  return (
    <div className="serial-tool-page-root">
      <PageContainer title={t('tools.spiDisplayTool.name', 'SPI Display Tool')}>
        <SPIDisplayTool />
      </PageContainer>
    </div>
  );
};
