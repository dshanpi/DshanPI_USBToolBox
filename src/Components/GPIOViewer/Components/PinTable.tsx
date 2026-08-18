import React from 'react';
import { useTranslation } from 'react-i18next';
import { GPIO } from '../../../Drivers/GPIO';
import type { PinRowData, EditValues } from '../types';

interface PinTableProps {
  pinData: PinRowData[];
  selectedPins: Set<string>;
  editingPins: PinRowData[];
  editValues: EditValues | null;
  changedPins: Set<string>;
  isEditing: boolean;
  loading: boolean;
  gpio: GPIO | null;
  isAllSelected: boolean;
  commonMuxOptions: { index: number; name: string }[];
  onRowClick: (row: PinRowData, event: React.MouseEvent) => void;
  onCheckboxChange: (pin: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onInlineEdit: (row: PinRowData) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
  onEditValuesChange: (values: EditValues) => void;
}

export const PinTable: React.FC<PinTableProps> = ({
  pinData,
  selectedPins,
  editingPins,
  editValues,
  changedPins,
  isEditing,
  loading,
  isAllSelected,
  commonMuxOptions,
  onRowClick,
  onCheckboxChange,
  onSelectAll,
  onInlineEdit,
  onInlineSave,
  onInlineCancel,
  onEditValuesChange,
}) => {
  const { t } = useTranslation();

  return (
    <table className="gpio-table">
      <thead>
        <tr>
          <th className="gpio-th-checkbox">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={(e) => onSelectAll(e.target.checked)}
              title={t('gpioViewer.table.selectAll', '全选')}
            />
          </th>
          <th>{t('gpioViewer.table.pin', 'GPIO Pin')}</th>
          <th>{t('gpioViewer.table.gpioId', 'GPIO ID')}</th>
          <th>{t('gpioViewer.table.function', 'Pin Function')}</th>
          <th>{t('gpioViewer.table.mux', 'Pin MUX')}</th>
          <th>{t('gpioViewer.table.pull', 'Pin Pull')}</th>
          <th>{t('gpioViewer.table.drv', 'Pin Driver')}</th>
          <th>{t('gpioViewer.table.data', 'Pin Data')}</th>
          <th>{t('gpioViewer.table.actions', '操作')}</th>
        </tr>
      </thead>
      <tbody>
        {pinData.map((row) => {
          const isCurrentEditing =
            editingPins.some((p) => p.pin === row.pin) && editValues !== null;
          const isChanged = changedPins.has(row.pin);

          return (
            <tr
              key={row.pin}
              className={`${selectedPins.has(row.pin) ? 'gpio-row-selected' : ''} ${isCurrentEditing ? 'gpio-row-editing' : ''} ${isChanged ? 'gpio-row-changed' : ''}`}
              onClick={(e) => !isCurrentEditing && onRowClick(row, e)}
            >
              <td className="gpio-checkbox" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedPins.has(row.pin)}
                  onChange={(e) => onCheckboxChange(row.pin, e.target.checked)}
                />
              </td>
              <td className="gpio-pin-name">{row.pin}</td>
              <td className="gpio-gpio-id">{row.gpioId}</td>
              {isCurrentEditing && editValues ? (
                <>
                  <td className="gpio-function-edit">
                    <select
                      value={editValues.mux}
                      onChange={(e) =>
                        onEditValuesChange({ ...editValues, mux: parseInt(e.target.value, 10) })
                      }
                      onClick={(e) => e.stopPropagation()}
                      disabled={loading}
                    >
                      {editingPins.length > 1 && editValues.mux === -1 && (
                        <option value={-1}>({t('gpioViewer.config.mixed', '混合')})</option>
                      )}
                      {commonMuxOptions.map((item) => (
                        <option key={item.index} value={item.index}>
                          ({item.index}): {item.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="gpio-mux-edit">{editValues.mux === -1 ? '-' : editValues.mux}</td>
                  <td className="gpio-pull-edit">
                    <select
                      value={editValues.pull}
                      onChange={(e) =>
                        onEditValuesChange({ ...editValues, pull: parseInt(e.target.value, 10) })
                      }
                      onClick={(e) => e.stopPropagation()}
                      disabled={loading}
                    >
                      {editingPins.length > 1 && editValues.pull === -1 && (
                        <option value={-1}>({t('gpioViewer.config.mixed', '混合')})</option>
                      )}
                      <option value={0}>{t('gpioViewer.config.pullNone')}</option>
                      <option value={1}>{t('gpioViewer.config.pullUp')}</option>
                      <option value={2}>{t('gpioViewer.config.pullDown')}</option>
                    </select>
                  </td>
                  <td className="gpio-drv-edit">
                    <select
                      value={editValues.drv}
                      onChange={(e) =>
                        onEditValuesChange({ ...editValues, drv: parseInt(e.target.value, 10) })
                      }
                      onClick={(e) => e.stopPropagation()}
                      disabled={loading}
                    >
                      {editingPins.length > 1 && editValues.drv === -1 && (
                        <option value={-1}>({t('gpioViewer.config.mixed', '混合')})</option>
                      )}
                      <option value={0}>0x0</option>
                      <option value={1}>0x1</option>
                      <option value={2}>0x2</option>
                      <option value={3}>0x3</option>
                    </select>
                  </td>
                  <td className="gpio-data-edit">
                    {editValues.mux === 1 ? (
                      <select
                        value={editValues.data}
                        onChange={(e) =>
                          onEditValuesChange({ ...editValues, data: parseInt(e.target.value, 10) })
                        }
                        onClick={(e) => e.stopPropagation()}
                        disabled={loading}
                      >
                        {editingPins.length > 1 && editValues.data === -1 && (
                          <option value={-1}>({t('gpioViewer.config.mixed', '混合')})</option>
                        )}
                        <option value={0}>{t('gpioViewer.config.low')}</option>
                        <option value={1}>{t('gpioViewer.config.high')}</option>
                      </select>
                    ) : (
                      <span className="gpio-data-function">{t('gpioViewer.config.function')}</span>
                    )}
                  </td>
                  <td className="gpio-actions">
                    <button
                      className="gpio-inline-btn gpio-inline-save"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInlineSave();
                      }}
                      disabled={loading}
                      title={t('gpioViewer.actions.save', '保存')}
                    >
                      ✓
                    </button>
                    <button
                      className="gpio-inline-btn gpio-inline-cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInlineCancel();
                      }}
                      disabled={loading}
                      title={t('gpioViewer.actions.cancel', '取消')}
                    >
                      ✕
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className={`gpio-function gpio-function-${row.mux.name.toLowerCase()}`}>
                    {row.mux.name.toUpperCase()}
                  </td>
                  <td className="gpio-mux">{row.mux.id}</td>
                  <td className={`gpio-pull gpio-pull-${row.pull.toLowerCase().replace(' ', '-')}`}>
                    {row.pull}
                  </td>
                  <td className="gpio-drv">0x{row.drv.toString(16).toUpperCase()}</td>
                  <td
                    className={`gpio-data ${row.mux.name.toUpperCase() === 'GPIO_IN' || row.mux.name.toUpperCase() === 'GPIO_OUT' ? (row.data === true ? 'gpio-data-high' : 'gpio-data-low') : 'gpio-data-function'}`}
                  >
                    {row.mux.name.toUpperCase() === 'GPIO_IN' ||
                    row.mux.name.toUpperCase() === 'GPIO_OUT'
                      ? row.data === true
                        ? 'HIGH'
                        : 'LOW'
                      : 'FUNCTION'}
                  </td>
                  <td className="gpio-actions">
                    <button
                      className="gpio-inline-btn gpio-inline-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInlineEdit(row);
                      }}
                      disabled={loading || isEditing}
                      title={t('gpioViewer.actions.edit', '编辑')}
                    >
                      ✎
                    </button>
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
