import type { AssistantProvider, AssistantTool, AssistantTurn, ChatMsg, CompleteInput, CompleteResult, TextChunkHandler, ToolCall } from '../provider.ts';

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

type AnthropicMessage = {
  content: AnthropicContentBlock[];
};

export class AnthropicProvider implements AssistantProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint = `${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private headers() {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private async createMessage(body: Record<string, unknown>, stage: 'initial' | 'tool_followup'): Promise<AnthropicMessage> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { type?: string; message?: string } } | null;
      const providerMessage = typeof payload?.error?.message === 'string'
        ? payload.error.message.replaceAll(this.apiKey, '[REDACTED]').slice(0, 300)
        : undefined;
      throw Object.assign(new Error('Anthropic request failed.'), {
        status: response.status,
        providerErrorType: payload?.error?.type,
        providerMessage,
        providerStage: stage,
      });
    }

    return await response.json() as AnthropicMessage;
  }

  private toApiMessages(messages: ChatMsg[]): Array<Record<string, unknown>> {
    return messages.map((message) => {
      if (message.role === 'user') return { role: 'user', content: message.text };
      if (message.role === 'assistant') {
        const content: Array<Record<string, unknown>> = [];
        if (message.text) content.push({ type: 'text', text: message.text });
        for (const call of message.toolCalls) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
        return { role: 'assistant', content };
      }
      return {
        role: 'user',
        content: message.results.map((result) => ({ type: 'tool_result', tool_use_id: result.id, content: result.content, ...(result.isError ? { is_error: true } : {}) })),
      };
    });
  }

  /** Streams one assistant turn, assembling text and tool_use blocks (whose JSON arrives in fragments). */
  async complete(input: CompleteInput, onText?: TextChunkHandler): Promise<CompleteResult> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: this.toApiMessages(input.messages),
        ...(input.tools.length ? { tools: input.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parametersJsonSchema })) } : {}),
        stream: true,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { type?: string; message?: string } } | null;
      throw Object.assign(new Error('Anthropic request failed.'), {
        status: response.status,
        providerErrorType: payload?.error?.type,
        providerMessage: payload?.error?.message?.replaceAll(this.apiKey, '[REDACTED]').slice(0, 300),
        providerStage: 'complete',
      });
    }
    if (!response.body) throw new Error('Anthropic response stream was empty.');

    type Block = { type: string; id?: string; name?: string; text: string; json: string };
    const blocks = new Map<number, Block>();
    let stopReason = 'end_turn';
    const handle = (raw: string) => {
      const payloadText = raw.trim();
      if (!payloadText || payloadText === '[DONE]') return;
      const event = JSON.parse(payloadText) as {
        type?: string; index?: number;
        content_block?: { type?: string; id?: string; name?: string };
        delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
        error?: { type?: string; message?: string };
      };
      if (event.type === 'error') {
        throw Object.assign(new Error('Anthropic stream failed.'), {
          status: /rate_limit/i.test(event.error?.type || '') ? 429 : /overloaded/i.test(event.error?.type || '') ? 503 : undefined,
          providerErrorType: event.error?.type,
          providerMessage: event.error?.message?.replaceAll(this.apiKey, '[REDACTED]').slice(0, 300),
        });
      }
      if (event.type === 'content_block_start' && typeof event.index === 'number') {
        blocks.set(event.index, { type: event.content_block?.type || 'text', id: event.content_block?.id, name: event.content_block?.name, text: '', json: '' });
      } else if (event.type === 'content_block_delta' && typeof event.index === 'number') {
        const block = blocks.get(event.index);
        if (!block) return;
        if (event.delta?.type === 'text_delta' && event.delta.text) { block.text += event.delta.text; onText?.(event.delta.text); }
        else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) block.json += event.delta.partial_json;
      } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason;
      }
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) if (line.startsWith('data:')) handle(line.slice(5));
      if (done) break;
    }
    if (buffer.startsWith('data:')) handle(buffer.slice(5));

    const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block);
    const toolCalls: ToolCall[] = ordered.filter((block) => block.type === 'tool_use' && block.id && block.name).map((block) => {
      let args: Record<string, unknown> = {};
      try { args = block.json ? JSON.parse(block.json) : {}; } catch { args = {}; }
      return { id: block.id as string, name: block.name as string, args };
    });
    return { text: ordered.filter((block) => block.type === 'text').map((block) => block.text).join('').trim(), toolCalls, stopReason };
  }

  async generate(input: { message: string; systemInstruction: string; tools: AssistantTool[] }): Promise<AssistantTurn> {
    const result = await this.createMessage({
      model: this.model,
      max_tokens: 1200,
      system: input.systemInstruction,
      messages: [{ role: 'user', content: input.message }],
      tools: input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parametersJsonSchema,
      })),
    }, 'initial');

    const toolCalls = result.content
      .filter((block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
      .map((block) => ({ name: block.name, args: block.input }));

    return {
      text: result.content
        .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join('\n'),
      toolCalls,
      continuation: result.content,
    };
  }

  async respondAfterTool(input: { message: string; systemInstruction: string; turn: AssistantTurn; toolName: string; toolResult: unknown }): Promise<string | undefined> {
    const continuation = input.turn.continuation as AnthropicContentBlock[] | undefined;
    const toolUse = continuation?.find(
      (block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use' && block.name === input.toolName,
    );
    if (!continuation?.length || !toolUse) {
      throw new Error('Provider response is missing its tool-call continuation.');
    }

    const result = await this.createMessage({
      model: this.model,
      max_tokens: 1200,
      system: input.systemInstruction,
      messages: [
        { role: 'user', content: input.message },
        { role: 'assistant', content: continuation },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(input.toolResult),
          }],
        },
      ],
    }, 'tool_followup');

    return result.content
      .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

  async generateText(input: { message: string; systemInstruction: string }, onText?: TextChunkHandler): Promise<string> {
    const body = {
      model: this.model,
      max_tokens: 600,
      system: input.systemInstruction,
      messages: [{ role: 'user', content: input.message }],
    };
    if (!onText) {
      const result = await this.createMessage(body, 'initial');
      return result.content.filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text').map((block) => block.text).join('\n').trim();
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...body, stream: true }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { type?: string; message?: string } } | null;
      throw Object.assign(new Error('Anthropic request failed.'), {
        status: response.status,
        providerErrorType: payload?.error?.type,
        providerMessage: payload?.error?.message?.replaceAll(this.apiKey, '[REDACTED]').slice(0, 300),
        providerStage: 'initial',
      });
    }
    if (!response.body) throw new Error('Anthropic response stream was empty.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payloadText = line.slice(5).trim();
        if (!payloadText || payloadText === '[DONE]') continue;
        const event = JSON.parse(payloadText) as { type?: string; delta?: { type?: string; text?: string }; error?: { type?: string; message?: string } };
        if (event.type === 'error') {
          throw Object.assign(new Error('Anthropic stream failed.'), {
            status: /rate_limit/i.test(event.error?.type || '') ? 429 : /overloaded/i.test(event.error?.type || '') ? 503 : undefined,
            providerErrorType: event.error?.type,
            providerMessage: event.error?.message?.replaceAll(this.apiKey, '[REDACTED]').slice(0, 300),
          });
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          answer += event.delta.text;
          onText(event.delta.text);
        }
      }
      if (done) break;
    }
    if (buffer.startsWith('data:')) {
      const payloadText = buffer.slice(5).trim();
      if (payloadText && payloadText !== '[DONE]') {
        const event = JSON.parse(payloadText) as { type?: string; delta?: { type?: string; text?: string }; error?: { type?: string; message?: string } };
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          answer += event.delta.text;
          onText(event.delta.text);
        }
      }
    }
    return answer.trim();
  }
}
