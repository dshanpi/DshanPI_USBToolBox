export type AssistantToolId =
  | 'serial-tool'
  | 'modbus-tool'
  | 'i2c-tool'
  | 'spi-tool'
  | 'gpio-tool'
  | 'spi-display-tool'
  | 'python-test-tool';

export interface AssistantAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface AssistantProposal {
  version: 1;
  tool: AssistantToolId;
  summary: string;
  actions: AssistantAction[];
}

export interface AssistantContextSection {
  source: string;
  data: unknown;
}

export interface AssistantApplyResult {
  message: string;
}

export interface AssistantContributor {
  id: string;
  tool: AssistantToolId;
  getContext: () => unknown;
  supports: (action: AssistantAction) => boolean;
  apply: (action: AssistantAction) => AssistantApplyResult | Promise<AssistantApplyResult>;
}

const registry = new Map<AssistantToolId, Map<string, AssistantContributor>>();

/** 注册工具状态入口；返回卸载函数，组件重渲染或卸载时必须调用。 */
export function registerAssistantContributor(contributor: AssistantContributor): () => void {
  let entries = registry.get(contributor.tool);
  if (!entries) {
    entries = new Map();
    registry.set(contributor.tool, entries);
  }
  entries.set(contributor.id, contributor);
  return () => {
    const current = registry.get(contributor.tool);
    if (current?.get(contributor.id) === contributor) {
      current.delete(contributor.id);
      if (current.size === 0) registry.delete(contributor.tool);
    }
  };
}

/** 获取当前工具愿意提供给 AI 的配置与最近诊断信息。 */
export function getAssistantToolContext(tool: AssistantToolId): AssistantContextSection[] {
  const entries = registry.get(tool);
  if (!entries) return [];
  const sections: AssistantContextSection[] = [];
  for (const contributor of entries.values()) {
    try {
      sections.push({ source: contributor.id, data: contributor.getContext() });
    } catch (error) {
      sections.push({
        source: contributor.id,
        data: { contextError: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return sections;
}

/** 逐项应用已审核的提案。只调用注册组件的 setState，不直接执行硬件传输。 */
export async function applyAssistantProposal(
  activeTool: AssistantToolId,
  proposal: AssistantProposal
): Promise<string[]> {
  if (proposal.tool !== activeTool) {
    throw new Error(`该提案属于 ${proposal.tool}，当前工具是 ${activeTool}`);
  }
  const entries = [...(registry.get(activeTool)?.values() ?? [])];
  if (entries.length === 0) {
    throw new Error('当前工具尚未提供可写配置入口，AI 只能给出排查建议');
  }

  const messages: string[] = [];
  for (const action of proposal.actions) {
    const contributor = entries.find((entry) => entry.supports(action));
    if (!contributor) {
      throw new Error(`当前版本不支持动作：${action.type}`);
    }
    const result = await contributor.apply(action);
    messages.push(result.message);
  }
  return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 对模型返回的动作块做严格的外层校验；字段级校验由对应工具再次执行。 */
export function parseAssistantProposal(value: unknown): AssistantProposal {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('动作格式缺少 version: 1');
  }
  if (typeof value.tool !== 'string') throw new Error('动作格式缺少 tool');
  const knownTools: AssistantToolId[] = [
    'serial-tool',
    'modbus-tool',
    'i2c-tool',
    'spi-tool',
    'gpio-tool',
    'spi-display-tool',
    'python-test-tool',
  ];
  if (!knownTools.includes(value.tool as AssistantToolId)) {
    throw new Error(`未知工具：${value.tool}`);
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 64) {
    throw new Error('actions 必须包含 1–64 个动作');
  }
  const actions = value.actions.map((item, index): AssistantAction => {
    if (!isRecord(item) || typeof item.type !== 'string' || !isRecord(item.payload)) {
      throw new Error(`第 ${index + 1} 个动作格式无效`);
    }
    return { type: item.type, payload: item.payload };
  });
  return {
    version: 1,
    tool: value.tool as AssistantToolId,
    summary: typeof value.summary === 'string' ? value.summary : 'AI 配置建议',
    actions,
  };
}

export function asRecord(value: unknown, label = 'payload'): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} 必须是对象`);
  return value;
}

export function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`);
  return value;
}

export function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} 必须是数字`);
  return value;
}

export function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${label} 必须是布尔值`);
  return value;
}
