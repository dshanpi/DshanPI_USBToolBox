import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPaperPlane,
  faStop,
  faWandMagicSparkles,
  faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { invokeCommand, subscribeEvent } from '../../../Platform/IPC';
import { loadSettings } from '../../../Settings';
import { AI_SYSTEM_PROMPT } from '../aiContext';
import './AiChat.css';

/** 一条聊天消息。 */
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

interface AiChatProps {
  /** 把 AI 生成的代码应用到脚本编辑器。 */
  onApplyCode: (code: string) => void;
  /** 把状态/错误写进输出台。 */
  onLog: (msg: string, isError?: boolean) => void;
}

/**
 * AI 聊天组件：用户用自然语言描述需求，AI 生成 Python 产测脚本。
 *
 * 调用 Rust 后端 ai_chat 命令（API Key 经后端代理，不进前端 JS），订阅 ai-chat-delta
 * 事件流式拼接 AI 回复。AI 回复中的 ```python 代码块带「应用到编辑器」按钮。
 */
export const AiChat: React.FC<AiChatProps> = ({ onApplyCode, onLog }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(''); // 流式拼接中的 AI 回复
  const [noKey, setNoKey] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef<string | null>(null);

  // 启动时检查是否配置了 API Key
  const checkKey = useCallback(async () => {
    try {
      const s = await loadSettings();
      setNoKey(!s.ai.apiKey);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    checkKey();
  }, [checkKey]);

  // 订阅流式事件
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let alive = true;
    (async () => {
      const u1 = await subscribeEvent('ai-chat-delta', (p) => {
        if (p.requestId !== requestIdRef.current) return;
        setStreaming((prev) => prev + p.content);
      });
      const u2 = await subscribeEvent('ai-chat-done', (p) => {
        if (p.requestId !== requestIdRef.current) return;
        setStreaming((prev) => {
          if (prev) {
            setMessages((m) => [...m, { role: 'assistant', content: prev }]);
          }
          return '';
        });
        requestIdRef.current = null;
        setBusy(false);
      });
      const u3 = await subscribeEvent('ai-chat-error', (p) => {
        if (p.requestId !== requestIdRef.current) return;
        onLog(t('tools.pythonTestTool.ai.errorLog', { error: p.error }), true);
        setStreaming((prev) => {
          if (prev) setMessages((m) => [...m, { role: 'assistant', content: prev }]);
          return '';
        });
        requestIdRef.current = null;
        setBusy(false);
      });
      if (alive) {
        unsubs.push(u1, u2, u3);
      } else {
        u1();
        u2();
        u3();
      }
    })();
    return () => {
      alive = false;
      unsubs.forEach((u) => u());
    };
  }, [onLog, t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    // 每次发送重新读设置，反映用户在设置里的最新改动
    let aiCfg;
    try {
      const s = await loadSettings();
      aiCfg = s.ai;
    } catch (e) {
      onLog(t('tools.pythonTestTool.ai.configError', { error: (e as Error).message }), true);
      return;
    }
    if (!aiCfg.apiKey) {
      setNoKey(true);
      onLog(t('tools.pythonTestTool.ai.noKey'), true);
      return;
    }
    setNoKey(false);

    const userMsg: ChatMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setBusy(true);
    setStreaming('');
    const requestId = `python-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    requestIdRef.current = requestId;

    // 构造发给后端的消息：首条 system 提示 + 历史 + 本轮用户消息
    const reqMessages = [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      await invokeCommand('ai_chat', {
        requestId,
        messages: reqMessages,
        settings: {
          apiUrl: aiCfg.apiUrl,
          apiKey: aiCfg.apiKey,
          model: aiCfg.model,
        },
      });
    } catch (e) {
      onLog(t('tools.pythonTestTool.ai.requestError', { error: (e as Error).message }), true);
      requestIdRef.current = null;
      setBusy(false);
    }
  }, [input, busy, messages, onLog, t]);

  const stop = useCallback(async () => {
    try {
      await invokeCommand('ai_chat_stop', { requestId: requestIdRef.current ?? undefined });
    } catch {
      /* ignore */
    }
    onLog(t('tools.pythonTestTool.ai.stopLog'));
  }, [onLog, t]);

  return (
    <div className="aic-root">
      <div className="aic-header">
        <FontAwesomeIcon icon={faWandMagicSparkles} />
        <span>{t('tools.pythonTestTool.ai.title')}</span>
        <span className="aic-sub">{t('tools.pythonTestTool.ai.subtitle')}</span>
      </div>

      {noKey && (
        <div className="aic-nokey">
          <FontAwesomeIcon icon={faCircleExclamation} />
          {t('tools.pythonTestTool.ai.noKey')}
        </div>
      )}

      <div className="aic-messages" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <div className="aic-empty">
            {t('tools.pythonTestTool.ai.emptyHint')}
            <br />
            <em>{t('tools.pythonTestTool.ai.example1')}</em>
            <br />
            <em>{t('tools.pythonTestTool.ai.example2')}</em>
            <br />
            <em>{t('tools.pythonTestTool.ai.example3')}</em>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} onApplyCode={onApplyCode} />
        ))}
        {streaming && (
          <MessageBubble role="assistant" content={streaming} onApplyCode={onApplyCode} streaming />
        )}
      </div>

      <div className="aic-input-row">
        <textarea
          className="aic-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t('tools.pythonTestTool.ai.placeholder')}
          rows={2}
          disabled={busy}
        />
        {busy ? (
          <button
            className="aic-btn aic-stop"
            onClick={stop}
            title={t('tools.pythonTestTool.ai.stop')}
          >
            <FontAwesomeIcon icon={faStop} />
          </button>
        ) : (
          <button className="aic-btn aic-send" onClick={send} disabled={!input.trim()}>
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        )}
      </div>
    </div>
  );
};

/** 单条消息气泡：解析 markdown 代码块，python 代码块带「应用到编辑器」按钮。 */
const MessageBubble: React.FC<{
  role: 'user' | 'assistant';
  content: string;
  onApplyCode: (code: string) => void;
  streaming?: boolean;
}> = ({ role, content, onApplyCode, streaming }) => {
  const { t: tb } = useTranslation();
  // 把内容拆成 [文本, 代码块, 文本, ...]
  const parts: Array<{ type: 'text' | 'code'; lang?: string; value: string }> = [];
  const re = /```(\w+)?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: content.slice(last, m.index) });
    parts.push({ type: 'code', lang: m[1] || '', value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });

  return (
    <div className={`aic-msg aic-${role}`}>
      <div className="aic-msg-role">
        {role === 'user' ? tb('tools.pythonTestTool.ai.you') : tb('tools.pythonTestTool.ai.ai')}
      </div>
      <div className="aic-msg-body">
        {parts.map((p, i) =>
          p.type === 'code' ? (
            <div className="aic-code-block" key={i}>
              <div className="aic-code-head">
                <span className="aic-code-lang">{p.lang || 'code'}</span>
                {!streaming && (p.lang === 'python' || p.lang === '') && (
                  <button className="aic-apply-btn" onClick={() => onApplyCode(p.value)}>
                    {tb('tools.pythonTestTool.ai.applyCode')}
                  </button>
                )}
              </div>
              <pre>
                <code>{p.value}</code>
              </pre>
            </div>
          ) : (
            <div className="aic-text" key={i}>
              {p.value}
            </div>
          )
        )}
        {streaming && <span className="aic-cursor">▋</span>}
      </div>
    </div>
  );
};
