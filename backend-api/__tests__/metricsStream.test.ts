// @ts-nocheck
const { EventEmitter } = require("events");
const jwt = require("jsonwebtoken");

const mockDb = { query: jest.fn() };
const mockBuildAgentStatsResponse = jest.fn().mockResolvedValue({
  status: "running",
  runtime: { health: "ok" },
});
const wsConnections = [];

class mockFakeWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = mockFakeWebSocket.OPEN;
    this.sent = [];
    this.closed = false;
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.closed = true;
    this.readyState = mockFakeWebSocket.CLOSED;
    this.emit("close");
  }
}

mockFakeWebSocket.OPEN = 1;
mockFakeWebSocket.CLOSED = 3;

class mockFakeWebSocketServer extends EventEmitter {
  handleUpgrade(_request, _socket, _head, callback) {
    const ws = new mockFakeWebSocket();
    wsConnections.push(ws);
    callback(ws);
  }
}

jest.mock("../db", () => mockDb);
jest.mock("../agentTelemetry", () => ({
  buildAgentStatsResponse: mockBuildAgentStatsResponse,
}));
jest.mock("ws", () => ({
  WebSocketServer: mockFakeWebSocketServer,
}));

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("metrics stream websocket auth", () => {
  let attachMetricsStream;
  let server;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "secret";
    mockDb.query.mockReset();
    mockBuildAgentStatsResponse.mockClear();
    mockBuildAgentStatsResponse.mockResolvedValue({
      status: "running",
      runtime: { health: "ok" },
    });
    wsConnections.length = 0;

    ({ attachMetricsStream } = require("../metricsStream"));
    server = new EventEmitter();
    attachMetricsStream(server);
  });

  function openMetricsStream(agentId, userPayload) {
    const token = jwt.sign(userPayload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    const socket = {
      write: jest.fn(),
      destroy: jest.fn(),
    };

    server.emit(
      "upgrade",
      {
        url: `/ws/metrics/${agentId}?token=${encodeURIComponent(token)}`,
        headers: { host: "nora.test" },
      },
      socket,
      Buffer.alloc(0),
    );

    return wsConnections[0];
  }

  it("allows workspace viewers to stream shared agent metrics", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "agent-1",
            name: "Shared Agent",
            status: "running",
            user_id: "owner-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });

    const ws = openMetricsStream("agent-1", { id: "viewer-1", role: "user" });
    await flushAsyncWork();

    expect(mockBuildAgentStatsResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-1", effective_role: "viewer" }),
    );
    expect(ws.sent).toContainEqual({
      type: "snapshot",
      payload: { status: "running", runtime: { health: "ok" } },
    });
    ws.close();
  });

  it("rejects users without access to the agent", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "agent-1",
            name: "Shared Agent",
            status: "running",
            user_id: "owner-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const ws = openMetricsStream("agent-1", { id: "user-2", role: "user" });
    await flushAsyncWork();

    expect(ws.sent).toContainEqual({
      type: "error",
      message: "Agent not found",
    });
    expect(ws.closed).toBe(true);
  });

  it("allows admins to stream metrics for any agent", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "agent-1",
          name: "Fleet Agent",
          status: "running",
          user_id: "owner-1",
        },
      ],
    });

    const ws = openMetricsStream("agent-1", { id: "admin-1", role: "admin" });
    await flushAsyncWork();

    expect(mockBuildAgentStatsResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-1", effective_role: "admin" }),
    );
    expect(ws.sent[0]).toEqual(
      expect.objectContaining({
        type: "snapshot",
      }),
    );
    ws.close();
  });
});
