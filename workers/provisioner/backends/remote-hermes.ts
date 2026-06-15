// @ts-nocheck
// Remote Hermes backend — BYOC Phase B2.
//
// Runs the Hermes runtime on a remote machine's Docker daemon over SSH, the
// Hermes analogue of RemoteDockerBackend (OpenClaw). It extends HermesBackend
// so all Hermes-specific bootstrap/image/lifecycle logic is inherited, and
// changes only what differs on a remote standalone host:
//   1. the dockerode client talks to the remote daemon over SSH;
//   2. no Nora compose network (default bridge);
//   3. the Hermes RUNTIME port (8642 — the API the post-deploy readiness probe
//      hits at /health) is PUBLISHED on the remote host (local Hermes publishes
//      nothing — it's reached via the container IP on the shared compose
//      network, which isn't possible across SSH);
//   4. create() advertises the remote machine's address + published runtime port
//      so readiness passes and the control plane targets the remote host.
//
// The dashboard (9119) embed reach over remote — and its pre-existing SSRF gap —
// is a separate pass (B2c); this PR makes Hermes deploy + stay healthy remotely.

const HermesBackend = require("./hermes");
const { buildRemoteDockerOptions } = require("./remote-docker");
const { HERMES_RUNTIME_PORT } = require("../../../agent-runtime/lib/contracts");

class RemoteHermesBackend extends HermesBackend {
  constructor(profile = {}) {
    super();
    this.profile = profile || {};
    this.executionTargetId = String(this.profile.executionTargetId || "")
      .trim()
      .toLowerCase();
    if (!this.executionTargetId.startsWith("remote:")) {
      throw new Error("Remote Hermes backend requires a registered remote host profile.");
    }
    if (!this.profile.sshHost || !this.profile.sshUser) {
      throw new Error(
        `Remote host ${this.profile.label || this.executionTargetId} is missing SSH connection details.`,
      );
    }
    const hasCredential =
      this.profile.sshAuthMode === "password"
        ? Boolean(this.profile.sshPassword)
        : Boolean(this.profile.sshPrivateKey);
    if (!hasCredential) {
      throw new Error(
        `Remote host ${this.profile.label || this.executionTargetId} is missing its SSH ` +
          `${this.profile.sshAuthMode === "password" ? "password" : "private key"}.`,
      );
    }
    // Reuse the dockerode constructor the parent resolved, pointed at the remote
    // daemon over SSH. dockerode is lazy, so the local client opened nothing.
    const Docker = this.docker.constructor;
    this.docker = new Docker(buildRemoteDockerOptions(this.profile));
    this._composeNetwork = null;
  }

  async _findComposeNetwork() {
    return null;
  }

  // Publish the Hermes RUNTIME port on the worker-allocated host port so the
  // control-plane readiness probe ({runtime_host}:{runtime_port}/health) can
  // reach it across the network. (The dashboard port is published by B2c.)
  _hermesPortBindings(config) {
    const port = Number(config?.gatewayHostPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
    return { [`${HERMES_RUNTIME_PORT}/tcp`]: [{ HostPort: String(port) }] };
  }

  async create(config = {}) {
    const result = await super.create(config);
    // Advertise the remote machine's address + the published runtime port so the
    // control plane targets the remote host instead of the container's internal
    // (unreachable) compose IP, and readiness probes the right address.
    const advertisedHost = this.profile.gatewayHost || this.profile.sshHost;
    const publishedRuntimePort = Number(config?.gatewayHostPort) || null;
    return {
      ...result,
      host: advertisedHost,
      runtimeHost: advertisedHost,
      runtimePort: publishedRuntimePort || result.runtimePort,
    };
  }
}

module.exports = RemoteHermesBackend;
