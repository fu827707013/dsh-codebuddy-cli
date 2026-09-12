import { A as defaultAuthDirCandidates, C as FALLBACK_CODEBUDDY_MODELS, D as CodeBuddyCredentialStore, E as CODEBUDDY_AUTH_FILE_ENV, O as codebuddyOwnAuthPath, S as CodeBuddyCatalog, T as CODEBUDDY_AUTH_FILENAME, _ as CODEBUDDY_UNKNOWN_VERSION, a as processStartTimeMs, b as resolveCodeBuddyCliVersion, d as ensureClientIdentity, f as normalizeCredits, g as CODEBUDDY_IDE_TYPE, h as CODEBUDDY_IDE_NAME, i as isHeartbeatProcessAlive, j as parseCodeBuddyAuth, k as defaultAuthDir, l as CodeBuddyUpstreamClient, m as regionOf, n as clearHostHeartbeat, o as readHostHeartbeat, p as prepareChatBody, r as codebuddyHostHeartbeatPath, s as writeHostHeartbeat, t as CODEBUDDY_HOST_HEARTBEAT_FILENAME, u as classifyUpstreamError, v as clientIdentityHeaders, w as filterEnabledModels, x as userAgentFor, y as resolveClientIdentity } from "./host-heartbeat-dfEY9CR-.js";
import z from "@deepseek-ai/schemastery";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { Buffer as Buffer$1 } from "node:buffer";
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
* The effort ladder the upstream accepts, in pi-ai's level spelling. Verified
* against the live endpoint: every one of these is accepted for both
* declared-set rows and old-form rows, while an unrecognized value is rejected
* with `code 11150 the reasoning effort value is not supported by the current
* model`. This is the same fixed ladder the official CLI carries
* (`normalizeReasoningEffort` allows `minimal low medium high xhigh max`), and
* the CLI applies it to any reasoning-capable model without consulting a
* per-model set.
*/
const STANDARD_EFFORTS = [
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/**
* Resolve a CodeBuddy model's reasoning capability into pi-ai's
* `thinkingLevelMap` (every level pinned to its wire spelling or `null` for
* unsupported), mirroring `dsh-llm-pi-ai`'s own `resolveModelReasoning`.
*
* Two upstream row shapes exist and they are handled differently:
*
* - **Declared set** (`reasoning.supportedEfforts`): the model advertises the
*   exact ladder it accepts, so the control offers exactly those values.
* - **Old form** (`reasoning.effort` + `summary`, no `supportedEfforts`): the
*   row carries no ladder, but that is *not* a statement that no effort can be
*   chosen. The official CLI treats exactly these rows as fully adjustable —
*   it gates only on `supportsReasoning` and then applies its global
*   `reasoningEffort` setting — and the live endpoint accepts the whole
*   standard ladder for them. Surfacing no control here is what made
*   DeepSeek-V4.1-Flash appear to have no effort selector while GLM-5.3-Flash
*   did.
*
* `off` is offered only when the model explicitly reports that thinking can be
* disabled (`canDisableThinking === true`); every other level maps to its wire
* spelling, and an unsupported one maps to `null`.
*/
function reasoningFields(info) {
	const reasoning = info.reasoning;
	if (reasoning === void 0 || reasoning.supports !== true) return { reasoning: false };
	const declared = reasoning.supportedEfforts;
	const efforts = declared === void 0 || declared.length === 0 ? STANDARD_EFFORTS : declared;
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
		modelErrors: /* @__PURE__ */ new Map(),
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
//#region src/oauth.ts
/**
* OAuth login flow for CodeBuddy CLI.
*
* The flow is a polling login (no callback redirect):
* 1. POST /v2/plugin/auth/state → returns a `state` and an `authUrl`.
* 2. The user opens `authUrl` in their browser and signs in.
* 3. The host polls GET /v2/plugin/auth/token?state=... every few seconds
*    until it returns an `accessToken` (code 0) or times out.
*
* This mirrors the flow in `dsh-router-codebuddy` and the official CLI,
* adapted to this plugin's header conventions (X-IDE-* family, identity
* resolution, and the common-header builder from upstream.ts).
*
* @module dsh-codebuddy-cli/oauth
*/
/** Base URL for the CN CodeBuddy upstream. */
const CN_BASE = "https://copilot.tencent.com";
/** OAuth state endpoint. */
const STATE_URL = `${CN_BASE}/v2/plugin/auth/state`;
/** OAuth token polling endpoint. */
const TOKEN_URL = `${CN_BASE}/v2/plugin/auth/token`;
/** Account info endpoint (called after token is obtained). */
const ACCOUNT_URL = `${CN_BASE}/v2/plugin/auth/login/account`;
/** Upstream "pending" code — keep polling. */
const PENDING_CODE = 11217;
/** Request timeout for individual OAuth HTTP calls. */
const REQUEST_TIMEOUT_MS = 2e4;
/** Headers for the state and token endpoints (no Authorization, identity only). */
function oauthHeaders(identity) {
	return {
		"Accept": "application/json, text/plain, */*",
		"Content-Type": "application/json",
		"X-Requested-With": "XMLHttpRequest",
		"X-Product": "SaaS",
		"X-Domain": "copilot.tencent.com",
		"X-No-Authorization": "true",
		"X-No-User-Id": "true",
		"X-No-Enterprise-Id": "true",
		"X-No-Department-Info": "true",
		...clientIdentityHeaders(identity)
	};
}
/** Read and parse a JSON envelope from a fetch response. */
async function readEnvelope(response) {
	const text = await response.text();
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`codebuddy oauth returned non-JSON (http ${response.status}): ${text.slice(0, 200)}`);
	}
	if (typeof parsed !== "object" || parsed === null) throw new Error(`codebuddy oauth returned an unexpected document (http ${response.status})`);
	const document = parsed;
	return {
		code: typeof document["code"] === "number" ? document["code"] : 0,
		msg: typeof document["msg"] === "string" ? document["msg"] : "",
		data: typeof document["data"] === "object" && document["data"] !== null ? document["data"] : {}
	};
}
/** Parse an expiry that may arrive in seconds or milliseconds. */
function expiryToMs(value) {
	if (value <= 0) return 0;
	return value > 0xe8d4a51000 ? value : value * 1e3;
}
function optionalString(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
/**
* Start the OAuth login: request a `state` and `authUrl` from the upstream.
*
* @param identity - resolved client identity for request headers.
* @returns the `authUrl` the user should open, and the internal `state`.
*/
async function startOAuthLogin(identity) {
	const response = await fetch(`${STATE_URL}?platform=CLI`, {
		method: "POST",
		headers: oauthHeaders(identity),
		body: "{}",
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	const envelope = await readEnvelope(response);
	if (!response.ok || envelope.code !== 0) throw new Error(`codebuddy login state failed (http ${response.status}): ${envelope.msg}`);
	const state = optionalString(envelope.data["state"]);
	const authUrl = optionalString(envelope.data["authUrl"]) ?? optionalString(envelope.data["auth_url"]);
	if (state === void 0 || authUrl === void 0) throw new Error(`codebuddy login state returned no authUrl: ${envelope.msg}`);
	return {
		authUrl,
		state
	};
}
/**
* Poll the token endpoint once. Returns the result if the login completed
* (code 0 + accessToken), undefined if still pending, or throws on a
* terminal failure.
*
* @param state - the state from {@link startOAuthLogin}.
* @param identity - resolved client identity for request headers.
*/
async function pollOAuthLogin(state, identity) {
	const response = await fetch(`${TOKEN_URL}?state=${encodeURIComponent(state)}`, {
		method: "GET",
		headers: oauthHeaders(identity),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});
	if (!response.ok) return void 0;
	const envelope = await readEnvelope(response);
	if (envelope.code === PENDING_CODE) return void 0;
	if (envelope.code !== 0) throw new Error(`codebuddy login failed (code ${envelope.code}): ${envelope.msg}`);
	const accessToken = optionalString(envelope.data["accessToken"]) ?? optionalString(envelope.data["access_token"]);
	if (accessToken === void 0) throw new Error(`codebuddy login returned no accessToken: ${envelope.msg}`);
	const refreshToken = optionalString(envelope.data["refreshToken"]) ?? optionalString(envelope.data["refresh_token"]) ?? "";
	const expiresIn = typeof envelope.data["expiresIn"] === "number" ? envelope.data["expiresIn"] : 86400;
	const expiresAtMs = typeof envelope.data["expiresAt"] === "number" ? expiryToMs(envelope.data["expiresAt"]) : Date.now() + expiresIn * 1e3;
	const refreshExpiresAtMs = typeof envelope.data["refreshExpiresAt"] === "number" ? expiryToMs(envelope.data["refreshExpiresAt"]) : void 0;
	const domain = optionalString(envelope.data["domain"]) ?? "";
	let uid = "";
	let nickname;
	let enterpriseId;
	try {
		const accountHeaders = {
			...oauthHeaders(identity),
			"Authorization": `Bearer ${accessToken}`
		};
		if (domain !== "") {
			accountHeaders["X-Domain"] = domain;
			delete accountHeaders["X-No-Department-Info"];
		}
		const accResponse = await fetch(`${ACCOUNT_URL}?state=${encodeURIComponent(state)}`, {
			method: "GET",
			headers: accountHeaders,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (accResponse.ok) {
			const accEnvelope = await readEnvelope(accResponse);
			if (accEnvelope.code === 0) {
				uid = optionalString(accEnvelope.data["uid"]) ?? "";
				nickname = optionalString(accEnvelope.data["nickname"]);
				enterpriseId = optionalString(accEnvelope.data["enterpriseId"]);
			}
		}
	} catch {}
	if (uid === "" || nickname === void 0) {
		const claims = parseJwtClaims(accessToken);
		if (uid === "" && typeof claims["sub"] === "string") uid = claims["sub"];
		if (nickname === void 0) nickname = (typeof claims["nickname"] === "string" ? claims["nickname"] : void 0) ?? (typeof claims["preferred_username"] === "string" ? claims["preferred_username"] : void 0);
		if (enterpriseId === void 0 && typeof claims["enterprise_id"] === "string" && claims["enterprise_id"] !== "") enterpriseId = claims["enterprise_id"];
	}
	return {
		accessToken,
		refreshToken,
		expiresAtMs,
		...refreshExpiresAtMs !== void 0 ? { refreshExpiresAtMs } : {},
		uid,
		...nickname !== void 0 ? { nickname } : {},
		domain,
		...enterpriseId !== void 0 ? { enterpriseId } : {}
	};
}
/**
* Decode the claims of a JWT without verifying the signature.
*
* The token material never crosses to the browser and the claims are only
* used for display identity (uid / nickname), so signature verification is
* not needed here. Any parse failure yields an empty object.
*/
function parseJwtClaims(token) {
	const parts = token.split(".");
	if (parts.length < 2) return {};
	const payload = parts[1];
	if (payload === void 0) return {};
	let json;
	try {
		const padded = payload.replace(/-/gu, "+").replace(/_/gu, "/");
		json = Buffer$1.from(padded, "base64").toString("utf8");
	} catch {
		return {};
	}
	try {
		const parsed = JSON.parse(json);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}
/** Generate a stable client-side account id. */
function generateAccountId() {
	return randomUUID();
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
/**
* Plugin-owned daily check-in endpoint.
*
* The card's check-in button POSTs here; the host half forwards the request
* to the CodeBuddy CN daily check-in upstream with the plugin-resolved
* credential. Same loopback/Origin gates as the enabled-model write route.
*/
const CODEBUDDY_CHECKIN_PATH = "/plugins/dsh-codebuddy-cli/check-in";
/**
* Plugin-owned account management endpoints.
*
* The card's account panel uses these routes to start an OAuth login, poll for
* completion, switch the active account, and remove an account. All routes
* apply the same loopback/Origin gates as the other write routes.
*/
const CODEBUDDY_LOGIN_START_PATH = "/plugins/dsh-codebuddy-cli/login/start";
const CODEBUDDY_LOGIN_POLL_PATH = "/plugins/dsh-codebuddy-cli/login/poll";
const CODEBUDDY_SWITCH_ACCOUNT_PATH = "/plugins/dsh-codebuddy-cli/accounts/switch";
const CODEBUDDY_DELETE_ACCOUNT_PATH = "/plugins/dsh-codebuddy-cli/accounts/delete";
/** Plugin-owned credit-statistics endpoint (aggregates usage across accounts). */
const CODEBUDDY_CREDIT_STATS_PATH = "/plugins/dsh-codebuddy-cli/credit-stats";
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
/** Local calendar date as `YYYY-MM-DD` (used to decide "checked in today"). */
function localDateKey(now = /* @__PURE__ */ new Date()) {
	const pad = (value) => String(value).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
/** Whether a stored check-in record means "already checked in today". */
function checkedInToday(record, today) {
	return record !== void 0 && record.date === today && (record.result === "ok" || record.result === "already");
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
/** Convert an AccountSummary to the web-facing shape. */
function toWebAccount(summary) {
	const account = {
		id: summary.id,
		uid: summary.uid,
		domain: summary.domain,
		expiresAtMs: summary.expiresAtMs,
		active: summary.active
	};
	if (summary.nickname !== void 0) account.nickname = summary.nickname;
	if (summary.enterpriseId !== void 0) account.enterpriseId = summary.enterpriseId;
	return account;
}
/**
* Inject stored accounts into a status document, whether signed-in or
* signed-out. Each stored account carries its own credit resources (fetched
* from the upstream, TTL-cached) and a refresh timestamp, so the card's
* per-account cards render package bars and expiry without a second round
* trip. When no account store is attached, the field is omitted entirely.
*/
async function withAccounts(deps, status) {
	if (deps.accountStore === void 0) return status;
	if (status.status === "error") return status;
	try {
		const summaries = await deps.accountStore.summaries();
		const today = localDateKey();
		const accounts = await Promise.all(summaries.map(async (summary) => {
			const account = toWebAccount(summary);
			const accountWithCheckIn = summary.lastCheckIn === void 0 ? account : {
				...account,
				checkedInToday: checkedInToday(summary.lastCheckIn, today)
			};
			const credential = await deps.accountStore.credentialFor(summary.id);
			if (credential === void 0) return accountWithCheckIn;
			const cached = accountCreditsCache.get(summary.id);
			if (cached !== void 0 && Date.now() - cached.at < ACCOUNT_CREDIT_TTL_MS) return {
				...accountWithCheckIn,
				...cached.payload
			};
			const startedAt = Date.now();
			try {
				const payload = {
					credits: await deps.client.fetchCredits(credential),
					creditUpdatedAtMs: startedAt
				};
				accountCreditsCache.set(summary.id, {
					at: startedAt,
					payload
				});
				return {
					...accountWithCheckIn,
					...payload
				};
			} catch (error) {
				const payload = { creditError: safeMessage(error) };
				accountCreditsCache.set(summary.id, {
					at: startedAt,
					payload
				});
				return {
					...accountWithCheckIn,
					...payload
				};
			}
		}));
		if (status.status === "signed-in") return {
			...status,
			accounts
		};
		return {
			status: "signed-out",
			accounts
		};
	} catch {
		return status;
	}
}
/** Per-account credit answers, so concurrent polls share one upstream call. */
const accountCreditsCache = /* @__PURE__ */ new Map();
/** TTL for per-account credit answers within one process. */
const ACCOUNT_CREDIT_TTL_MS = 3e4;
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
			json(res, 200, await withAccounts(deps, await codeBuddyWebStatus(deps, creditsCache)));
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
/** Parse the check-in body `{id?}`; undefined when the JSON is malformed or not an object. */
async function parseCheckInBody(req) {
	let body;
	try {
		body = await readBody(req);
	} catch {
		return;
	}
	if (body.trim() === "") return {};
	try {
		const candidate = JSON.parse(body);
		if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return void 0;
		return candidate;
	} catch {
		return;
	}
}
/** Refresh a targeted account credential when its token is near/over expiry. */
async function refreshIfNeeded(deps, credential) {
	if (deps.refreshToken === void 0 || credential.expiresAtMs > Date.now() + 3e5) return credential;
	const outcome = await deps.refreshToken(credential);
	const refreshed = {
		...credential,
		accessToken: outcome.accessToken,
		...outcome.refreshToken === void 0 ? {} : { refreshToken: outcome.refreshToken },
		expiresAtMs: outcome.expiresInSec !== void 0 ? Date.now() + outcome.expiresInSec * 1e3 : credential.expiresAtMs,
		...outcome.domain === void 0 || outcome.domain === "" ? {} : { domain: outcome.domain }
	};
	if (credential.uid !== "" && deps.accountStore !== void 0) {
		const doc = await deps.accountStore.read();
		const id = Object.keys(doc.accounts).find((key) => doc.accounts[key]?.uid === credential.uid);
		if (id !== void 0) await deps.accountStore.updateTokens(id, {
			accessToken: refreshed.accessToken,
			...outcome.refreshToken !== void 0 ? { refreshToken: outcome.refreshToken } : {},
			expiresAtMs: refreshed.expiresAtMs,
			...refreshed.refreshExpiresAtMs !== void 0 ? { refreshExpiresAtMs: refreshed.refreshExpiresAtMs } : {},
			...outcome.domain === void 0 || outcome.domain === "" ? {} : { domain: outcome.domain }
		});
	}
	return refreshed;
}
/** The currently active account id, or undefined when none is stored/active. */
async function activeAccountId(deps) {
	if (deps.accountStore === void 0) return void 0;
	const doc = await deps.accountStore.read();
	return doc.activeId !== void 0 && doc.accounts[doc.activeId] !== void 0 ? doc.activeId : void 0;
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
/**
* The daily check-in write handler.
*
* Same strict gate as the enabled-model write: POST only, loopback Host and a
* mandatory loopback `Origin`, JSON content type. The upstream answer is a
* plain outcome document, so the card never sees upstream error text without
* a status classification. A missing executor answers 501 instead of failing.
*/
function codeBuddyCheckInHandler(deps) {
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
		if (deps.checkIn === void 0) {
			json(res, 501, { error: "check-in-unavailable" });
			return;
		}
		try {
			const parsed = await parseCheckInBody(req);
			if (parsed === void 0) {
				json(res, 400, { error: "expected {\"id\"?: string}" });
				return;
			}
			const targetId = typeof parsed.id === "string" && parsed.id !== "" ? parsed.id : void 0;
			let credential;
			if (targetId !== void 0 && deps.accountStore !== void 0) {
				const target = await deps.accountStore.credentialFor(targetId);
				if (target === void 0) {
					json(res, 404, { error: "account-not-found" });
					return;
				}
				credential = await refreshIfNeeded(deps, target);
			} else credential = await deps.store.resolve();
			const outcome = await deps.checkIn(credential);
			const recordId = targetId ?? await activeAccountId(deps);
			if (recordId !== void 0) await deps.accountStore?.recordCheckIn(recordId, localDateKey(), outcome.status);
			json(res, 200, outcome);
		} catch (error) {
			json(res, 500, { error: safeMessage(error) });
		}
	};
}
/** Mount the GET status route, the selection write route, the daily check-in route, and the account management routes. */
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
		const disposeCheckIn = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_CHECKIN_PATH,
			handler: codeBuddyCheckInHandler(deps)
		});
		const disposeLoginStart = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_LOGIN_START_PATH,
			handler: codeBuddyLoginStartHandler(deps)
		});
		const disposeLoginPoll = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_LOGIN_POLL_PATH,
			handler: codeBuddyLoginPollHandler(deps)
		});
		const disposeSwitch = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_SWITCH_ACCOUNT_PATH,
			handler: codeBuddySwitchAccountHandler(deps)
		});
		const disposeDelete = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_DELETE_ACCOUNT_PATH,
			handler: codeBuddyDeleteAccountHandler(deps)
		});
		const disposeCreditStats = ctx.webServer.register({
			kind: "exact",
			path: CODEBUDDY_CREDIT_STATS_PATH,
			handler: codeBuddyCreditStatsHandler(deps)
		});
		return () => {
			dispose();
			disposeModels();
			disposeCheckIn();
			disposeLoginStart();
			disposeLoginPoll();
			disposeSwitch();
			disposeDelete();
			disposeCreditStats();
		};
	}, "dsh-codebuddy-cli: Web status route");
}
/** Check loopback Host + Origin + JSON content type for a mutating POST. */
function checkLoopbackPost(req, res) {
	if (!hostIsLoopback(req.headers.host) || !originIsLoopback(req.headers.origin)) {
		json(res, 403, { error: "request-not-trusted" });
		return false;
	}
	if (typeof req.headers.origin !== "string") {
		json(res, 403, { error: "origin-required" });
		return false;
	}
	const type = req.headers["content-type"];
	if (typeof type !== "string" || !type.trim().toLowerCase().startsWith("application/json")) {
		json(res, 415, { error: "content-type must be application/json" });
		return false;
	}
	return true;
}
/**
* The login-start handler. POSTs to the upstream state endpoint and returns
* the authUrl + state. The card opens the authUrl in a new tab and then polls
* the poll endpoint.
*/
function codeBuddyLoginStartHandler(deps) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		if (!checkLoopbackPost(req, res)) return;
		if (deps.loginStart === void 0 || deps.resolveIdentity === void 0) {
			json(res, 501, { error: "login-unavailable" });
			return;
		}
		try {
			const identity = await deps.resolveIdentity();
			const { authUrl, state } = await deps.loginStart(identity);
			json(res, 200, {
				ok: true,
				authUrl,
				state
			});
		} catch (error) {
			json(res, 200, {
				ok: false,
				error: safeMessage(error)
			});
		}
	};
}
/**
* The login-poll handler. Polls the upstream token endpoint once; on success
* stores the account and returns it. The card polls this every few seconds.
*/
function codeBuddyLoginPollHandler(deps) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		if (!checkLoopbackPost(req, res)) return;
		if (deps.loginPoll === void 0 || deps.resolveIdentity === void 0 || deps.accountStore === void 0) {
			json(res, 501, { error: "login-unavailable" });
			return;
		}
		try {
			const body = await readBody(req);
			let parsed;
			try {
				parsed = JSON.parse(body);
			} catch {
				json(res, 400, { error: "expected {\"state\": string}" });
				return;
			}
			const state = typeof parsed.state === "string" ? parsed.state : "";
			if (state === "") {
				json(res, 400, { error: "expected {\"state\": string}" });
				return;
			}
			const identity = await deps.resolveIdentity();
			const result = await deps.loginPoll(state, identity);
			if (result === void 0) {
				json(res, 200, { done: false });
				return;
			}
			const id = generateAccountId();
			const stored = await deps.accountStore.add({
				id,
				uid: result.uid,
				...result.nickname !== void 0 ? { nickname: result.nickname } : {},
				domain: result.domain,
				...result.enterpriseId !== void 0 ? { enterpriseId: result.enterpriseId } : {},
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				expiresAtMs: result.expiresAtMs,
				...result.refreshExpiresAtMs !== void 0 ? { refreshExpiresAtMs: result.refreshExpiresAtMs } : {}
			});
			await deps.accountStore.setActive(id);
			json(res, 200, {
				done: true,
				account: toWebAccount({
					...stored,
					active: true
				})
			});
		} catch (error) {
			json(res, 200, {
				done: true,
				error: safeMessage(error)
			});
		}
	};
}
/**
* The switch-account handler. Sets the active account by id.
*/
function codeBuddySwitchAccountHandler(deps) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		if (!checkLoopbackPost(req, res)) return;
		if (deps.accountStore === void 0) {
			json(res, 501, { error: "accounts-unavailable" });
			return;
		}
		try {
			const body = await readBody(req);
			let parsed;
			try {
				parsed = JSON.parse(body);
			} catch {
				json(res, 400, { error: "expected {\"id\": string}" });
				return;
			}
			const id = typeof parsed.id === "string" ? parsed.id : "";
			if (id === "") {
				json(res, 400, { error: "expected {\"id\": string}" });
				return;
			}
			if (!await deps.accountStore.setActive(id)) {
				json(res, 404, { error: "account not found" });
				return;
			}
			json(res, 200, { ok: true });
		} catch (error) {
			json(res, 500, { error: safeMessage(error) });
		}
	};
}
/**
* The delete-account handler. Removes an account by id.
*/
function codeBuddyDeleteAccountHandler(deps) {
	return async (req, res) => {
		if (req.method !== "POST") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		if (!checkLoopbackPost(req, res)) return;
		if (deps.accountStore === void 0) {
			json(res, 501, { error: "accounts-unavailable" });
			return;
		}
		try {
			const body = await readBody(req);
			let parsed;
			try {
				parsed = JSON.parse(body);
			} catch {
				json(res, 400, { error: "expected {\"id\": string}" });
				return;
			}
			const id = typeof parsed.id === "string" ? parsed.id : "";
			if (id === "") {
				json(res, 400, { error: "expected {\"id\": string}" });
				return;
			}
			if (!await deps.accountStore.remove(id)) {
				json(res, 404, { error: "account not found" });
				return;
			}
			json(res, 200, { ok: true });
		} catch (error) {
			json(res, 500, { error: safeMessage(error) });
		}
	};
}
/** Per-account usage answers, so repeated panel visits share one fetch. */
const usageCache = /* @__PURE__ */ new Map();
/** TTL for per-account usage answers within one process. */
const USAGE_CACHE_TTL_MS = 3e5;
/**
* Build the aggregated credit-statistics document by fetching each stored
* account's official usage (cached per account) and merging the results.
*/
async function buildCreditStats(deps) {
	if (deps.accountStore === void 0) throw new Error("account store unavailable");
	if (deps.fetchUsage === void 0) throw new Error("official-usage fetch unavailable");
	const fetchUsage = deps.fetchUsage;
	const accountList = await deps.accountStore.summaries();
	const collectedAt = Date.now();
	const accountStats = [];
	const dailyMap = /* @__PURE__ */ new Map();
	const modelMap = /* @__PURE__ */ new Map();
	let allRequests = [];
	let successCount = 0;
	let today = 0;
	let week = 0;
	let month = 0;
	(/* @__PURE__ */ new Date()).getFullYear().toString() + "" + ((/* @__PURE__ */ new Date()).getMonth() + 1).toString().padStart(2, "0");
	await Promise.all(accountList.map(async (account) => {
		const credential = await deps.accountStore.credentialFor(account.id);
		if (credential === void 0) return;
		const cacheHit = usageCache.get(account.id);
		let stats;
		if (cacheHit !== void 0 && Date.now() - cacheHit.at < USAGE_CACHE_TTL_MS) stats = cacheHit.stats;
		else try {
			stats = await fetchUsage(credential);
			usageCache.set(account.id, {
				at: Date.now(),
				stats
			});
		} catch (error) {
			accountStats.push({
				accountId: account.id,
				accountName: account.nickname ?? account.uid ?? account.id,
				ok: false,
				usageToday: null,
				usage7Days: null,
				usageThisMonth: null,
				error: safeMessage(error)
			});
			return;
		}
		if (stats.status === "unavailable") {
			accountStats.push({
				accountId: account.id,
				accountName: account.nickname ?? account.uid ?? account.id,
				ok: false,
				usageToday: null,
				usage7Days: null,
				usageThisMonth: null
			});
			return;
		}
		successCount += 1;
		accountStats.push({
			accountId: account.id,
			accountName: account.nickname ?? account.uid ?? account.id,
			ok: true,
			usageToday: stats.summary.usageToday,
			usage7Days: stats.summary.usage7Days,
			usageThisMonth: stats.summary.usageThisMonth,
			daily: stats.daily,
			models: stats.models
		});
		today += stats.summary.usageToday;
		week += stats.summary.usage7Days;
		month += stats.summary.usageThisMonth;
		for (const daily of stats.daily) {
			const existing = dailyMap.get(daily.date) ?? {
				date: daily.date,
				usage: 0
			};
			existing.usage += daily.usage;
			if (daily.models !== void 0) {
				const models = existing.models === void 0 ? [] : [...existing.models];
				for (const model of daily.models) {
					const idx = models.findIndex((m) => m.model === model.model);
					const current = idx !== -1 ? models[idx] : void 0;
					if (current !== void 0) models[idx] = {
						...current,
						requestCount: current.requestCount + model.requestCount,
						credit: current.credit + model.credit
					};
					else models.push({ ...model });
				}
				existing.models = models;
			}
			dailyMap.set(daily.date, existing);
		}
		for (const model of stats.models) {
			const existing = modelMap.get(model.model) ?? {
				requestCount: 0,
				credit: 0
			};
			existing.requestCount += model.requestCount;
			existing.credit += model.credit;
			modelMap.set(model.model, existing);
		}
		allRequests.push(...stats.requests.map((row, index) => ({
			ts: row.ts - index / 1e6,
			row: {
				requestId: row.requestId,
				model: row.model,
				client: row.client,
				credit: row.credit,
				requestTime: row.requestTime,
				date: row.date,
				accountId: account.id,
				accountName: account.nickname ?? account.uid ?? account.id
			}
		})));
	}));
	const status = accountList.length === 0 ? "unavailable" : successCount === accountList.length ? "complete" : successCount > 0 ? "partial" : "unavailable";
	const daily = [...dailyMap.values()].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
	const sortedRequests = allRequests.sort((a, b) => b.ts - a.ts).map((entry) => entry.row);
	const detailLimit = 100;
	return {
		status,
		rangeStart: daily.length > 0 ? daily[0].date : "",
		rangeEnd: daily.length > 0 ? daily[daily.length - 1].date : "",
		collectedAt,
		summary: {
			usageToday: today,
			usage7Days: week,
			usageThisMonth: month
		},
		daily,
		models: [...modelMap.entries()].map(([model, { requestCount, credit }]) => ({
			model,
			requestCount,
			credit
		})).sort((a, b) => b.credit - a.credit || b.requestCount - a.requestCount || a.model.localeCompare(b.model)),
		requests: sortedRequests.slice(0, detailLimit),
		accounts: accountStats,
		detailLimit
	};
}
/**
* The credit-statistics handler. GET returns the cached-or-fresh aggregated
* statistics; POST with `{refresh: true}` forces a re-fetch of every account's
* official usage. The panel uses this to show today / 7-day / month totals,
* a daily trend chart, per-model breakdown and the recent request list.
*/
function codeBuddyCreditStatsHandler(deps) {
	return async (req, res) => {
		if (!loopbackRequest(req)) {
			json(res, 403, { error: "request-not-trusted" });
			return;
		}
		let refresh = false;
		if (req.method === "POST") {
			if (!checkLoopbackPost(req, res)) return;
			try {
				const body = await readBody(req);
				refresh = JSON.parse(body)?.refresh === true;
			} catch {
				json(res, 400, { error: "expected {\"refresh\": boolean}" });
				return;
			}
		} else if (req.method !== "GET") {
			json(res, 405, { error: "method not allowed" });
			return;
		}
		try {
			if (refresh) usageCache.clear();
			json(res, 200, await buildCreditStats(deps));
		} catch (error) {
			json(res, 500, { error: safeMessage(error) });
		}
	};
}
//#endregion
//#region src/account-store.ts
/**
* Multi-account credential store for CodeBuddy CLI.
*
* Accounts added through OAuth login are stored here as a JSON document under
* `$DSH_HOME`. Each account carries its own accessToken, refreshToken,
* expiresAt, and identity fields (uid, nickname, domain, enterpriseId).
*
* The "active" account is the one the plugin currently serves; its credential
* is resolved first, falling back to the CLI's own auth file when no account
* is active (so the original single-account behavior is preserved).
*
* @module dsh-codebuddy-cli/account-store
*/
/** Basename of the multi-account JSON file inside the Harness home. */
const CODEBUDDY_ACCOUNTS_FILENAME = ".codebuddy-cli-accounts.json";
/** Current on-disk format version; readers reject others. */
const ACCOUNTS_FORMAT_VERSION = 1;
/** Path of the multi-account file. */
function codebuddyAccountsPath() {
	return join(resolveDshHome(), CODEBUDDY_ACCOUNTS_FILENAME);
}
/** Whether a filesystem error reports an absent path. */
function isENOENT(error) {
	return error?.code === "ENOENT";
}
/** Parse and validate an accounts document; returns undefined when invalid. */
function parseDocument(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
	const document = parsed;
	if (document["version"] !== ACCOUNTS_FORMAT_VERSION) return void 0;
	if (typeof document["accounts"] !== "object" || document["accounts"] === null || Array.isArray(document["accounts"])) return;
	const raw = document["accounts"];
	const accounts = {};
	for (const [id, value] of Object.entries(raw)) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
		const entry = value;
		const accessToken = typeof entry["accessToken"] === "string" ? entry["accessToken"] : "";
		if (accessToken === "") continue;
		accounts[id] = {
			id,
			uid: typeof entry["uid"] === "string" ? entry["uid"] : "",
			...entry["nickname"] !== void 0 && typeof entry["nickname"] === "string" ? { nickname: entry["nickname"] } : {},
			domain: typeof entry["domain"] === "string" ? entry["domain"] : "",
			...entry["enterpriseId"] !== void 0 && typeof entry["enterpriseId"] === "string" ? { enterpriseId: entry["enterpriseId"] } : {},
			accessToken,
			refreshToken: typeof entry["refreshToken"] === "string" ? entry["refreshToken"] : "",
			expiresAtMs: typeof entry["expiresAtMs"] === "number" ? entry["expiresAtMs"] : 0,
			...entry["refreshExpiresAtMs"] !== void 0 && typeof entry["refreshExpiresAtMs"] === "number" ? { refreshExpiresAtMs: entry["refreshExpiresAtMs"] } : {},
			addedAtMs: typeof entry["addedAtMs"] === "number" ? entry["addedAtMs"] : Date.now(),
			...parseLastCheckIn(entry)
		};
	}
	const activeId = typeof document["activeId"] === "string" && document["activeId"] !== "" ? document["activeId"] : void 0;
	return {
		version: ACCOUNTS_FORMAT_VERSION,
		...activeId === void 0 ? {} : { activeId },
		accounts
	};
}
/** Parse the optional `lastCheckIn` block of a stored account. */
function parseLastCheckIn(entry) {
	const raw = entry["lastCheckIn"];
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
	const record = raw;
	if (typeof record["date"] !== "string" || record["date"] === "") return {};
	const result = record["result"];
	if (result !== "ok" && result !== "already" && result !== "failed") return {};
	return { lastCheckIn: {
		date: record["date"],
		result
	} };
}
/**
* Multi-account credential store.
*
* The store reads and writes a JSON document under `$DSH_HOME`. Writes are
* atomic and lock-protected. Reads are immutable snapshots — callers that
* need a credential must copy it out.
*/
var AccountStore = class {
	path;
	constructor(path) {
		this.path = path ?? codebuddyAccountsPath();
	}
	/** Read the full document; returns an empty document when the file is absent. */
	async read() {
		try {
			return parseDocument(await readFile(this.path, "utf8")) ?? {
				version: ACCOUNTS_FORMAT_VERSION,
				accounts: {}
			};
		} catch (error) {
			if (isENOENT(error)) return {
				version: ACCOUNTS_FORMAT_VERSION,
				accounts: {}
			};
			return {
				version: ACCOUNTS_FORMAT_VERSION,
				accounts: {}
			};
		}
	}
	/** Read and re-write the document inside a lock, applying a transform. */
	async mutate(fn) {
		return withFileLock(this.path, async () => {
			let doc;
			try {
				doc = parseDocument(await readFile(this.path, "utf8")) ?? {
					version: ACCOUNTS_FORMAT_VERSION,
					accounts: {}
				};
			} catch (error) {
				if (!isENOENT(error)) throw error;
				doc = {
					version: ACCOUNTS_FORMAT_VERSION,
					accounts: {}
				};
			}
			const { doc: next, result } = fn(doc);
			await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return result;
		});
	}
	/** Add a new account (or overwrite if the id already exists). Returns the stored account. */
	async add(account) {
		return this.mutate((doc) => {
			const stored = {
				...account,
				addedAtMs: Date.now()
			};
			const accounts = {
				...doc.accounts,
				[account.id]: stored
			};
			const activeId = doc.activeId ?? account.id;
			return {
				doc: {
					...doc,
					activeId,
					accounts
				},
				result: stored
			};
		});
	}
	/** Remove an account by id. Returns true if the account existed. */
	async remove(id) {
		return this.mutate((doc) => {
			if (doc.accounts[id] === void 0) return {
				doc,
				result: false
			};
			const accounts = { ...doc.accounts };
			delete accounts[id];
			const activeId = doc.activeId === id ? void 0 : doc.activeId;
			const nextDoc = {
				version: ACCOUNTS_FORMAT_VERSION,
				accounts
			};
			if (activeId !== void 0) nextDoc.activeId = activeId;
			return {
				doc: nextDoc,
				result: true
			};
		});
	}
	/** Set the active account by id. Returns false when the account does not exist. */
	async setActive(id) {
		return this.mutate((doc) => {
			if (doc.accounts[id] === void 0) return {
				doc,
				result: false
			};
			return {
				doc: {
					...doc,
					activeId: id
				},
				result: true
			};
		});
	}
	/** Clear the active account (so the CLI file fallback takes over). */
	async clearActive() {
		await this.mutate((doc) => {
			return {
				doc: {
					version: ACCOUNTS_FORMAT_VERSION,
					accounts: doc.accounts
				},
				result: void 0
			};
		});
	}
	/** Get the active account's stored credential, or undefined when none is active. */
	async activeCredential() {
		const doc = await this.read();
		if (doc.activeId === void 0) return void 0;
		const account = doc.accounts[doc.activeId];
		if (account === void 0) return void 0;
		return this.toCredential(account, "dsh");
	}
	/** Get a specific account's stored credential. */
	async credentialFor(id) {
		const account = (await this.read()).accounts[id];
		if (account === void 0) return void 0;
		return this.toCredential(account, "dsh");
	}
	/** Update a stored account's tokens (after a refresh). */
	async updateTokens(id, tokens) {
		await this.mutate((doc) => {
			const existing = doc.accounts[id];
			if (existing === void 0) return {
				doc,
				result: void 0
			};
			const updated = {
				...existing,
				accessToken: tokens.accessToken,
				...tokens.refreshToken !== void 0 && tokens.refreshToken !== "" ? { refreshToken: tokens.refreshToken } : {},
				expiresAtMs: tokens.expiresAtMs,
				...tokens.refreshExpiresAtMs !== void 0 ? { refreshExpiresAtMs: tokens.refreshExpiresAtMs } : {},
				...tokens.domain !== void 0 && tokens.domain !== "" ? { domain: tokens.domain } : {}
			};
			const accounts = {
				...doc.accounts,
				[id]: updated
			};
			return {
				doc: {
					...doc,
					accounts
				},
				result: void 0
			};
		});
	}
	/** Record a daily check-in outcome for an account. No-op when the id is unknown. */
	async recordCheckIn(id, date, result) {
		await this.mutate((doc) => {
			const existing = doc.accounts[id];
			if (existing === void 0) return {
				doc,
				result: void 0
			};
			const updated = {
				...existing,
				lastCheckIn: {
					date,
					result
				}
			};
			const accounts = {
				...doc.accounts,
				[id]: updated
			};
			return {
				doc: {
					...doc,
					accounts
				},
				result: void 0
			};
		});
	}
	/** Summaries of all stored accounts, with the active one flagged. */
	async summaries() {
		const doc = await this.read();
		const activeId = doc.activeId;
		return Object.values(doc.accounts).map((account) => {
			const fallback = account.uid === "" && account.nickname === void 0 ? jwtIdentity(account.accessToken) : void 0;
			const uid = account.uid !== "" ? account.uid : fallback?.uid ?? "";
			const nickname = account.nickname ?? fallback?.nickname;
			return {
				id: account.id,
				uid,
				...nickname !== void 0 ? { nickname } : {},
				domain: account.domain,
				...account.enterpriseId !== void 0 ? { enterpriseId: account.enterpriseId } : {},
				expiresAtMs: account.expiresAtMs,
				active: account.id === activeId,
				...account.lastCheckIn !== void 0 ? { lastCheckIn: account.lastCheckIn } : {}
			};
		});
	}
	/** Convert a stored account to a CodeBuddyCredential. */
	toCredential(account, source) {
		const credential = {
			accessToken: account.accessToken,
			refreshToken: account.refreshToken,
			expiresAtMs: account.expiresAtMs,
			domain: account.domain,
			uid: account.uid,
			source
		};
		if (account.refreshExpiresAtMs !== void 0) credential.refreshExpiresAtMs = account.refreshExpiresAtMs;
		if (account.enterpriseId !== void 0) credential.enterpriseId = account.enterpriseId;
		if (account.nickname !== void 0) credential.nickname = account.nickname;
		return credential;
	}
};
/**
* Decode `sub` / `nickname` claims from a CodeBuddy access token JWT without
* verifying the signature. Display-only identity, so verification is not
* needed; any failure yields undefined.
*/
function jwtIdentity(accessToken) {
	const parts = accessToken.split(".");
	if (parts.length < 2) return void 0;
	const payload = parts[1];
	if (payload === void 0) return void 0;
	let claims;
	try {
		const padded = payload.replace(/-/gu, "+").replace(/_/gu, "/");
		const parsed = JSON.parse(Buffer$1.from(padded, "base64").toString("utf8"));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
		claims = parsed;
	} catch {
		return;
	}
	const uid = typeof claims["sub"] === "string" ? claims["sub"] : "";
	if (uid === "") return void 0;
	let nickname;
	if (typeof claims["nickname"] === "string") nickname = claims["nickname"];
	else if (typeof claims["preferred_username"] === "string") nickname = claims["preferred_username"];
	return {
		uid,
		...nickname !== void 0 ? { nickname } : {}
	};
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
	const accountStore = new AccountStore();
	const store = new CodeBuddyCredentialStore({
		...config.authFile === void 0 ? {} : { cliPath: config.authFile },
		refresh: (credential) => client.refreshToken(credential),
		accountStore
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
		settingsWritable: () => ctx.get("settings") !== void 0,
		checkIn: (credential) => client.checkIn(credential),
		refreshToken: (credential) => client.refreshToken(credential),
		fetchUsage: (credential) => client.fetchUsage(credential),
		accountStore,
		loginStart: (identity) => startOAuthLogin(identity),
		loginPoll: (state, identity) => pollOAuthLogin(state, identity),
		resolveIdentity: () => ensureClientIdentity()
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
export { CODEBUDDY_AUTH_FILENAME, CODEBUDDY_AUTH_FILE_ENV, CODEBUDDY_HOST_HEARTBEAT_FILENAME, CODEBUDDY_IDE_NAME, CODEBUDDY_IDE_TYPE, CODEBUDDY_PROVIDER, CODEBUDDY_SETTINGS_NS, CODEBUDDY_STREAM_IDLE_TIMEOUT_MS, CODEBUDDY_UNKNOWN_VERSION, CodeBuddyCatalog, CodeBuddyCredentialStore, CodeBuddyUpstreamClient, Config, FALLBACK_CODEBUDDY_MODELS, apply, classifyUpstreamError, clearHostHeartbeat, clientIdentityHeaders, codebuddyHostHeartbeatPath, codebuddyOwnAuthPath, createCodeBuddyAdapter, createCodeBuddyShim, defaultAuthDir, defaultAuthDirCandidates, filterEnabledModels, inject, isHeartbeatProcessAlive, name, normalizeCredits, parseCodeBuddyAuth, prepareChatBody, processStartTimeMs, readHostHeartbeat, regionOf, resolveClientIdentity, resolveCodeBuddyCliVersion, userAgentFor };
