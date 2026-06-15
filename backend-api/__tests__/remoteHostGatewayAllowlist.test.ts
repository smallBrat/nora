// @ts-nocheck
/**
 * __tests__/remoteHostGatewayAllowlist.test.ts — A3a: the HTTP gateway proxy
 * allows a remote-docker agent's own registered host address (which is not
 * RFC1918), while never widening the allowlist for other agents and still
 * enforcing the hard blocked-IP floor.
 */
jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../integrations", () => ({}));
jest.mock("../metrics", () => ({ recordMetric: jest.fn(), recordTokenUsage: jest.fn() }));
jest.mock("../agentBudgets", () => ({ checkAndEnforce: jest.fn() }));
jest.mock("ws", () => ({ WebSocket: class {}, WebSocketServer: class {} }));

const mockGetRemoteHostByExecutionTarget = jest.fn();
jest.mock("../remoteHosts", () => ({
  getRemoteHostByExecutionTarget: (...args) => mockGetRemoteHostByExecutionTarget(...args),
}));

const { resolveSafeGatewayHttpTarget } = require("../gatewayProxy");

const PUBLIC_IP = "203.0.113.5";

function remoteAgent(overrides = {}) {
  return {
    id: "agent-1",
    user_id: "user-1",
    deploy_target: "remote-docker",
    execution_target_id: "remote:my-vps",
    gateway_host: PUBLIC_IP,
    gateway_port: 19042,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetRemoteHostByExecutionTarget.mockReset();
});

describe("remote-host gateway allowlist (HTTP proxy)", () => {
  it("allows a remote-docker agent's own registered (non-RFC1918) host", async () => {
    mockGetRemoteHostByExecutionTarget.mockResolvedValue({
      id: "my-vps",
      ownerUserId: "user-1",
      gatewayHost: PUBLIC_IP,
      sshHost: PUBLIC_IP,
    });
    const target = await resolveSafeGatewayHttpTarget(remoteAgent(), "status");
    expect(target.url).toBe(`http://${PUBLIC_IP}:19042/status`);
    expect(mockGetRemoteHostByExecutionTarget).toHaveBeenCalledWith("remote:my-vps");
  });

  it("does NOT trust a remote host registered by a different operator", async () => {
    // Cross-tenant execution_target_id reference: the host belongs to user-2.
    mockGetRemoteHostByExecutionTarget.mockResolvedValue({
      id: "my-vps",
      ownerUserId: "user-2",
      gatewayHost: PUBLIC_IP,
      sshHost: PUBLIC_IP,
    });
    await expect(resolveSafeGatewayHttpTarget(remoteAgent(), "status")).rejects.toThrow(
      /not an allowed gateway address/i,
    );
  });

  it("rejects a public host when no matching remote host is registered", async () => {
    mockGetRemoteHostByExecutionTarget.mockResolvedValue(null);
    await expect(resolveSafeGatewayHttpTarget(remoteAgent(), "status")).rejects.toThrow(
      /not an allowed gateway address/i,
    );
  });

  it("does NOT widen the allowlist for a non-remote agent with a public host", async () => {
    // A docker agent must never reach a public address — the registry lookup is
    // skipped entirely (deploy_target !== remote-docker).
    const dockerAgent = remoteAgent({ deploy_target: "docker", execution_target_id: "docker" });
    await expect(resolveSafeGatewayHttpTarget(dockerAgent, "status")).rejects.toThrow(
      /not an allowed gateway address/i,
    );
    expect(mockGetRemoteHostByExecutionTarget).not.toHaveBeenCalled();
  });

  it("still blocks dangerous addresses even for a registered remote host", async () => {
    mockGetRemoteHostByExecutionTarget.mockResolvedValue({
      id: "my-vps",
      gatewayHost: "169.254.169.254",
      sshHost: "169.254.169.254",
    });
    const linkLocal = remoteAgent({ gateway_host: "169.254.169.254" });
    await expect(resolveSafeGatewayHttpTarget(linkLocal, "status")).rejects.toThrow(
      /not an allowed gateway address/i,
    );
  });

  it("trusts a k8s agent's operator-provisioned (public LoadBalancer) address", async () => {
    // k8s exposure addresses (LB/NodePort) are operator-provisioned, so RPC/WS/HTTP
    // must reach them even when public — without a registry lookup.
    const k8sAgent = {
      id: "agent-k8s",
      user_id: "user-1",
      deploy_target: "k8s",
      execution_target_id: "k8s:prod",
      gateway_host: "203.0.113.20",
      gateway_port: 18789,
    };
    const target = await resolveSafeGatewayHttpTarget(k8sAgent, "status");
    expect(target.url).toBe("http://203.0.113.20:18789/status");
    expect(mockGetRemoteHostByExecutionTarget).not.toHaveBeenCalled();
  });

  it("still allows an ordinary RFC1918 docker host (no regression)", async () => {
    const dockerAgent = remoteAgent({
      deploy_target: "docker",
      execution_target_id: "docker",
      gateway_host: "10.0.0.10",
      gateway_port: 19000,
    });
    const target = await resolveSafeGatewayHttpTarget(dockerAgent, "status");
    expect(target.url).toBe("http://10.0.0.10:19000/status");
    expect(mockGetRemoteHostByExecutionTarget).not.toHaveBeenCalled();
  });
});
