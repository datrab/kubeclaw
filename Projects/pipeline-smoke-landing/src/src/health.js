function buildHealthPayload() {
  return {
    status: "ok",
    service: "pipeline-smoke-landing",
    module: "01-foundation"
  };
}

module.exports = {
  buildHealthPayload
};
