// Builds the auto-posting workflows and creates or updates them through the n8n public API.
// Usage: N8N_API_URL=... N8N_API_KEY=... node build.mjs [--dry]
// Config lives in config.json next to this file. IDs of created workflows are written back to it.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const here = new URL('.', import.meta.url);
const configPath = new URL('config.json', here);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const dry = process.argv.includes('--dry');
const API = (process.env.N8N_API_URL || 'http://ps.taildae6a9.ts.net:5678').replace(/\/$/, '') + '/api/v1';
const KEY = process.env.N8N_API_KEY;

const sheetCred = config.credentials.googleServiceAccount
  ? { googleApi: { id: config.credentials.googleServiceAccount, name: 'Google Service Account' } }
  : undefined;
const fbCred = config.credentials.facebookGraph
  ? { facebookGraphApi: { id: config.credentials.facebookGraph, name: 'Facebook - Dien May Toan Phat' } }
  : undefined;
const hookCred = config.credentials.webhookHeaderAuth
  ? { httpHeaderAuth: { id: config.credentials.webhookHeaderAuth, name: 'Posts API token' } }
  : undefined;

function node(name, type, typeVersion, parameters, position, extra = {}) {
  return { id: randomUUID(), name, type, typeVersion, position, parameters, ...extra };
}

function code(name, jsCode, position, extra = {}) {
  return node(name, 'n8n-nodes-base.code', 2, { jsCode }, position, extra);
}

function sheet(name, operation, tab, position, extra = {}) {
  const parameters = {
    authentication: 'serviceAccount',
    resource: 'sheet',
    operation,
    documentId: { __rl: true, mode: 'id', value: config.sheetId },
    sheetName: { __rl: true, mode: 'name', value: tab },
    options: {},
  };
  if (extra.matchingColumns || operation === 'append') {
    parameters.columns = {
      mappingMode: 'autoMapInputData',
      value: {},
      matchingColumns: extra.matchingColumns || [],
      schema: [],
    };
  }
  delete extra.matchingColumns;
  const n = node(name, 'n8n-nodes-base.googleSheets', 4.7, parameters, position, extra);
  if (sheetCred) n.credentials = sheetCred;
  return n;
}

function ifNode(name, leftValue, rightValue, position) {
  return node(name, 'n8n-nodes-base.if', 2.2, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: randomUUID(),
        leftValue,
        rightValue,
        operator: { type: 'string', operation: 'equals' },
      }],
      combinator: 'and',
    },
    options: {},
  }, position);
}

function graphCall(name, urlExpr, bodyExpr, position) {
  const n = node(name, 'n8n-nodes-base.httpRequest', 4.2, {
    method: 'POST',
    url: urlExpr,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'facebookGraphApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: bodyExpr,
    options: { response: { response: { fullResponse: true, neverError: true } } },
  }, position, { onError: 'continueRegularOutput' });
  if (fbCred) n.credentials = fbCred;
  return n;
}

function connect(pairs) {
  const c = {};
  for (const [from, to, output = 0] of pairs) {
    c[from] ||= { main: [] };
    while (c[from].main.length <= output) c[from].main.push([]);
    c[from].main[output].push({ node: to, type: 'main', index: 0 });
  }
  return c;
}

const trigger = (pos) => node('Start', 'n8n-nodes-base.executeWorkflowTrigger', 1.3, { inputSource: 'passthrough' }, pos);

// Shared by adapters: turns an HTTP full response (or a thrown error) into the adapter contract.
const graphResultFn = `
function graphResult(res) {
  if (!res) return { ok: false, error: 'no response', retryable: true };
  if (res.error && !res.statusCode) {
    const msg = typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error));
    return { ok: false, error: msg.slice(0, 500), retryable: true };
  }
  const status = Number(res.statusCode || 0);
  const body = res.body || {};
  if (status >= 200 && status < 300 && !body.error) return { ok: true, body };
  const e = body.error || {};
  const transient = e.is_transient || [1, 2, 4, 17, 32, 613].includes(Number(e.code));
  return {
    ok: false,
    error: (\`HTTP \${status}: \${e.message || JSON.stringify(body)}\`).slice(0, 500),
    retryable: status >= 500 || status === 429 || Boolean(transient),
  };
}`;

function dryrunAdapter() {
  const nodes = [
    trigger([0, 0]),
    code('Result', `return $input.all().map(i => ({ json: {
  delivery_id: i.json.delivery_id,
  ok: true,
  post_url: 'dryrun://' + i.json.delivery_id,
} }));`, [240, 0]),
  ];
  return { name: 'Adapter – dryrun', nodes, connections: connect([['Start', 'Result']]) };
}

function facebookPostAdapter() {
  const fb = config.facebook;
  const nodes = [
    trigger([0, 0]),
    code('Build request', `const PAGE_ID = ${JSON.stringify(fb.pageId)};
const GRAPH = 'https://graph.facebook.com/${fb.graphVersion}';
return $input.all().map(i => {
  const p = i.json;
  const media = String(p.media_url || '').trim();
  const message = String(p.content || '').trim();
  return { json: media
    ? { url: \`\${GRAPH}/\${PAGE_ID}/photos\`, body: { url: media, caption: message, published: true } }
    : { url: \`\${GRAPH}/\${PAGE_ID}/feed\`, body: { message } } };
});`, [240, 0]),
    graphCall('Graph API', '={{ $json.url }}', '={{ JSON.stringify($json.body) }}', [480, 0]),
    code('Result', `${graphResultFn}
const input = $('Start').first().json;
const r = graphResult($input.first().json);
if (!r.ok) return [{ json: { delivery_id: input.delivery_id, ok: false, error: r.error, retryable: r.retryable } }];
const postId = r.body.post_id || r.body.id;
return [{ json: { delivery_id: input.delivery_id, ok: true, post_url: 'https://www.facebook.com/' + postId } }];`, [720, 0]),
  ];
  return {
    name: 'Adapter – facebook_post',
    nodes,
    connections: connect([['Start', 'Build request'], ['Build request', 'Graph API'], ['Graph API', 'Result']]),
  };
}

function facebookReelAdapter() {
  const fb = config.facebook;
  const nodes = [
    trigger([0, 0]),
    code('Build request', `return $input.all().map(i => ({ json: {
  page_id: ${JSON.stringify(fb.pageId)},
  graph: 'https://graph.facebook.com/${fb.graphVersion}',
  rupload: 'https://rupload.facebook.com/video-upload/${fb.graphVersion}',
  file_url: String(i.json.media_url || '').trim(),
  description: String(i.json.content || '').trim(),
} }));`, [240, 0]),
    graphCall('Start upload', "={{ $('Build request').first().json.graph + '/' + $('Build request').first().json.page_id + '/video_reels' }}",
      '={{ JSON.stringify({ upload_phase: "start" }) }}', [480, 0]),
    (() => {
      const n = node('Upload from URL', 'n8n-nodes-base.httpRequest', 4.2, {
        method: 'POST',
        url: "={{ $('Build request').first().json.rupload + '/' + ($json.body && $json.body.video_id) }}",
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'facebookGraphApi',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'file_url', value: "={{ $('Build request').first().json.file_url }}" }] },
        options: { response: { response: { fullResponse: true, neverError: true } } },
      }, [720, 0], { onError: 'continueRegularOutput' });
      if (fbCred) n.credentials = fbCred;
      return n;
    })(),
    graphCall('Publish', "={{ $('Build request').first().json.graph + '/' + $('Build request').first().json.page_id + '/video_reels' }}",
      "={{ JSON.stringify({ upload_phase: 'finish', video_id: $('Start upload').first().json.body.video_id, video_state: 'PUBLISHED', description: $('Build request').first().json.description }) }}",
      [960, 0]),
    code('Result', `${graphResultFn}
const input = $('Start').first().json;
const steps = [['start upload', $('Start upload').first().json], ['upload', $('Upload from URL').first().json], ['publish', $('Publish').first().json]];
for (const [label, res] of steps) {
  const r = graphResult(res);
  if (!r.ok) return [{ json: { delivery_id: input.delivery_id, ok: false, error: label + ': ' + r.error, retryable: r.retryable } }];
}
const videoId = $('Start upload').first().json.body.video_id;
return [{ json: { delivery_id: input.delivery_id, ok: true, post_url: 'https://www.facebook.com/reel/' + videoId } }];`, [1200, 0]),
  ];
  return {
    name: 'Adapter – facebook_reel',
    nodes,
    connections: connect([
      ['Start', 'Build request'], ['Build request', 'Start upload'], ['Start upload', 'Upload from URL'],
      ['Upload from URL', 'Publish'], ['Publish', 'Result'],
    ]),
  };
}

function createPostJob() {
  const hook = node('Webhook', 'n8n-nodes-base.webhook', 2, {
    httpMethod: 'POST',
    path: 'posts',
    authentication: 'headerAuth',
    responseMode: 'responseNode',
    options: {},
  }, [0, 0], { webhookId: config.webhookId });
  if (hookCred) hook.credentials = hookCred;
  const nodes = [
    hook,
    sheet('Read Routes', 'read', 'Routes', [240, 0], { alwaysOutputData: true, executeOnce: true }),
    code('Validate', `const b = $('Webhook').first().json.body || {};
const routes = $('Read Routes').all().map(i => i.json).filter(r => String(r.format || '').trim());
const list = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(Boolean);
const fail = error => [{ json: { ok: 'false', error } }];

const format = String(b.format || '').trim();
const route = routes.find(r => String(r.format).trim() === format);
if (!route) return fail(\`unknown format "\${format}". Known: \${routes.map(r => r.format).join(', ')}\`);

const missing = list(route.required).filter(f => !String(b[f] ?? '').trim());
if (missing.length) return fail(\`missing fields for \${format}: \${missing.join(', ')}\`);

let when = DateTime.now().setZone('Asia/Ho_Chi_Minh');
if (b.scheduled_at) {
  when = DateTime.fromISO(String(b.scheduled_at), { zone: 'Asia/Ho_Chi_Minh' });
  if (!when.isValid) return fail(\`invalid scheduled_at "\${b.scheduled_at}". Use ISO 8601, e.g. 2026-10-21T09:00:00+07:00\`);
}

const now = DateTime.now().setZone('Asia/Ho_Chi_Minh');
const id = 'p_' + now.toFormat('yyyyMMddHHmmss') + '_' + Math.random().toString(36).slice(2, 6);
return [{ json: { ok: 'true', row: {
  id,
  created_at: now.toISO({ suppressMilliseconds: true }),
  format,
  title: String(b.title || ''),
  content: String(b.content || ''),
  media_url: String(b.media_url || ''),
  scheduled_at: when.toISO({ suppressMilliseconds: true }),
  targets_override: list(b.targets).join(', '),
  status: 'Ready',
  updated_at: now.toISO({ suppressMilliseconds: true }),
  error: '',
} } }];`, [480, 0]),
    ifNode('Valid?', '={{ $json.ok }}', 'true', [720, 0]),
    code('Row', `return $input.all().map(i => ({ json: i.json.row }));`, [960, -100]),
    sheet('Append Posts', 'append', 'Posts', [1200, -100]),
    node('Respond 201', 'n8n-nodes-base.respondToWebhook', 1.1, {
      respondWith: 'json',
      responseBody: "={{ JSON.stringify({ ok: true, id: $('Validate').first().json.row.id, status: 'Ready', scheduled_at: $('Validate').first().json.row.scheduled_at }) }}",
      options: { responseCode: 201 },
    }, [1440, -100]),
    node('Respond 400', 'n8n-nodes-base.respondToWebhook', 1.1, {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ ok: false, error: $json.error }) }}',
      options: { responseCode: 400 },
    }, [960, 100]),
  ];
  return {
    name: 'Job 1 – Create post (API)',
    nodes,
    connections: connect([
      ['Webhook', 'Read Routes'], ['Read Routes', 'Validate'], ['Validate', 'Valid?'],
      ['Valid?', 'Row', 0], ['Valid?', 'Respond 400', 1],
      ['Row', 'Append Posts'], ['Append Posts', 'Respond 201'],
    ]),
  };
}

function publishJob() {
  const nodes = [
    node('Every 5 minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, {
      rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] },
    }, [0, 0]),
    sheet('Read Posts', 'read', 'Posts', [220, 0], { alwaysOutputData: true }),
    sheet('Read Routes', 'read', 'Routes', [440, 0], { alwaysOutputData: true, executeOnce: true }),
    sheet('Read Targets', 'read', 'Targets', [660, 0], { alwaysOutputData: true, executeOnce: true }),
    sheet('Read Deliveries', 'read', 'Deliveries', [880, 0], { alwaysOutputData: true, executeOnce: true }),
    code('Plan', `const MAX_ATTEMPTS = 3;
const STUCK_MINUTES = 30;
const ZONE = 'Asia/Ho_Chi_Minh';
const now = DateTime.now().setZone(ZONE);
const stamp = now.toISO({ suppressMilliseconds: true });

const rows = (node, key) => $(node).all().map(i => i.json).filter(r => String(r[key] ?? '').trim());
const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const parseTime = s => {
  let d = DateTime.fromISO(String(s || ''), { zone: ZONE });
  if (!d.isValid) d = DateTime.fromSQL(String(s || ''), { zone: ZONE });
  return d;
};

const posts = rows('Read Posts', 'id');
const routes = Object.fromEntries(rows('Read Routes', 'format').map(r => [String(r.format).trim(), r]));
const targets = Object.fromEntries(rows('Read Targets', 'target').map(r => [String(r.target).trim(), r]));
const byPost = {};
for (const d of rows('Read Deliveries', 'delivery_id')) (byPost[String(d.post_id)] ||= []).push(d);

const out = [];
const postUpdate = (id, status, error = '') => out.push({ json: { kind: 'post_update', row: { id, status, error, updated_at: stamp } } });
const deliveryUpdate = row => out.push({ json: { kind: 'delivery_update', row: { ...row, updated_at: stamp } } });

function deliver(post, target, attempts) {
  const delivery_id = post.id + ':' + target;
  const t = targets[target];
  const enabled = t && String(t.enabled).trim().toUpperCase() === 'TRUE' && String(t.workflow_id || '').trim();
  if (!enabled) {
    deliveryUpdate({ delivery_id, post_id: post.id, target, status: 'Failed', attempts, error: 'target not registered or disabled in Targets' });
    return;
  }
  out.push({ json: {
    kind: 'deliver',
    workflow_id: String(t.workflow_id).trim(),
    delivery_id, post_id: post.id, target, attempts: attempts + 1,
    format: post.format, title: post.title, content: post.content, media_url: post.media_url,
    posting_row: { delivery_id, post_id: post.id, target, status: 'Posting', attempts: attempts + 1, updated_at: stamp, error: '' },
  } });
}

for (const p of posts) {
  const status = String(p.status || '').trim();
  if (status !== 'Ready' && status !== 'Processing') continue;

  if (status === 'Ready') {
    const when = parseTime(p.scheduled_at);
    if (!when.isValid) { postUpdate(p.id, 'Failed', 'invalid scheduled_at: ' + p.scheduled_at); continue; }
    if (when > now) continue;
  }

  const names = list(p.targets_override).length ? list(p.targets_override) : list(routes[String(p.format).trim()]?.targets);
  if (!names.length) { postUpdate(p.id, 'Failed', 'no route for format ' + p.format); continue; }
  if (status === 'Ready') postUpdate(p.id, 'Processing');

  const existing = Object.fromEntries((byPost[String(p.id)] || []).map(d => [String(d.target).trim(), d]));
  let finals = 0, posted = 0;
  for (const target of names) {
    const d = existing[target];
    if (!d) { deliver(p, target, 0); continue; }
    const ds = String(d.status).trim();
    const attempts = Number(d.attempts || 0);
    if (ds === 'Posted') { finals++; posted++; continue; }
    if (ds === 'Failed') { finals++; continue; }
    if (ds === 'Pending' && attempts < MAX_ATTEMPTS) { deliver(p, target, attempts); continue; }
    if (ds === 'Pending') { deliveryUpdate({ delivery_id: d.delivery_id, status: 'Failed', error: d.error || 'max attempts reached' }); continue; }
    if (ds === 'Posting') {
      const since = parseTime(d.updated_at);
      if (!since.isValid || now.diff(since, 'minutes').minutes > STUCK_MINUTES) {
        deliveryUpdate({ delivery_id: d.delivery_id, status: 'Failed', error: 'stuck in Posting; check the platform before retrying' });
      }
    }
  }
  if (status === 'Processing' && finals === names.length) {
    postUpdate(p.id, posted === names.length ? 'Done' : posted === 0 ? 'Failed' : 'Partial', posted === names.length ? '' : 'see Deliveries');
  }
}
return out;`, [1100, 0]),
    ifNode('Deliver?', '={{ $json.kind }}', 'deliver', [1320, 0]),
    code('Posting row', `return $input.all().map(i => ({ json: i.json.posting_row }));`, [1540, -200]),
    sheet('Mark Posting', 'appendOrUpdate', 'Deliveries', [1760, -200], { matchingColumns: ['delivery_id'] }),
    node('Run adapter', 'n8n-nodes-base.executeWorkflow', 1.4, {
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: '={{ $json.workflow_id }}' },
      workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
      mode: 'each',
      options: { waitForSubWorkflow: true },
    }, [1540, 0], { onError: 'continueRegularOutput' }),
    code('Delivery result', `const MAX_ATTEMPTS = 3;
const stamp = DateTime.now().setZone('Asia/Ho_Chi_Minh').toISO({ suppressMilliseconds: true });
const sent = $('Deliver?').all(0).map(i => i.json);
return $input.all().map((item, i) => {
  const r = item.json || {};
  const d = sent.find(x => x.delivery_id === r.delivery_id) || sent[i];
  const row = { delivery_id: d.delivery_id, attempts: d.attempts, updated_at: stamp };
  if (r.ok === true) return { json: { ...row, status: 'Posted', post_url: r.post_url || '', posted_at: stamp, error: '' } };
  const error = String(r.error && r.error.message ? r.error.message : r.error || 'adapter returned no result').slice(0, 500);
  const retry = r.retryable !== false && d.attempts < MAX_ATTEMPTS;
  return { json: { ...row, status: retry ? 'Pending' : 'Failed', error } };
});`, [1760, 0]),
    sheet('Save result', 'appendOrUpdate', 'Deliveries', [1980, 0], { matchingColumns: ['delivery_id'] }),
    ifNode('Post update?', '={{ $json.kind }}', 'post_update', [1540, 200]),
    code('Post row', `return $input.all().map(i => ({ json: i.json.row }));`, [1760, 150]),
    sheet('Update Posts', 'update', 'Posts', [1980, 150], { matchingColumns: ['id'] }),
    code('Delivery row', `return $input.all().map(i => ({ json: i.json.row }));`, [1760, 300]),
    sheet('Save delivery', 'appendOrUpdate', 'Deliveries', [1980, 300], { matchingColumns: ['delivery_id'] }),
  ];
  return {
    name: 'Job 2 – Publish (dispatcher)',
    nodes,
    connections: connect([
      ['Every 5 minutes', 'Read Posts'], ['Read Posts', 'Read Routes'], ['Read Routes', 'Read Targets'],
      ['Read Targets', 'Read Deliveries'], ['Read Deliveries', 'Plan'], ['Plan', 'Deliver?'],
      // Mark Posting sits above Run adapter, so with execution order v1 it finishes first.
      ['Deliver?', 'Posting row', 0], ['Deliver?', 'Run adapter', 0], ['Deliver?', 'Post update?', 1],
      ['Posting row', 'Mark Posting'], ['Run adapter', 'Delivery result'], ['Delivery result', 'Save result'],
      ['Post update?', 'Post row', 0], ['Post update?', 'Delivery row', 1],
      ['Post row', 'Update Posts'], ['Delivery row', 'Save delivery'],
    ]),
  };
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const builders = {
  dryrun: dryrunAdapter,
  facebook_post: facebookPostAdapter,
  facebook_reel: facebookReelAdapter,
  job1: createPostJob,
  job2: publishJob,
};

for (const [key, build] of Object.entries(builders)) {
  const wf = build();
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1', timezone: 'Asia/Ho_Chi_Minh', saveManualExecutions: true },
  };
  writeFileSync(new URL(`${key}.json`, here), JSON.stringify(payload, null, 2) + '\n');
  if (dry) { console.log(`wrote ${key}.json`); continue; }
  const id = config.workflowIds[key];
  const saved = id ? await api('PUT', `/workflows/${id}`, payload) : await api('POST', '/workflows', payload);
  config.workflowIds[key] = saved.id;
  console.log(`${id ? 'updated' : 'created'} ${key}: ${saved.name} (${saved.id})`);
}
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
