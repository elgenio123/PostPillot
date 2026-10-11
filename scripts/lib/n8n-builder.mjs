// Small helpers that write n8n workflow JSON. The JSON files in n8n/workflows/ are the source of truth;
// this builder only makes them consistent (ids, positions, connections, shared headers).
import crypto from "node:crypto";

const APP = "{{ $env.APP_INTERNAL_URL }}";
const SECRET_HEADER = { name: "x-postpilot-secret", value: "={{ $env.POSTPILOT_SECRET }}" };

// Stable UUID from a text, so re-running the builder does not change ids
export function stableId(text) {
  const h = crypto.createHash("sha1").update(text).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Turns a JS function into Code node source: only the body is kept
export function body(fn) {
  const src = fn.toString();
  const inner = src.slice(src.indexOf("{") + 1, src.lastIndexOf("}"));
  const lines = inner.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join("\n");
}

export class Workflow {
  constructor(id, name, description) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.nodes = [];
    this.connections = {};
  }

  add(name, type, typeVersion, parameters, position, extra = {}) {
    this.nodes.push({ parameters, id: stableId(`${this.id}/${name}`), name, type, typeVersion, position, ...extra });
    return name;
  }

  connect(from, to, output = 0, input = 0) {
    const c = (this.connections[from] ??= { main: [] });
    while (c.main.length <= output) c.main.push([]);
    c.main[output].push({ node: to, type: "main", index: input });
  }

  // Connects a chain of nodes in order: chain("A", "B", "C")
  chain(...names) {
    for (let i = 0; i < names.length - 1; i++) this.connect(names[i], names[i + 1]);
  }

  note(content, position, width, height, color = 7) {
    const name = `Note ${this.nodes.filter((n) => n.type === "n8n-nodes-base.stickyNote").length + 1}`;
    this.add(name, "n8n-nodes-base.stickyNote", 1, { content, width, height, color }, position);
  }

  webhook(name, path, position) {
    return this.add(name, "n8n-nodes-base.webhook", 2, { httpMethod: "POST", path, options: {} }, position, {
      webhookId: stableId(`${this.id}/webhook/${path}`),
    });
  }

  // Stops the workflow unless the caller sent the shared secret
  secretCheck(name, webhookName, position) {
    return this.if(name, `{{ $('${webhookName}').item.json.headers['x-postpilot-secret'] === $env.POSTPILOT_SECRET }}`, position);
  }

  if(name, expression, position) {
    return this.add(name, "n8n-nodes-base.if", 2.2, {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
        conditions: [{
          id: stableId(`${this.id}/${name}/cond`),
          leftValue: `=${expression}`,
          rightValue: "",
          operator: { type: "boolean", operation: "true", singleValue: true },
        }],
        combinator: "and",
      },
      looseTypeValidation: true,
      options: {},
    }, position);
  }

  // `helpers` are extra functions appended to the node's code (e.g. a JSON reader)
  code(name, fn, position, mode = "runOnceForEachItem", helpers = []) {
    const src = [body(fn), ...helpers.map(body)].join("\n\n");
    const parameters = mode === "runOnceForEachItem" ? { mode, jsCode: src } : { jsCode: src };
    return this.add(name, "n8n-nodes-base.code", 2, parameters, position);
  }

  http(name, opts, position, extra = {}) {
    const p = { method: opts.method ?? "POST", url: opts.url, options: { timeout: opts.timeout ?? 30000 } };
    const headers = opts.headers ?? [];
    if (headers.length) {
      p.sendHeaders = true;
      p.headerParameters = { parameters: headers };
    }
    if (opts.json) {
      p.sendBody = true;
      p.specifyBody = "json";
      p.jsonBody = `={{ JSON.stringify(${opts.json}) }}`;
    }
    if (opts.binaryBody) {
      p.sendBody = true;
      p.contentType = "binaryData";
      p.inputDataFieldName = "data";
    }
    if (opts.form) {
      p.sendBody = true;
      p.contentType = "multipart-form-data";
      p.bodyParameters = { parameters: opts.form };
    }
    if (opts.query) {
      p.sendQuery = true;
      p.queryParameters = { parameters: opts.query };
    }
    if (opts.file) p.options.response = { response: { responseFormat: "file", outputPropertyName: "data" } };
    if (opts.fullResponse) p.options.response = { response: { fullResponse: true } };
    const errorHandling = opts.continueOnFail ? { onError: "continueRegularOutput" } : {};
    const retry = opts.retry ? { retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 } : {};
    return this.add(name, "n8n-nodes-base.httpRequest", 4.2, p, position, { ...errorHandling, ...retry, ...extra });
  }

  // POST to the app with the shared secret
  app(name, path, json, position, extra = {}) {
    return this.http(name, { url: `=${APP}${path}`, headers: [SECRET_HEADER], json, continueOnFail: true, ...extra }, position);
  }

  // Progress event shown in the app's live timeline
  tellApp(name, runIdExpr, fields, position) {
    const json = `{ ${fields}, executionId: $execution.id, workflow: $workflow.id }`;
    return this.app(name, `/api/internal/runs/{{ ${runIdExpr} }}/events`, json, position);
  }

  // One call to an OpenRouter chat model. `messages` and `model` are JS expressions.
  ai(name, { model, messages, json = true, extraBody = "" }, position) {
    const format = json ? "response_format: { type: 'json_object' }, " : "";
    return this.http(name, {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: [
        { name: "Authorization", value: "=Bearer {{ $env.OPENROUTER_API_KEY }}" },
        { name: "X-Title", value: "PostPilot" },
        { name: "HTTP-Referer", value: "https://github.com/postpilot-demo" },
      ],
      json: `{ model: ${model}, messages: ${messages}, ${format}${extraBody}usage: { include: true } }`,
      timeout: 120000,
      continueOnFail: true,
      retry: true,
    }, position);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      nodes: this.nodes,
      connections: this.connections,
      settings: { executionOrder: "v1", saveManualExecutions: true, saveDataSuccessExecution: "all", timezone: "Africa/Douala" },
      pinData: {},
      meta: { templateCredsSetupCompleted: true },
      tags: [],
      active: false,
    };
  }
}

export const APP_URL = APP;
export { SECRET_HEADER };
