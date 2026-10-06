import type { AssistantProvider, AssistantTool, AssistantTurn } from '../provider.ts';

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

type AnthropicMessage = {
  content: AnthropicContentBlock[];
};

export class AnthropicProvider implements AssistantProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint = 'https://api.anthropic.com/v1/messages';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async createMessage(body: Record<string, unknown>): Promise<AnthropicMessage> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Keep the diagnostic safe: never include request headers or API keys in errors/logs.
      throw Object.assign(new Error('Anthropic request failed.'), { status: response.status });
    }

    return await response.json() as AnthropicMessage;
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
    });

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
    });

    return result.content
      .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }
}
