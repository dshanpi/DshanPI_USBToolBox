import React from 'react';
import { useTheme } from '../ThemeProvider';
import { useTranslation } from 'react-i18next';
import './ThemeViewer.css';

interface ThemeViewerProps {
  visible: boolean;
  onClose: () => void;
}

const ThemeViewer: React.FC<ThemeViewerProps> = ({ visible, onClose }) => {
  const { currentThemeId, availableThemes } = useTheme();
  const { t } = useTranslation();

  const currentTheme = availableThemes.find((t) => t.id === currentThemeId);

  if (!visible || !currentTheme) return null;

  return (
    <div className="theme-viewer-overlay" onClick={onClose}>
      <div className="theme-viewer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="theme-viewer-header">
          <h2>
            {t('themeViewer.title')} - {currentTheme.name} ({currentTheme.variantName})
          </h2>
          <button className="theme-viewer-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="theme-viewer-content">
          <div className="theme-card" data-theme={currentTheme.variant}>
            <div className="theme-preview">
              {/* Buttons */}
              <div className="preview-section">
                <h5>{t('themeViewer.buttons')}</h5>
                <div className="preview-buttons">
                  <button className="preview-btn preview-btn-primary">
                    {t('themeViewer.primaryButton')}
                  </button>
                  <button className="preview-btn preview-btn-secondary">
                    {t('themeViewer.secondaryButton')}
                  </button>
                  <button className="preview-btn preview-btn-success">
                    {t('themeViewer.success')}
                  </button>
                  <button className="preview-btn preview-btn-warning">
                    {t('themeViewer.warning')}
                  </button>
                  <button className="preview-btn preview-btn-error">
                    {t('themeViewer.error')}
                  </button>
                  <button className="preview-btn" disabled>
                    {t('themeViewer.disabled')}
                  </button>
                </div>
              </div>

              {/* Inputs */}
              <div className="preview-section">
                <h5>{t('themeViewer.inputFields')}</h5>
                <div className="preview-inputs">
                  <input
                    type="text"
                    placeholder={t('themeViewer.textInput')}
                    className="preview-input"
                  />
                  <input
                    type="email"
                    placeholder={t('themeViewer.emailInput')}
                    className="preview-input"
                  />
                  <select className="preview-select">
                    <option>{t('themeViewer.selectOption')}</option>
                    <option>{t('themeViewer.option2')}</option>
                    <option>{t('themeViewer.option3')}</option>
                  </select>
                  <textarea
                    placeholder={t('themeViewer.textarea')}
                    className="preview-textarea"
                    rows={3}
                  />
                </div>
              </div>

              {/* Progress */}
              <div className="preview-section">
                <h5>{t('themeViewer.progressBars')}</h5>
                <div className="preview-progress-container">
                  <div className="preview-progress-label">
                    <span>{t('themeViewer.progress25')}</span>
                    <div className="preview-progress">
                      <div className="preview-progress-bar" style={{ width: '25%' }} />
                    </div>
                  </div>
                  <div className="preview-progress-label">
                    <span>{t('themeViewer.progress50')}</span>
                    <div className="preview-progress">
                      <div className="preview-progress-bar" style={{ width: '50%' }} />
                    </div>
                  </div>
                  <div className="preview-progress-label">
                    <span>{t('themeViewer.progress75')}</span>
                    <div className="preview-progress">
                      <div className="preview-progress-bar" style={{ width: '75%' }} />
                    </div>
                  </div>
                  <div className="preview-progress-label">
                    <span>{t('themeViewer.progressIndeterminate')}</span>
                    <div className="preview-progress preview-progress-indeterminate">
                      <div className="preview-progress-bar" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Alerts */}
              <div className="preview-section">
                <h5>{t('themeViewer.alertsMessages')}</h5>
                <div className="preview-alerts">
                  <div className="preview-alert preview-alert-success">
                    <strong>{t('themeViewer.success')}</strong> {t('themeViewer.successMessage')}
                  </div>
                  <div className="preview-alert preview-alert-warning">
                    <strong>{t('themeViewer.warning')}</strong> {t('themeViewer.warningMessage')}
                  </div>
                  <div className="preview-alert preview-alert-error">
                    <strong>{t('themeViewer.error')}</strong> {t('themeViewer.errorMessage')}
                  </div>
                  <div className="preview-alert preview-alert-info">
                    <strong>{t('themeViewer.success')}</strong> {t('themeViewer.infoMessage')}
                  </div>
                </div>
              </div>

              {/* Badges & Tags */}
              <div className="preview-section">
                <h5>{t('themeViewer.badgesTags')}</h5>
                <div className="preview-badges">
                  <span className="preview-badge preview-badge-primary">
                    {t('themeViewer.primaryButton')}
                  </span>
                  <span className="preview-badge preview-badge-success">
                    {t('themeViewer.success')}
                  </span>
                  <span className="preview-badge preview-badge-warning">
                    {t('themeViewer.warning')}
                  </span>
                  <span className="preview-badge preview-badge-error">
                    {t('themeViewer.error')}
                  </span>
                  <span className="preview-badge preview-badge-info">
                    {t('themeViewer.success')}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="preview-section">
                <h5>{t('themeViewer.cards')}</h5>
                <div className="preview-card-demo">
                  <div className="preview-card-header">
                    <strong>{t('themeViewer.cardTitle')}</strong>
                  </div>
                  <div className="preview-card-body">{t('themeViewer.cardContent')}</div>
                  <div className="preview-card-footer">
                    <button className="preview-btn preview-btn-secondary preview-btn-sm">
                      {t('themeViewer.cancel')}
                    </button>
                    <button className="preview-btn preview-btn-primary preview-btn-sm">
                      {t('themeViewer.confirm')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Checkbox & Radio */}
              <div className="preview-section">
                <h5>{t('themeViewer.checkboxRadio')}</h5>
                <div className="preview-controls">
                  <label className="preview-checkbox">
                    <input type="checkbox" defaultChecked />
                    <span>{t('themeViewer.checkedCheckbox')}</span>
                  </label>
                  <label className="preview-checkbox">
                    <input type="checkbox" />
                    <span>{t('themeViewer.uncheckedCheckbox')}</span>
                  </label>
                  <label className="preview-radio">
                    <input type="radio" name="radio-group" defaultChecked />
                    <span>{t('themeViewer.selectedRadio')}</span>
                  </label>
                  <label className="preview-radio">
                    <input type="radio" name="radio-group" />
                    <span>{t('themeViewer.unselectedRadio')}</span>
                  </label>
                </div>
              </div>

              {/* Table */}
              <div className="preview-section">
                <h5>{t('themeViewer.table')}</h5>
                <div className="preview-table-container">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>{t('themeViewer.id')}</th>
                        <th>{t('themeViewer.name')}</th>
                        <th>{t('themeViewer.status')}</th>
                        <th>{t('themeViewer.action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>1</td>
                        <td>{t('themeViewer.item1')}</td>
                        <td>
                          <span className="preview-badge preview-badge-success">
                            {t('themeViewer.active')}
                          </span>
                        </td>
                        <td>
                          <button className="preview-btn preview-btn-secondary preview-btn-sm">
                            {t('themeViewer.edit')}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td>{t('themeViewer.item2')}</td>
                        <td>
                          <span className="preview-badge preview-badge-warning">
                            {t('themeViewer.pending')}
                          </span>
                        </td>
                        <td>
                          <button className="preview-btn preview-btn-secondary preview-btn-sm">
                            {t('themeViewer.edit')}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td>3</td>
                        <td>{t('themeViewer.item3')}</td>
                        <td>
                          <span className="preview-badge preview-badge-error">
                            {t('themeViewer.error')}
                          </span>
                        </td>
                        <td>
                          <button className="preview-btn preview-btn-secondary preview-btn-sm">
                            {t('themeViewer.edit')}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeViewer;
