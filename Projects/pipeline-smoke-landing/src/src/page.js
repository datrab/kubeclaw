function renderStyles() {
  return `
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f7fb;
      color: #17202e;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(135deg, rgba(19, 88, 120, 0.14), transparent 34rem),
        linear-gradient(315deg, rgba(71, 128, 92, 0.14), transparent 30rem),
        #f5f7fb;
    }

    main {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 2rem 1rem;
    }

    #foundation {
      width: min(100%, 68rem);
      display: grid;
      gap: 1.5rem;
      padding: clamp(2rem, 6vw, 4.5rem);
      border: 1px solid rgba(23, 32, 46, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 24px 80px rgba(23, 32, 46, 0.12);
    }

    .eyebrow {
      margin: 0;
      color: #236059;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      max-width: 13ch;
      margin: 0;
      font-size: clamp(2.4rem, 8vw, 5.5rem);
      line-height: 0.98;
      letter-spacing: 0;
    }

    .lede {
      max-width: 42rem;
      margin: 0;
      color: #405064;
      font-size: clamp(1.05rem, 2vw, 1.35rem);
      line-height: 1.55;
    }

    .details {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .details li {
      padding: 0.7rem 0.9rem;
      border: 1px solid rgba(23, 32, 46, 0.1);
      border-radius: 8px;
      background: #ffffff;
      color: #263548;
      font-size: 0.95rem;
    }

    @media (min-width: 760px) {
      #foundation {
        grid-template-columns: 1fr minmax(18rem, 0.72fr);
        align-items: end;
      }

      .lede,
      .details {
        grid-column: 2;
      }

      h1,
      .eyebrow {
        grid-column: 1;
      }
    }

    @media (max-width: 520px) {
      main {
        place-items: stretch;
        padding: 1rem;
      }

      #foundation {
        min-height: calc(100vh - 2rem);
        align-content: center;
      }
    }
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
      <section id="foundation" data-module="01-foundation" aria-labelledby="foundation-title">
        <p class="eyebrow">OpenClaw pipeline smoke test</p>
        <h1 id="foundation-title">Pipeline Smoke Landing</h1>
        <p class="lede">
          This first section proves the foundation module can serve a plain Node.js
          landing page, answer health checks, and move through the OpenClaw pipeline.
        </p>
        <ul class="details" aria-label="Foundation checks">
          <li>Module 01 foundation</li>
          <li>HTML at /</li>
          <li>JSON health at /health</li>
        </ul>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = {
  renderPage,
  renderStyles
};
