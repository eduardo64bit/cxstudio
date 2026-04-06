import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const accessPassword = env.ACCESS_PASSWORD;
  const assemblyAiApiKey = env.ASSEMBLYAI_API_KEY;

  return {
    plugins: [
      react(),
      {
        name: "flow-file-api",
        configureServer(server) {
          server.middlewares.use("/api/save-flow", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.end("Método não permitido");
              return;
            }

            try {
              const chunks: Uint8Array[] = [];
              for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }

              const body = Buffer.concat(chunks).toString("utf-8");
              const parsed = JSON.parse(body) as { nodes?: unknown; edges?: unknown };
              if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
                res.statusCode = 400;
                res.end("Payload de fluxo inválido");
                return;
              }

              const flowPath = path.resolve(server.config.root, "public/flows/flow.json");
              await fs.writeFile(flowPath, JSON.stringify(parsed, null, 2), "utf-8");

              res.setHeader("Content-Type", "application/json");
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 500;
              res.end("Falha ao salvar o arquivo de fluxo");
            }
          });

          server.middlewares.use("/api/transcribe", async (req, res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Password");

            if (req.method === "OPTIONS") {
              res.statusCode = 200;
              res.end();
              return;
            }

            try {
              const pathOnly = (req.url ?? "").split("?")[0] ?? "";
              const password = req.headers["x-password"];
              if (!accessPassword) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "ACCESS_PASSWORD não configurada no ambiente local" }));
                return;
              }
              if (password !== accessPassword) {
                res.statusCode = 401;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Senha incorreta" }));
                return;
              }

              if (pathOnly === "/auth") {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true }));
                return;
              }

              if (!assemblyAiApiKey) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "ASSEMBLYAI_API_KEY não configurada no ambiente local" }));
                return;
              }

              let assemblyUrl = "https://api.assemblyai.com/v2";
              if (pathOnly === "/upload" || pathOnly === "") {
                assemblyUrl += "/upload";
              } else if (pathOnly.startsWith("/transcript")) {
                assemblyUrl += pathOnly;
              } else {
                assemblyUrl += "/transcript";
              }

              const chunks: Uint8Array[] = [];
              for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const requestBody = Buffer.concat(chunks);

              const upstream = await fetch(assemblyUrl, {
                method: req.method,
                headers: {
                  Authorization: assemblyAiApiKey,
                  "Content-Type": req.headers["content-type"] ?? "application/json",
                },
                body: req.method === "GET" ? undefined : requestBody,
              });

              const text = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", "application/json");
              res.end(text);
            } catch {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Falha no proxy local de transcrição" }));
            }
          });
        },
      },
    ],
  };
});
