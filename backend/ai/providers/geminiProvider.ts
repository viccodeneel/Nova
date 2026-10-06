import { GoogleGenAI } from '@google/genai';
import type { AssistantProvider, AssistantTool, AssistantTurn, TextChunkHandler } from '../provider.ts';

export class GeminiProvider implements AssistantProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
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
