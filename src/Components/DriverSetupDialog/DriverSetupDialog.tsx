import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { driverService, type DriverStatus } from '../../Services';
import './DriverSetupDialog.css';

interface DriverSetupDialogProps {
  visible: boolean;
  onClose: () => void;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** One-time first-launch prompt for installing the bundled Windows drivers. */
export const DriverSetupDialog: React.FC<DriverSetupDialogProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setChecking(true);
    setError(null);
    setWarning(null);
    driverService
      .getStatus()
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch((nextError) => {
        if (active) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    setWarning(null);
    setRestartRequired(false);
    try {
      const result = await driverService.install();
      setStatus(result.status);
      setRestartRequired(result.restartRequired);
      if (result.warnings.length > 0) {
        setWarning(result.warnings.join(' '));
      }
      if (result.cancelled) {
        setError(t('driverSetup.cancelled'));
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setInstalling(false);
    }
  };

  const installed = status?.installed === true;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="driver-setup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !installing && onClose()}
        >
          <motion.div
            className="driver-setup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-setup-title"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="driver-setup-icon" aria-hidden="true">
              {t('driverSetup.iconLabel')}
            </div>
            <div className="driver-setup-body">
              <h2 id="driver-setup-title">{t('driverSetup.title')}</h2>
              <p>{t('driverSetup.description')}</p>
              <p className="driver-setup-note">{t('driverSetup.adminNote')}</p>

              {checking && <div className="driver-setup-feedback">{t('driverSetup.checking')}</div>}
              {installed && (
                <div className="driver-setup-feedback success">
                  {restartRequired ? t('driverSetup.installedRestart') : t('driverSetup.installed')}
                </div>
              )}
              {error && <div className="driver-setup-feedback error">{error}</div>}
              {warning && <div className="driver-setup-feedback warning">{warning}</div>}
            </div>

            <div className="driver-setup-actions">
              <button
                type="button"
                className="driver-setup-btn secondary"
                onClick={onClose}
                disabled={installing}
              >
                {installed ? t('driverSetup.done') : t('driverSetup.later')}
              </button>
              {!installed && (
                <button
                  type="button"
                  className="driver-setup-btn primary"
                  onClick={handleInstall}
                  disabled={installing || checking}
                >
                  {installing ? t('driverSetup.installing') : t('driverSetup.install')}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DriverSetupDialog;
