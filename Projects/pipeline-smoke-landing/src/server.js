const http = require("node:http");
const { buildHealthPayload } = require("./src/health");
const { renderPage } = require("./src/page");

const PORT = process.env.PORT || 3000;

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

function createApp() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, buildHealthPayload());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/") {
      sendHtml(response, 200, renderPage());
      return;
    }

    sendJson(response, 404, {
      error: "not_found"
    });
  });
}

if (require.main === module) {
  const server = createApp();

  server.listen(PORT, () => {
    console.log(`pipeline-smoke-landing listening on port ${PORT}`);
  });
}

module.exports = {
  createApp
};
