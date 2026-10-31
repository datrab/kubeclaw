// Semantic defaults shared by engine captures and the interactive Studio preview.
// Explicit document/theme styles remain authoritative through their inline styles.
export const documentBaseStyles = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}
main,[data-prism-type]{min-width:0}
[data-prism-type="heading"],[data-prism-type="text"]{margin:0;overflow-wrap:anywhere}
h1,h2,h3{text-wrap:balance}
button,input,select,textarea{font:inherit;color:inherit}
button{min-height:44px;padding:10px 16px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:10px;background:color-mix(in srgb,currentColor 5%,transparent);font-size:.875rem;font-weight:600;cursor:pointer;line-height:1.4}
button:hover:not(:disabled){filter:brightness(.95)}
button:disabled{opacity:.5;cursor:not-allowed}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:3px}
[data-prism-type="navigation"] ul,[data-prism-type="breadcrumb"] ol{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0}
[data-prism-type="navigation"] li{min-width:0}
[data-prism-type="navigation"] [aria-current="page"] button{background:color-mix(in srgb,currentColor 12%,transparent);border-color:currentColor}
[data-prism-type="checkbox"]{display:flex;align-items:flex-start;gap:10px;line-height:1.5}
input[type="checkbox"]{width:18px;height:18px;flex:none;margin:3px 0;accent-color:currentColor}
[data-prism-type="badge"]{display:inline-flex;align-items:center;align-self:flex-start;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:999px;padding:6px 10px;font-size:.65rem;line-height:1.5;letter-spacing:.05em;font-weight:600}
@media(max-width:600px){[data-prism-type="navigation"] ul{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-bottom:6px}[data-prism-type="navigation"] li{flex:none}[data-prism-type="navigation"] button{white-space:nowrap;padding:8px 12px;font-size:.8rem}}
img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{text-align:start;padding:10px;border-bottom:1px solid color-mix(in srgb,currentColor 15%,transparent)}
`;
