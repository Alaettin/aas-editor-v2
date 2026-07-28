import Fastify from "fastify";

const port = Number(process.env.PORT ?? 3200);
const host = process.env.HOST ?? "0.0.0.0";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.get("/api/health", async () => ({
    status: "ok",
    version: "0.1.0",
    metamodel: "3.1",
  }));

  return app;
}

const app = buildServer();

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
