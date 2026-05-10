// @ts-nocheck
const { EventEmitter } = require("events");
const jwt = require("jsonwebtoken");

const mockDb = { query: jest.fn() };
const mockContainerManager = {
  status: jest.fn(),
  exec: jest.fn(),
};
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
jest.mock("../containerManager", () => mockContainerManager);
jest.mock("dockerode", () => jest.fn());
jest.mock("ws", () => ({
  WebSocketServer: mockFakeWebSocketServer,
}));

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("exec stream websocket auth", () => {
  let attachExecStream;
  let server;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "secret";
    mockDb.query.mockReset();
    mockContainerManager.status.mockReset();
    mockContainerManager.exec.mockReset();
    wsConnections.length = 0;

    ({ attachExecStream } = require("../execStream"));
    server = new EventEmitter();
    attachExecStream(server);
  });

  function openExecStream(agentId, userPayload) {
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
        url: `/ws/exec/${agentId}?token=${encodeURIComponent(token)}`,
        headers: { host: "nora.test" },
      },
      socket,
      Buffer.alloc(0),
    );

    return wsConnections[0];
  }

  it("allows workspace editors to open terminal sessions for shared agents", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "agent-1",
            name: "Shared Agent",
            status: "running",
            container_id: null,
            backend_type: "docker",
            user_id: "owner-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "editor" }] });

    const ws = openExecStream("agent-1", { id: "editor-1", role: "user" });
    await flushAsyncWork();

    expect(ws.sent).toContainEqual({
      type: "error",
      message: "No container ID — agent may still be provisioning",
    });
    expect(ws.closed).toBe(true);
  });

  it("rejects workspace viewers from terminal sessions", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "agent-1",
            name: "Shared Agent",
            status: "running",
            container_id: null,
            backend_type: "docker",
            user_id: "owner-1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });

    const ws = openExecStream("agent-1", { id: "viewer-1", role: "user" });
    await flushAsyncWork();

    expect(ws.sent).toContainEqual({
      type: "error",
      message: "Agent not found",
    });
    expect(ws.closed).toBe(true);
  });

  it("allows admins to open terminal sessions for any agent", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "agent-1",
          name: "Fleet Agent",
          status: "running",
          container_id: null,
          backend_type: "docker",
          user_id: "owner-1",
        },
      ],
    });

    const ws = openExecStream("agent-1", { id: "admin-1", role: "admin" });
    await flushAsyncWork();

    expect(ws.sent).toContainEqual({
      type: "error",
      message: "No container ID — agent may still be provisioning",
    });
    expect(ws.closed).toBe(true);
  });
});
