import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DeviceSlot } from '../Types';
import { DYNAMIC_I18N_KEYS } from '../../../Assets/I18nKeys';

interface DeviceListViewProps {
  slots: DeviceSlot[];
}

function formatDuration(startMs: number | null, endMs: number | null): string {
  if (!startMs) return '';
  const endTime = endMs || Date.now();
  const diff = Math.floor((endTime - startMs) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

function getStatusClass(status: DeviceSlot['status']): string {
  switch (status) {
    case 'flashing':
      return 'mp-slot-flashing';
    case 'success':
      return 'mp-slot-success';
    case 'failed':
      return 'mp-slot-failed';
    case 'waiting':
      return 'mp-slot-waiting';
    default:
      return 'mp-slot-idle';
  }
}

function getStatusLabel(status: DeviceSlot['status']): string {
  const labels = DYNAMIC_I18N_KEYS.massProduction.statusLabels;
  switch (status) {
    case 'idle':
      return labels.idle;
    case 'waiting':
      return labels.waiting;
    case 'flashing':
      return labels.flashing;
    case 'success':
      return labels.success;
    case 'failed':
      return labels.failed;
    default:
      return '';
  }
}

function progressText(slot: DeviceSlot): string {
  if (slot.status === 'failed' && slot.error) return slot.error;
  if (slot.status === 'success') return `100% · ${formatDuration(slot.startTime, slot.endTime)}`;
  if (slot.status === 'flashing') {
    const pct = `${Math.round(slot.progress)}%`;
    return slot.stage ? `${pct} · ${slot.stage}` : pct;
  }
  return slot.stage || '';
}

function SlotRow({ slot }: { slot: DeviceSlot }) {
  const cls = getStatusClass(slot.status);
  const text = progressText(slot);
  const p = slot.progress;
  return (
    <div className={`mp-device-row ${cls}`}>
      <span className="mp-col-id">{slot.id + 1}</span>
      <span className={`mp-col-status mp-status-badge ${cls}`}>{getStatusLabel(slot.status)}</span>
      <span className="mp-col-progress">
        <div className={`mp-progress-bar-container ${cls}`}>
          <div className="mp-progress-bar-fill" style={{ width: `${p}%` }} />
          <span className="mp-progress-text" style={{ clipPath: `inset(0 0 0 ${p}%)` }}>
            {text}
          </span>
          <span
            className="mp-progress-text mp-progress-text-filled"
            style={{ clipPath: `inset(0 ${100 - p}% 0 0)` }}
          >
            {text}
          </span>
        </div>
      </span>
    </div>
  );
}

export const DeviceListView: React.FC<DeviceListViewProps> = ({ slots }) => {
  const { t } = useTranslation();
  const half = Math.ceil(slots.length / 2);
  const leftSlots = slots.slice(0, half);
  const rightSlots = slots.slice(half);

  const header = (
    <div className="mp-device-list-header">
      <span className="mp-col-id">#</span>
      <span className="mp-col-status">{t('massProduction.status', '状态')}</span>
      <span className="mp-col-progress">{t('massProduction.progress', '进度')}</span>
    </div>
  );

  return (
    <div className="mp-device-list">
      <div className="mp-device-column mp-device-column-left">
        {header}
        <div className="mp-device-list-body">
          {leftSlots.map((slot) => (
            <SlotRow key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
      <div className="mp-device-column">
        {header}
        <div className="mp-device-list-body">
          {rightSlots.map((slot) => (
            <SlotRow key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
    </div>
  );
};
