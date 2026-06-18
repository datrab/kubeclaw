const http = require("node:http");

const { buildHealthPayload } = require("./src/health");
const { renderPage } = require("./src/page");

const DEFAULT_PORT = 3000;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, buildHealthPayload());
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, 200, renderPage());
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

function createServer() {
  return http.createServer(handleRequest);
}

if (require.main === module) {
  const port = process.env.PORT || DEFAULT_PORT;
  createServer().listen(port, () => {
    console.log(`pipeline-smoke-landing listening on ${port}`);
  });
}

module.exports = {
  createServer,
  handleRequest
};
