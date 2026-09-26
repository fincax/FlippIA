/**
 * AI provider abstraction. Business logic never depends on a vendor SDK.
 * The deterministic provider keeps the whole product working without keys:
 * it returns `null` so callers fall back to templated narrative.
 */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the model to answer with a JSON object only. */
  json?: boolean;
}

export interface AICompletion {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface AIProvider {
  id: string;
  model: string;
  available: boolean;
  complete(req: AICompletionRequest): Promise<AICompletion | null>;
}

export class DeterministicProvider implements AIProvider {
  id = "deterministic";
  model = "none";
  available = false;
  async complete(): Promise<AICompletion | null> {
    return null;
  }
}

export class AnthropicProvider implements AIProvider {
  id = "anthropic";
  available = true;
  constructor(
    private readonly apiKey: string,
    public readonly model = process.env.AI_MODEL ?? "claude-sonnet-5",
    private readonly defaultMaxTokens = Number(process.env.AI_MAX_TOKENS ?? 1200),
  ) {}

  async complete(req: AICompletionRequest): Promise<AICompletion | null> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: this.apiKey });
    const started = Date.now();
    const res = await client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? this.defaultMaxTokens,
      temperature: req.temperature ?? 0.2,
      system: req.json
        ? `${req.system}\n\nResponde únicamente con un objeto JSON válido, sin texto adicional.`
        : req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return {
      text,
      model: res.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      latencyMs: Date.now() - started,
    };
  }
}

let provider: AIProvider | undefined;

export function aiProvider(): AIProvider {
  if (provider) return provider;
  const key = process.env.ANTHROPIC_API_KEY;
  const mode = process.env.AI_PROVIDER ?? "anthropic";
  provider = mode === "anthropic" && key ? new AnthropicProvider(key) : new DeterministicProvider();
  return provider;
}

export function setAiProvider(p: AIProvider | undefined) {
  provider = p;
}
