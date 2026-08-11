import type { AssistantToolId } from './assistantBridge';

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantAttachment {
  id: string;
  name: string;
  kind: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
}

export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantChatMessage[];
  attachments: AssistantAttachment[];
  draft: string;
}

export interface AssistantToolHistory {
  activeId: string;
  conversations: AssistantConversation[];
}

export type AssistantHistories = Record<AssistantToolId, AssistantToolHistory>;

type PersistedConversation = Omit<AssistantConversation, 'attachments'>;

interface PersistedToolHistory {
  activeId: string;
  conversations: PersistedConversation[];
}

interface PersistedHistory {
  version: 1;
  tools: Partial<Record<AssistantToolId, PersistedToolHistory>>;
}

const STORAGE_KEY = 'usbtoolbox-ai-conversation-history-v1';
const MAX_CONVERSATIONS_PER_TOOL = 30;
const MAX_MESSAGES_PER_CONVERSATION = 120;
const MAX_MESSAGE_CHARS = 50_000;
const MAX_DRAFT_CHARS = 10_000;
const MAX_STORAGE_CHARS = 1_500_000;
const MAX_CONVERSATION_CHARS = 220_000;

export const ASSISTANT_TOOL_IDS: AssistantToolId[] = [
  'serial-tool',
  'modbus-tool',
  'i2c-tool',
  'spi-tool',
  'gpio-tool',
  'spi-display-tool',
  'python-test-tool',
];

const makeId = () => `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function createAssistantConversation(now = Date.now()): AssistantConversation {
  return {
    id: makeId(),
    title: '',
    createdAt: now,
    updatedAt: now,
    messages: [],
    attachments: [],
    draft: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConversation(value: unknown): AssistantConversation | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
  const messages = Array.isArray(value.messages)
    ? value.messages
        .filter(
          (message): message is Record<string, unknown> =>
            isRecord(message) &&
            typeof message.id === 'string' &&
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.content === 'string'
        )
        .slice(-MAX_MESSAGES_PER_CONVERSATION)
        .map((message) => ({
          id: String(message.id),
          role: message.role as AssistantChatMessage['role'],
          content: String(message.content).slice(0, MAX_MESSAGE_CHARS),
        }))
    : [];
  const createdAt =
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    value.createdAt >= 0 &&
    value.createdAt <= 8_640_000_000_000_000
      ? value.createdAt
      : Date.now();
  const updatedAt =
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt >= 0 &&
    value.updatedAt <= 8_640_000_000_000_000
      ? value.updatedAt
      : createdAt;
  return {
    id: value.id,
    title: typeof value.title === 'string' ? value.title.slice(0, 120) : '',
    createdAt,
    updatedAt,
    messages,
    attachments: [],
    draft: typeof value.draft === 'string' ? value.draft.slice(0, MAX_DRAFT_CHARS) : '',
  };
}

export function loadAssistantHistories(): AssistantHistories {
  let stored: PersistedHistory | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isRecord(parsed) && parsed.version === 1 && isRecord(parsed.tools)) {
      stored = parsed as unknown as PersistedHistory;
    }
  } catch {
    stored = null;
  }

  return Object.fromEntries(
    ASSISTANT_TOOL_IDS.map((tool) => {
      const rawBucket = stored?.tools[tool];
      const seenIds = new Set<string>();
      const conversations = Array.isArray(rawBucket?.conversations)
        ? rawBucket.conversations
            .map(normalizeConversation)
            .filter((item): item is AssistantConversation => item !== null)
            .filter((item) => {
              if (seenIds.has(item.id)) return false;
              seenIds.add(item.id);
              return true;
            })
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, MAX_CONVERSATIONS_PER_TOOL)
        : [];
      const items = conversations.length ? conversations : [createAssistantConversation()];
      const activeId = items.some((item) => item.id === rawBucket?.activeId)
        ? String(rawBucket?.activeId)
        : items[0].id;
      return [tool, { activeId, conversations: items }];
    })
  ) as AssistantHistories;
}

function persistableConversation(
  conversation: AssistantConversation,
  allowance: number
): PersistedConversation | null {
  if (allowance < 300) return null;
  const base: PersistedConversation = {
    id: conversation.id,
    title: conversation.title.slice(0, 120),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: [],
    draft: conversation.draft.slice(0, MAX_DRAFT_CHARS),
  };
  let used = JSON.stringify(base).length;
  const messages: AssistantChatMessage[] = [];
  for (
    let index = conversation.messages.length - 1;
    index >= 0 && messages.length < MAX_MESSAGES_PER_CONVERSATION;
    index -= 1
  ) {
    const message = conversation.messages[index];
    const remaining = allowance - used - 100;
    if (remaining < 1) break;
    const storedMessage = {
      id: message.id,
      role: message.role,
      content: message.content.slice(0, Math.min(MAX_MESSAGE_CHARS, remaining)),
    };
    used += JSON.stringify(storedMessage).length;
    messages.unshift(storedMessage);
  }
  base.messages = messages;
  return base;
}

/**
 * 持久化对话文字，不写入附件名称、路径或正文。全局字符预算用于避免占满 localStorage。
 */
export function saveAssistantHistories(histories: AssistantHistories): void {
  const tools: PersistedHistory['tools'] = Object.fromEntries(
    ASSISTANT_TOOL_IDS.map((tool) => [
      tool,
      { activeId: histories[tool].activeId, conversations: [] },
    ])
  );
  const all = ASSISTANT_TOOL_IDS.flatMap((tool) =>
    histories[tool].conversations.map((conversation) => ({ tool, conversation }))
  );
  const activeKeys = new Set(
    ASSISTANT_TOOL_IDS.map((tool) => `${tool}:${histories[tool].activeId}`)
  );
  all.sort((a, b) => {
    const aActive = activeKeys.has(`${a.tool}:${a.conversation.id}`) ? 1 : 0;
    const bActive = activeKeys.has(`${b.tool}:${b.conversation.id}`) ? 1 : 0;
    return bActive - aActive || b.conversation.updatedAt - a.conversation.updatedAt;
  });

  let remaining = MAX_STORAGE_CHARS;
  const counts = new Map<AssistantToolId, number>();
  for (const { tool, conversation } of all) {
    const count = counts.get(tool) ?? 0;
    if (count >= MAX_CONVERSATIONS_PER_TOOL) continue;
    // Reserve a little room for the surrounding JSON structure so the final
    // serialized object stays inside the global budget.
    const allowance = Math.min(MAX_CONVERSATION_CHARS, Math.max(0, remaining - 2048));
    const stored = persistableConversation(conversation, allowance);
    if (!stored) continue;
    const size = JSON.stringify(stored).length;
    if (size > remaining) continue;
    tools[tool]?.conversations.push(stored);
    counts.set(tool, count + 1);
    remaining -= size;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, tools } satisfies PersistedHistory)
  );
}
