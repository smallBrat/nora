// @ts-nocheck
const express = require("express");
const request = require("supertest");

const { AppError, correlationId, errorHandler } = require("../middleware/errorHandler");

function buildApp(route) {
  const app = express();
  app.use(correlationId);
  app.get("/test", route);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("exposes expected operator-facing 5xx errors", async () => {
    const app = buildApp(() => {
      throw new AppError(
        "Managed backup storage requires NORA_BACKUP_ENCRYPTION_KEY to be configured with a valid 64-char hex key",
        503,
        "BACKUP_ENCRYPTION_NOT_CONFIGURED",
        { expose: true },
      );
    });

    const res = await request(app).get("/test");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error:
        "Managed backup storage requires NORA_BACKUP_ENCRYPTION_KEY to be configured with a valid 64-char hex key",
      code: "BACKUP_ENCRYPTION_NOT_CONFIGURED",
    });
    expect(res.body.correlationId).toBeTruthy();
  });

  it("keeps unexpected 5xx messages generic", async () => {
    const app = buildApp(() => {
      throw new Error("database password leaked in stack context");
    });

    const res = await request(app).get("/test");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });
});
