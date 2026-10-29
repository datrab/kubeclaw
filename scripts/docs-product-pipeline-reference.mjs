import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const pipelinePage = 'docs/site/reference/workflows.md';
const contracts = 'skills/common/plugin-runtime/sdk/src/generated/contracts.ts';
const compiler = 'skills/nova/project/compiler.ts';
const progress = 'skills/nova/project_setup/tools/progress-scaffold-validation.ts';
const schemaInterfaces = Object.freeze(['StageDefinition', 'PipelineDefinition']);
const familySections = Object.freeze({ schema: Object.freeze(['schema', 'workflow']), contract: Object.freeze(['contract']), workflow: Object.freeze(['workflow']) });
const familyCodes = Object.freeze({ schema: 'DOC_DRIFT_SCHEMA', contract: 'DOC_DRIFT_CONTRACT', workflow: 'DOC_DRIFT_WORKFLOW' });

// Fresh metadata only: consumers cannot mutate the renderer's selection inputs.
export function describeProductPipelineDiscovery() {
  return {
    kind: 'product-pipeline-discovery',
    owner: 'documentation automation',
    generator: 'scripts/docs-product-pipeline-reference.mjs',
    page: pipelinePage,
    authorities: { schema: contracts, workflow: compiler, contract: progress },
    schemaInterfaces: [...schemaInterfaces],
    families: Object.fromEntries(Object.entries(familySections).map(([family, sections]) => [family, { sections: [...sections], driftCode: familyCodes[family] }])),
    parser: { kind: 'TypeScript createSourceFile', target: 'Latest', scriptKind: 'TS', typeChecking: false, output: 'printer with comments removed; source order retained' },
    schema: {
      selection: 'Every matching interface declaration and all merged members',
      members: 'Property and index signatures; recursive inline TypeLiteral properties; named aliases remain references',
      rejected: ['Other interface member kinds', 'Interface heritage', 'Interface type parameters'],
      annotations: 'Declared JSDoc syntax, not runtime enforcement',
    },
    graph: {
      selection: 'Reachable static relative imports/re-exports with literal .ts extension; normalized root containment and seen membership',
      external: 'Named import boundaries, not traversed',
      rejected: ['Import-equals declarations', 'import() calls', 'Every require or createRequire identifier'],
      filesystem: 'readFileSync; no symlink rejection claim',
    },
    limits: ['Bounded product pipeline sections, not all repository contracts or SDK exports', 'Not arbitrary TypeScript module resolution or type checking', 'No runtime, persistence, scheduler or recovery qualification', 'No DATA output-role or acceptance grant'],
  };
}
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const code = (node, source) => printer.printNode(ts.EmitHint.Unspecified, node, source).trim();
// Entity-encode every ASCII punctuation mark before Markdown parses a cell.
// In particular, source backslashes and emphasis/link delimiters stay literal.
const cell = value => String(value).replace(/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g, char => `&#${char.charCodeAt(0)};`).replaceAll('\n', '<br>');
const table = (heads, rows) => [`| ${heads.map(cell).join(' | ')} |`, `| ${heads.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n');

function parse(root, relative) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) {
    throw new Error(`PIPELINE_SOURCE_PARSE_ERROR ${relative}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, ' ')}`);
  }
  return source;
}

// Complete normalized declarations retain every expression and control guard.
// A lossy list of descendant calls would miss false && validate(...), try/finally
// or other execution context. Do not infer runtime success from this syntax.
// Comments are intentionally omitted; schema annotations are extracted below.
function rules(source) {
  return source.statements.map(node => [
    node.name ? code(node.name, source) : 'module',
    'source order, complete declaration',
    ts.SyntaxKind[node.kind],
    node.name ? code(node.name, source) : '',
    code(node, source),
  ]);
}

function schemaRows(source) {
  const rows = [];
  function members(nodes, prefix) {
    for (const member of nodes) {
      if (ts.isPropertySignature(member)) {
        const name = `${prefix}.${code(member.name, source)}`;
        const tags = ts.getJSDocTags(member).map(tag => `@${tag.tagName.text} ${typeof tag.comment === 'string' ? tag.comment : ''}`.trim()).join('; ');
        rows.push([name, member.questionToken ? 'optional' : 'required', code(member, source), tags]);
        if (member.type && ts.isTypeLiteralNode(member.type)) members(member.type.members, name);
      } else if (ts.isIndexSignatureDeclaration(member)) {
        rows.push([`${prefix}.[key]`, 'index signature', code(member, source), '']);
      } else {
        throw new Error(`PIPELINE_SCHEMA_UNSUPPORTED_MEMBER ${prefix}: ${ts.SyntaxKind[member.kind]}`);
      }
    }
  }
  for (const name of schemaInterfaces) {
    const declarations = source.statements.filter(node => ts.isInterfaceDeclaration(node) && node.name.text === name);
    if (!declarations.length) throw new Error(`PIPELINE_SCHEMA_AUTHORITY_MISSING ${name}`);
    // TypeScript merges interface declarations: every member contributes.
    for (const declaration of declarations) {
      if (declaration.heritageClauses?.length) throw new Error(`PIPELINE_SCHEMA_UNSUPPORTED_INHERITANCE ${name}`);
      if (declaration.typeParameters?.length) throw new Error(`PIPELINE_SCHEMA_UNSUPPORTED_TYPE_PARAMETERS ${name}`);
      members(declaration.members, name);
    }
  }
  return rows;
}

export function productPipelineSections(root) {
  const schema = parse(root, contracts);
  function graph(authority) {
    const sources = [parse(root, authority)];
    const dependencies = [];
    const seen = new Set([authority]);
    for (const source of sources) {
      function rejectUnsupported(node) {
        if (ts.isImportEqualsDeclaration(node)
          || (ts.isIdentifier(node) && ['require', 'createRequire'].includes(node.text))
          || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
          throw new Error(`PIPELINE_DYNAMIC_DEPENDENCY_UNSUPPORTED ${source.fileName}`);
        }
        ts.forEachChild(node, rejectUnsupported);
      }
      rejectUnsupported(source);
      for (const node of source.statements.filter(node => ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        dependencies.push([source.fileName, specifier, ts.isExportDeclaration(node) ? `re-export ${node.exportClause ? code(node.exportClause, source) : '*'}` : node.importClause ? code(node.importClause, source) : '(side effects)']);
        if (specifier.startsWith('.')) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(source.fileName), specifier));
          if (!target.endsWith('.ts') || target.startsWith('../')) throw new Error(`PIPELINE_DEPENDENCY_UNSUPPORTED ${target}`);
          if (!seen.has(target)) { seen.add(target); sources.push(parse(root, target)); }
        }
      }
    }
    return { sources, dependencies };
  }
  // Ownership follows reachability from each authority, not a directory prefix.
  // A shared helper can therefore contribute to both reader-facing sections.
  const compileGraph = graph(compiler);
  const progressGraph = graph(progress);
  const sections = {
    schema: `## Product pipeline fields\n\nAuthority: \`${contracts}\`, interfaces \`StageDefinition\` and \`PipelineDefinition\`. The generator expands inline object members below. It keeps named aliases as explicit type references. These references do not supply defaults. Tags are declared annotations. They do not prove runtime enforcement.\n\n${table(['Field', 'Presence', 'Declared member (type/modifiers)', 'Annotations'], schemaRows(schema))}\n`,
    workflow: `## Product project compiler\n\nAuthority: \`${compiler}\`. The complete normalized declarations below keep actual expressions, branch conditions, selected stage-construction calls, concurrency and schema-validation arguments. Complete function bodies keep short-circuit, loop and exception context. The generator does not duplicate descendant calls without their guards.\n\nThese declarations describe checked-in syntax. They do not prove a compilation without error or runtime recovery. The generator keeps source order in each module.\n\n${compileGraph.sources.map(source => `### ${source.fileName}\n\n${table(['Owner', 'Branch', 'Rule', 'Target', 'Expression'], rules(source))}\n`).join('\n')}\n### Import and receiver boundary\n\n${table(['Importing source', 'Specifier', 'Imported bindings'], compileGraph.dependencies)}\n\nThe generator reads the static local TypeScript imports and re-exports above. Dynamic imports, import-equals declarations and require/createRequire source bindings are unsupported inputs. They cannot give a freshness check that passes. This limit includes computed require arguments and aliases. Such loaders need separate qualification.\n\nExternal package imports are named boundaries. They do not prove resolved registrations or runtime qualification. This section does not prove scheduler state, registry availability, atomic writes or crash recovery.\n`,
    contract: `## Product progress scaffold\n\nAuthority: \`${progress}\` and its local dependencies. These full normalized declarations show validation inputs, parameter defaults and the returned pipeline/progress mapping. The declarations keep all control context.\n\nThese declarations include filesystem reader and writer code. They are not evidence that a caller writes the returned progress object. They are not evidence of atomic persistence or recovery.\n\n${progressGraph.sources.map(source => `### ${source.fileName}\n\n${table(['Owner', 'Branch', 'Rule', 'Target', 'Expression'], rules(source))}\n`).join('\n')}\n### Progress import and receiver boundary\n\n${table(['Importing source', 'Specifier', 'Imported bindings'], progressGraph.dependencies)}\n\nThe returned \`progress\` object is not evidence that any caller writes it to durable storage. Writer/reader lifecycle and external registry behavior need checks at their owners.\n`,
  };
  return sections;
}

export function renderProductPipeline(root) {
  return Object.entries(productPipelineSections(root)).map(([family, section]) => `<!-- BEGIN PRODUCT PIPELINE: ${family} -->\n\n${section}\n<!-- END PRODUCT PIPELINE: ${family} -->`).join('\n\n');
}

export function checkProductPipeline(root, family) {
  const codes = familyCodes;
  if (!(family in codes)) throw new Error(`PIPELINE_FAMILY_UNSUPPORTED ${family}`);
  // Parse/toolchain/read errors propagate separately; only a successfully built
  // semantic section that differs from this exact page receives a drift code.
  const expected = productPipelineSections(root);
  const page = fs.readFileSync(path.join(root, pipelinePage), 'utf8');
  // The schema family owns both recursive fields and compiler-selected stages.
  const selected = Object.hasOwn(familySections, family) ? familySections[family] : [family];
  for (const section of selected) {
    const begin = `<!-- BEGIN PRODUCT PIPELINE: ${section} -->`;
    const end = `<!-- END PRODUCT PIPELINE: ${section} -->`;
    const start = page.indexOf(begin);
    const stop = page.indexOf(end);
    if (start < 0 || stop < start || page.indexOf(begin, start + begin.length) !== -1 || page.indexOf(end, stop + end.length) !== -1 || page.slice(start + begin.length, stop) !== `\n\n${expected[section]}\n`) {
      return `${codes[family]} ${pipelinePage}: product pipeline ${section} section differs from its source rules`;
    }
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--describe-discovery') {
      console.log(JSON.stringify(describeProductPipelineDiscovery(), null, 2));
    } else {
    const family = process.argv[2];
    const failure = checkProductPipeline(process.cwd(), family);
    if (failure) { console.error(failure); process.exitCode = 1; }
    else console.log(`product pipeline ${family} section is current; bounded contribution, not complete family acceptance`);
    }
  } catch (error) {
    console.error(`PIPELINE_REFERENCE_INPUT_ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
