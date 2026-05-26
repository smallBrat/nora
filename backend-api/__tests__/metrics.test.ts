// @ts-nocheck
const mockDb = { query: jest.fn() };

jest.mock("../db", () => mockDb);

const metrics = require("../metrics");

describe("cost metrics", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockDb.query.mockReset();
    process.env = {
      ...originalEnv,
      COST_PER_1K_TOKENS: "0.01",
      COST_MODEL_RATES_JSON: JSON.stringify({
        "openai/gpt-5.5": { input_per_1k: 0.002, output_per_1k: 0.008 },
        "flat-model": { per_1k: 0.004 },
      }),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("calculates model split token costs", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "agent-1" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            model: "gpt-5.5",
            provider: "openai",
            input_tokens: 100000,
            output_tokens: 50000,
            total_tokens: 150000,
            request_count: 3,
          },
        ],
      });

    const cost = await metrics.getAgentCost("agent-1", {
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-05-02T00:00:00.000Z",
    });

    expect(cost.token_cost).toBe(0.6);
    expect(cost.total_cost).toBe(0.6);
    expect(cost.input_tokens).toBe(100000);
    expect(cost.output_tokens).toBe(50000);
    expect(cost.cost_details.tokens.models[0]).toEqual(
      expect.objectContaining({
        model: "gpt-5.5",
        provider: "openai",
        rate_source: "model",
        token_cost: 0.6,
      }),
    );
  });

  it("uses fallback pricing for unknown historical rows", async () => {
    process.env.COST_MODEL_RATES_JSON = "{invalid";
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "agent-1" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            model: "Unknown model",
            provider: null,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 2000,
            request_count: 2,
          },
        ],
      });

    const cost = await metrics.getAgentCost("agent-1", {
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-05-01T01:00:00.000Z",
    });

    expect(cost.token_cost).toBe(0.02);
    expect(cost.cost_details.tokens.models[0]).toEqual(
      expect.objectContaining({
        model: "Unknown model",
        rate_source: "unknown",
        token_cost: 0.02,
      }),
    );
  });

  it("rejects invalid custom date ranges", () => {
    expect(() =>
      metrics.parseCostQuery({
        period_start: "2026-05-02",
        period_end: "2026-05-01",
      }),
    ).toThrow("Invalid cost date range");
  });

  it("persists runtime token usage metadata for future search", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const recorded = await metrics.recordTokenUsage(
      { id: "agent-1", runtime_family: "hermes" },
      "user-1",
      {
        model: "openai/gpt-5.5",
        usage: {
          input_tokens: 1200,
          output_tokens: 300,
          total_tokens: 1500,
        },
      },
      { source: "hermes-ui", sessionId: "sess-1" },
    );

    expect(recorded.totalTokens).toBe(1500);
    expect(mockDb.query).toHaveBeenCalledWith(
      "INSERT INTO usage_metrics(agent_id, user_id, metric_type, value, metadata) VALUES($1, $2, $3, $4, $5)",
      [
        "agent-1",
        "user-1",
        "tokens_used",
        1500,
        JSON.stringify({
          model: "openai/gpt-5.5",
          provider: "openai",
          runtime_family: "hermes",
          source: "hermes-ui",
          session_id: "sess-1",
          input_tokens: 1200,
          output_tokens: 300,
          total_tokens: 1500,
        }),
      ],
    );
  });
});
