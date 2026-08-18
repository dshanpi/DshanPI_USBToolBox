import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faClockRotateLeft,
  faFileLines,
  faGear,
  faMagnifyingGlass,
  faPaperPlane,
  faPaperclip,
  faPen,
  faPlus,
  faRobot,
  faStop,
  faTrashCan,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { invokeCommand, subscribeEvent } from '../../Platform/IPC';
import { loadSettings } from '../../Settings';
import {
  applyAssistantProposal,
  getAssistantToolContext,
  parseAssistantProposal,
  type AssistantProposal,
  type AssistantToolId,
} from './assistantBridge';
import { buildAssistantSystemPrompt, TOOL_STARTERS } from './assistantPrompt';
import {
  createAssistantConversation,
  loadAssistantHistories,
  saveAssistantHistories,
  type AssistantAttachment,
  type AssistantChatMessage,
  type AssistantConversation,
} from './assistantHistory';
import './AIAssistant.css';

interface ActiveStream {
  requestId: string;
  tool: AssistantToolId;
  conversationId: string;
  content: string;
}

interface AIAssistantProps {
  activeTool: AssistantToolId;
  toolName: string;
  onOpenSettings: () => void;
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function conversationTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length > 48 ? `${characters.slice(0, 48).join('')}…` : normalized;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** 全局 USBToolBox AI 助手。它只生成/填入草稿，不直接连接或操作硬件。 */
export const AIAssistant: React.FC<AIAssistantProps> = ({
  activeTool,
  toolName,
  onOpenSettings,
}) => {
  const { t, i18n } = useTranslation();
  const [openPanel, setOpenPanel] = useState(false);
  const [launcherTarget, setLauncherTarget] = useState<HTMLElement | null>(null);
  const [histories, setHistories] = useState(loadAssistantHistories);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [editingConversationId, setEditingConversationId] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [historyStorageError, setHistoryStorageError] = useState('');
  const [stream, setStream] = useState<ActiveStream | null>(null);
  const streamRef = useRef<ActiveStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const toolHistory = histories[activeTool];
  const conversation =
    toolHistory.conversations.find((item) => item.id === toolHistory.activeId) ??
    toolHistory.conversations[0];

  const updateConversation = useCallback(
    (
      tool: AssistantToolId,
      update: (current: AssistantConversation) => AssistantConversation,
      conversationId?: string
    ) => {
      setHistories((current) => {
        const bucket = current[tool];
        const targetId = conversationId ?? bucket.activeId;
        return {
          ...current,
          [tool]: {
            ...bucket,
            conversations: bucket.conversations.map((item) =>
              item.id === targetId ? { ...update(item), updatedAt: Date.now() } : item
            ),
          },
        };
      });
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        saveAssistantHistories(histories);
        setHistoryStorageError('');
      } catch (saveError) {
        setHistoryStorageError(errorMessage(saveError));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [histories]);

  useEffect(() => {
    if (!openPanel) return;
    loadSettings()
      .then((settings) => setNoKey(!settings.ai.apiKey))
      .catch(() => setNoKey(true));
  }, [openPanel]);

  useEffect(() => {
    setLauncherTarget(document.getElementById('assistant-sidebar-slot'));
  }, []);

  useEffect(() => {
    if (!openPanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (historyOpen) setHistoryOpen(false);
      else setOpenPanel(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyOpen, openPanel]);

  useEffect(() => {
    setHistoryQuery('');
    setEditingConversationId('');
  }, [activeTool]);

  useEffect(() => {
    let alive = true;
    const unsubscribers: Array<() => void> = [];
    void (async () => {
      const delta = await subscribeEvent('ai-chat-delta', (payload) => {
        const current = streamRef.current;
        if (!current || payload.requestId !== current.requestId) return;
        const next = { ...current, content: current.content + payload.content };
        streamRef.current = next;
        setStream(next);
      });
      const done = await subscribeEvent('ai-chat-done', (payload) => {
        const current = streamRef.current;
        if (!current || payload.requestId !== current.requestId) return;
        if (current.content.trim()) {
          updateConversation(
            current.tool,
            (session) => ({
              ...session,
              messages: [
                ...session.messages,
                { id: makeId('assistant'), role: 'assistant', content: current.content },
              ],
            }),
            current.conversationId
          );
        }
        streamRef.current = null;
        setStream(null);
        setBusy(false);
      });
      const failed = await subscribeEvent('ai-chat-error', (payload) => {
        const current = streamRef.current;
        if (!current || payload.requestId !== current.requestId) return;
        if (current.content.trim()) {
          updateConversation(
            current.tool,
            (session) => ({
              ...session,
              messages: [
                ...session.messages,
                { id: makeId('assistant'), role: 'assistant', content: current.content },
              ],
            }),
            current.conversationId
          );
        }
        setError(payload.error);
        streamRef.current = null;
        setStream(null);
        setBusy(false);
      });
      if (alive) unsubscribers.push(delta, done, failed);
      else {
        delta();
        done();
        failed();
      }
    })();
    return () => {
      alive = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [updateConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversation.id, conversation.messages, stream, activeTool]);

  const setDraft = useCallback(
    (draft: string) =>
      updateConversation(activeTool, (session) => ({
        ...session,
        draft,
      })),
    [activeTool, updateConversation]
  );

  const attachFiles = useCallback(async () => {
    if (attaching) return;
    setError('');
    setNotice('');
    setAttaching(true);
    try {
      const selected = await open({
        multiple: true,
        title: t('aiAssistant.chooseFiles'),
        filters: [
          {
            name: t('aiAssistant.fileFilterDocs'),
            extensions: ['pdf', 'txt', 'md', 'rst', 'csv'],
          },
          {
            name: t('aiAssistant.fileFilterSource'),
            extensions: [
              'c',
              'h',
              'cpp',
              'hpp',
              'ino',
              'py',
              'json',
              'yaml',
              'yml',
              'xml',
              'ini',
              'cfg',
              'toml',
              'log',
            ],
          },
        ],
      });
      const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (!paths.length) return;
      const remaining = Math.max(0, 5 - conversation.attachments.length);
      if (remaining === 0) throw new Error(t('aiAssistant.maxAttachments'));
      const docs: AssistantAttachment[] = [];
      for (const path of paths.slice(0, remaining)) {
        const doc = await invokeCommand('ai_read_document', { path });
        docs.push({ ...doc, id: makeId('attachment') });
      }
      updateConversation(
        activeTool,
        (session) => ({
          ...session,
          attachments: [...session.attachments, ...docs],
        }),
        conversation.id
      );
    } catch (attachError) {
      setError(errorMessage(attachError));
    } finally {
      setAttaching(false);
    }
  }, [
    activeTool,
    attaching,
    conversation.attachments.length,
    conversation.id,
    t,
    updateConversation,
  ]);

  const removeAttachment = useCallback(
    (id: string) =>
      updateConversation(activeTool, (session) => ({
        ...session,
        attachments: session.attachments.filter((item) => item.id !== id),
      })),
    [activeTool, updateConversation]
  );

  const send = useCallback(async () => {
    const text = conversation.draft.trim();
    if (!text || busy) return;
    setError('');
    setNotice('');

    let ai;
    try {
      ai = (await loadSettings()).ai;
    } catch (settingsError) {
      setError(t('aiAssistant.readSettingsFailed', { error: errorMessage(settingsError) }));
      return;
    }
    if (!ai.apiKey) {
      setNoKey(true);
      setError(t('aiAssistant.keyRequired'));
      return;
    }
    setNoKey(false);

    const userMessage: AssistantChatMessage = {
      id: makeId('user'),
      role: 'user',
      content: text,
    };
    const messageHistory = [...conversation.messages, userMessage];
    updateConversation(
      activeTool,
      (session) => ({
        ...session,
        title: session.title || conversationTitle(text),
        messages: messageHistory,
        draft: '',
      }),
      conversation.id
    );

    const context = includeContext ? getAssistantToolContext(activeTool) : [];
    let attachmentBudget = 140_000;
    const attachmentText = conversation.attachments
      .map((attachment) => {
        const textPart = attachment.text.slice(0, Math.max(0, attachmentBudget));
        attachmentBudget -= textPart.length;
        return `\n--- 附件: ${attachment.name} (${attachment.kind}${attachment.truncated ? '，已截断' : ''}) ---\n${textPart}`;
      })
      .join('');
    const enrichedUserContent = `${text}\n\n[当前工具上下文]\n${JSON.stringify(
      { tool: activeTool, capturedAt: new Date().toISOString(), sections: context },
      null,
      2
    )}${attachmentText ? `\n\n[用户选择的本地资料]${attachmentText}` : ''}`;

    const recentHistory = messageHistory.slice(-14).map((message, index, list) => ({
      role: message.role,
      content: index === list.length - 1 ? enrichedUserContent : message.content,
    }));
    const requestId = makeId('usbtoolbox-assistant');
    const activeStream: ActiveStream = {
      requestId,
      tool: activeTool,
      conversationId: conversation.id,
      content: '',
    };
    streamRef.current = activeStream;
    setStream(activeStream);
    setBusy(true);
    try {
      await invokeCommand('ai_chat', {
        requestId,
        messages: [
          {
            role: 'system',
            content: buildAssistantSystemPrompt(activeTool, toolName, i18n.resolvedLanguage),
          },
          ...recentHistory,
        ],
        settings: { apiUrl: ai.apiUrl, apiKey: ai.apiKey, model: ai.model },
      });
    } catch (sendError) {
      streamRef.current = null;
      setStream(null);
      setBusy(false);
      setError(t('aiAssistant.requestFailed', { error: errorMessage(sendError) }));
    }
  }, [
    activeTool,
    busy,
    conversation,
    i18n.resolvedLanguage,
    includeContext,
    t,
    toolName,
    updateConversation,
  ]);

  const stop = useCallback(async () => {
    const requestId = streamRef.current?.requestId;
    if (!requestId) return;
    try {
      await invokeCommand('ai_chat_stop', { requestId });
    } catch (stopError) {
      setError(t('aiAssistant.stopFailed', { error: errorMessage(stopError) }));
    }
  }, [t]);

  const newConversation = useCallback(() => {
    if (busy) return;
    if (conversation.messages.length === 0 && !conversation.draft.trim()) {
      if (conversation.attachments.length > 0) {
        updateConversation(activeTool, (item) => ({ ...item, attachments: [] }), conversation.id);
      }
      setHistoryOpen(false);
      return;
    }
    const next = createAssistantConversation();
    setHistories((current) => ({
      ...current,
      [activeTool]: {
        activeId: next.id,
        conversations: [next, ...current[activeTool].conversations].slice(0, 30),
      },
    }));
    setHistoryOpen(false);
    setEditingConversationId('');
    setError('');
    setNotice('');
  }, [activeTool, busy, conversation, updateConversation]);

  const selectConversation = useCallback(
    (conversationId: string) => {
      if (busy) return;
      setHistories((current) => ({
        ...current,
        [activeTool]: { ...current[activeTool], activeId: conversationId },
      }));
      setHistoryOpen(false);
      setEditingConversationId('');
      setError('');
      setNotice('');
    },
    [activeTool, busy]
  );

  const beginRename = useCallback((item: AssistantConversation) => {
    setEditingConversationId(item.id);
    setEditingTitle(item.title);
  }, []);

  const commitRename = useCallback(
    (conversationId: string) => {
      updateConversation(
        activeTool,
        (item) => ({ ...item, title: editingTitle.trim().slice(0, 120) }),
        conversationId
      );
      setEditingConversationId('');
      setEditingTitle('');
    },
    [activeTool, editingTitle, updateConversation]
  );

  const deleteConversation = useCallback(
    (conversationId: string) => {
      if (busy || !window.confirm(t('aiAssistant.deleteHistoryConfirm'))) return;
      setHistories((current) => {
        const bucket = current[activeTool];
        const remaining = bucket.conversations.filter((item) => item.id !== conversationId);
        const conversations = remaining.length ? remaining : [createAssistantConversation()];
        const activeId = conversations.some((item) => item.id === bucket.activeId)
          ? bucket.activeId
          : [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
        return { ...current, [activeTool]: { activeId, conversations } };
      });
      setEditingConversationId('');
    },
    [activeTool, busy, t]
  );

  const clearToolHistory = useCallback(() => {
    if (busy || !window.confirm(t('aiAssistant.clearHistoryConfirm'))) return;
    const next = createAssistantConversation();
    setHistories((current) => ({
      ...current,
      [activeTool]: { activeId: next.id, conversations: [next] },
    }));
    setEditingConversationId('');
    setHistoryOpen(false);
    setError('');
    setNotice('');
  }, [activeTool, busy, t]);

  const starters = useMemo(() => TOOL_STARTERS[activeTool], [activeTool]);
  const sortedHistory = useMemo(
    () => [...toolHistory.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [toolHistory.conversations]
  );
  const filteredHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return sortedHistory;
    return sortedHistory.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.messages.some((message) => message.content.toLowerCase().includes(query))
    );
  }, [historyQuery, sortedHistory]);
  const historyDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.resolvedLanguage]
  );
  const visibleStream =
    stream?.tool === activeTool && stream.conversationId === conversation.id ? stream.content : '';

  return (
    <>
      {openPanel && (
        <section className="uta-panel" role="dialog" aria-label={t('aiAssistant.dialogLabel')}>
          <header className="uta-header">
            <div className="uta-title">
              <FontAwesomeIcon icon={faRobot} />
              <div>
                <strong>{t('aiAssistant.title')}</strong>
                <span title={conversation.title || undefined}>
                  {toolName}
                  {conversation.title ? ` · ${conversation.title}` : ''}
                </span>
              </div>
            </div>
            <div className="uta-header-actions">
              <button
                onClick={() => setHistoryOpen((current) => !current)}
                className={historyOpen ? 'active' : ''}
                title={t('aiAssistant.history')}
              >
                <FontAwesomeIcon icon={faClockRotateLeft} />
              </button>
              <button onClick={newConversation} disabled={busy} title={t('aiAssistant.newChat')}>
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <button onClick={onOpenSettings} title={t('aiAssistant.settings')}>
                <FontAwesomeIcon icon={faGear} />
              </button>
              <button onClick={() => setOpenPanel(false)} title={t('aiAssistant.close')}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          </header>

          {historyOpen && (
            <div className="uta-history">
              <div className="uta-history-header">
                <div>
                  <strong>{t('aiAssistant.history')}</strong>
                  <span>{toolName}</span>
                </div>
                <button onClick={clearToolHistory} disabled={busy}>
                  <FontAwesomeIcon icon={faTrashCan} />
                  {t('aiAssistant.clearHistory')}
                </button>
              </div>
              <label className="uta-history-search">
                <FontAwesomeIcon icon={faMagnifyingGlass} />
                <input
                  type="search"
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder={t('aiAssistant.searchHistory')}
                />
              </label>
              <div className="uta-history-list">
                {filteredHistory.map((item) => {
                  const active = item.id === toolHistory.activeId;
                  return (
                    <div className={`uta-history-row ${active ? 'active' : ''}`} key={item.id}>
                      {editingConversationId === item.id ? (
                        <input
                          className="uta-history-rename"
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={() => commitRename(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === 'Escape') {
                              event.preventDefault();
                              event.stopPropagation();
                              event.currentTarget.blur();
                            }
                          }}
                          maxLength={120}
                          autoFocus
                          aria-label={t('aiAssistant.renameHistory')}
                        />
                      ) : (
                        <button
                          className="uta-history-main"
                          onClick={() => selectConversation(item.id)}
                          disabled={busy}
                        >
                          <strong>{item.title || t('aiAssistant.untitledHistory')}</strong>
                          <span>
                            {historyDateFormatter.format(item.updatedAt)} ·{' '}
                            {t('aiAssistant.messageCount', { count: item.messages.length })}
                          </span>
                        </button>
                      )}
                      <div className="uta-history-actions">
                        <button
                          onClick={() => beginRename(item)}
                          disabled={busy}
                          title={t('aiAssistant.renameHistory')}
                          aria-label={t('aiAssistant.renameHistory')}
                        >
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                        <button
                          onClick={() => deleteConversation(item.id)}
                          disabled={busy}
                          title={t('aiAssistant.deleteHistory')}
                          aria-label={t('aiAssistant.deleteHistory')}
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <div className="uta-history-empty">{t('aiAssistant.noHistoryResults')}</div>
                )}
              </div>
              <div className="uta-history-note">{t('aiAssistant.historyLocalNote')}</div>
            </div>
          )}

          {noKey && (
            <div className="uta-notice warning">
              {t('aiAssistant.noKey')}
              <button onClick={onOpenSettings}>{t('aiAssistant.openSettings')}</button>
            </div>
          )}
          {error && (
            <div className="uta-notice error">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label={t('aiAssistant.closeError')}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          )}
          {notice && (
            <div className="uta-notice success">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label={t('aiAssistant.closeNotice')}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          )}
          {historyStorageError && (
            <div className="uta-notice warning">
              <span>{t('aiAssistant.historySaveFailed', { error: historyStorageError })}</span>
            </div>
          )}

          <div className="uta-context-bar">
            <label title={t('aiAssistant.includeContextTitle')}>
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(event) => setIncludeContext(event.target.checked)}
              />
              {t('aiAssistant.includeContext')}
            </label>
            <button onClick={attachFiles} disabled={attaching || busy}>
              <FontAwesomeIcon icon={faPaperclip} />
              {attaching ? t('aiAssistant.reading') : t('aiAssistant.addManual')}
            </button>
          </div>

          {conversation.attachments.length > 0 && (
            <div className="uta-attachments">
              {conversation.attachments.map((attachment) => (
                <div className="uta-attachment" key={attachment.id} title={attachment.name}>
                  <FontAwesomeIcon icon={faFileLines} />
                  <span>{attachment.name}</span>
                  {attachment.truncated && <small>{t('aiAssistant.truncated')}</small>}
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={t('aiAssistant.removeAttachment')}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="uta-messages" ref={scrollRef}>
            {conversation.messages.length === 0 && !visibleStream && (
              <div className="uta-empty">
                <FontAwesomeIcon icon={faRobot} />
                <strong>{t('aiAssistant.emptyTitle')}</strong>
                <span>{t('aiAssistant.emptyDescription')}</span>
                <div className="uta-starters">
                  {starters.map((starterKey) => {
                    const starter = t(starterKey);
                    return (
                      <button key={starterKey} onClick={() => setDraft(starter)}>
                        {starter}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {conversation.messages.map((message) => (
              <AssistantMessage
                key={message.id}
                message={message}
                activeTool={activeTool}
                onApplied={(messageText) => {
                  setError('');
                  setNotice(messageText);
                }}
              />
            ))}
            {visibleStream && (
              <AssistantMessage
                message={{ id: 'streaming', role: 'assistant', content: visibleStream }}
                activeTool={activeTool}
                streaming
                onApplied={() => {}}
              />
            )}
          </div>

          <footer className="uta-composer">
            <textarea
              value={conversation.draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={3}
              disabled={busy}
              placeholder={t('aiAssistant.placeholder')}
            />
            {busy ? (
              <button
                className="uta-send stop"
                onClick={stop}
                title={t('aiAssistant.stopGeneration')}
              >
                <FontAwesomeIcon icon={faStop} />
              </button>
            ) : (
              <button
                className="uta-send"
                onClick={send}
                disabled={!conversation.draft.trim()}
                title={t('aiAssistant.send')}
              >
                <FontAwesomeIcon icon={faPaperPlane} />
              </button>
            )}
            <div className="uta-safety">{t('aiAssistant.safety')}</div>
          </footer>
        </section>
      )}

      {launcherTarget &&
        createPortal(
          <button
            className={`sidebar-footer-btn uta-sidebar-trigger ${openPanel ? 'open' : ''}`}
            onClick={() => setOpenPanel((current) => !current)}
            aria-label={
              openPanel ? t('aiAssistant.closeAssistant') : t('aiAssistant.openAssistant')
            }
            title={t('aiAssistant.dialogLabel')}
          >
            <FontAwesomeIcon icon={openPanel ? faXmark : faRobot} />
            <span>{t('aiAssistant.title')}</span>
          </button>,
          launcherTarget
        )}
    </>
  );
};

const AssistantMessage: React.FC<{
  message: AssistantChatMessage;
  activeTool: AssistantToolId;
  streaming?: boolean;
  onApplied: (message: string) => void;
}> = ({ message, activeTool, streaming = false, onApplied }) => {
  const { t } = useTranslation();
  const parts = splitMessage(message.content);
  return (
    <div className={`uta-message ${message.role}`}>
      <div className="uta-message-role">
        {message.role === 'user' ? t('aiAssistant.you') : t('aiAssistant.assistant')}
      </div>
      <div className="uta-message-body">
        {parts.map((part, index) => {
          if (part.type === 'proposal') {
            return (
              <ProposalCard
                key={index}
                proposal={part.proposal}
                parseError={part.error}
                raw={part.raw}
                activeTool={activeTool}
                disabled={streaming}
                onApplied={onApplied}
              />
            );
          }
          if (part.type === 'code') {
            return (
              <div className="uta-code" key={index}>
                <div>{part.language || t('aiAssistant.code')}</div>
                <pre>{part.content}</pre>
              </div>
            );
          }
          return (
            <div className="uta-text" key={index}>
              {part.content}
            </div>
          );
        })}
        {streaming && <span className="uta-cursor">▋</span>}
      </div>
    </div>
  );
};

type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | {
      type: 'proposal';
      raw: string;
      proposal?: AssistantProposal;
      error?: string;
    };

function splitMessage(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const regex = /```([\w-]+)?\s*\n?([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > cursor)
      parts.push({ type: 'text', content: content.slice(cursor, match.index) });
    const language = (match[1] ?? '').toLowerCase();
    const block = match[2].trim();
    if (language === 'usbtoolbox-action') {
      try {
        parts.push({
          type: 'proposal',
          raw: block,
          proposal: parseAssistantProposal(JSON.parse(block)),
        });
      } catch (proposalError) {
        parts.push({ type: 'proposal', raw: block, error: errorMessage(proposalError) });
      }
    } else {
      parts.push({ type: 'code', language, content: match[2] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) parts.push({ type: 'text', content: content.slice(cursor) });
  return parts.length ? parts : [{ type: 'text', content }];
}

const ProposalCard: React.FC<{
  proposal?: AssistantProposal;
  parseError?: string;
  raw: string;
  activeTool: AssistantToolId;
  disabled: boolean;
  onApplied: (message: string) => void;
}> = ({ proposal, parseError, raw, activeTool, disabled, onApplied }) => {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState('');

  if (!proposal) {
    return (
      <div className="uta-proposal invalid">
        <strong>{t('aiAssistant.proposalInvalid')}</strong>
        <span>{parseError}</span>
        <pre>{raw}</pre>
      </div>
    );
  }

  const apply = async () => {
    setApplying(true);
    setApplyError('');
    try {
      const messages = await applyAssistantProposal(activeTool, proposal);
      setApplied(true);
      onApplied(t('aiAssistant.filled', { items: messages.join('；') }));
    } catch (error) {
      setApplyError(errorMessage(error));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="uta-proposal">
      <div className="uta-proposal-title">
        <div>
          <strong>{proposal.summary}</strong>
          <span>{t('aiAssistant.uiChanges', { count: proposal.actions.length })}</span>
        </div>
        <button
          onClick={apply}
          disabled={disabled || applying || applied || proposal.tool !== activeTool}
        >
          <FontAwesomeIcon icon={applied ? faCheck : faFileLines} />
          {applied
            ? t('aiAssistant.applied')
            : applying
              ? t('aiAssistant.applying')
              : t('aiAssistant.applyToTool')}
        </button>
      </div>
      <ul>
        {proposal.actions.map((action, index) => (
          <li key={`${action.type}-${index}`}>
            <code>{action.type}</code>
            <span>{summarizePayload(action.payload)}</span>
          </li>
        ))}
      </ul>
      {proposal.tool !== activeTool && (
        <div className="uta-proposal-error">
          {t('aiAssistant.switchTool', { tool: proposal.tool })}
        </div>
      )}
      {applyError && <div className="uta-proposal-error">{applyError}</div>}
    </div>
  );
};

function summarizePayload(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .slice(0, 6)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? `${value.length}项` : String(value)}`)
    .join('，');
}
