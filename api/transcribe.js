const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
  maxDuration: 60,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Password",
};

export default async function handler(request, response) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.setHeader(key, value);
  });

  if (request.method === "OPTIONS") {
    response.status(200).end();
    return;
  }

  try {
    const path = request.url.replace("/api/transcribe", "").split("?")[0];

    const password = request.headers["x-password"];
    if (!ACCESS_PASSWORD) {
      response.status(500).json({ error: "ACCESS_PASSWORD nao configurada no servidor" });
      return;
    }

    if (password !== ACCESS_PASSWORD) {
      response.status(401).json({ error: "Senha incorreta" });
      return;
    }

    if (path === "/auth") {
      response.status(200).json({ ok: true });
      return;
    }

    if (!ASSEMBLYAI_API_KEY) {
      response.status(500).json({ error: "API key nao configurada no servidor" });
      return;
    }

    let assemblyUrl = "https://api.assemblyai.com/v2";
    if (path === "/upload" || path === "") {
      assemblyUrl += "/upload";
    } else if (path.startsWith("/transcript")) {
      assemblyUrl += path;
    } else {
      assemblyUrl += "/transcript";
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const assemblyResponse = await fetch(assemblyUrl, {
      method: request.method,
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": request.headers["content-type"] || "application/json",
      },
      body: request.method !== "GET" ? body : undefined,
    });

    const responseText = await assemblyResponse.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: responseText || "Erro desconhecido da API" };
    }

    response.status(assemblyResponse.status).json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    response.status(500).json({ error: error.message || "Erro interno do proxy" });
  }
}
