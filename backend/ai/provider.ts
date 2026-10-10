export interface AssistantTool {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}
export interface AssistantToolCall { name: string; args?: Record<string, unknown> }
export interface AssistantTurn { text?: string; toolCalls: AssistantToolCall[]; continuation?: unknown }
export type TextChunkHandler = (chunk: string) => void;
/** NOVA_AI_PROVIDER wins; otherwise use whichever provider actually has an API key. */
export function resolveProviderName(): 'anthropic' | 'gemini' {
  const explicit = (process.env.NOVA_AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'gemini' || explicit === 'anthropic') return explicit;
  if (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return 'gemini';
  return 'anthropic';
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ChatMsg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; continuation?: unknown }
  | { role: 'tool'; results: Array<{ id: string; content: string; isError: boolean }> };
export interface CompleteInput { system: string; messages: ChatMsg[]; tools: AssistantTool[]; maxTokens: number }
/** `continuation` is provider-specific raw output (e.g. Gemini parts with signatures) that must be echoed back unchanged. */
export interface CompleteResult { text: string; toolCalls: ToolCall[]; stopReason: string; continuation?: unknown }

export interface AssistantProvider {
  /** Multi-turn, tool-calling completion. Providers without it fall back to the legacy single-turn path. */
  complete?(input: CompleteInput, onText?: TextChunkHandler): Promise<CompleteResult>;
  generate(input: { message: string; systemInstruction: string; tools: AssistantTool[] }): Promise<AssistantTurn>;
  respondAfterTool(input: { message: string; systemInstruction: string; turn: AssistantTurn; toolName: string; toolResult: unknown }): Promise<string | undefined>;
  generateText(input: { message: string; systemInstruction: string }, onText?: TextChunkHandler): Promise<string>;
}
