import { C as parseCodeBuddyAuth, S as defaultAuthDirCandidates, _ as CODEBUDDY_AUTH_FILENAME, a as processStartTimeMs, b as codebuddyOwnAuthPath, d as normalizeCredits, f as prepareChatBody, g as filterEnabledModels, h as FALLBACK_CODEBUDDY_MODELS, i as isHeartbeatProcessAlive, l as CodeBuddyUpstreamClient, m as CodeBuddyCatalog, n as clearHostHeartbeat, o as readHostHeartbeat, p as regionOf, r as codebuddyHostHeartbeatPath, s as writeHostHeartbeat, t as CODEBUDDY_HOST_HEARTBEAT_FILENAME, u as classifyUpstreamError, v as CODEBUDDY_AUTH_FILE_ENV, x as defaultAuthDir, y as CodeBuddyCredentialStore } from "./host-heartbeat-CZcc5IWy.js";
import z from "@deepseek-ai/schemastery";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
//#region src/adapter.ts
/**
* The `codebuddy` pi-ai provider: one loopback-backed adapter registered
* into the Harness LLM seam, assembled from public `dsh-llm-pi-ai`
* extension points the way `dsh-codex-connect` assembles its Codex route.
*
* @module dsh-codebuddy-cli/adapter
*/
/** Provider route this bundle owns. */
const CODEBUDDY_PROVIDER = "codebuddy-cli";
/** Provider idle ceiling while one stream read is outstanding. */
const CODEBUDDY_STREAM_IDLE_TIMEOUT_MS = 3e5;
/**
* Image-request budgets at the dsh-llm-pi-ai defaults; the profile type made
* them required in 0.1.1-rc.2. They bound requests to models whose catalog
* entry declares `supportsImages`; text-only models never receive images.
*/
const REQUEST_IMAGE_BUDGETS = {
	maxRequestImageBytes: 20971520,
	requestImagePixelBudget: 4194304,
	requestImageMaxBytes: 1048576
};
/**
* Inert pi-ai auth plane. The codebuddy route authenticates only through the
* shim shared secret resolved per request by `resolveApiKey`, so pi-ai's own
* credential lifecycle and ambient discovery must never manufacture a
* credential for it. `PiAiAdapterOptions.auth` is required since 0.1.1-rc.2;
* every ambient question here answers "nothing stored, nothing set".
*/
const INERT_AUTH = {
	credentials: {
		async read() {},
		async list() {
			return [];
		},
		async modify() {
			throw new Error("dsh-codebuddy-cli: the codebuddy route has no pi-ai credential lifecycle");
		},
		async delete() {}
	},
	authContext: {
		async env() {},
		async fileExists() {
			return false;
		}
	}
};
/** No per-token pricing is knowable for a subscription quota; report zero. */
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
/**
* The suffix appended to a model's display name so its billing rate is visible
* wherever the name is shown.
*
* The separator is a middle dot rather than a hyphen or colon: model names
* already contain hyphens (`GLM-5.3-Flash`, `Deepseek-V4-Flash`), so a hyphen
* separator would be ambiguous about where the name ends and the rate begins.
*/
const RATE_SEPARATOR = " · ";
/**
* Append the billing rate to one model's display name.
*
* The rate AND the declared promo badges ride the *name* alone: since DSH
* 0.1.2 the composer's model seat (`ModelSelect`) renders `model.name` only —
* `description` is no longer read there at all (the 0.1.1-era client rendered
* it, which is why the badges used to be visible in the seat). The `/model`
* popup renders the name too, so a separate `description` copy would either
* duplicate (rate) or vanish (badges) depending on client generation.
*
* This is display-only and cannot affect routing: the wire request is built
* from `model.id` (pi-ai's completions API sets `model: model.id`), the
* selection a picker submits is `{provider, model: id, reasoningEffort}`, and
* `dsh-llm` validates `name` as a non-empty string without comparing its
* contents. Nothing in the host resolves a model *by* name.
*/
/**
* The catalog display suffix: the billing rate followed by the declared promo
* badges (`限时免费`, `夜间折扣`), or undefined when the row carries neither.
* The badge labels are the upstream's own spellings and the host seam has no
* locale service, so non-Chinese UIs see them verbatim — accepted until the
* picker grows a localized badge slot.
*/
function displaySuffix(info) {
	const parts = [normalizeCredits(info.billing?.credits), ...info.billing?.badges ?? []].filter((part) => part !== void 0 && part !== "");
	return parts.length === 0 ? void 0 : parts.join(" · ");
}
/** Append the catalog display suffix to one model's display name. */
function withCatalogDisplay(name, info) {
	const suffix = displaySuffix(info);
	return suffix === void 0 ? name : `${name}${RATE_SEPARATOR}${suffix}`;
}
/**
* Resolve a CodeBuddy model's reasoning capability into pi-ai's
* `thinkingLevelMap` (every level pinned to its wire spelling or `null` for
* unsupported), mirroring `dsh-llm-pi-ai`'s own `resolveModelReasoning`.
*
* Declared sets only: a thinking control is offered exactly when the upstream
* catalog declares a `supportedEfforts` list, and it offers exactly the
* declared values. Rows without a list (the older `{effort, summary}` shape)
* get no control at all — their selectable set is client-side knowledge the
* catalog does not carry (the desktop app differs per model there: GLM-5.2
* gets a thinking control while MiniMax-M3 and Kimi-K2.6 do not, though their
* catalog rows are identical), and another implementation against the same
* upstream (codebuddy2api) gates on the declared set and downgrades
* out-of-set values rather than passing them through, so sending an
* undeclared value risks a 400. Such models never carry `reasoning_effort`
* on the wire; the upstream applies its own default.
* `off` is offered only when the model explicitly reports thinking can be
* disabled (`canDisableThinking === true`).
*/
function reasoningFields(info) {
	const reasoning = info.reasoning;
	if (reasoning === void 0 || reasoning.supports !== true) return { reasoning: false };
	const efforts = reasoning.supportedEfforts;
	if (efforts === void 0 || efforts.length === 0) return { reasoning: false };
	return {
		reasoning: true,
		thinkingLevelMap: {
			off: reasoning.canDisableThinking === true ? "off" : null,
			minimal: null,
			low: efforts.includes("low") ? "low" : null,
			medium: efforts.includes("medium") ? "medium" : null,
			high: efforts.includes("high") ? "high" : null,
			xhigh: efforts.includes("xhigh") ? "xhigh" : null,
			max: efforts.includes("max") ? "max" : null
		}
	};
}
/** Build one pi-ai model descriptor pointing at the loopback shim. */
function toPiModel(info, baseUrl) {
	return {
		id: info.id,
		name: info.name,
		api: "openai-completions",
		provider: CODEBUDDY_PROVIDER,
		baseUrl,
		input: info.supportsImages === true ? ["text", "image"] : ["text"],
		...reasoningFields(info),
		cost: NO_COST,
		contextWindow: info.contextWindow,
		maxTokens: info.maxTokens
	};
}
/**
* Assemble the adapter. The provider's `getModels` reads the live catalog,
* and every model's `baseUrl` is re-resolved per read so the shim's
* ephemeral port applies from the first snapshot after startup.
*/
function createCodeBuddyAdapter(options) {
	const { shim, store, catalog, enabledModels, resolveAttachments } = options;
	const buildModels = () => {
		const baseUrl = `${shim.baseUrl()}/v1`;
		return catalog.current().map((info) => toPiModel(info, baseUrl));
	};
	const provider = {
		...createProvider({
			id: CODEBUDDY_PROVIDER,
			name: "CodeBuddy CLI",
			auth: { apiKey: {
				name: "CodeBuddy OAuth bearer token",
				async resolve({ credential }) {
					const apiKey = credential?.key;
					return apiKey === void 0 || apiKey.length === 0 ? void 0 : {
						auth: { apiKey },
						source: "CodeBuddy"
					};
				}
			} },
			models: buildModels(),
			api: openAICompletionsApi()
		}),
		getModels: () => buildModels()
	};
	const profile = {
		provider: CODEBUDDY_PROVIDER,
		displayName: "CodeBuddy CLI",
		streamIdleTimeoutMs: CODEBUDDY_STREAM_IDLE_TIMEOUT_MS,
		retryPolicy: resolveRetryPolicy(void 0, "dsh-codebuddy-cli retryPolicy"),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		...REQUEST_IMAGE_BUDGETS,
		piProvider: provider
	};
	let profiles = /* @__PURE__ */ new Map([[CODEBUDDY_PROVIDER, profile]]);
	return {
		adapter: new CodeBuddyPiAiAdapter(catalog, enabledModels, {
			profiles: () => profiles,
			auth: INERT_AUTH,
			resolveApiKey: async () => shim.token(),
			...resolveAttachments === void 0 ? {} : { resolveAttachments }
		}),
		invalidate: () => {
			profiles = /* @__PURE__ */ new Map([[CODEBUDDY_PROVIDER, profile]]);
		}
	};
}
/**
* The CodeBuddy route's adapter: `PiAiAdapter` with the billing rate folded
* into the catalog answers it returns to the DSH model pickers.
*
* `PiAiAdapter.listModels()` and `.resolveModel()` build their answers straight
* from the pi-ai descriptors, which carry no billing fact, so the rate is
* layered on here by looking the model up in the live catalog. Both overrides
* delegate to `super` and then rewrite only the display fields, so streaming,
* capability resolution, and effort mapping stay exactly as `dsh-llm-pi-ai`
* implements them.
*
* A model missing from the catalog (an id the shim would serve but the last
* upstream refresh did not list) falls through with its name untouched rather
* than being dropped: catalog membership is advisory, and the seam tolerates
* serving an unlisted id.
*/
var CodeBuddyPiAiAdapter = class extends PiAiAdapter {
	catalog;
	enabledModels;
	constructor(catalog, enabledModels, options) {
		super(options);
		this.catalog = catalog;
		this.enabledModels = enabledModels;
	}
	/** Catalog entry for one model id, or undefined when the catalog omits it. */
	infoFor(model) {
		return this.catalog.current().find((entry) => entry.id === model);
	}
	/**
	* The enabled-model allowlist narrows this answer only — the *offer* surface.
	*
	* Dispatch deliberately stays whole: `resolveModel` below, the pi-ai
	* provider's own `getModels`, and the shim's `/v1/models` all keep serving
	* the complete catalog. A session already pinned to a model the user later
	* unchecked therefore keeps streaming instead of failing to resolve, and an
	* agent preset naming that id stays valid; the model simply stops being
	* offered in the pickers, which is exactly what the setting asks for.
	*/
	async listModels(provider) {
		const models = await super.listModels(provider);
		const allowed = filterEnabledModels(this.catalog.current(), this.enabledModels?.());
		const catalogIds = new Set(this.catalog.current().map((entry) => entry.id));
		const allowedIds = new Set(allowed.map((entry) => entry.id));
		return models.filter((model) => !catalogIds.has(model.id) || allowedIds.has(model.id)).map((model) => {
			const info = this.infoFor(model.id);
			if (info === void 0) return model;
			return {
				...model,
				name: withCatalogDisplay(model.name, info)
			};
		});
	}
	async resolveModel(provider, model, signal) {
		const resolved = await super.resolveModel(provider, model, signal);
		const info = this.infoFor(model);
		if (info === void 0) return resolved;
		return {
			...resolved,
			name: withCatalogDisplay(resolved.name, info)
		};
	}
};
//#endregion
//#region src/loopback.ts
/**
* Shared loopback gates for the plugin's local HTTP surfaces: the loopback
* shim and the same-origin web-status route. Both are only ever meant to be
* addressed through the machine's loopback interface.
*
* @module dsh-codebuddy-cli/loopback
*/
/** Loopback hostnames a local plugin surface may be addressed by. */
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"localhost",
	"[::1]"
]);
/** Strip the optional :port from a Host header value, IPv6-bracket aware. */
function hostnameOfHost(host) {
	let hostname = host.trim().toLowerCase();
	if (hostname.startsWith("[")) {
		const end = hostname.indexOf("]");
		return end === -1 ? hostname : hostname.slice(0, end + 1);
	}
	const colon = hostname.lastIndexOf(":");
	if (colon !== -1 && !hostname.slice(0, colon).includes(":") && /^\d+$/.test(hostname.slice(colon + 1))) hostname = hostname.slice(0, colon);
	return hostname;
}
/**
* The request's Host header must name the loopback interface. A DNS-rebinding
* page (attacker domain re-resolved to 127.0.0.1) sends its own domain in
* Host, so this check drops those before any routing happens.
*/
function hostIsLoopback(host) {
	if (host === void 0 || host.trim() === "") return false;
	return LOOPBACK_HOSTS.has(hostnameOfHost(host));
}
/**
* A browser-sent Origin (present header) must be loopback. Non-browser
* clients (the plugin's own fetch calls) send no Origin at all and pass.
*/
function originIsLoopback(origin) {
	if (origin === void 0 || origin.trim() === "") return true;
	try {
		const { hostname } = new URL(origin);
		return LOOPBACK_HOSTS.has(hostname) || hostname === "::1";
	} catch {
		return false;
	}
}
//#endregion
//#region src/shim.ts
/**
* Loopback OpenAI-compatible endpoint. The pi-ai provider points here; the
* shim applies the CodeBuddy wire quirks (forced streaming, string
* `tool_choice`, CLI-shaped headers) and forwards to the real upstream.
* It binds 127.0.0.1 only and never serves another interface.
*
* Inbound hardening: the loopback bind alone is not a trust boundary (any
* local process or a DNS-rebinding page can reach 127.0.0.1), so every
* request must carry a loopback Host header, browser-sent Origins must be
* loopback, chat POSTs must be application/json, and the Authorization
* header must carry the shim's per-process shared secret. The plugin's
* own client satisfies all four by construction; local attackers cannot
* read the secret out of the plugin process's memory.
*
* @module dsh-codebuddy-cli/shim
*/
const REQUEST_BODY_LIMIT = 67108864;
/** Chat-completion POSTs must carry a JSON body type (simple-request CSRF drops here). */
function isJsonContentType(req) {
	const type = req.headers["content-type"];
	return typeof type === "string" && type.trim().toLowerCase().startsWith("application/json");
}
/** HTTP status each upstream failure class surfaces as. */
const KIND_STATUS = {
	hard_credit: 402,
	soft_rate: 429,
	session_dead: 401,
	not_found: 502,
	server: 502,
	client: 400
};
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
function writeOpenAIError(res, status, kind, message) {
	writeJson(res, status, { error: {
		message,
		type: kind,
		code: kind
	} });
}
/** Read a request body with a size cap; over-limit bodies fail the request. */
function readBody$1(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > REQUEST_BODY_LIMIT) {
				reject(/* @__PURE__ */ new Error("request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}
/**
* Start the loopback endpoint. Requests carry any bearer; the loopback bind
* is the boundary, and the upstream credential comes from the store alone.
*/
function createCodeBuddyShim(options) {
	const { store, client, catalog } = options;
	const logger = options.logger;
	const SHARED_SECRET = randomBytes(32).toString("base64url");
	/** Constant-time bearer check; absent or mismatched bearers are rejected. */
	function bearerOk(req) {
		const header = req.headers.authorization;
		if (typeof header !== "string") return false;
		const match = /^Bearer\s+(.+)$/i.exec(header.trim());
		if (match === null) return false;
		const presented = match[1];
		const expected = SHARED_SECRET;
		const a = Buffer.from(presented);
		const b = Buffer.from(expected);
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	}
	const server = createServer((req, res) => {
		handle(req, res);
	});
	const ready = new Promise((resolve, reject) => {
		server.once("listening", () => resolve());
		server.once("error", reject);
	});
	server.listen(0, "127.0.0.1");
	const baseUrl = () => {
		const address = server.address();
		if (address === null || typeof address === "string") throw new Error("codebuddy shim has no listening address");
		return `http://127.0.0.1:${address.port}`;
	};
	async function handle(req, res) {
		try {
			if (!hostIsLoopback(req.headers.host)) {
				writeOpenAIError(res, 403, "host_not_allowed", "Host header must name the loopback interface");
				return;
			}
			if (!originIsLoopback(req.headers.origin)) {
				writeOpenAIError(res, 403, "origin_not_allowed", "Origin must be a loopback origin");
				return;
			}
			if (!bearerOk(req)) {
				writeOpenAIError(res, 401, "unauthorized", "missing or invalid Authorization bearer");
				return;
			}
			const url = req.url ?? "/";
			if (req.method === "GET" && (url === "/healthz" || url === "/healthz/")) {
				writeJson(res, 200, { ok: true });
				return;
			}
			if (req.method === "GET" && (url === "/v1/models" || url === "/v1/models/")) {
				writeJson(res, 200, {
					object: "list",
					data: catalog.current().map((model) => ({
						id: model.id,
						object: "model",
						created: 0,
						owned_by: "codebuddy"
					}))
				});
				return;
			}
			if (req.method === "POST" && (url === "/v1/chat/completions" || url === "/v1/chat/completions/")) {
				await chatCompletions(req, res);
				return;
			}
			writeOpenAIError(res, 404, "not_found", `no such route: ${req.method} ${url}`);
		} catch (error) {
			if (!res.headersSent) writeOpenAIError(res, 500, "internal", String(error));
			else res.end();
		}
	}
	async function chatCompletions(req, res) {
		if (!isJsonContentType(req)) {
			writeOpenAIError(res, 415, "unsupported_media_type", "Content-Type must be application/json");
			return;
		}
		let credential;
		try {
			credential = await store.resolve();
		} catch (error) {
			writeOpenAIError(res, 401, "not_signed_in", String(error));
			return;
		}
		const raw = (await readBody$1(req)).toString("utf8");
		const prepared = prepareChatBody(raw);
		const controller = new AbortController();
		req.on("close", () => controller.abort());
		const result = await client.chatStream(credential, prepared, controller.signal);
		if (!result.ok) {
			writeOpenAIError(res, KIND_STATUS[result.kind], result.kind, `codebuddy upstream ${result.kind} (http ${result.status}): ${result.message.slice(0, 400)}`);
			return;
		}
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			"X-Accel-Buffering": "no"
		});
		let sawDone = false;
		const body = Readable.fromWeb(result.response.body);
		body.on("data", (chunk) => {
			if (chunk.includes("[DONE]")) sawDone = true;
		});
		body.on("error", (error) => {
			logger?.warn("dsh-codebuddy-cli: upstream stream failed mid-flight", error);
			if (!sawDone && res.writable) res.end("data: [DONE]\n\n");
		});
		body.pipe(res);
	}
	return {
		ready,
		baseUrl,
		token: () => SHARED_SECRET,
		close: () => new Promise((resolve, reject) => {
			server.close(() => resolve());
			server.closeAllConnections();
			server.once("error", reject);
		})
	};
}
//#endregion
//#region src/status-paths.ts
/** Node-free constants and types shared by the Host and browser halves. */
/** Plugin-owned status endpoint consumed by its browser half. */
const CODEBUDDY_STATUS_PATH = "/plugins/dsh-codebuddy-cli/status";
/**
* Plugin-owned write endpoint for the enabled-model selection.
*
* The card writes its selection through this route rather than the host's
* generic settings form: the choice is a set of checkboxes over the live
* catalog, which a schema-rendered string-array field cannot express. The
* handler applies the same loopback gate as the status route and additionally
* requires a loopback `Origin`, because unlike the GET it mutates state.
*/
const CODEBUDDY_MODELS_PATH = "/plugins/dsh-codebuddy-cli/enabled-models";
//#endregion
//#region src/web-status.ts
/** Largest enabled-model write the route accepts (bounds an untrusted body). */
const MODELS_BODY_LIMIT = 65536;
/** Redact token-like content before it crosses to the browser. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").slice(0, 500);
}
function json(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
/**
* The request must be addressed to the loopback interface, and a
* browser-attached Origin must be loopback too. The Host check drops
* DNS-rebinding pages (their Host is the attacker's domain, not loopback);
* the card's same-origin fetches carry no Origin and pass on Host alone.
*/
function loopbackRequest(req) {
	return hostIsLoopback(req.headers.host) && originIsLoopback(req.headers.origin);
}
/**
* The composer dock polls the status route alongside the card's own polling,
* and a live billing upstream call per poll would multiply the CodeBuddy
* billing endpoint's traffic for no user-visible gain (credit figures move
* only when the user spends). A short TTL collapses concurrent and
* back-to-back document builds into one upstream call.
*/
const CREDITS_CACHE_TTL_MS = 3e4;
/**
* Build the whole-catalog rate/name maps for the composer dock, or undefined
* when the catalog is empty. Every served model appears (not only promo rows):
* the dock resolves the multiplier of whatever model the session currently
* has selected.
*/
function rateMapOf(models) {
	if (models.length === 0) return void 0;
	const rates = {};
	const names = {};
	for (const model of models) {
		names[model.id] = model.name;
		const rate = normalizeCredits(model.billing?.credits);
		if (rate !== void 0) rates[model.id] = rate;
	}
	return {
		rates,
		names
	};
}
/**
* Build the card's checkbox list: every served model with the offered state the
* Host actually applies.
*
* `restricted` reports whether the stored selection narrows anything, computed
* the same way the adapter's filter decides it (absent, empty, or fully stale
* selections restrict nothing) so the card and the picker can never disagree
* about what is offered.
*
* @param models - the full catalog.
* @param enabled - the stored allowlist, or undefined when none is stored.
* @param writable - whether a settings provider could accept a write.
* @returns the selection block, or undefined for an empty catalog.
*/
function selectionOf(models, enabled, writable) {
	if (models.length === 0) return void 0;
	const offered = new Set(filterEnabledModels(models, enabled).map((model) => model.id));
	return {
		choices: models.map((model) => {
			const rate = normalizeCredits(model.billing?.credits);
			return {
				id: model.id,
				name: model.name,
				enabled: offered.has(model.id),
				...model.billing?.free === true ? { free: true } : {},
				...model.billing?.badges !== void 0 && model.billing.badges.length > 0 ? { badges: model.billing.badges } : {},
				...rate === void 0 ? {} : { credits: rate }
			};
		}),
		restricted: offered.size < models.length,
		writable
	};
}
/**
* Assemble the card's status document. Sign-in state is read-only; credit is
* a live billing answer whose failure degrades to `creditsError` rather than
* failing the whole document, memoized briefly so the card and the composer
* dock's polling share one upstream call per TTL window.
*/
async function codeBuddyWebStatus(deps, creditsCache) {
	const authStatus = await deps.store.status();
	if (authStatus.state !== "signed-in") return { status: "signed-out" };
	const status = {
		status: "signed-in",
		...authStatus.nickname === void 0 ? {} : { nickname: authStatus.nickname },
		...authStatus.domain === void 0 || authStatus.domain === "" ? {} : { domain: authStatus.domain },
		...authStatus.source === void 0 ? {} : { source: authStatus.source },
		...authStatus.expiresAtMs === void 0 ? {} : { expiresAt: authStatus.expiresAtMs }
	};
	const models = deps.models();
	const modelsField = models.filter((model) => model.billing?.free === true || (model.billing?.badges?.length ?? 0) > 0).map((model) => {
		const rate = normalizeCredits(model.billing?.credits);
		return {
			id: model.id,
			name: model.name,
			...model.billing?.free === true ? { free: true } : {},
			...model.billing?.badges !== void 0 && model.billing.badges.length > 0 ? { badges: model.billing.badges } : {},
			...rate === void 0 ? {} : { credits: rate }
		};
	});
	const statusWithModels = modelsField.length > 0 ? {
		...status,
		models: modelsField
	} : status;
	const catalog = rateMapOf(models);
	const statusWithRates = catalog === void 0 ? statusWithModels : {
		...statusWithModels,
		catalog
	};
	const selection = selectionOf(models, deps.enabledModels?.(), deps.settingsWritable?.() ?? false);
	const statusWithCatalog = selection === void 0 ? statusWithRates : {
		...statusWithRates,
		selection
	};
	try {
		const credential = await deps.store.current();
		if (credential !== void 0) {
			const cached = creditsCache?.entry;
			if (cached !== void 0 && Date.now() - cached.at < CREDITS_CACHE_TTL_MS) return {
				...statusWithCatalog,
				credits: cached.credits
			};
			const credits = await deps.client.fetchCredits(credential);
			if (creditsCache !== void 0) creditsCache.entry = {
				at: Date.now(),
				credits
			};
			return {
				...statusWithCatalog,
				credits
			};
		}
	} catch (error) {
		return {
			...statusWithCatalog,
			creditsError: safeMessage(error)
		};
	}
	return statusWithCatalog;
}
/** The status route's request handler, extracted so tests can mount it on a bare server. */
function codeBuddyStatusHandler(deps, creditsCache) {
	return async (req, res) => {
		if (req.method !== "GET") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		if (!loopbackRequest(req)) {
			json(res, 403, { error: "request-not-trusted" });
			return;
		}
		try {
			json(res, 200, await codeBuddyWebStatus(deps, creditsCache));
		} catch (error) {
			json(res, 500, { error: safeMessage(error) });
		}
	};
}
/** Read a bounded request body; an over-limit body fails the request. */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MODELS_BODY_LIMIT) {
				reject(/* @__PURE__ */ new Error("request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
/**
* Parse the write body into a clean allowlist, or undefined when the body is
* not one.
*
* Only ids the catalog currently serves survive: the body is untrusted input,
* and an id the plugin does not serve could never be offered anyway. Duplicates
* collapse, and order follows the catalog so the stored document reads the same
* way the card lists it.
*/
function parseEnabledModels(raw, models) {
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		return;
	}
	if (typeof body !== "object" || body === null) return void 0;
	const field = body.enabledModels;
	if (!Array.isArray(field)) return void 0;
	if (!field.every((id) => typeof id === "string")) return void 0;
	const requested = new Set(field);
	return models.filter((model) => requested.has(model.id)).map((model) => model.id);
}
/**
* The enabled-model write handler.
*
* A state-changing route, so the loopback gate is stricter than the status
* GET's: the browser attaches an `Origin` to this POST, and a request without
* one is refused rather than trusted on Host alone. Content type must be JSON,
* which drops HTML-form simple requests as well.
*/
function codeBuddyEnabledModelsHandler(deps) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		if (!hostIsLoopback(req.headers.host) || !originIsLoopback(req.headers.origin)) {
			json(res, 403, { error: "request-not-trusted" });
			return;
		}
		if (typeof req.headers.origin !== "string") {
			json(res, 403, { error: "origin-required" });
			return;
		}
		const type = req.headers["content-type"];
		if (typeof type !== "string" || !type.trim().toLowerCase().startsWith("application/json")) {
			json(res, 415, { error: "content-type must be application/json" });
			return;
		}
		const write = deps.setEnabledModels;
		if (write === void 0) {
			json(res, 501, { error: "settings-not-writable" });
			return;
		}
		try {
			const models = deps.models();
			const ids = parseEnabledModels(await readBody(req), models);
			if (ids === void 0) {
				json(res, 400, { error: "expected {\"enabledModels\": string[]}" });
				return;
			}
			if (!await write(ids)) {
				json(res, 501, { error: "settings-not-writable" });
				return;
			}
			json(res, 200, { selection: selectionOf(models, ids, true) });
		} catch (error) {
			json(res, 500, { error: safeMessage(error) });
		}
	};
}
/** Mount the GET status route and the selection write route on an optional webServer context. */
function registerCodeBuddyStatusRoute(ctx, deps) {
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_STATUS_PATH,
			handler: codeBuddyStatusHandler(deps, {})
		});
		const disposeModels = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_MODELS_PATH,
			handler: codeBuddyEnabledModelsHandler(deps)
		});
		return () => {
			dispose();
			disposeModels();
		};
	}, "dsh-codebuddy-cli: Web status route");
}
//#endregion
//#region src/index.ts
/** Stable Cordis plugin name. */
const name = "llm-codebuddy-cli";
/** The model registry required before the provider can register. */
const inject = ["llm"];
/**
* Settings namespace owning the configuration card.
*
* DSH 0.1.2 dropped the `settingsNamespace()` branding function: a namespace is
* now a nominal string, validated by the type system where it is used rather
* than at runtime by a function call. The brand is compile-time only, so this
* stays the plain string it always was — every comparison, descriptor lookup,
* and `dsh` config file still sees `'codebuddy-cli'`. It is cast once here so the
* public constant carries the seam's type without pulling the brand helper
* into this package (upstream DSH plugins, `dsh-llm-pi-ai` included, pass
* their namespaces as plain string literals).
*/
const CODEBUDDY_SETTINGS_NS = "codebuddy-cli";
const Config = z.object({
	authFile: z.string().description("CodeBuddy CLI auth file (defaults to the CLI's own location)"),
	enabledModels: z.array(z.string()).description("Model ids offered in the model pickers (empty means every model)")
});
/**
* Start the loopback endpoint, register the `codebuddy` provider, and
* refresh the model catalog from the upstream once credentials allow it.
* The static fallback catalog serves from the first moment, so an offline
* upstream never leaves the provider empty.
*/
function apply(ctx, config) {
	const client = new CodeBuddyUpstreamClient();
	const store = new CodeBuddyCredentialStore({
		...config.authFile === void 0 ? {} : { cliPath: config.authFile },
		refresh: (credential) => client.refreshToken(credential)
	});
	const catalog = new CodeBuddyCatalog();
	const shim = createCodeBuddyShim({
		store,
		client,
		catalog,
		logger: ctx.logger
	});
	let current = () => config;
	const enabledModels = () => current().enabledModels;
	/**
	* Persist a model selection into this plugin's settings section.
	*
	* The settings service is resolved per call rather than captured, matching
	* how the adapter resolves `attachments`: a headless profile has no settings
	* provider at all, and the card must be told the selection is not writable
	* rather than silently dropping it.
	*/
	const setEnabledModels = async (ids) => {
		const settings = ctx.get("settings");
		if (settings === void 0) return false;
		await settings.update(CODEBUDDY_SETTINGS_NS, { enabledModels: [...ids] });
		return true;
	};
	ctx.inject(["webServer"], (webCtx) => registerCodeBuddyStatusRoute(webCtx, {
		store,
		client,
		models: () => catalog.current(),
		enabledModels,
		setEnabledModels,
		settingsWritable: () => ctx.get("settings") !== void 0
	}));
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, CODEBUDDY_SETTINGS_NS, Config, config, {
			setSource(source) {
				current = source;
			},
			onChange() {
				const next = current().authFile;
				store.setCliPath(next);
			}
		});
	});
	let stopped = false;
	ctx.effect(() => () => {
		stopped = true;
		shim.close();
		clearHostHeartbeat();
	});
	shim.ready.then(() => {
		if (stopped) return;
		let invalidate;
		try {
			const codebuddy = createCodeBuddyAdapter({
				shim,
				store,
				catalog,
				enabledModels,
				resolveAttachments: () => ctx.get("attachments")
			});
			invalidate = codebuddy.invalidate;
			let releaseAdapter;
			let releaseDirectory;
			try {
				releaseAdapter = ctx.llm.registerAdapter([CODEBUDDY_PROVIDER], codebuddy.adapter);
				releaseDirectory = ctx.llm.registerConfigurableProviders([{
					provider: CODEBUDDY_PROVIDER,
					displayName: "CodeBuddy",
					settingsNs: CODEBUDDY_SETTINGS_NS,
					settingsPath: [],
					declared: false
				}]);
			} finally {
				if (releaseAdapter === void 0 || releaseDirectory === void 0) {
					releaseAdapter?.();
					releaseDirectory?.();
				}
			}
			try {
				ctx.effect(() => () => {
					releaseAdapter?.();
					releaseDirectory?.();
				});
			} catch {
				releaseAdapter?.();
				releaseDirectory?.();
			}
			writeHostHeartbeat();
		} catch (error) {
			ctx.logger.error("dsh-codebuddy-cli: provider registration failed", error);
			return;
		}
		(async () => {
			try {
				const credential = await store.current();
				if (credential === void 0 || stopped) return;
				const models = await client.fetchModels(credential);
				if (stopped) return;
				catalog.set([...models]);
				invalidate?.();
			} catch (error) {
				ctx.logger.warn("dsh-codebuddy-cli: dynamic model catalog unavailable; serving the static fallback list", error);
			}
		})();
	}).catch((error) => {
		ctx.logger.error("dsh-codebuddy-cli: loopback endpoint failed to start; provider not registered", error);
	});
}
//#endregion
export { CODEBUDDY_AUTH_FILENAME, CODEBUDDY_AUTH_FILE_ENV, CODEBUDDY_HOST_HEARTBEAT_FILENAME, CODEBUDDY_PROVIDER, CODEBUDDY_SETTINGS_NS, CODEBUDDY_STREAM_IDLE_TIMEOUT_MS, CodeBuddyCatalog, CodeBuddyCredentialStore, CodeBuddyUpstreamClient, Config, FALLBACK_CODEBUDDY_MODELS, apply, classifyUpstreamError, clearHostHeartbeat, codebuddyHostHeartbeatPath, codebuddyOwnAuthPath, createCodeBuddyAdapter, createCodeBuddyShim, defaultAuthDir, defaultAuthDirCandidates, filterEnabledModels, inject, isHeartbeatProcessAlive, name, normalizeCredits, parseCodeBuddyAuth, prepareChatBody, processStartTimeMs, readHostHeartbeat, regionOf };
