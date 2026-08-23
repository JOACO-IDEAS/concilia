import { describe, expect, it, vi } from "vitest";
import { AGENT_MODEL_MAX_OUTPUT_TOKENS, AGENT_MODEL_TIMEOUT_MS, createOpenAIAgentProvider } from "./model-provider";

describe("OpenAI AgentModelProvider", () => {
  it("is absent without config and always absent in tests even if a key exists", () => {
    expect(createOpenAIAgentProvider({ NODE_ENV: "production" } as NodeJS.ProcessEnv, vi.fn() as never)).toBeNull();
    expect(createOpenAIAgentProvider({ NODE_ENV: "test", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, vi.fn() as never)).toBeNull();
  });

  it("uses mocked Responses API, registry-derived read-only tools, store false and bounded output", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: "function_call", name: "DEBT_OVERVIEW", arguments: "{}" }] }) });
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789", OPENAI_AGENT_MODEL: "test-model" } as NodeJS.ProcessEnv, fetcher as never)!;
    await expect(model.select({ message: "deuda", history: [] })).resolves.toEqual({ kind: "TOOL", capability: "DEBT_OVERVIEW", arguments: {} });
    const [url, options] = fetcher.mock.calls[0]; const body = JSON.parse(options.body);
    expect(url).toBe("https://api.openai.com/v1/responses"); expect(body).toMatchObject({ model: "test-model", store: false, max_output_tokens: AGENT_MODEL_MAX_OUTPUT_TOKENS, parallel_tool_calls: false });
    expect(body.tools).toHaveLength(5); expect(body.tools.every((tool: { type: string }) => tool.type === "function")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL"); expect(AGENT_MODEL_TIMEOUT_MS).toBe(15000);
  });

  it("surfaces provider errors/timeouts safely without logging payloads", async () => {
    const failure = Object.assign(new Error("sentinel-secret-in-prompt"), { name: "TimeoutError" });
    const fetcher = vi.fn().mockRejectedValue(failure); const log = vi.spyOn(console, "log").mockImplementation(() => undefined); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, fetcher as never)!;
    await expect(model.select({ message: "sentinel-secret-in-prompt", history: [] })).rejects.toThrow();
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); log.mockRestore(); error.mockRestore();
  });
});
