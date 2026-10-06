export interface AssistantTool {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}
export interface AssistantToolCall { name: string; args?: Record<string, unknown> }
export interface AssistantTurn { text?: string; toolCalls: AssistantToolCall[]; continuation?: unknown }
export interface AssistantProvider {
  generate(input: { message: string; systemInstruction: string; tools: AssistantTool[] }): Promise<AssistantTurn>;
  respondAfterTool(input: { message: string; systemInstruction: string; turn: AssistantTurn; toolName: string; toolResult: unknown }): Promise<string | undefined>;
}
