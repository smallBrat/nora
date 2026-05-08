// @ts-nocheck
const {
  buildIntegrationToolCatalogEntries,
} = require("../integrations/services/toolCatalogBuilder");

describe("buildIntegrationToolCatalogEntries", () => {
  it("converts tool specs into OpenClaw-compatible entries", () => {
    const tools = buildIntegrationToolCatalogEntries(
      [
        {
          id: "int-gh",
          provider: "github",
          name: "GitHub",
          authType: "api_key",
          capabilities: ["read", "write"],
          redactedConfig: { org: "openai" },
          api: { type: "rest", baseUrl: "https://api.github.com" },
          mcp: { available: false },
          usageHints: ["Use for repo inspection."],
          toolSpecs: [
            {
              name: "github_list_repositories",
              description: "List repositories.",
              operation: "repos.list",
              inputSchema: { type: "object", properties: { owner: { type: "string" } } },
            },
          ],
        },
      ],
      { reservedNames: new Set(["health_check"]) },
    );

    expect(tools).toHaveLength(2);

    const [aggregate, repoTool] = tools;

    expect(aggregate.function.name).toBe("nora_github_integration");
    expect(aggregate.nora).toMatchObject({
      source: "integration-manifest",
      executable: true,
      executionState: "runtime_skill",
      provider: "github",
      integrationId: "int-gh",
      runtimeToolName: "nora_github_integration",
    });
    expect(aggregate.nora.invokeCommand).toContain(
      "nora-integration-tool nora_github_integration",
    );

    expect(repoTool.function).toEqual({
      name: "github_list_repositories",
      description: "List repositories.",
      parameters: { type: "object", properties: { owner: { type: "string" } } },
    });
    expect(repoTool.nora).toMatchObject({
      provider: "github",
      integrationId: "int-gh",
      runtimeToolName: "github_list_repositories",
      operation: "repos.list",
    });
  });

  it("handles non-array inputs without throwing", () => {
    expect(buildIntegrationToolCatalogEntries(null)).toEqual([]);
    expect(buildIntegrationToolCatalogEntries(undefined)).toEqual([]);
    expect(buildIntegrationToolCatalogEntries({})).toEqual([]);
  });

  it("normalizes a missing/invalid input schema to an empty object schema", () => {
    const tools = buildIntegrationToolCatalogEntries([
      {
        id: "int-gh",
        provider: "github",
        toolSpecs: [{ name: "tool_one" }],
      },
    ]);
    const target = tools.find((t) => t.function.name === "tool_one");
    expect(target).toBeDefined();
    expect(target.function.parameters).toEqual({ type: "object", properties: {} });
  });

  it("falls back to a generated description when none is provided", () => {
    const tools = buildIntegrationToolCatalogEntries([
      {
        id: "int-gh",
        provider: "github",
        name: "GitHub",
        toolSpecs: [{ name: "tool_one" }],
      },
    ]);
    const target = tools.find((t) => t.function.name === "tool_one");
    expect(target.function.description).toContain("GitHub");
  });

  it("avoids name collisions with reservedNames by suffixing", () => {
    const reservedNames = new Set(["github_list_repositories"]);
    const tools = buildIntegrationToolCatalogEntries(
      [
        {
          id: "int-gh",
          provider: "github",
          toolSpecs: [
            {
              name: "github_list_repositories",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      ],
      { reservedNames },
    );

    const repoTool = tools.find((t) => t.function.name !== "nora_github_integration");
    expect(repoTool.function.name).toBe("github_list_repositories_2");
  });
});
