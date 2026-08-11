import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseHexBytes,
  type ReceiveFrameMode,
  type ReceiveOptions,
  type SerialProfile,
  type SerialTextEncoding,
} from '../serialFeatures';

interface SerialFeatureSettingsProps {
  receiveOptions: ReceiveOptions;
  onReceiveOptionsChange: (options: ReceiveOptions) => void;
  profiles: SerialProfile[];
  profileName: string;
  selectedProfileId: string;
  connected: boolean;
  onProfileNameChange: (name: string) => void;
  onSelectProfile: (id: string) => void;
  onSaveProfile: () => void;
  onLoadProfile: () => void;
  onDeleteProfile: () => void;
}

const FRAME_MODES: ReceiveFrameMode[] = ['idle', 'fixed', 'newline', 'delimiter', 'raw'];
const ENCODINGS: SerialTextEncoding[] = ['latin1', 'utf-8', 'gbk', 'ascii'];

export const SerialFeatureSettings: React.FC<SerialFeatureSettingsProps> = ({
  receiveOptions,
  onReceiveOptionsChange,
  profiles,
  profileName,
  selectedProfileId,
  connected,
  onProfileNameChange,
  onSelectProfile,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
}) => {
  const { t } = useTranslation();
  const updateReceiveOption = useCallback(
    <K extends keyof ReceiveOptions>(key: K, value: ReceiveOptions[K]) => {
      onReceiveOptionsChange({ ...receiveOptions, [key]: value });
    },
    [onReceiveOptionsChange, receiveOptions]
  );

  const delimiterInvalid =
    receiveOptions.frameMode === 'delimiter' &&
    parseHexBytes(receiveOptions.delimiterHex).length === 0;

  return (
    <div className="serial-feature-settings">
      <div className="serial-receive-config">
        <span className="feature-settings-title">{t('serialTool.receive.title')}</span>
        <label className="feature-field">
          <span>{t('serialTool.receive.frameMode')}</span>
          <select
            value={receiveOptions.frameMode}
            onChange={(event) =>
              updateReceiveOption('frameMode', event.target.value as ReceiveFrameMode)
            }
          >
            {FRAME_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`serialTool.receive.modes.${mode}`)}
              </option>
            ))}
          </select>
        </label>

        {receiveOptions.frameMode === 'idle' && (
          <label className="feature-field feature-field--number">
            <span>{t('serialTool.receive.idleGap')}</span>
            <span className="feature-input-with-unit">
              <input
                type="number"
                min={1}
                max={5000}
                value={receiveOptions.idleGapMs}
                onChange={(event) =>
                  updateReceiveOption(
                    'idleGapMs',
                    Math.max(1, Math.min(5000, Number(event.target.value) || 1))
                  )
                }
              />
              <span>ms</span>
            </span>
          </label>
        )}

        {receiveOptions.frameMode === 'fixed' && (
          <label className="feature-field feature-field--number">
            <span>{t('serialTool.receive.fixedLength')}</span>
            <span className="feature-input-with-unit">
              <input
                type="number"
                min={1}
                max={65535}
                value={receiveOptions.fixedLength}
                onChange={(event) =>
                  updateReceiveOption(
                    'fixedLength',
                    Math.max(1, Math.min(65535, Number(event.target.value) || 1))
                  )
                }
              />
              <span>B</span>
            </span>
          </label>
        )}

        {receiveOptions.frameMode === 'delimiter' && (
          <label className="feature-field feature-field--delimiter">
            <span>{t('serialTool.receive.delimiter')}</span>
            <input
              className={delimiterInvalid ? 'invalid' : ''}
              value={receiveOptions.delimiterHex}
              onChange={(event) => updateReceiveOption('delimiterHex', event.target.value)}
              placeholder="0D 0A"
              title={
                delimiterInvalid
                  ? t('serialTool.receive.invalidDelimiter')
                  : t('serialTool.receive.delimiterHint')
              }
            />
          </label>
        )}

        <label className="feature-field">
          <span>{t('serialTool.receive.encoding')}</span>
          <select
            value={receiveOptions.encoding}
            onChange={(event) =>
              updateReceiveOption('encoding', event.target.value as SerialTextEncoding)
            }
          >
            {ENCODINGS.map((encoding) => (
              <option key={encoding} value={encoding}>
                {t(`serialTool.receive.encodings.${encoding}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="serial-option-inline feature-checkbox">
          <input
            type="checkbox"
            checked={receiveOptions.showInvisible}
            onChange={(event) => updateReceiveOption('showInvisible', event.target.checked)}
          />
          {t('serialTool.receive.showInvisible')}
        </label>
      </div>

      <div className="serial-profile-config">
        <span className="feature-settings-title">{t('serialTool.profiles.title')}</span>
        <input
          className="profile-name-input"
          value={profileName}
          onChange={(event) => onProfileNameChange(event.target.value)}
          placeholder={t('serialTool.profiles.namePlaceholder')}
        />
        <select
          className="profile-select"
          value={selectedProfileId}
          onChange={(event) => onSelectProfile(event.target.value)}
        >
          <option value="">{t('serialTool.profiles.select')}</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <span className="profile-actions">
          <button
            className="profile-action-btn primary"
            onClick={onSaveProfile}
            disabled={!profileName.trim()}
          >
            {t('serialTool.profiles.save')}
          </button>
          <button
            className="profile-action-btn"
            onClick={onLoadProfile}
            disabled={!selectedProfileId || connected}
            title={connected ? t('serialTool.profiles.disconnectToLoad') : undefined}
          >
            {t('serialTool.profiles.load')}
          </button>
          <button
            className="profile-action-btn danger"
            onClick={onDeleteProfile}
            disabled={!selectedProfileId}
          >
            {t('serialTool.profiles.delete')}
          </button>
        </span>
      </div>
    </div>
  );
};
