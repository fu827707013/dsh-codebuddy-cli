import { createRequire } from "node:module";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, release } from "node:os";
import { basename, dirname, join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { execFileSync } from "node:child_process";
//#region src/auth.ts
/**
* CodeBuddy CLI credential resolution. The primary source is the CodeBuddy
* CLI's own auth file (`<authDir>/<product>.info`, e.g.
* `Tencent-Cloud.coding-copilot.info`), read-only; a plugin-owned copy under
* `$DSH_HOME` holds token refreshes so the CLI's file is never written.
* The effective credential is whichever of the two expires later, so a
* refresh by either side wins.
*
* The CLI shares the `CodeBuddyExtension/Data/Public/auth` directory with the
* desktop IDE but writes one `.info` file per signed-in product. Discovery
* scans that directory and picks the CLI's own file first, then any file
* whose account is flagged `lastLogin`, then the most recently written file.
*
* @module dsh-codebuddy-cli/auth
*/
/** Basename of the plugin-owned credential copy inside the Harness home. */
const CODEBUDDY_AUTH_FILENAME = ".codebuddy-cli-auth.json";
/** Env variable that overrides the CLI auth-file location. */
const CODEBUDDY_AUTH_FILE_ENV = "CODEBUDDY_CLI_AUTH_FILE";
/** Current on-disk format of the plugin-owned copy; readers reject others. */
const OWN_FORMAT_VERSION = 1;
/** Plugin-owned copy path inside the Harness home. */
function codebuddyOwnAuthPath() {
	return join(resolveDshHome(), CODEBUDDY_AUTH_FILENAME);
}
/**
* The auth directory's leaf path under the CodeBuddyExtension data root.
* The CLI and the desktop IDE share this directory; each writes its own
* `<product>.info` file inside.
*/
const AUTH_DIR_RELATIVE = [
	"CodeBuddyExtension",
	"Data",
	"Public",
	"auth"
];
/**
* The CLI's own auth file name. This is the file `codebuddy` CLI rewrites on
* login and refresh; when present it wins over every other candidate.
*/
const CLI_AUTH_FILENAME = "Tencent-Cloud.coding-copilot.info";
/** Whether this Linux process is running inside Windows Subsystem for Linux. */
function isWsl() {
	if (process.platform !== "linux") return false;
	if (process.env["WSL_DISTRO_NAME"] !== void 0 || process.env["WSL_INTEROP"] !== void 0) return true;
	return release().toLowerCase().includes("microsoft");
}
/** Convert a Windows drive path to WSL's conventional `/mnt/<drive>` form. */
function windowsPathForWsl(value) {
	const path = value?.trim();
	if (!path) return void 0;
	if (path.startsWith("/")) return path;
	const drivePath = /^([a-z]):[\\/](.*)$/iu.exec(path);
	if (drivePath === null) return void 0;
	return join("/mnt", drivePath[1].toLowerCase(), ...drivePath[2].split(/[\\/]+/u));
}
/** Windows auth directories visible from a WSL process. */
function wslAuthDirCandidates(home) {
	const profile = windowsPathForWsl(process.env["USERPROFILE"]) ?? join("/mnt/c/Users", basename(home));
	const localAppData = windowsPathForWsl(process.env["LOCALAPPDATA"]) ?? join(profile, "AppData", "Local");
	const roamingAppData = windowsPathForWsl(process.env["APPDATA"]) ?? join(profile, "AppData", "Roaming");
	return [join(localAppData, ...AUTH_DIR_RELATIVE), join(roamingAppData, ...AUTH_DIR_RELATIVE)];
}
/**
* Platform-default candidates for the auth directory, in probe order.
* Windows probes both AppData roots: current builds write under
* `%LOCALAPPDATA%` (Local), older ones under `%APPDATA%` (Roaming). WSL probes
* those same Windows locations through its mounted Windows profile before the
* native Linux location.
*/
function defaultAuthDirCandidates() {
	const home = homedir();
	if (process.platform === "darwin") return [join(home, "Library", "Application Support", ...AUTH_DIR_RELATIVE)];
	if (process.platform === "win32") return [join(home, "AppData", "Local", ...AUTH_DIR_RELATIVE), join(home, "AppData", "Roaming", ...AUTH_DIR_RELATIVE)];
	if (process.platform === "linux") {
		const linux = join(home, ".config", ...AUTH_DIR_RELATIVE);
		return isWsl() ? [...wslAuthDirCandidates(home), linux] : [linux];
	}
	return [];
}
/** First platform-default candidate; see {@link defaultAuthDirCandidates}. */
function defaultAuthDir() {
	return defaultAuthDirCandidates()[0];
}
/** Normalize an expiry that may arrive in seconds or milliseconds. */
function expiryToMs(value) {
	if (value <= 0) return 0;
	return value > 0xe8d4a51000 ? value : value * 1e3;
}
function optionalString(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
/**
* Parse a CodeBuddy auth document in either on-disk shape: the nested form
* `{"auth":{...},"account":{...}}` (both the CLI and the desktop IDE write
* this) and the flat panel form. Returns undefined when the document carries
* no access token.
*/
function parseCodeBuddyAuth(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
	const document = parsed;
	let auth;
	let identity;
	if (typeof document["auth"] === "object" && document["auth"] !== null) {
		auth = document["auth"];
		identity = typeof document["account"] === "object" && document["account"] !== null ? document["account"] : {};
	} else {
		auth = document;
		identity = document;
	}
	const accessToken = typeof auth["accessToken"] === "string" ? auth["accessToken"] : "";
	if (accessToken === "") return void 0;
	const expiresAtMs = typeof auth["expiresAt"] === "number" ? expiryToMs(auth["expiresAt"]) : 0;
	const refreshExpiresAtMs = typeof auth["refreshExpiresAt"] === "number" ? expiryToMs(auth["refreshExpiresAt"]) : void 0;
	const enterpriseId = optionalString(identity["enterpriseId"]);
	const nickname = optionalString(identity["nickname"]);
	return {
		accessToken,
		refreshToken: typeof auth["refreshToken"] === "string" ? auth["refreshToken"] : "",
		expiresAtMs,
		...refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs },
		domain: optionalString(auth["domain"]) ?? "",
		uid: optionalString(identity["uid"]) ?? "",
		...enterpriseId === void 0 ? {} : { enterpriseId },
		...nickname === void 0 ? {} : { nickname },
		source: "cli"
	};
}
/** Serialize the plugin-owned copy. */
function ownDocument(credential) {
	return {
		version: OWN_FORMAT_VERSION,
		credential
	};
}
/** Parse the plugin-owned copy; other versions and shapes are rejected. */
function parseOwnDocument(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
	const document = parsed;
	if (document["version"] !== OWN_FORMAT_VERSION) return void 0;
	if (typeof document["credential"] !== "object" || document["credential"] === null) return void 0;
	const stored = document["credential"];
	const accessToken = typeof stored["accessToken"] === "string" ? stored["accessToken"] : "";
	if (accessToken === "") return void 0;
	const refreshExpiresAtMs = typeof stored["refreshExpiresAtMs"] === "number" ? stored["refreshExpiresAtMs"] : void 0;
	const enterpriseId = optionalString(stored["enterpriseId"]);
	const nickname = optionalString(stored["nickname"]);
	return {
		accessToken,
		refreshToken: typeof stored["refreshToken"] === "string" ? stored["refreshToken"] : "",
		expiresAtMs: typeof stored["expiresAtMs"] === "number" ? stored["expiresAtMs"] : 0,
		...refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs },
		domain: optionalString(stored["domain"]) ?? "",
		uid: optionalString(stored["uid"]) ?? "",
		...enterpriseId === void 0 ? {} : { enterpriseId },
		...nickname === void 0 ? {} : { nickname },
		source: "dsh"
	};
}
/** Whether a filesystem error reports an absent path. */
function isENOENT(error) {
	return error?.code === "ENOENT";
}
/** Rank bonus for the file the CLI itself maintains. */
const CLI_FILE_RANK = 2;
/** Rank bonus for a document whose account carries `lastLogin: true`. */
const LAST_LOGIN_RANK = 1;
/**
* Scan one auth directory for parsable `.info` files and rank them. The
* CLI's own file (`Tencent-Cloud.coding-copilot.info`) outranks everything;
* `account.lastLogin === true` outranks the rest; equal ranks break by file
* mtime, newest first. Unparsable and token-less files are skipped.
*/
async function discoverInDir(dir) {
	let entries;
	try {
		entries = await readdir(dir);
	} catch (error) {
		if (isENOENT(error)) return [];
		throw error;
	}
	const found = [];
	for (const entry of entries) {
		if (!entry.endsWith(".info")) continue;
		const path = join(dir, entry);
		let text;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			if (isENOENT(error)) continue;
			throw error;
		}
		const credential = parseCodeBuddyAuth(text);
		if (credential === void 0) continue;
		let rank = entry === CLI_AUTH_FILENAME ? CLI_FILE_RANK : 0;
		let mtimeMs = 0;
		try {
			mtimeMs = (await stat(path)).mtimeMs;
		} catch {}
		try {
			const document = JSON.parse(text);
			if ((typeof document["account"] === "object" && document["account"] !== null ? document["account"] : void 0)?.["lastLogin"] === true) rank += LAST_LOGIN_RANK;
		} catch {}
		found.push({
			path,
			credential,
			rank,
			mtimeMs
		});
	}
	return found.sort((a, b) => b.rank - a.rank || b.mtimeMs - a.mtimeMs);
}
/**
* Read-only credential store with demand-driven refresh.
*
* Refresh policy: refresh only when the access token is inside the margin
* (or already expired), keep the refreshed credential in the plugin-owned
* copy, and never write the CLI's auth file. A failed refresh still
* returns a not-yet-expired token so an unreachable refresh endpoint does
* not take down a working session.
*/
var CodeBuddyCredentialStore = class {
	refresh;
	refreshMarginMs;
	ownPath;
	cliPathOverride;
	inflight;
	accountStore;
	constructor(options) {
		this.refresh = options.refresh;
		this.refreshMarginMs = options.refreshMarginMs ?? 3e5;
		this.ownPath = options.ownPath ?? codebuddyOwnAuthPath();
		this.cliPathOverride = options.cliPath;
		this.accountStore = options.accountStore;
	}
	/**
	* Configuration precedence for the CLI file: the plugin's configured path,
	* then the environment variable, then the platform defaults. An explicit
	* path is used verbatim; the defaults are a discovery order.
	*/
	resolveCliCandidates() {
		const fromEnv = process.env[CODEBUDDY_AUTH_FILE_ENV];
		const explicit = this.cliPathOverride ?? (fromEnv !== void 0 && fromEnv.trim() !== "" ? fromEnv : void 0);
		if (explicit !== void 0) return [explicit];
		return defaultAuthDirCandidates();
	}
	/** The first auth-directory candidate, for diagnostics. */
	cliAuthDir() {
		if (this.cliPathOverride !== void 0) return this.cliPathOverride;
		const fromEnv = process.env[CODEBUDDY_AUTH_FILE_ENV];
		if (fromEnv !== void 0 && fromEnv.trim() !== "") return fromEnv;
		return defaultAuthDir();
	}
	/**
	* Repoint the CLI auth file; a settings change applies on the next read.
	*/
	setCliPath(path) {
		this.cliPathOverride = path;
	}
	/** The configured CLI auth-file path, for diagnostics. */
	cliAuthPath() {
		return this.resolveCliCandidates()[0];
	}
	/** The plugin-owned copy path, for diagnostics. */
	ownAuthPath() {
		return this.ownPath;
	}
	/** Read the freshest stored credential without refreshing anything. */
	async current() {
		if (this.accountStore !== void 0) {
			const active = await this.accountStore.activeCredential();
			if (active !== void 0) return active;
		}
		const [cli, own] = await Promise.all([this.readCli(), this.readOwn()]);
		if (cli === void 0) return own;
		if (own === void 0) return cli;
		return own.expiresAtMs > cli.expiresAtMs ? own : cli;
	}
	/**
	* The credential to send upstream: {@link current}, refreshed on demand.
	* Single-flight, so parallel requests share one refresh.
	*/
	async resolve() {
		const credential = await this.current();
		if (credential === void 0) {
			const dirs = defaultAuthDirCandidates();
			const where = dirs.length > 0 ? dirs.join(" or ") : "(no auth directory on this platform)";
			throw new Error(`codebuddy-cli: no signed-in CodeBuddy account found; run \`codebuddy\` once and sign in (expected a .info file under ${where}, or set ${CODEBUDDY_AUTH_FILE_ENV}), or refresh an existing session`);
		}
		if (!this.needsRefresh(credential)) return credential;
		this.inflight ??= this.refreshNow(credential).finally(() => {
			this.inflight = void 0;
		});
		return this.inflight;
	}
	/** Read-only sign-in summary; never refreshes and never throws. */
	async status() {
		try {
			const credential = await this.current();
			if (credential === void 0) return { state: "signed-out" };
			return {
				state: "signed-in",
				expiresAtMs: credential.expiresAtMs,
				...credential.refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs: credential.refreshExpiresAtMs },
				...credential.nickname === void 0 ? {} : { nickname: credential.nickname },
				...credential.domain === "" ? {} : { domain: credential.domain },
				source: credential.source
			};
		} catch {
			return { state: "signed-out" };
		}
	}
	/** Remove the plugin-owned copy; the CLI's auth file is untouched. */
	async logout() {
		await rm(this.ownPath, { force: true });
		await rm(`${this.ownPath}.lock`, { force: true });
	}
	needsRefresh(credential) {
		if (credential.expiresAtMs <= 0) return true;
		return Date.now() + this.refreshMarginMs >= credential.expiresAtMs;
	}
	async refreshNow(credential) {
		if (credential.refreshToken === "") {
			if (credential.expiresAtMs > Date.now() + 3e4) return credential;
			throw new Error("codebuddy-cli: access token expired and no refresh token is stored; sign in again in the CodeBuddy CLI");
		}
		try {
			const outcome = await this.refresh(credential);
			const refreshed = {
				...credential,
				accessToken: outcome.accessToken,
				...outcome.refreshToken === void 0 ? {} : { refreshToken: outcome.refreshToken },
				expiresAtMs: outcome.expiresInSec !== void 0 ? Date.now() + outcome.expiresInSec * 1e3 : credential.expiresAtMs,
				...outcome.domain === void 0 || outcome.domain === "" ? {} : { domain: outcome.domain },
				source: "dsh"
			};
			if (this.accountStore !== void 0) {
				const doc = await this.accountStore.read();
				const targetId = credential.uid !== "" ? Object.keys(doc.accounts).find((id) => doc.accounts[id]?.uid === credential.uid) : doc.activeId !== void 0 && doc.accounts[doc.activeId] !== void 0 ? doc.activeId : void 0;
				if (targetId !== void 0) await this.accountStore.updateTokens(targetId, {
					accessToken: refreshed.accessToken,
					...outcome.refreshToken !== void 0 ? { refreshToken: outcome.refreshToken } : {},
					expiresAtMs: refreshed.expiresAtMs,
					...refreshed.refreshExpiresAtMs !== void 0 ? { refreshExpiresAtMs: refreshed.refreshExpiresAtMs } : {},
					...outcome.domain !== void 0 && outcome.domain !== "" ? { domain: outcome.domain } : {}
				});
			}
			await this.saveOwn(refreshed);
			return refreshed;
		} catch (error) {
			if (credential.expiresAtMs > Date.now() + 3e4) return credential;
			throw new Error(`codebuddy-cli: token refresh failed and the access token is expired (${String(error)}); run the CodeBuddy CLI once to sign in again`);
		}
	}
	async saveOwn(credential) {
		await withFileLock(this.ownPath, async () => {
			await writeFileAtomic(this.ownPath, `${JSON.stringify(ownDocument(credential), null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
		});
	}
	/**
	* Discover the best CLI credential: scan each default directory (or use a
	* single explicit path verbatim) in probe order and take the first
	* directory that yields a ranked candidate. Only an absent candidate
	* (ENOENT) falls through to the next; a present directory with no parsable
	* `.info` file is authoritative for its slot, so a stale older-version
	* location never silently wins over a broken newer one.
	*/
	async readCli() {
		for (const candidate of this.resolveCliCandidates()) {
			let statResult;
			try {
				statResult = await stat(candidate);
			} catch (error) {
				if (!isENOENT(error)) throw error;
				continue;
			}
			if (statResult.isFile()) return parseCodeBuddyAuth(await readFile(candidate, "utf8")) ?? void 0;
			const discovered = await discoverInDir(candidate);
			if (discovered.length > 0) return discovered[0].credential;
			return;
		}
	}
	async readOwn() {
		try {
			return parseOwnDocument(await readFile(this.ownPath, "utf8"));
		} catch (error) {
			if (isENOENT(error)) return void 0;
			return;
		}
	}
	/** Whether any auth-directory candidate yields a credential; diagnostics only. */
	async cliFilePresent() {
		for (const candidate of this.resolveCliCandidates()) try {
			if ((await stat(candidate)).isFile()) return true;
			if ((await discoverInDir(candidate)).length > 0) return true;
		} catch {}
		return false;
	}
};
//#endregion
//#region src/catalog.ts
/**
* Static CLI models observed on the CN endpoint (re-verified against the live
* catalog 2026-09-01, including the thinking-effort and billing metadata). The
* upstream refresh replaces this list at startup; it exists so the provider
* registers with a usable catalog even while the first fetch is in flight or
* offline.
*
* The list tracks the `cli` agent's model roster exactly: the 15 models the
* desktop CLI offers. Reasoning metadata is taken verbatim from the live
* endpoint — each model's supported effort set and whether thinking can be
* disabled — and the `free` flag follows the upstream `x0.00` credits marker.
*/
const FALLBACK_CODEBUDDY_MODELS = [
	{
		id: "auto",
		name: "Auto",
		contextWindow: 168e3,
		maxTokens: 32e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "high",
			canDisableThinking: false
		},
		billing: { free: false }
	},
	{
		id: "hy3",
		name: "Hy3",
		contextWindow: 192e3,
		maxTokens: 64e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "high",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.00",
			badges: ["限时免费"],
			free: true
		}
	},
	{
		id: "glm-5.2",
		name: "GLM-5.2",
		contextWindow: 1e6,
		maxTokens: 48e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.79 credits",
			badges: ["夜间折扣"],
			free: false
		}
	},
	{
		id: "glm-5.1",
		name: "GLM-5.1",
		contextWindow: 2e5,
		maxTokens: 48e3,
		supportsImages: false,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.79 credits",
			free: false
		}
	},
	{
		id: "glm-5v-turbo",
		name: "GLM-5v-Turbo",
		contextWindow: 2e5,
		maxTokens: 64e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.71 credits",
			free: false
		}
	},
	{
		id: "kimi-k3-1",
		name: "Kimi-K3",
		contextWindow: 1e6,
		maxTokens: 32e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x1.62 credits",
			free: false
		}
	},
	{
		id: "kimi-k2.7",
		name: "Kimi-K2.7-Code",
		contextWindow: 256e3,
		maxTokens: 32e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.57 credits",
			free: false
		}
	},
	{
		id: "kimi-k2.6",
		name: "Kimi-K2.6",
		contextWindow: 256e3,
		maxTokens: 32e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.52 credits",
			free: false
		}
	},
	{
		id: "minimax-m3",
		name: "MiniMax-M3",
		contextWindow: 512e3,
		maxTokens: 128e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "medium",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.25 credits",
			free: false
		}
	},
	{
		id: "deepseek-v4-flash",
		name: "Deepseek-V4-Flash",
		contextWindow: 1e6,
		maxTokens: 5e4,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "high",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.17 credits",
			free: false
		}
	},
	{
		id: "deepseek-v4-pro",
		name: "Deepseek-V4-Pro",
		contextWindow: 1e6,
		maxTokens: 5e4,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			defaultEffort: "high",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.51 credits",
			free: false
		}
	},
	{
		id: "hy4-preview",
		name: "Hy4 preview",
		contextWindow: 1e6,
		maxTokens: 64e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			supportedEfforts: ["high"],
			defaultEffort: "high",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.00",
			badges: ["限时免费"],
			free: true
		}
	},
	{
		id: "hy3-x",
		name: "Hy3",
		contextWindow: 192e3,
		maxTokens: 64e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			supportedEfforts: ["low", "high"],
			defaultEffort: "high",
			canDisableThinking: false
		},
		billing: {
			credits: "x0.05",
			free: false
		}
	},
	{
		id: "glm-5.3",
		name: "GLM-5.3",
		contextWindow: 1e6,
		maxTokens: 48e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			supportedEfforts: [
				"low",
				"high",
				"xhigh"
			],
			defaultEffort: "high",
			canDisableThinking: true
		},
		billing: {
			credits: "x0.79",
			free: false
		}
	},
	{
		id: "glm-5.3-flash",
		name: "GLM-5.3-Flash",
		contextWindow: 1e6,
		maxTokens: 32e3,
		supportsImages: true,
		reasoning: {
			supports: true,
			onlyReasoning: true,
			supportedEfforts: [
				"low",
				"high",
				"max"
			],
			defaultEffort: "high",
			canDisableThinking: true
		},
		billing: {
			credits: "x0.06",
			free: false
		}
	}
];
/** Mutable catalog shared by the shim's `/v1/models` and the adapter. */
var CodeBuddyCatalog = class {
	models = FALLBACK_CODEBUDDY_MODELS;
	/** Current entries; the fallback list until the upstream answer lands. */
	current() {
		return this.models;
	}
	/** Replace the list; callers invalidate their adapter snapshot after this. */
	set(models) {
		this.models = [...models];
	}
};
/**
* Narrow a catalog to the user's enabled selection.
*
* The selection is an allowlist of model ids kept in this plugin's settings
* section (`enabledModels`). Two states mean "everything": an absent list (the
* out-of-the-box default, so an untouched install keeps serving the whole
* roster) and an empty list (a user who unchecked every row did not intend to
* empty their model picker — the composer would have nothing to select, which
* is worse than ignoring the edit).
*
* Ids in the selection that the catalog does not carry are ignored rather than
* failing: the upstream roster changes under a stored selection, and a
* retired id must not invalidate the rest of the list. If a selection matches
* nothing at all, the whole catalog is served — the same reasoning as the empty
* list, applied to a selection that has gone entirely stale.
*
* @param models - the full catalog as the upstream (or the fallback) describes it.
* @param enabled - the allowlist of model ids, or undefined for no restriction.
* @returns the models the picker should offer, in catalog order.
*/
function filterEnabledModels(models, enabled) {
	if (enabled === void 0 || enabled.length === 0) return models;
	const allow = new Set(enabled);
	const kept = models.filter((model) => allow.has(model.id));
	return kept.length === 0 ? models : kept;
}
//#endregion
//#region src/client-identity.ts
/**
* CodeBuddy client identity: the headers the upstream uses to attribute a
* request to a client product and version.
*
* The CodeBuddy backend does not read `User-Agent` to decide which client a
* request came from. It reads a dedicated header family — `X-IDE-Type`,
* `X-IDE-Name`, `X-IDE-Version` and `X-Product-Version` — which the official
* CLI sets on every call. A request that omits them is attributed to no client
* at all, which is what makes the plugin's traffic indistinguishable from an
* unattributed client in the backend console.
*
* The official CLI derives those values the same way every time:
*
* - `ideType` is `cli` (its host detection resolves a plain `codebuddy`
*   process to `cli`; `--acp` maps to `vscode-acp` and `--serve` to `web-ui`).
* - the version fields come from the installed CLI build, so they track the
*   CLI the user actually has rather than a compile-time constant.
*
* This module reproduces that identity for the plugin's own upstream calls:
* `X-IDE-Type` is the constant `cli`, while the version fields are resolved
* from the installed `@tencent-ai/codebuddy-code` package so they can never
* drift from the CLI the credential came from. Resolution is best-effort — a
* missing or unreadable install falls back to a neutral placeholder instead of
* failing the request, because identity metadata must never break chat.
*
* @module dsh-codebuddy-cli/client-identity
*/
/**
* The IDE type the official CLI reports for a plain (non-ACP, non-serve)
* process. Kept as an exact constant: it is what the backend matches on to
* classify traffic as CLI traffic.
*/
const CODEBUDDY_IDE_TYPE = "cli";
/** IDE name the CLI reports; mirrors its product name for the terminal. */
const CODEBUDDY_IDE_NAME = "cli";
/** npm package name of the CodeBuddy CLI. */
const CODEBUDDY_CLI_PACKAGE = "@tencent-ai/codebuddy-code";
/**
* Version reported when the installed CLI cannot be resolved. Deliberately a
* value that reads as "unknown" rather than a stale real version number: a
* plausible-but-wrong version is worse evidence than an honest placeholder.
*/
const CODEBUDDY_UNKNOWN_VERSION = "unknown";
/**
* How many ancestor directories to probe above each module search root when
* looking for a global install. Version managers nest their global prefix a
* couple of levels deep (fnm exposes `<prefix>/lib/node`), so a small bound
* covers them without walking to the filesystem root on every probe.
*/
const MAX_ANCESTOR_PROBE_DEPTH = 4;
/**
* Decorated `User-Agent` the upstream sees. Kept in the CLI's own
* `CLI/<version> CodeBuddy/<version>` shape and now derived from the real
* installed version instead of a hardcoded constant.
*/
function userAgentFor(version) {
	return `CLI/${version} CodeBuddy/${version}`;
}
/**
* Read the version of an installed CodeBuddy CLI package.
*
* Resolution order mirrors how the CLI itself would be located, most specific
* first:
*
* 1. an explicit `package.json` path, for tests and unusual installs;
* 2. the package resolved from the plugin's own module graph (works when the
*    CLI is co-installed with, or hoisted next to, the plugin);
* 3. every directory on this Node process's module search path, which covers
*    global installs under npm, pnpm, fnm, nvm and Volta without needing to
*    know any of their layouts;
* 4. the conventional global npm roots for the running platform.
*
* Every step is best-effort: any failure moves to the next candidate, and the
* final fallback is {@link CODEBUDDY_UNKNOWN_VERSION}.
*
* @param explicitPath - optional absolute path to a CLI `package.json`.
* @returns the installed version, or the unknown placeholder.
*/
async function resolveCodeBuddyCliVersion(explicitPath) {
	const candidates = [];
	if (explicitPath !== void 0 && explicitPath !== "") candidates.push(explicitPath);
	const resolved = resolveFromModuleGraph();
	if (resolved !== void 0) candidates.push(resolved);
	candidates.push(...moduleSearchPathCandidates());
	candidates.push(...globalPackageJsonCandidates());
	for (const candidate of candidates) {
		const version = await readVersionFrom(candidate);
		if (version !== void 0) return version;
	}
	return CODEBUDDY_UNKNOWN_VERSION;
}
/** Locate the CLI's `package.json` through the plugin's module resolution. */
function resolveFromModuleGraph() {
	try {
		return createRequire(import.meta.url).resolve(`${CODEBUDDY_CLI_PACKAGE}/package.json`);
	} catch {
		return;
	}
}
/**
* Candidate paths derived from the module resolution search path — the exact
* set of directories Node itself would consult for a global module. This is
* the portable answer to "where is a globally installed package": version
* managers such as fnm, nvm and Volta install into per-session or per-version
* roots that no fixed path can predict, but those roots appear on this list
* while the process runs.
*
* `require.resolve.paths` is the ESM-safe equivalent of `module.paths`, which
* does not exist under ES modules.
*/
function moduleSearchPathCandidates() {
	const parts = CODEBUDDY_CLI_PACKAGE.split("/");
	let roots = null;
	try {
		roots = createRequire(import.meta.url).resolve.paths(CODEBUDDY_CLI_PACKAGE);
	} catch {
		roots = null;
	}
	if (roots === null) return [];
	const candidates = [];
	for (const root of roots) {
		candidates.push(join(root, ...parts, "package.json"));
		let current = root;
		for (let depth = 0; depth < MAX_ANCESTOR_PROBE_DEPTH; depth += 1) {
			const parent = dirname(current);
			if (parent === current) break;
			candidates.push(join(parent, "node_modules", ...parts, "package.json"));
			current = parent;
		}
	}
	return candidates;
}
/**
* Conventional global install locations for the current platform, used as a
* last resort when the module search path does not cover the install.
*/
function globalPackageJsonCandidates() {
	const parts = CODEBUDDY_CLI_PACKAGE.split("/");
	const home = process.env["USERPROFILE"] ?? process.env["HOME"];
	const localAppData = process.env["LOCALAPPDATA"];
	const appData = process.env["APPDATA"];
	const roots = [];
	if (process.platform === "win32") {
		if (appData !== void 0 && appData !== "") roots.push(join(appData, "npm", "node_modules"));
		if (localAppData !== void 0 && localAppData !== "") roots.push(join(localAppData, "npm", "node_modules"));
	} else if (home !== void 0 && home !== "") roots.push(join(home, ".npm-global", "lib", "node_modules"));
	roots.push("/usr/local/lib/node_modules");
	roots.push("/usr/lib/node_modules");
	return roots.map((root) => join(root, ...parts, "package.json"));
}
/** Read and parse a `version` field from one `package.json`, if usable. */
async function readVersionFrom(packageJsonPath) {
	try {
		const parsed = JSON.parse(await readFile(packageJsonPath, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return void 0;
		const version = parsed["version"];
		return typeof version === "string" && version.trim() !== "" ? version.trim() : void 0;
	} catch {
		return;
	}
}
/**
* Headers that carry the client identity to the upstream. These are the same
* header names the official CLI uses, which is what makes the backend
* attribute plugin traffic to a `cli` client instead of leaving it blank.
*
* @param identity - resolved identity from {@link resolveClientIdentity}.
* @returns the identity header block.
*/
function clientIdentityHeaders(identity) {
	const headers = {
		"X-IDE-Type": identity.ideType,
		"X-IDE-Name": identity.ideName,
		"User-Agent": userAgentFor(identity.ideVersion)
	};
	if (identity.ideVersion !== "unknown") {
		headers["X-IDE-Version"] = identity.ideVersion;
		headers["X-Product-Version"] = identity.productVersion;
	}
	return headers;
}
/**
* Resolve the full client identity once, ready to splat into request headers.
*
* @param explicitPath - optional absolute CLI `package.json` path.
* @returns the resolved identity.
*/
async function resolveClientIdentity(explicitPath) {
	const version = await resolveCodeBuddyCliVersion(explicitPath);
	return {
		ideType: "cli",
		ideName: "cli",
		ideVersion: version,
		productVersion: version
	};
}
//#endregion
//#region src/upstream.ts
const CN_CHAT_BASE = "https://copilot.tencent.com";
const CN_BILLING_BASE = "https://www.codebuddy.cn";
const GLOBAL_BASE = "https://www.workbuddy.ai";
const JSON_TIMEOUT_MS = 3e4;
const ERROR_BODY_LIMIT = 4096;
/**
* Client identity carried on every upstream request.
*
* The backend attributes a request to a client only when the `X-IDE-*` family
* is present; without it the request shows up as an unattributed client. The
* identity is cached after the first successful resolution because reading the
* installed CLI's version touches the filesystem and the value is stable for
* the lifetime of the process.
*/
let cachedIdentity;
/**
* Identity resolution in flight, so concurrent first requests share one
* filesystem probe instead of racing to read the same file.
*/
let pendingIdentity;
/** Identity used before (or instead of) a successful filesystem resolution. */
const FALLBACK_IDENTITY = {
	ideType: "cli",
	ideName: "cli",
	ideVersion: CODEBUDDY_UNKNOWN_VERSION,
	productVersion: CODEBUDDY_UNKNOWN_VERSION
};
/**
* Resolve and cache the CLI client identity, tolerating any failure: identity
* metadata must never be able to break a chat request.
*
* @param packageJsonPath - optional explicit CLI `package.json` path.
* @returns the resolved identity.
*/
async function ensureClientIdentity(packageJsonPath) {
	return await startClientIdentityResolution(packageJsonPath);
}
/**
* Identity for the next request, starting resolution if it has not run yet.
*
* Request headers are built synchronously while version resolution is async,
* so the first request cannot wait for the real version. Rather than send a
* versionless request and rely on the caller to have warmed the cache, this
* kicks off resolution on first use: `startClientIdentityResolution` is called
* from the client constructor, and the version headers appear as soon as the
* probe settles.
*/
function startClientIdentityResolution(packageJsonPath) {
	if (cachedIdentity !== void 0) return Promise.resolve(cachedIdentity);
	pendingIdentity ??= (async () => {
		try {
			cachedIdentity = await resolveClientIdentity(packageJsonPath);
		} catch {
			cachedIdentity = FALLBACK_IDENTITY;
		}
		return cachedIdentity;
	})();
	return pendingIdentity;
}
/** Identity headers for the current request, resolving identity on first use. */
function identityHeaders() {
	return clientIdentityHeaders(cachedIdentity ?? FALLBACK_IDENTITY);
}
/** Daily check-in endpoint on the CN side. */
const CN_CHECKIN_PATH = "/v2/billing/meter/daily-checkin";
/** Upstream messages that mean "already checked in today". */
const CHECKIN_ALREADY_MARKERS = [
	"already",
	"checked in today",
	"already signed",
	"already checked",
	"已签到",
	"已签",
	"今日已",
	"签过"
];
/** Insufficient-credit markers, ASCII lowercase plus the original Chinese. */
const HARD_CREDIT_MARKERS = [
	"insufficient credit",
	"no credit",
	"credit exhausted",
	"out of credit",
	"quota exceeded",
	"quota exhaust",
	"payment required",
	"credit not enough",
	"not enough credit",
	"积分不足",
	"额度不足",
	"余额不足",
	"积分用完",
	"额度用尽",
	"没有积分"
];
/** The concrete effort spellings CodeBuddy exposes on the wire. */
const EFFORT_VALUES = [
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/** Promotional badge keys the upstream tags carry, minus their color suffix. */
const BADGE_PREFIX = "badge:";
/** Parse the upstream `reasoning` object into {@link CodeBuddyModelReasoning}. */
function resolveUpstreamReasoning(wrapped) {
	const supports = wrapped["supportsReasoning"] === true;
	const onlyReasoning = wrapped["onlyReasoning"] === true;
	const rawReasoning = wrapped["reasoning"];
	let supportedEfforts;
	let defaultEffort;
	let canDisableThinking = true;
	if (typeof rawReasoning === "object" && rawReasoning !== null && !Array.isArray(rawReasoning)) {
		const reasoning = rawReasoning;
		const rawEfforts = reasoning["supportedEfforts"];
		if (Array.isArray(rawEfforts)) {
			const efforts = rawEfforts.filter((value) => typeof value === "string" && EFFORT_VALUES.includes(value));
			if (efforts.length > 0) supportedEfforts = efforts;
		}
		if (typeof reasoning["defaultEffort"] === "string" && EFFORT_VALUES.includes(reasoning["defaultEffort"])) defaultEffort = reasoning["defaultEffort"];
		else if (typeof reasoning["effort"] === "string" && EFFORT_VALUES.includes(reasoning["effort"])) defaultEffort = reasoning["effort"];
		canDisableThinking = reasoning["canDisableThinking"] === true;
	}
	return { reasoning: {
		supports,
		onlyReasoning,
		...supportedEfforts === void 0 ? {} : { supportedEfforts },
		...defaultEffort === void 0 ? {} : { defaultEffort },
		canDisableThinking
	} };
}
/**
* Reduce an upstream credits string to its language-neutral display form.
*
* The host LLM seam carries this text to the browser, and the host has no
* locale service — whatever string is produced here is shown verbatim in every
* UI language. The upstream is inconsistent in a way that matters: some catalog
* rows report a bare multiplier (`x0.79`) and others append a unit word
* (`x0.79 credits`), and the unit word would pin the display to English.
* Dropping a trailing `credits` (case-insensitive, singular or plural) yields
* the one spelling that reads identically in every language.
*
* @param credits - raw upstream credits string, e.g. `"x0.79 credits"`.
* @returns the bare multiplier, or undefined when nothing displayable remains.
*/
function normalizeCredits(credits) {
	if (credits === void 0) return void 0;
	const trimmed = credits.trim();
	if (trimmed === "") return void 0;
	if (/^credits?$/iu.test(trimmed)) return void 0;
	const bare = trimmed.replace(/\s+credits?$/iu, "").trim();
	return bare === "" ? void 0 : bare;
}
/**
* Parse a usage row's request time into a local date key and epoch ms.
* Accepts numeric epoch (seconds or ms) and common `YYYY-MM-DD HH:MM:SS`
* spellings. Returns undefined when the value is unusable.
*/
function parseUsageTime(value, now) {
	if (typeof value === "number" && Number.isFinite(value)) {
		const ms = value < 0xe8d4a51000 ? value * 1e3 : value;
		const date = new Date(ms);
		if (Number.isNaN(date.getTime())) return void 0;
		return {
			date,
			ts: ms
		};
	}
	if (typeof value === "string" && value.trim() !== "") {
		const text = value.trim();
		const numeric = Number(text);
		if (Number.isFinite(numeric)) {
			const ms = numeric < 0xe8d4a51000 ? numeric * 1e3 : numeric;
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) return void 0;
			return {
				date,
				ts: ms
			};
		}
		const withTime = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/u.exec(text);
		if (withTime !== null) {
			const date = new Date(Number(withTime[1]), Number(withTime[2]) - 1, Number(withTime[3]), Number(withTime[4]), Number(withTime[5]), Number(withTime[6] ?? 0));
			if (Number.isNaN(date.getTime())) return void 0;
			return {
				date,
				ts: date.getTime()
			};
		}
		const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
		if (dateOnly !== null) {
			const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0);
			if (Number.isNaN(date.getTime())) return void 0;
			return {
				date,
				ts: date.getTime()
			};
		}
	}
}
/** Whole days from `fromKey` to `toKey` (positive when to is later). */
function daysBetween(fromKey, toKey) {
	const [fy, fm, fd] = fromKey.split("-").map(Number);
	const [ty, tm, td] = toKey.split("-").map(Number);
	const from = Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1);
	const to = Date.UTC(ty, (tm ?? 1) - 1, td ?? 1);
	return Math.round((to - from) / 864e5);
}
/** Parse the upstream `tags` / `credits` fields into billing metadata. */
function resolveUpstreamBilling(wrapped) {
	const rawCredits = wrapped["credits"];
	const credits = typeof rawCredits === "string" && rawCredits.trim() !== "" ? rawCredits.trim() : void 0;
	const badges = [];
	const rawTags = wrapped["tags"];
	if (Array.isArray(rawTags)) for (const tag of rawTags) {
		if (typeof tag !== "string") continue;
		if (!tag.toLowerCase().startsWith(BADGE_PREFIX)) continue;
		const label = tag.slice(6).split(":")[0] ?? tag.slice(6);
		if (label !== "") badges.push(label);
	}
	const free = credits !== void 0 && /^x?0\.0+$/u.test(credits);
	return { billing: {
		...credits === void 0 ? {} : { credits },
		...badges.length === 0 ? {} : { badges },
		free
	} };
}
/** Session-invalidation markers that mean "sign in again in the CodeBuddy app". */
const SESSION_DEAD_MARKERS = ["Offline user session not found", "12153"];
/** Classify an upstream failure from its HTTP status and body excerpt. */
function classifyUpstreamError(status, body) {
	if (status === 402) return "hard_credit";
	const lower = body.toLowerCase();
	for (const marker of HARD_CREDIT_MARKERS) if (lower.includes(marker.toLowerCase()) || body.includes(marker)) return "hard_credit";
	for (const marker of SESSION_DEAD_MARKERS) if (body.includes(marker)) return "session_dead";
	if (status === 429) return "soft_rate";
	if (status === 404) return "not_found";
	if (status >= 500) return "server";
	if (status >= 400) return "client";
	return "client";
}
/** Region for a login domain; an empty domain means CN (matching upstream tooling). */
function regionOf(domain) {
	const lowered = domain.trim().toLowerCase();
	if (lowered === "workbuddy.ai" || lowered.endsWith(".workbuddy.ai")) return "global";
	return "cn";
}
function chatBase(credential) {
	return regionOf(credential.domain) === "global" ? GLOBAL_BASE : CN_CHAT_BASE;
}
function billingBase(credential) {
	return regionOf(credential.domain) === "global" ? GLOBAL_BASE : CN_BILLING_BASE;
}
function originReferer(credential) {
	return regionOf(credential.domain) === "global" ? GLOBAL_BASE : CN_BILLING_BASE;
}
/** Headers every upstream request shares. */
function commonHeaders(credential) {
	return {
		"Accept": "application/json, text/plain, */*",
		"X-Requested-With": "XMLHttpRequest",
		"Origin": originReferer(credential),
		"Referer": `${originReferer(credential)}/`,
		...identityHeaders()
	};
}
/** Chat request headers, including the X-No-* conventions the official CLI uses. */
function chatHeaders(credential) {
	return {
		...commonHeaders(credential),
		"Content-Type": "application/json",
		...credential.uid === "" ? { "X-No-User-Id": "1" } : { "X-User-Id": credential.uid },
		...credential.enterpriseId === void 0 || credential.enterpriseId === "" ? { "X-No-Enterprise-Id": "1" } : { "X-Enterprise-Id": credential.enterpriseId },
		...credential.domain === "" ? { "X-No-Department-Info": "1" } : { "X-Domain": credential.domain },
		"X-Product": "SaaS"
	};
}
/** Refresh-endpoint headers; X-Refresh-Token appears here and nowhere else. */
function refreshHeaders(credential) {
	const headers = {
		...commonHeaders(credential),
		"X-Refresh-Token": credential.refreshToken,
		"X-Auth-Refresh-Source": "workbuddy"
	};
	if (credential.enterpriseId !== void 0 && credential.enterpriseId !== "") headers["X-Enterprise-Id"] = credential.enterpriseId;
	return headers;
}
/** Billing request headers. */
function billingHeaders(credential) {
	const headers = {
		"Authorization": `Bearer ${credential.accessToken}`,
		"Accept": "application/json",
		"Content-Type": "application/json",
		...identityHeaders()
	};
	if (credential.uid !== "") headers["X-User-Id"] = credential.uid;
	if (credential.enterpriseId !== void 0 && credential.enterpriseId !== "") {
		headers["X-Enterprise-Id"] = credential.enterpriseId;
		headers["X-Tenant-Id"] = credential.enterpriseId;
	}
	if (credential.domain !== "") headers["X-Domain"] = credential.domain;
	return headers;
}
/**
* Daily check-in request headers. The billing headers already carry the
* authorization and identity fields; the check-in endpoint additionally wants
* an explicit domain header, so an empty credential domain falls back to the
* CN web domain rather than omitting the field.
*/
function checkInHeaders(credential) {
	return {
		...billingHeaders(credential),
		"X-Domain": credential.domain.trim() === "" ? "www.codebuddy.cn" : credential.domain
	};
}
/**
* Normalize an OpenAI chat-completions body for the CodeBuddy upstream:
* force `stream: true` (the upstream rejects non-streaming), flatten
* `tool_choice` (the upstream's field is a string; object forms return 400),
* and rewrite `developer` messages as `system`.
*
* The `developer` rewrite is load-bearing: pi-ai emits the system prompt as
* `role: "developer"` (the OpenAI convention it adopted), but the CodeBuddy
* upstream rejects that role with HTTP 400 code 11128 ("Illegal API
* invocation from an unapproved channel"). Rewriting to `system` is the
* compatible spelling the upstream accepts.
*/
function prepareChatBody(source) {
	let body;
	try {
		body = JSON.parse(source);
	} catch {
		return source;
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) return source;
	const obj = body;
	obj["stream"] = true;
	normalizeDeveloperRole(obj);
	normalizeToolChoice(obj);
	return JSON.stringify(obj);
}
/** Rewrite `role: "developer"` messages to `role: "system"` (upstream rejects developer). */
function normalizeDeveloperRole(obj) {
	const messages = obj["messages"];
	if (!Array.isArray(messages)) return;
	for (const message of messages) {
		if (typeof message !== "object" || message === null || Array.isArray(message)) continue;
		const wrapped = message;
		if (wrapped["role"] === "developer") wrapped["role"] = "system";
	}
}
/** Rewrite OpenAI `tool_choice` spellings into the upstream's string form. */
function normalizeToolChoice(obj) {
	const suppress = () => {
		delete obj["tools"];
		delete obj["functions"];
	};
	if (!("tool_choice" in obj)) return;
	const choice = obj["tool_choice"];
	if (typeof choice === "string") {
		if (choice.trim().toLowerCase() === "none") {
			delete obj["tool_choice"];
			suppress();
		}
		return;
	}
	if (typeof choice === "object" && choice !== null && !Array.isArray(choice)) {
		const wrapped = choice;
		const type = typeof wrapped["type"] === "string" ? wrapped["type"].trim().toLowerCase() : "";
		if (type === "none") {
			delete obj["tool_choice"];
			suppress();
		} else if (type === "auto" || type === "required") obj["tool_choice"] = type;
		else if (type === "function") {
			const fn = typeof wrapped["function"] === "object" && wrapped["function"] !== null ? wrapped["function"] : void 0;
			let name = typeof fn?.["name"] === "string" ? fn["name"] : "";
			if (name === "" && typeof wrapped["name"] === "string") name = wrapped["name"];
			name = name.trim();
			obj["tool_choice"] = name !== "" ? name : "auto";
		} else delete obj["tool_choice"];
		return;
	}
	delete obj["tool_choice"];
}
async function readEnvelope(response) {
	const text = await response.text();
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`codebuddy upstream returned non-JSON (http ${response.status}): ${text.slice(0, 160)}`);
	}
	if (typeof parsed !== "object" || parsed === null) throw new Error(`codebuddy upstream returned an unexpected document (http ${response.status})`);
	const document = parsed;
	return {
		code: typeof document["code"] === "number" ? document["code"] : 0,
		msg: typeof document["msg"] === "string" ? document["msg"] : "",
		data: "data" in document ? document["data"] : void 0
	};
}
/** Fail an envelope whose business code is non-zero, classified like HTTP errors. */
function envelopeError(status, envelope) {
	const kind = classifyUpstreamError(status, envelope.msg);
	return /* @__PURE__ */ new Error(`codebuddy upstream ${kind} (http ${status}): ${envelope.msg.slice(0, 160)}`);
}
/**
* Upstream HTTP client. One instance serves the whole plugin; requests take
* the credential explicitly so token refreshes apply on the next call.
*/
var CodeBuddyUpstreamClient = class {
	/**
	* Begin resolving the client identity as soon as a client exists.
	*
	* Request headers are assembled synchronously, so the version headers can
	* only appear once resolution has settled. Warming it here means the first
	* request already carries them in practice, and a request issued before the
	* probe finishes still carries `X-IDE-Type`/`X-IDE-Name` in the meantime.
	*/
	constructor() {
		startClientIdentityResolution().catch(() => {});
	}
	/** POST the chat endpoint; a successful answer is the raw SSE response. */
	async chatStream(credential, bodyJson, signal) {
		let response;
		try {
			response = await fetch(`${chatBase(credential)}/v2/chat/completions`, {
				method: "POST",
				headers: {
					...chatHeaders(credential),
					"Authorization": `Bearer ${credential.accessToken}`
				},
				body: bodyJson,
				...signal === void 0 ? {} : { signal }
			});
		} catch (error) {
			return {
				ok: false,
				status: 0,
				kind: "server",
				message: `transport error: ${String(error)}`
			};
		}
		if (response.ok) return {
			ok: true,
			response
		};
		const text = (await response.text()).slice(0, ERROR_BODY_LIMIT);
		return {
			ok: false,
			status: response.status,
			kind: classifyUpstreamError(response.status, text),
			message: text
		};
	}
	/** POST the token-refresh endpoint; the caller merges the outcome. */
	async refreshToken(credential) {
		const response = await fetch(`${chatBase(credential)}/v2/plugin/auth/token/refresh`, {
			method: "POST",
			headers: refreshHeaders(credential),
			signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
		});
		const envelope = await readEnvelope(response);
		if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
		const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
		const accessToken = typeof data["accessToken"] === "string" ? data["accessToken"] : "";
		if (accessToken === "") throw new Error("codebuddy token refresh returned no accessToken; sign in again in the CodeBuddy app");
		const outcome = { accessToken };
		if (typeof data["refreshToken"] === "string" && data["refreshToken"] !== "") outcome.refreshToken = data["refreshToken"];
		if (typeof data["expiresIn"] === "number" && data["expiresIn"] > 0) outcome.expiresInSec = data["expiresIn"];
		if (typeof data["domain"] === "string" && data["domain"] !== "") outcome.domain = data["domain"];
		return outcome;
	}
	/** GET the personal model catalog and keep the `cli` agent's models only. */
	async fetchModels(credential) {
		const response = await fetch(`${chatBase(credential)}/console/enterprises/personal/models`, {
			headers: {
				"Authorization": `Bearer ${credential.accessToken}`,
				"Accept": "application/json",
				"Origin": originReferer(credential),
				"Referer": `${originReferer(credential)}/`,
				...identityHeaders()
			},
			signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
		});
		const envelope = await readEnvelope(response);
		if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
		const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
		const rawModels = Array.isArray(data["models"]) ? data["models"] : [];
		const agents = Array.isArray(data["agents"]) ? data["agents"] : [];
		let cliIds;
		for (const agent of agents) if (typeof agent === "object" && agent !== null) {
			const wrapped = agent;
			if (wrapped["name"] === "cli" && Array.isArray(wrapped["models"])) {
				cliIds = wrapped["models"].filter((id) => typeof id === "string");
				break;
			}
		}
		if (cliIds === void 0 || cliIds.length === 0) throw new Error("codebuddy model catalog lists no cli agent models");
		const byId = /* @__PURE__ */ new Map();
		for (const model of rawModels) {
			if (typeof model !== "object" || model === null) continue;
			const wrapped = model;
			const id = typeof wrapped["id"] === "string" ? wrapped["id"] : "";
			if (id === "" || wrapped["disabled"] === true) continue;
			const input = typeof wrapped["maxInputTokens"] === "number" ? wrapped["maxInputTokens"] : 0;
			const output = typeof wrapped["maxOutputTokens"] === "number" ? wrapped["maxOutputTokens"] : 0;
			if (input <= 0 || output <= 0) continue;
			byId.set(id, {
				id,
				name: typeof wrapped["name"] === "string" && wrapped["name"] !== "" ? wrapped["name"] : id,
				contextWindow: input,
				maxTokens: output,
				supportsImages: wrapped["supportsImages"] === true && wrapped["disabledMultimodal"] !== true,
				...resolveUpstreamReasoning(wrapped),
				...resolveUpstreamBilling(wrapped)
			});
		}
		const models = cliIds.map((id) => byId.get(id)).filter((model) => model !== void 0);
		if (models.length === 0) throw new Error("codebuddy model catalog resolved to an empty list");
		return models;
	}
	/** POST the billing endpoint for the aggregated remaining credit. */
	async fetchCredits(credential) {
		const now = /* @__PURE__ */ new Date();
		const format = (date) => [
			date.getFullYear().toString().padStart(4, "0"),
			(date.getMonth() + 1).toString().padStart(2, "0"),
			date.getDate().toString().padStart(2, "0")
		].join("-") + " " + [
			date.getHours().toString().padStart(2, "0"),
			date.getMinutes().toString().padStart(2, "0"),
			date.getSeconds().toString().padStart(2, "0")
		].join(":");
		const response = await fetch(`${billingBase(credential)}/v2/billing/meter/get-user-resource`, {
			method: "POST",
			headers: billingHeaders(credential),
			body: JSON.stringify({
				PageNumber: 1,
				PageSize: 100,
				ProductCode: "p_tcaca",
				Status: [0, 3],
				PackageEndTimeRangeBegin: format(now),
				PackageEndTimeRangeEnd: format(new Date(now.getTime() + 3185136e6))
			}),
			signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
		});
		const envelope = await readEnvelope(response);
		if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
		const responseWrapper = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
		const data = typeof responseWrapper["Response"] === "object" && responseWrapper["Response"] !== null ? responseWrapper["Response"] : {};
		const inner = typeof data["Data"] === "object" && data["Data"] !== null ? data["Data"] : {};
		const rawAccounts = Array.isArray(inner["Accounts"]) ? inner["Accounts"] : [];
		const accounts = [];
		let total = 0;
		const nowMs = Date.now();
		const struct = (raw) => {
			if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
			return raw;
		};
		const num = (account, ...keys) => {
			for (const key of keys) {
				const value = account[key];
				const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
				if (Number.isFinite(parsed)) return parsed;
			}
			return 0;
		};
		const tsMs = (value) => {
			const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
			if (!Number.isFinite(parsed)) return void 0;
			const ms = parsed < 0xe8d4a51000 ? parsed * 1e3 : parsed;
			return ms > 0 ? ms : void 0;
		};
		for (const rawItem of rawAccounts) {
			const account = struct(rawItem);
			if (account === void 0) continue;
			const cycleSize = num(account, "CycleCapacitySize", "CycleCapacitySizePrecise");
			const cycleRemain = num(account, "CycleCapacityRemain", "CycleCapacityRemainPrecise", "CycleRemainCapacity");
			const cycleUsed = num(account, "CycleCapacityUsed", "CycleCapacityUsedPrecise");
			const capacitySize = num(account, "CapacitySize", "CapacitySizePrecise");
			const capacityRemain = num(account, "CapacityRemain", "CapacityRemainPrecise");
			const capacityUsed = num(account, "CapacityUsed", "CapacityUsedPrecise");
			let size;
			let remain;
			let used;
			if (cycleSize > 0) {
				size = cycleSize;
				remain = cycleRemain;
				used = cycleUsed;
			} else if (cycleRemain > 0 || cycleUsed > 0) {
				size = cycleSize;
				remain = cycleRemain;
				used = cycleUsed;
			} else {
				size = capacitySize;
				remain = capacityRemain;
				used = capacityUsed;
			}
			if (size <= 0 && cycleSize > 0) size = cycleSize;
			if (remain < 0) remain = 0;
			if (used < 0) used = 0;
			const expireAtMs = tsMs(account["DeductionEndTime"] ?? account["deductionEndTime"] ?? account["ExpiredTime"] ?? account["expiredTime"] ?? account["CycleEndTime"] ?? account["cycleEndTime"]);
			const expired = expireAtMs !== void 0 && expireAtMs <= nowMs;
			const expiringSoon = expireAtMs !== void 0 && !expired && expireAtMs - nowMs <= 6048e5;
			total += remain;
			accounts.push({
				...typeof account["PackageCode"] === "string" && account["PackageCode"] !== "" ? { packageCode: account["PackageCode"] } : {},
				packageName: typeof account["PackageName"] === "string" && account["PackageName"] !== "" ? account["PackageName"] : "(unnamed)",
				total: size,
				remain,
				used,
				size,
				...expireAtMs !== void 0 ? { expireAtMs } : {},
				expired,
				expiringSoon
			});
		}
		return {
			total,
			accounts
		};
	}
	/**
	* Fetch official per-request usage over a window and aggregate it.
	*
	* The upstream billing endpoint (`get-user-request-usage`) returns paginated
	* rows of individual billing requests (credit consumed, model, client,
	* request time). The rows are aggregated in-process into today / 7-day /
	* month totals, a zero-filled daily series, and a per-model breakdown,
	* which back the plugin's credit-statistics panel.
	*
	* Pagination follows the upstream page contract; a capped page count guards
	* against runaway loops. Window days default to 31 (the upstream's range).
	*/
	async fetchUsage(credential, windowDays = 31) {
		const now = /* @__PURE__ */ new Date();
		const dateKey = (date) => [
			date.getFullYear().toString().padStart(4, "0"),
			(date.getMonth() + 1).toString().padStart(2, "0"),
			date.getDate().toString().padStart(2, "0")
		].join("-");
		const timeParts = (date) => [
			date.getFullYear().toString().padStart(4, "0"),
			(date.getMonth() + 1).toString().padStart(2, "0"),
			date.getDate().toString().padStart(2, "0")
		].join("-") + " " + [
			date.getHours().toString().padStart(2, "0"),
			date.getMinutes().toString().padStart(2, "0"),
			date.getSeconds().toString().padStart(2, "0")
		].join(":");
		const rangeStart = new Date(now);
		rangeStart.setDate(rangeStart.getDate() - (windowDays - 1));
		rangeStart.setHours(0, 0, 0, 0);
		const rangeEnd = new Date(now);
		rangeEnd.setHours(23, 59, 59, 999);
		const rangeStartKey = dateKey(rangeStart);
		const rangeEndKey = dateKey(rangeEnd);
		const url = `${billingBase(credential)}/billing/meter/get-user-request-usage`;
		const pageSize = 3e3;
		const maxPages = 100;
		const rows = [];
		let reportedTotal = 0;
		let fetchedRaw = 0;
		let pages = 0;
		let lastError;
		for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
			let response;
			try {
				response = await fetch(url, {
					method: "POST",
					headers: billingHeaders(credential),
					body: JSON.stringify({
						startTime: timeParts(rangeStart),
						endTime: timeParts(rangeEnd),
						pageNum,
						pageSize
					}),
					signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
				});
			} catch (error) {
				lastError = `transport error: ${String(error)}`;
				break;
			}
			let envelope;
			try {
				envelope = await readEnvelope(response);
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
				break;
			}
			if (!response.ok || envelope.code !== 0 && envelope.code !== 200) {
				lastError = envelope.msg.trim() === "" ? `http ${response.status}` : envelope.msg;
				break;
			}
			const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
			const rawRows = Array.isArray(data["data"]) ? data["data"] : [];
			const total = typeof data["total"] === "number" ? data["total"] : typeof data["total"] === "string" ? Number(data["total"]) : rawRows.length;
			if (Number.isFinite(total) && total > reportedTotal) reportedTotal = Math.round(total);
			fetchedRaw += rawRows.length;
			for (const raw of rawRows) {
				if (typeof raw !== "object" || raw === null) continue;
				const row = raw;
				const credit = typeof row["credit"] === "number" ? row["credit"] : typeof row["credit"] === "string" ? Number(row["credit"]) : NaN;
				if (!Number.isFinite(credit) || credit < 0) continue;
				const rawTime = row["requestTime"] ?? row["request_time"] ?? row["requesttime"];
				const parsed = parseUsageTime(rawTime, now);
				if (parsed === void 0) continue;
				const date = dateKey(parsed.date);
				if (date < rangeStartKey || date > rangeEndKey) continue;
				rows.push({
					requestId: typeof row["requestId"] === "string" ? row["requestId"] : typeof row["request_id"] === "string" ? row["request_id"] : "unknown",
					model: typeof row["model"] === "string" && row["model"] !== "" ? row["model"] : "—",
					client: typeof row["client"] === "string" && row["client"] !== "" ? row["client"] : "—",
					credit,
					requestTime: typeof rawTime === "string" ? rawTime : String(rawTime ?? date),
					ts: parsed.ts,
					date
				});
			}
			pages += 1;
			if (!(rawRows.length > 0 && fetchedRaw < reportedTotal && pageNum < maxPages)) break;
		}
		const truncated = reportedTotal > 0 && fetchedRaw < reportedTotal;
		const todayKey = dateKey(now);
		const monthPrefix = now.getFullYear().toString() + "-" + (now.getMonth() + 1).toString().padStart(2, "0");
		let usageToday = 0;
		let usage7Days = 0;
		let usageThisMonth = 0;
		const daily = /* @__PURE__ */ new Map();
		const dailyModels = /* @__PURE__ */ new Map();
		const modelTotals = /* @__PURE__ */ new Map();
		const sorted = [...rows].sort((a, b) => b.ts - a.ts);
		for (const row of sorted) {
			const distance = daysBetween(row.date, todayKey);
			if (distance === 0) usageToday += row.credit;
			if (distance >= 0 && distance < 7) usage7Days += row.credit;
			if (row.date.startsWith(monthPrefix)) usageThisMonth += row.credit;
			daily.set(row.date, (daily.get(row.date) ?? 0) + row.credit);
			const modelKey = row.model === "—" ? "未知模型" : row.model;
			const entry = modelTotals.get(modelKey) ?? {
				requestCount: 0,
				credit: 0
			};
			entry.requestCount += 1;
			entry.credit += row.credit;
			modelTotals.set(modelKey, entry);
			const perDay = dailyModels.get(row.date);
			if (perDay !== void 0) {
				const modelDay = perDay.get(modelKey) ?? {
					requestCount: 0,
					credit: 0
				};
				modelDay.requestCount += 1;
				modelDay.credit += row.credit;
				perDay.set(modelKey, modelDay);
			} else dailyModels.set(row.date, /* @__PURE__ */ new Map([[modelKey, {
				requestCount: 1,
				credit: row.credit
			}]]));
		}
		const dailySeries = [];
		const walk = new Date(rangeStart);
		while (walk <= rangeEnd) {
			const key = dateKey(walk);
			const dayTotal = daily.get(key) ?? 0;
			const dayModels = dailyModels.get(key);
			dailySeries.push({
				date: key,
				usage: dayTotal,
				...dayModels !== void 0 && dayModels.size > 0 ? { models: [...dayModels.entries()].map(([model, { requestCount, credit }]) => ({
					model,
					requestCount,
					credit
				})) } : {}
			});
			walk.setDate(walk.getDate() + 1);
		}
		const models = [...modelTotals.entries()].map(([model, { requestCount, credit }]) => ({
			model,
			requestCount,
			credit
		})).sort((a, b) => b.credit - a.credit || b.requestCount - a.requestCount || a.model.localeCompare(b.model));
		const status = lastError !== void 0 || truncated ? reportedTotal > 0 ? "partial" : "unavailable" : "complete";
		const uniqueRows = /* @__PURE__ */ new Map();
		for (const row of sorted) uniqueRows.set(`${row.requestId}@${row.ts}`, row);
		const detailLimit = 100;
		return {
			status,
			rangeStart: rangeStartKey,
			rangeEnd: rangeEndKey,
			collectedAt: Date.now(),
			summary: {
				usageToday,
				usage7Days,
				usageThisMonth
			},
			daily: dailySeries,
			models,
			requests: [...uniqueRows.values()].slice(0, detailLimit),
			detailLimit
		};
	}
	/**
	* POST the CN daily check-in endpoint. The answer is classified for the
	* card rather than thrown: a transport or envelope failure, and an upstream
	* "already checked in" business code, all come back as plain outcomes so
	* the browser half never has to interpret upstream error text.
	*/
	async checkIn(credential) {
		if (regionOf(credential.domain) !== "cn") return {
			status: "failed",
			message: "daily check-in is only available for the CodeBuddy CN account"
		};
		let response;
		try {
			response = await fetch(`${CN_CHAT_BASE}${CN_CHECKIN_PATH}`, {
				method: "POST",
				headers: checkInHeaders(credential),
				body: "{}",
				signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
			});
		} catch (error) {
			return {
				status: "failed",
				message: `transport error: ${String(error)}`
			};
		}
		let envelope;
		try {
			envelope = await readEnvelope(response);
		} catch (error) {
			return {
				status: "failed",
				message: error instanceof Error ? error.message : String(error)
			};
		}
		if (response.ok && envelope.code === 0) return {
			status: "ok",
			message: envelope.msg.trim() === "" ? "checked in" : envelope.msg
		};
		const message = envelope.msg.trim() === "" ? `http ${response.status}` : envelope.msg;
		const lowered = message.toLowerCase();
		for (const marker of CHECKIN_ALREADY_MARKERS) if (lowered.includes(marker.toLowerCase())) return {
			status: "already",
			message
		};
		return {
			status: "failed",
			message
		};
	}
};
//#endregion
//#region src/version.ts
const CODEBUDDY_CLI_VERSION = "0.2.1";
//#endregion
//#region src/host-heartbeat.ts
/**
* Host-side heartbeat: a small JSON file written under `$DSH_HOME` once the
* `codebuddy` provider is registered. The status CLI reads it to report
* whether the host bundle is alive, independent of the browser card.
*
* The browser (client) bundle cannot write files; its health is reported
* only through `console.error` on failure (see `src/client/index.tsx`).
* This asymmetry is intentional: the host is the load-bearing half, and
* a missing heartbeat unambiguously means the host never started.
*
* @module dsh-codebuddy-cli/host-heartbeat
*/
/** Basename of the host heartbeat file inside the Harness home. */
const CODEBUDDY_HOST_HEARTBEAT_FILENAME = ".codebuddy-host-heartbeat.json";
/** Current on-disk heartbeat format; readers reject others. */
const HEARTBEAT_FORMAT_VERSION = 1;
/** Absolute path of the host heartbeat file. */
function codebuddyHostHeartbeatPath() {
	return join(resolveDshHome(), CODEBUDDY_HOST_HEARTBEAT_FILENAME);
}
/**
* Write (or overwrite) the heartbeat after the host bundle registered the
* provider. A failed write is non-fatal: the host is already running, and
* the status CLI will simply report "heartbeat missing" rather than failing.
*/
async function writeHostHeartbeat() {
	const document = {
		version: HEARTBEAT_FORMAT_VERSION,
		package: "dsh-codebuddy-cli",
		pluginVersion: CODEBUDDY_CLI_VERSION,
		registeredAt: Date.now(),
		pid: process.pid
	};
	try {
		await writeFile(codebuddyHostHeartbeatPath(), JSON.stringify(document), "utf8");
	} catch {}
}
/** Remove the heartbeat on plugin disposal so a stale file does not linger. */
async function clearHostHeartbeat() {
	try {
		await rm(codebuddyHostHeartbeatPath(), { force: true });
	} catch {}
}
/** Read and validate the heartbeat; returns `undefined` when absent or malformed. */
async function readHostHeartbeat() {
	let raw;
	try {
		raw = await readFile(codebuddyHostHeartbeatPath(), "utf8");
	} catch {
		return;
	}
	try {
		const parsed = JSON.parse(raw);
		if (parsed.version === HEARTBEAT_FORMAT_VERSION && parsed.package === "dsh-codebuddy-cli" && typeof parsed.registeredAt === "number" && typeof parsed.pid === "number") return {
			version: HEARTBEAT_FORMAT_VERSION,
			package: "dsh-codebuddy-cli",
			pluginVersion: typeof parsed.pluginVersion === "string" ? parsed.pluginVersion : "unknown",
			registeredAt: parsed.registeredAt,
			pid: parsed.pid
		};
	} catch {}
}
/**
* Absolute start time (epoch ms) of the process holding `pid`, or `undefined`
* when it cannot be determined (no such PID, platform lacks a readable source).
*
* - macOS / Linux: `ps -o lstart=` prints a local-time "EEE MMM DD HH:MM:SS YYYY";
*   `Date.parse` resolves it against the local clock, which matches how
*   `registeredAt` (a `Date.now()` absolute value) is expressed.
* - Windows: WMI `CreationDate` is UTC (`YYYYMMDDHHMMSS.mmm+zzzz`); parsed with
*   `Date.UTC`, again comparable to `registeredAt`.
*
* Failures return `undefined` so callers can fall back to plain PID liveness
* rather than mis-report a running host as dead.
*/
function processStartTimeMs(pid) {
	try {
		if (process.platform === "win32") {
			try {
				const m = execFileSync("wmic", [
					"process",
					"where",
					`processid=${pid}`,
					"get",
					"CreationDate"
				], {
					encoding: "utf8",
					windowsHide: true
				}).trim().match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d+([+-]\d{4})/);
				if (m !== null) {
					const [, y, mo, d, h, mi, s] = m;
					const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
					if (Number.isFinite(ms)) return ms;
				}
			} catch {}
			const psOut = execFileSync("powershell.exe", [
				"-NoProfile",
				"-Command",
				`(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString('yyyy-MM-ddTHH:mm:ss.fff')`
			], {
				encoding: "utf8",
				windowsHide: true
			}).trim();
			if (psOut === "") return void 0;
			const ms = Date.parse(psOut);
			return Number.isFinite(ms) ? ms : void 0;
		}
		const out = execFileSync("ps", [
			"-o",
			"lstart=",
			"-p",
			String(pid)
		], {
			encoding: "utf8",
			env: {
				...process.env,
				LC_ALL: "C",
				LANG: "C"
			}
		}).trim();
		if (out === "") return void 0;
		const ms = Date.parse(out);
		return Number.isFinite(ms) ? ms : void 0;
	} catch {
		return;
	}
}
/**
* Whether the heartbeat's PID is still alive *and* still the same process that
* registered it. A stale heartbeat (host crashed without clearing the file)
* is distinguished from a live host by two checks:
*
* 1. `process.kill(pid, 0)` — the PID exists (signal 0 tests existence).
* 2. The process holding that PID started at or before `registeredAt`. A host
*    that registered the heartbeat must have been started before writing it,
*    so `start <= registeredAt`; a recycled PID belongs to an unrelated process
*    started after the host died, so `start > registeredAt` correctly reads dead.
*
* PID-only detection is not enough: after a crash the OS may hand the same PID
* to an unrelated process, and the un-cleared stale heartbeat would otherwise
* produce a false "Host running". When the process start time cannot be read
* (e.g. unsupported platform) the check degrades to plain PID liveness.
*/
function isHeartbeatProcessAlive(heartbeat) {
	try {
		process.kill(heartbeat.pid, 0);
	} catch {
		return false;
	}
	const startAtMs = processStartTimeMs(heartbeat.pid);
	if (startAtMs === void 0) return true;
	return startAtMs <= heartbeat.registeredAt;
}
//#endregion
export { defaultAuthDirCandidates as A, FALLBACK_CODEBUDDY_MODELS as C, CodeBuddyCredentialStore as D, CODEBUDDY_AUTH_FILE_ENV as E, codebuddyOwnAuthPath as O, CodeBuddyCatalog as S, CODEBUDDY_AUTH_FILENAME as T, CODEBUDDY_UNKNOWN_VERSION as _, processStartTimeMs as a, resolveCodeBuddyCliVersion as b, CODEBUDDY_CLI_VERSION as c, ensureClientIdentity as d, normalizeCredits as f, CODEBUDDY_IDE_TYPE as g, CODEBUDDY_IDE_NAME as h, isHeartbeatProcessAlive as i, parseCodeBuddyAuth as j, defaultAuthDir as k, CodeBuddyUpstreamClient as l, regionOf as m, clearHostHeartbeat as n, readHostHeartbeat as o, prepareChatBody as p, codebuddyHostHeartbeatPath as r, writeHostHeartbeat as s, CODEBUDDY_HOST_HEARTBEAT_FILENAME as t, classifyUpstreamError as u, clientIdentityHeaders as v, filterEnabledModels as w, userAgentFor as x, resolveClientIdentity as y };
