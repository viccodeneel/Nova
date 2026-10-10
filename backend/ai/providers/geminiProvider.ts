import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { AssistantProvider, AssistantTool, AssistantTurn, CompleteInput, CompleteResult, TextChunkHandler, ToolCall } from '../provider.ts';

export class GeminiProvider implements AssistantProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    // GEMINI_BASE_URL exists so the request flow can be tested against a local stand-in server.
    this.client = new GoogleGenAI({ apiKey, ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}) });
    this.model = model;
  }

  private wrapError(error: unknown): Error {
    const err = error as { status?: number; message?: string; name?: string };
    const message = String(err?.message || 'Gemini request failed.').replaceAll(this.apiKey, '[REDACTED]');
    return Object.assign(new Error(message.slice(0, 300)), { status: err?.status, providerErrorType: err?.name, providerMessage: message.slice(0, 300), providerStage: 'complete' });
  }

  /** Multi-turn streaming completion with function calling, mirroring the Anthropic implementation. */
  async complete(input: CompleteInput, onText?: TextChunkHandler): Promise<CompleteResult> {
    const calls = new Map<string, { name: string; native: boolean }>();
    const contents: Content[] = input.messages.map((message): Content => {
      if (message.role === 'user') return { role: 'user', parts: [{ text: message.text }] };
      if (message.role === 'assistant') {
        for (const call of message.toolCalls) calls.set(call.id, { name: call.name, native: !call.id.startsWith('gem_') });
        const parts = Array.isArray(message.continuation) && message.continuation.length
          ? message.continuation as Part[]
          : [...(message.text ? [{ text: message.text }] : []), ...message.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.args } }))];
        return { role: 'model', parts };
      }
      return {
        role: 'user',
        parts: message.results.map((result) => {
          const meta = calls.get(result.id);
          let body: unknown = result.content;
          try { body = JSON.parse(result.content); } catch { /* keep raw text */ }
          return { functionResponse: { ...(meta?.native ? { id: result.id } : {}), name: meta?.name || 'tool', response: result.isError ? { error: body } : { result: body } } };
        }),
      };
    });

    let text = '';
    const toolCalls: ToolCall[] = [];
    const parts: Part[] = [];
    let finish = 'STOP';
    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: input.system,
          ...(input.tools.length ? { tools: [{ functionDeclarations: input.tools as never }] } : {}),
          // Thinking models count their reasoning toward this cap, so leave generous headroom; brevity is enforced by the prompt.
          maxOutputTokens: Math.max(input.maxTokens * 3, 1500),
        },
      });
      for await (const chunk of stream) {
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          parts.push(part);
          if (part.functionCall?.name) {
            toolCalls.push({ id: part.functionCall.id || `gem_${Date.now().toString(36)}_${toolCalls.length}`, name: part.functionCall.name, args: (part.functionCall.args as Record<string, unknown>) || {} });
          } else if (typeof part.text === 'string' && part.text && !part.thought) {
            text += part.text;
            onText?.(part.text);
          }
        }
        if (candidate?.finishReason) finish = String(candidate.finishReason);
      }
    } catch (error) {
      throw this.wrapError(error);
    }
    return { text: text.trim(), toolCalls, stopReason: finish, continuation: parts };
  }

  async generate(input: { message: string; systemInstruction: string; tools: AssistantTool[] }): Promise<AssistantTurn> {
    const result = await this.client.models.generateContent({
      model: this.model, contents: [{ role: 'user', parts: [{ text: input.message }] }],
      config: { systemInstruction: input.systemInstruction, tools: [{ functionDeclarations: input.tools }], temperature: 0.2 },
    });
    return {
      text: result.text,
      toolCalls: (result.functionCalls || []).flatMap((call) => call.name ? [{ name: call.name, args: call.args as Record<string, unknown> | undefined }] : []),
      continuation: result.candidates?.[0]?.content?.parts,
    };
  }

  async respondAfterTool(input: { message: string; systemInstruction: string; turn: AssistantTurn; toolName: string; toolResult: unknown }): Promise<string | undefined> {
    const parts = input.turn.continuation as Array<Record<string, unknown>> | undefined;
    if (!parts?.length) throw new Error('Provider response is missing its tool-call continuation.');
    const result = await this.client.models.generateContent({
      model: this.model,
      contents: [
        { role: 'user', parts: [{ text: input.message }] },
        { role: 'model', parts },
        { role: 'user', parts: [{ functionResponse: { name: input.toolName, response: { result: input.toolResult } } }] },
      ],
      config: { systemInstruction: input.systemInstruction, temperature: 0.2 },
    });
    return result.text?.trim();
  }

  async generateText(input: { message: string; systemInstruction: string }, onText?: TextChunkHandler): Promise<string> {
    if (!onText) {
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: input.message }] }],
        config: { systemInstruction: input.systemInstruction, temperature: 0.2, maxOutputTokens: 600 },
      });
      return result.text?.trim() || '';
    }

    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: input.message }] }],
      config: { systemInstruction: input.systemInstruction, temperature: 0.2, maxOutputTokens: 600 },
    });
    let answer = '';
    for await (const chunk of stream) {
      const text = chunk.text || '';
      if (text) {
        answer += text;
        onText(text);
      }
    }
    return answer.trim();
  }
}
