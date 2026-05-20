// @ts-nocheck
const { EventEmitter } = require("events");
const { PassThrough } = require("stream");
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

  it("forwards non-docker backend exec output and input over the websocket", async () => {
    const backendStream = new PassThrough();
    const backendStdin = new PassThrough();
    const resize = jest.fn().mockResolvedValue(undefined);
    const stdinChunks = [];
    backendStdin.on("data", (chunk) => stdinChunks.push(chunk.toString("utf8")));

    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "agent-k8s",
          name: "K8s Agent",
          status: "running",
          container_id: "oclaw-agent-k8s",
          backend_type: "k8s",
          deploy_target: "k8s",
          user_id: "owner-1",
        },
      ],
    });
    mockContainerManager.status.mockResolvedValueOnce({ running: true });
    mockContainerManager.exec.mockResolvedValueOnce({
      stream: backendStream,
      stdin: backendStdin,
      exec: { resize },
    });

    const ws = openExecStream("agent-k8s", { id: "admin-1", role: "admin" });
    await flushAsyncWork();

    backendStream.write("ready\n");
    ws.emit("message", JSON.stringify({ type: "input", data: "echo NORA_WS_EXEC_OK\n" }));
    ws.emit("message", JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    await flushAsyncWork();

    expect(ws.sent).toContainEqual({
      type: "system",
      message: "Terminal for k8s backend — limited TTY support",
    });
    expect(ws.sent).toContainEqual({
      type: "system",
      message: "Connected to K8s Agent via k8s",
    });
    expect(ws.sent).toContainEqual({
      type: "output",
      data: "ready\n",
    });
    expect(stdinChunks.join("")).toContain("echo NORA_WS_EXEC_OK\n");
    expect(resize).toHaveBeenCalledWith({ h: 30, w: 100 });

    ws.close();
    expect(backendStdin.destroyed || backendStdin.writableEnded).toBe(true);
    expect(backendStream.destroyed).toBe(true);
  });
});
