#!/usr/bin/env node
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const QDRANT_URL       = (process.env.QDRANT_URL || 'http://qdrant.default.svc.cluster.local:6333').replace(/\/+$/, '');
const COLLECTION       = 'swarm_intelligence';
const ARCHIVE          = 'swarm_archive';
const LITELLM_URL      = (process.env.LITELLM_URL || 'http://litellm.default.svc.cluster.local:4000').replace(/\/+$/, '');
const LITELLM_KEY      = process.env.LITELLM_API_KEY || '';
const EMBEDDING_MODEL  = 'gemini-embedding-001';
const VECTOR_SIZE      = 3072;

const AGENT_NAME       = process.env.AGENT_NAME || 'unknown';
const CURRENT_PROJECT  = process.env.CURRENT_PROJECT || 'kubecommand';
const CURRENT_MODULE   = process.env.CURRENT_MODULE || null;

// Confidence tuning
const CONF_INITIAL     = 0.5;
const CONF_FLOOR       = 0.4;   // floor in ranking formula
const CONF_WEIGHT      = 0.6;   // weight in ranking formula
const BOOST_PASS       = 0.15;
const BOOST_VALIDATE   = 0.10;
const BOOST_CROSS      = 0.05;
const DECAY_FAIL       = 0.10;
const DECAY_DISPUTE    = 0.15;
const DECAY_SUPERSEDE  = 0.20;
const DECAY_BLOCKED    = 0.20;

// ═══════════════════════════════════════════════════════════════
// EMBEDDING
// ═══════════════════════════════════════════════════════════════
async function getEmbedding(text) {
  const res = await fetch(`${LITELLM_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LITELLM_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data?.[0]?.embedding || [];
}

// ═══════════════════════════════════════════════════════════════
// QDRANT OPERATIONS
// ═══════════════════════════════════════════════════════════════
const qdrant = {

  async ensureCollection(name = COLLECTION) {
    const check = await fetch(`${QDRANT_URL}/collections/${name}`);
    if (check.status === 404) {
      const res = await fetch(`${QDRANT_URL}/collections/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
          // Indexes for common filter fields
          optimizers_config: { indexing_threshold: 100 }
        })
      });
      if (!res.ok) throw new Error(`Create collection failed: ${await res.text()}`);

      // Create payload indexes for fields we filter on
      for (const field of ['scope', 'module', 'agent', 'confidence', 'last_accessed']) {
        const type = (field === 'confidence' || field === 'last_accessed') ? 'float' : 'keyword';
        await fetch(`${QDRANT_URL}/collections/${name}/index`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_name: field, field_schema: type })
        }).catch(() => {}); // non-fatal
      }
      // tags is an array of keywords
      await fetch(`${QDRANT_URL}/collections/${name}/index`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: 'tags', field_schema: 'keyword' })
      }).catch(() => {});
    }
  },

  async upsert(points, collection = COLLECTION) {
    await this.ensureCollection(collection);
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    });
    if (!res.ok) throw new Error(`Upsert failed: ${await res.text()}`);
  },

  async search(vector, filter = {}, limit = 5, collection = COLLECTION) {
    const body = { vector, limit, with_payload: true, score_threshold: 0.45 };
    if (Object.keys(filter).length > 0) body.filter = filter;
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result || [];
  },

  async scroll(filter, limit = 100, collection = COLLECTION) {
    const body = { filter, limit, with_payload: true, with_vector: false };
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.result?.points || [];
  },

  async setPayload(ids, payload, collection = COLLECTION) {
    if (!ids.length) return;
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/payload?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, points: ids })
    });
    if (!res.ok) throw new Error(`setPayload failed: ${await res.text()}`);
  },

  async deletePoints(ids, collection = COLLECTION) {
    if (!ids.length) return;
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/delete?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: ids })
    });
    if (!res.ok) throw new Error(`Delete failed: ${await res.text()}`);
  },

  async collectionInfo(collection = COLLECTION) {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.result || null;
  }
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function makeId(text, scope) {
  return crypto.createHash('md5')
    .update(text + '|' + scope)
    .digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

function resolveScope(scopeArg) {
  if (!scopeArg || scopeArg === 'project') return `project:${CURRENT_PROJECT}`;
  if (scopeArg === 'global') return 'global';
  if (scopeArg === 'agent') return `agent:${AGENT_NAME}`;
  // Allow passing full scope strings directly
  if (scopeArg.startsWith('project:') || scopeArg.startsWith('agent:')) return scopeArg;
  return `project:${CURRENT_PROJECT}`;
}

function buildScopeFilter() {
  // Agent sees: global + its project + its own agent-scoped memories
  return {
    should: [
      { key: 'scope', match: { value: 'global' } },
      { key: 'scope', match: { value: `project:${CURRENT_PROJECT}` } },
      { key: 'scope', match: { value: `agent:${AGENT_NAME}` } }
    ]
  };
}

function clamp(val, min = 0.0, max = 1.0) {
  return Math.max(min, Math.min(max, val));
}

function effectiveScore(similarity, confidence) {
  return similarity * (CONF_FLOOR + CONF_WEIGHT * confidence);
}

function confidenceStars(conf) {
  if (conf >= 0.75) return '★★★';
  if (conf >= 0.45) return '★★☆';
  return '★☆☆';
}

// ═══════════════════════════════════════════════════════════════
// LIBRARY (importable + CLI)
// ═══════════════════════════════════════════════════════════════
const lib = {

  // ─────────────────────────────────────────────────────────────
  // REMEMBER — write a new memory
  // ─────────────────────────────────────────────────────────────
  async remember({ text, tags = [], scope, module, supersedes }) {
    if (!text || text.length < 5) throw new Error('Text too short (min 5 chars)');

    const resolvedScope = resolveScope(scope);
    const resolvedModule = module || CURRENT_MODULE;
    const parsedTags = Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    const id = makeId(text, resolvedScope);
    const now = Date.now();

    const vector = await getEmbedding(text);

    const payload = {
      text,
      tags: parsedTags,
      scope: resolvedScope,
      agent: AGENT_NAME,
      module: resolvedModule,
      confidence: CONF_INITIAL,
      access_count: 0,
      boost_count: 0,
      decay_count: 0,
      created_at: now,
      updated_at: now,
      last_accessed: null,
      supersedes: supersedes || null,
      related: []
    };

    await qdrant.upsert([{ id, vector, payload }]);

    // If superseding, decay the old memory
    if (supersedes) {
      try {
        const oldPoints = await qdrant.scroll(
          { must: [{ has_id: [supersedes] }] }, 1
        );
        if (oldPoints.length > 0) {
          const oldConf = oldPoints[0].payload?.confidence || CONF_INITIAL;
          await qdrant.setPayload([supersedes], {
            confidence: clamp(oldConf - DECAY_SUPERSEDE),
            updated_at: now
          });
        }
      } catch (e) {
        console.warn(`[MEMORY] Could not decay superseded ${supersedes}: ${e.message}`);
      }
    }

    return { status: 'remembered', id, scope: resolvedScope, module: resolvedModule };
  },

  // ─────────────────────────────────────────────────────────────
  // RECALL — search with confidence-weighted ranking
  // ─────────────────────────────────────────────────────────────
  async recall({ query, tags, module, minConfidence, limit = 5, verbose = false }) {
    if (!query || query.length < 3) return [];

    const vector = await getEmbedding(query);

    // Build filter: scope (must match one of agent's scopes)
    const filter = { must: [], should: [] };

    // Scope filter — always applied
    const scopeFilter = buildScopeFilter();
    // Qdrant: wrap should in a nested must so it ANDs with other conditions
    filter.must.push(scopeFilter);

    // Optional: tag filter (all specified tags must be present)
    if (tags) {
      const tagList = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
      for (const tag of tagList) {
        filter.must.push({ key: 'tags', match: { value: tag } });
      }
    }

    // Optional: module filter
    if (module) {
      filter.must.push({ key: 'module', match: { value: module } });
    }

    // Optional: minimum confidence
    if (minConfidence != null) {
      filter.must.push({ key: 'confidence', range: { gte: parseFloat(minConfidence) } });
    }

    // Over-fetch for re-ranking (3x limit, minimum 15)
    const fetchLimit = Math.max(limit * 3, 15);
    const results = await qdrant.search(vector, filter, fetchLimit);

    if (!results.length) return [];

    // Re-rank by effective score
    const ranked = results.map(r => ({
      id: r.id,
      text: r.payload.text,
      score: r.score,
      confidence: r.payload.confidence ?? CONF_INITIAL,
      effective_score: effectiveScore(r.score, r.payload.confidence ?? CONF_INITIAL),
      agent: r.payload.agent,
      module: r.payload.module,
      tags: r.payload.tags || [],
      scope: r.payload.scope,
      created_at: r.payload.created_at,
      access_count: r.payload.access_count || 0
    }));

    ranked.sort((a, b) => b.effective_score - a.effective_score);
    const top = ranked.slice(0, limit);

    // Update access tracking on served memories (fire-and-forget)
    const now = Date.now();
    const servedIds = top.map(r => r.id);
    qdrant.setPayload(servedIds, { last_accessed: now }).catch(() => {});

    // Increment access_count individually (read current from results)
    for (const r of top) {
      qdrant.setPayload([r.id], { access_count: (r.access_count || 0) + 1 }).catch(() => {});
    }

    // Cross-agent bonus: if recalled by different agent than author, small boost
    for (const r of top) {
      if (r.agent && r.agent !== AGENT_NAME) {
        qdrant.setPayload([r.id], {
          confidence: clamp((r.confidence || CONF_INITIAL) + BOOST_CROSS),
          boost_count: (r.boost_count || 0) + 1,
          updated_at: now
        }).catch(() => {});
      }
    }

    if (verbose) return top;

    // Compact output for normal use
    return top.map(r => ({
      id: r.id,
      text: r.text,
      score: r.effective_score,
      confidence: r.confidence,
      module: r.module,
      agent: r.agent,
      tags: r.tags
    }));
  },

  // ─────────────────────────────────────────────────────────────
  // FORGET — delete a memory
  // ─────────────────────────────────────────────────────────────
  async forget({ id }) {
    if (!id) throw new Error('Missing --id');
    await qdrant.deletePoints([id]);
    return { status: 'forgotten', id };
  },

  // ─────────────────────────────────────────────────────────────
  // BOOST — increase confidence
  // ─────────────────────────────────────────────────────────────
  async boost({ id, amount }) {
    if (!id) throw new Error('Missing --id');
    const delta = parseFloat(amount) || BOOST_VALIDATE;
    const points = await qdrant.scroll({ must: [{ has_id: [id] }] }, 1);
    if (!points.length) throw new Error(`Memory ${id} not found`);

    const current = points[0].payload?.confidence ?? CONF_INITIAL;
    const newConf = clamp(current + delta);
    await qdrant.setPayload([id], {
      confidence: newConf,
      boost_count: (points[0].payload?.boost_count || 0) + 1,
      updated_at: Date.now()
    });
    return { status: 'boosted', id, confidence: { from: current, to: newConf } };
  },

  // ─────────────────────────────────────────────────────────────
  // DISPUTE — decrease confidence
  // ─────────────────────────────────────────────────────────────
  async dispute({ id }) {
    if (!id) throw new Error('Missing --id');
    const points = await qdrant.scroll({ must: [{ has_id: [id] }] }, 1);
    if (!points.length) throw new Error(`Memory ${id} not found`);

    const current = points[0].payload?.confidence ?? CONF_INITIAL;
    const newConf = clamp(current - DECAY_DISPUTE);
    await qdrant.setPayload([id], {
      confidence: newConf,
      decay_count: (points[0].payload?.decay_count || 0) + 1,
      updated_at: Date.now()
    });
    return { status: 'disputed', id, confidence: { from: current, to: newConf } };
  },

  // ─────────────────────────────────────────────────────────────
  // VALIDATE — confirm a memory is correct (stronger boost)
  // ─────────────────────────────────────────────────────────────
  async validate({ id }) {
    if (!id) throw new Error('Missing --id');
    return lib.boost({ id, amount: BOOST_VALIDATE });
  },

  // ─────────────────────────────────────────────────────────────
  // FEEDBACK — bulk confidence update after module outcome
  //
  // Called by Logos after state transitions:
  //   feedback --module 04a --outcome pass
  //   feedback --module 04a --outcome fail --reason "..."
  //   feedback --module 04a --outcome blocked --reason "..."
  // ─────────────────────────────────────────────────────────────
  async feedback({ module, outcome, reason }) {
    if (!module) throw new Error('Missing --module');
    if (!outcome) throw new Error('Missing --outcome');
    if (!['pass', 'fail', 'blocked'].includes(outcome)) {
      throw new Error('--outcome must be pass, fail, or blocked');
    }

    const now = Date.now();
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);

    // Find memories related to this module:
    // 1. Memories tagged with this module
    const byModule = await qdrant.scroll({
      must: [{ key: 'module', match: { value: module } }]
    }, 100);

    // 2. Memories recently accessed (served during this module's work)
    const byAccess = await qdrant.scroll({
      must: [{ key: 'last_accessed', range: { gte: twoHoursAgo } }]
    }, 100);

    // Deduplicate
    const seen = new Set();
    const targets = [];
    for (const p of [...byModule, ...byAccess]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        targets.push(p);
      }
    }

    // Apply confidence adjustment
    let delta;
    switch (outcome) {
      case 'pass':    delta = BOOST_PASS;     break;
      case 'fail':    delta = -DECAY_FAIL;    break;
      case 'blocked': delta = -DECAY_BLOCKED; break;
    }

    let updated = 0;
    for (const point of targets) {
      const current = point.payload?.confidence ?? CONF_INITIAL;
      const newConf = clamp(current + delta);
      if (newConf !== current) {
        const update = {
          confidence: newConf,
          updated_at: now
        };
        if (delta > 0) update.boost_count = (point.payload?.boost_count || 0) + 1;
        else update.decay_count = (point.payload?.decay_count || 0) + 1;

        await qdrant.setPayload([point.id], update);
        updated++;
      }
    }

    // Write the outcome itself as a new memory
    const outcomeText = outcome === 'pass'
      ? `Module ${module} PASSED. Patterns used during this module were validated.`
      : outcome === 'fail'
        ? `Module ${module} FAILED: ${reason || 'no reason given'}`
        : `Module ${module} BLOCKED after 3 fail cycles: ${reason || 'no reason given'}`;

    const outcomeTags = ['module-outcome', outcome, module];
    const outcomeConf = outcome === 'blocked' ? 0.8 : CONF_INITIAL;

    const vector = await getEmbedding(outcomeText);
    const outcomeId = makeId(outcomeText, `project:${CURRENT_PROJECT}`);

    await qdrant.upsert([{
      id: outcomeId,
      vector,
      payload: {
        text: outcomeText,
        tags: outcomeTags,
        scope: `project:${CURRENT_PROJECT}`,
        agent: AGENT_NAME,
        module,
        confidence: outcomeConf,
        access_count: 0,
        boost_count: 0,
        decay_count: 0,
        created_at: now,
        updated_at: now,
        last_accessed: null,
        supersedes: null,
        related: []
      }
    }]);

    return {
      status: 'feedback_applied',
      outcome,
      module,
      memories_affected: updated,
      memories_found: targets.length,
      outcome_memory_id: outcomeId
    };
  },

  // ─────────────────────────────────────────────────────────────
  // STATS — collection overview
  // ─────────────────────────────────────────────────────────────
  async stats() {
    const info = await qdrant.collectionInfo();
    if (!info) return { error: 'Collection not found' };

    const totalPoints = info.points_count || 0;

    // Sample to get distribution (scroll up to 500)
    const all = await qdrant.scroll({}, Math.min(totalPoints, 500));

    const byScope = {};
    const byAgent = {};
    let confSum = 0;
    let highConf = 0;
    let lowConf = 0;
    let mostAccessed = { text: '', count: 0 };

    for (const p of all) {
      const pl = p.payload || {};
      const scope = pl.scope || 'unknown';
      const agent = pl.agent || 'unknown';
      const conf = pl.confidence ?? CONF_INITIAL;
      const acc = pl.access_count || 0;

      byScope[scope] = (byScope[scope] || 0) + 1;
      byAgent[agent] = (byAgent[agent] || 0) + 1;
      confSum += conf;
      if (conf >= 0.8) highConf++;
      if (conf < 0.2) lowConf++;
      if (acc > mostAccessed.count) {
        mostAccessed = { text: (pl.text || '').slice(0, 80), count: acc, id: p.id };
      }
    }

    return {
      total: totalPoints,
      sampled: all.length,
      by_scope: byScope,
      by_agent: byAgent,
      avg_confidence: all.length ? (confSum / all.length).toFixed(3) : 0,
      high_confidence: highConf,
      low_confidence: lowConf,
      most_accessed: mostAccessed.count > 0 ? mostAccessed : null
    };
  }
};

export default lib;

// ═══════════════════════════════════════════════════════════════
// CLI WRAPPER
// ═══════════════════════════════════════════════════════════════
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  (async () => {
    const args = process.argv.slice(2);
    const cmd = args[0];
    const getArg = (name) => {
      const i = args.indexOf('--' + name);
      return i > -1 && args[i + 1] ? args[i + 1] : null;
    };
    const hasFlag = (name) => args.includes('--' + name);

    try {
      switch (cmd) {
        case 'remember': {
          const res = await lib.remember({
            text: getArg('text'),
            tags: getArg('tags'),
            scope: getArg('scope'),
            module: getArg('module'),
            supersedes: getArg('supersedes')
          });
          console.log(JSON.stringify(res));
          break;
        }

        case 'recall': {
          const res = await lib.recall({
            query: getArg('query'),
            tags: getArg('tags'),
            module: getArg('module'),
            minConfidence: getArg('min-confidence'),
            limit: parseInt(getArg('limit') || '5'),
            verbose: hasFlag('verbose')
          });
          console.log(JSON.stringify(res, null, 2));
          break;
        }

        case 'forget': {
          const res = await lib.forget({ id: getArg('id') });
          console.log(JSON.stringify(res));
          break;
        }

        case 'boost': {
          const res = await lib.boost({ id: getArg('id'), amount: getArg('amount') });
          console.log(JSON.stringify(res));
          break;
        }

        case 'dispute': {
          const res = await lib.dispute({ id: getArg('id') });
          console.log(JSON.stringify(res));
          break;
        }

        case 'validate': {
          const res = await lib.validate({ id: getArg('id') });
          console.log(JSON.stringify(res));
          break;
        }

        case 'feedback': {
          const res = await lib.feedback({
            module: getArg('module'),
            outcome: getArg('outcome'),
            reason: getArg('reason')
          });
          console.log(JSON.stringify(res, null, 2));
          break;
        }

        case 'stats': {
          const res = await lib.stats();
          console.log(JSON.stringify(res, null, 2));
          break;
        }

        default:
          console.error(`Unknown command: ${cmd}`);
          console.error('Commands: remember, recall, forget, boost, dispute, validate, feedback, stats');
          process.exit(1);
      }

      process.exit(0);
    } catch (e) {
      console.error(JSON.stringify({ error: e.message }));
      process.exit(1);
    }
  })();
}
