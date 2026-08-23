import { describe, expect, it, vi } from "vitest";
import { AGENT_MODEL_MAX_OUTPUT_TOKENS, AGENT_MODEL_TIMEOUT_MS, createOpenAIAgentProvider, parseSafeProviderError, type SafeProviderDiagnostic } from "./model-provider";

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
    expect(body.tools).toHaveLength(6); expect(body.tools.every((tool: { type: string }) => tool.type === "function")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL"); expect(AGENT_MODEL_TIMEOUT_MS).toBe(15000);
  });

  it("surfaces provider errors/timeouts safely without logging payloads", async () => {
    const failure = Object.assign(new Error("sentinel-secret-in-prompt"), { name: "TimeoutError" });
    const fetcher = vi.fn().mockRejectedValue(failure); const log = vi.spyOn(console, "log").mockImplementation(() => undefined); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, fetcher as never)!;
    await expect(model.select({ message: "sentinel-secret-in-prompt", history: [] })).rejects.toThrow();
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); log.mockRestore(); error.mockRestore();
  });

  it.each([400, 401, 429])("captures safe provider metadata for HTTP %s without raw messages", async (status) => {
    const events: SafeProviderDiagnostic[] = [];
    const body = { error: { type: "invalid_request_error", code: status === 429 ? "rate_limit_exceeded" : "safe_code", param: "tools[0].parameters", message: "sentinel raw prompt and secret" } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "x-request-id": "req_safe_123", "retry-after": "2" } }));
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, fetcher as never, { onDiagnostic: (event) => events.push(event) })!;
    await expect(model.select({ message: "private sentinel prompt", history: [] })).rejects.toThrow("AGENT_MODEL_PROVIDER_ERROR");
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ stage: "SELECTION", httpStatus: status, contentType: "application/json", requestId: "req_safe_123", providerErrorType: "invalid_request_error", parseOutcome: "HTTP_ERROR" });
    expect(JSON.stringify(events)).not.toMatch(/sentinel|Authorization|sk-test/i);
  });

  it("handles malformed error bodies without exposing raw content", () => {
    expect(parseSafeProviderError("<html>sentinel secret</html>")).toEqual({});
    expect(parseSafeProviderError({ error: { type: "unsafe value with spaces", code: { raw: true }, param: null, message: "sentinel" } })).toEqual({ providerErrorType: undefined, providerErrorCode: undefined, providerErrorParam: undefined });
  });

  it("finds a tool call outside the first output item and reports safe argument parsing", async () => {
    const events: SafeProviderDiagnostic[] = [];
    const payload = { id: "resp_safe", status: "completed", output: [{ type: "message", content: [] }, { type: "function_call", name: "TODAY_ATTENTION", arguments: "{}" }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }));
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, fetcher as never, { onDiagnostic: (event) => events.push(event) })!;
    await expect(model.select({ message: "hoy", history: [] })).resolves.toMatchObject({ kind: "TOOL", capability: "TODAY_ATTENTION" });
    expect(events[0]).toMatchObject({ outputItems: 2, toolCallPresent: true, toolName: "TODAY_ATTENTION", argsParse: "PASS", parseOutcome: "TOOL_CALL" });
  });

  it("reports output without a tool call and incomplete responses", async () => {
    const events: SafeProviderDiagnostic[] = [];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "No tool" }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "incomplete", output: [] }), { status: 200 }));
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, fetcher as never, { onDiagnostic: (event) => events.push(event) })!;
    await model.select({ message: "one", history: [] }); await model.select({ message: "two", history: [] });
    expect(events.map((event) => event.parseOutcome)).toEqual(["NO_TOOL_CALL", "INCOMPLETE"]);
  });

  it("parses synthesis text and reports the synthesis stage", async () => {
    const events: SafeProviderDiagnostic[] = [];
    const payload = { id: "resp_synthesis", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Hay cuatro situaciones." }] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const model = createOpenAIAgentProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk-test-sentinel-key-123456789" } as NodeJS.ProcessEnv, fetcher as never, { onDiagnostic: (event) => events.push(event) })!;
    await expect(model.synthesize({ message: "hoy", history: [], capability: "TODAY_ATTENTION", safeResult: { summary: "safe" }, fallback: "fallback" })).resolves.toBe("Hay cuatro situaciones.");
    expect(events[0]).toMatchObject({ stage: "SYNTHESIS", parseOutcome: "TEXT", toolCallPresent: false });
  });
});
