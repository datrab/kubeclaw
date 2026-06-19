function renderStyles() {
  return `
    :root {
      color-scheme: light;
      --ink: #17202a;
      --muted: #4a5563;
      --surface: #ffffff;
      --line: #d6dde6;
      --accent: #1d7a8c;
      --accent-strong: #145c69;
      --bg: #eef3f7;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: var(--bg);
    }

    main {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 2rem 1rem;
    }

    #foundation {
      width: min(100%, 68rem);
      padding: clamp(2rem, 6vw, 5rem);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 24px 60px rgba(23, 32, 42, 0.12);
    }

    .eyebrow {
      margin: 0 0 0.75rem;
      color: var(--accent-strong);
      font-size: 0.84rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      max-width: 12ch;
      font-size: clamp(2.4rem, 7vw, 5.75rem);
      line-height: 0.95;
    }

    .summary {
      margin: 1.25rem 0 0;
      max-width: 46rem;
      color: var(--muted);
      font-size: clamp(1rem, 2vw, 1.3rem);
      line-height: 1.6;
    }

    .status-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 2rem;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      min-height: 2.5rem;
      padding: 0.65rem 0.85rem;
      border: 1px solid var(--line);
      border-left: 4px solid var(--accent);
      background: #f8fbfc;
      color: var(--ink);
      font-size: 0.95rem;
      font-weight: 700;
    }

    @media (min-width: 760px) {
      #foundation {
        display: grid;
        grid-template-columns: minmax(18rem, 0.9fr) minmax(24rem, 1.1fr);
        align-items: end;
        gap: 3rem;
      }

      .summary {
        margin-top: 0;
      }

      .status-row {
        grid-column: 1 / -1;
      }
    }
  `;
}

function renderFoundationSection() {
  return `
      <section id="foundation" data-module="01-foundation">
        <div>
          <p class="eyebrow">OpenClaw pipeline smoke test</p>
          <h1>Landing Page Foundation</h1>
        </div>
        <p class="summary">
          This first visible section verifies that the OpenClaw pipeline can
          build, serve, test, and package a plain Node.js landing page before
          later modules add more sections.
        </p>
        <div class="status-row" aria-label="Module status">
          <span class="status-pill">Service: pipeline-smoke-landing</span>
          <span class="status-pill">Module: 01-foundation</span>
          <span class="status-pill">Health: /health</span>
        </div>
      </section>
  `;
}

function renderPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pipeline Smoke Landing</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
${renderFoundationSection()}
    </main>
  </body>
</html>`;
}

module.exports = {
  renderFoundationSection,
  renderPage,
  renderStyles
};
