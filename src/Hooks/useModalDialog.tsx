/**
 * 自定义模态弹窗 Hook —— 取代浏览器原生 window.prompt / window.confirm / window.alert，
 * 避免它们在 Tauri WebView 里显示 "localhost:3030" 等地址栏标题。
 *
 * 使用方式：
 *   const { showPrompt, showConfirm, modalNode } = useModalDialog();
 *
 *   const name = await showPrompt('标题', '默认值', '副说明');
 *   const ok = await showConfirm('删除？', '此操作不可撤销', { okText: '删除', okDanger: true });
 *
 *   return (
 *     <div>
 *       ...
 *       {modalNode}   // 必须挂到 JSX 中，弹窗才能渲染
 *     </div>
 *   );
 *
 * 三个特性：
 *   - ESC 取消、Enter 提交（prompt 模式）
 *   - 点击遮罩取消
 *   - 危险操作用 okDanger:true 把确认按钮变红（删除/覆盖/清空场景）
 */

import { useCallback, useState } from 'react';
import './useModalDialog.css';

/** Modal 内部状态。mode 决定显示输入框还是仅确认按钮。 */
interface ModalState {
  open: boolean;
  mode: 'prompt' | 'confirm' | 'alert';
  title: string;
  message?: string;
  okText?: string;
  okDanger?: boolean;
  /** prompt 模式 resolve 输入字符串或 null；confirm/alert 模式 resolve null 或空串 */
  resolve?: (val: string | null) => void;
}

/** 弹出确认/输入框时的可选参数。 */
export interface ModalDialogOptions {
  /** 副说明文字（可选，prompt 输入框上方提示） */
  message?: string;
  /** 确认按钮文字，默认 "确定" */
  okText?: string;
  /** 确认按钮显示为危险（红色）样式，适用于"删除/覆盖/清空"场景 */
  okDanger?: boolean;
}

/** Hook 返回值。 */
export interface UseModalDialogResult {
  /** 弹出输入框：返回 Promise，resolve 输入字符串或 null（取消） */
  showPrompt: (title: string, defaultValue?: string, message?: string) => Promise<string | null>;
  /** 弹出确认框：返回 Promise<boolean>。confirm/cancel 两态 */
  showConfirm: (title: string, message?: string, opts?: ModalDialogOptions) => Promise<boolean>;
  /** 弹出仅提示用的对话框（OK 按钮），返回 Promise<void> */
  showAlert: (title: string, message?: string) => Promise<void>;
  /** 必须挂到 JSX 树中的弹窗节点（用 React Portal 或直接渲染都行，这里直接渲染） */
  modalNode: React.ReactNode;
}

/**
 * 共享的模态弹窗 hook。
 *
 * 内部用单一 state 同时支持 prompt/confirm/alert 三种模式，
 * 因为应用里同一时刻只会有一个 modal。
 */
export function useModalDialog(): UseModalDialogResult {
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'prompt', title: '' });
  const [input, setInput] = useState('');

  const showPrompt = useCallback((title: string, defaultValue = '', message?: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setInput(defaultValue);
      setModal({ open: true, mode: 'prompt', title, message, resolve });
    });
  }, []);

  const showConfirm = useCallback((title: string, message?: string, opts?: ModalDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({
        open: true, mode: 'confirm', title, message,
        okText: opts?.okText, okDanger: opts?.okDanger,
        // confirm 模式下 resolve('') 视为确认，resolve(null) 视为取消
        resolve: (val) => resolve(val !== null),
      });
    });
  }, []);

  const showAlert = useCallback((title: string, message?: string): Promise<void> => {
    return new Promise((resolve) => {
      setModal({
        open: true, mode: 'alert', title, message,
        resolve: () => resolve(),
      });
    });
  }, []);

  /** 关闭弹窗并把结果通过 resolve 返回给等待方。 */
  const close = useCallback((result: string | null) => {
    modal.resolve?.(result);
    setModal((m) => ({ ...m, open: false, resolve: undefined }));
  }, [modal]);

  // 弹窗 JSX —— 调用方挂到树上即可。所有交互（ESC/Enter/点遮罩）都在内部处理
  const modalNode = !modal.open ? null : (
    <div className="spi-modal-overlay" onClick={() => close(null)}>
      <div className="spi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spi-modal-title">{modal.title}</div>
        {modal.message && <div className="spi-modal-message">{modal.message}</div>}
        {modal.mode === 'prompt' && (
          <input
            className="spi-modal-input"
            type="text"
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') close(input);
              if (e.key === 'Escape') close(null);
            }}
          />
        )}
        <div className="spi-modal-actions">
          {/* alert 模式只有 OK 按钮；prompt/confirm 模式有取消和确认 */}
          {modal.mode !== 'alert' && (
            <button className="spi-modal-btn" onClick={() => close(null)}>取消</button>
          )}
          <button className={`spi-modal-btn ${modal.okDanger ? 'danger' : 'primary'}`}
            onClick={() => close(modal.mode === 'prompt' ? input : '')}>
            {modal.okText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  );

  return { showPrompt, showConfirm, showAlert, modalNode };
}
