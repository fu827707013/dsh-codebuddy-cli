import z from "@deepseek-ai/schemastery";
import "@earendil-works/pi-ai";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { Context } from "@deepseek-ai/cordis";
import { SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { AttachmentStore } from "@deepseek-ai/dsh-attachment";
//#region src/client-identity.d.ts
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
declare const CODEBUDDY_IDE_TYPE = "cli";
/** IDE name the CLI reports; mirrors its product name for the terminal. */
declare const CODEBUDDY_IDE_NAME = "cli";
/**
 * Version reported when the installed CLI cannot be resolved. Deliberately a
 * value that reads as "unknown" rather than a stale real version number: a
 * plausible-but-wrong version is worse evidence than an honest placeholder.
 */
declare const CODEBUDDY_UNKNOWN_VERSION = "unknown";
/** Resolved client identity carried on every upstream request. */
interface CodeBuddyClientIdentity {
  /** IDE type, always `cli` — see {@link CODEBUDDY_IDE_TYPE}. */
  ideType: string;
  /** IDE name, always `cli`. */
  ideName: string;
  /** Installed CLI version, or {@link CODEBUDDY_UNKNOWN_VERSION}. */
  ideVersion: string;
  /** Product version; tracks {@link ideVersion}. */
  productVersion: string;
}
/**
 * Decorated `User-Agent` the upstream sees. Kept in the CLI's own
 * `CLI/<version> CodeBuddy/<version>` shape and now derived from the real
 * installed version instead of a hardcoded constant.
 */
declare function userAgentFor(version: string): string;
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
declare function resolveCodeBuddyCliVersion(explicitPath?: string): Promise<string>;
/**
 * Headers that carry the client identity to the upstream. These are the same
 * header names the official CLI uses, which is what makes the backend
 * attribute plugin traffic to a `cli` client instead of leaving it blank.
 *
 * @param identity - resolved identity from {@link resolveClientIdentity}.
 * @returns the identity header block.
 */
declare function clientIdentityHeaders(identity: CodeBuddyClientIdentity): Record<string, string>;
/**
 * Resolve the full client identity once, ready to splat into request headers.
 *
 * @param explicitPath - optional absolute CLI `package.json` path.
 * @returns the resolved identity.
 */
declare function resolveClientIdentity(explicitPath?: string): Promise<CodeBuddyClientIdentity>;
//#endregion
//#region src/status-paths.d.ts
/** Daily check-in outcome status, already mapped for display. */
type CodeBuddyCheckInStatus = 'ok' | 'already' | 'failed';
/**
 * The daily check-in answer the card renders. `message` is upstream text
 * (success confirmation, the "already" reason, or a failure detail) and is
 * shown verbatim next to the localized status.
 */
interface CodeBuddyCheckInOutcome {
  status: CodeBuddyCheckInStatus;
  message: string;
}
//#endregion
//#region src/upstream.d.ts
/** CodeBuddy region selected by the credential's login domain. */
type CodeBuddyRegion = 'cn' | 'global';
/** Upstream failure classes the shim maps onto distinct HTTP answers. */
type UpstreamErrorKind = 'hard_credit' | 'soft_rate' | 'session_dead' | 'not_found' | 'server' | 'client';
/** One CLI-usable model as the upstream catalog describes it. */
interface CodeBuddyUpstreamModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  /**
   * Upstream-declared image input capability. Missing or false upstream data
   * resolves to false, so an unknown model stays text-only: over-claiming
   * admits an image the provider then rejects after the message is durable.
   */
  supportsImages: boolean;
  /**
   * Reasoning metadata the upstream catalog declares per model. The wire
   * effort values (`low`, `medium`, `high`, `xhigh`, `max`) map directly onto
   * pi-ai's thinking levels, and the supported set decides which levels the
   * DSH model selector offers.
   */
  reasoning?: CodeBuddyModelReasoning;
  /**
   * Billing convenience metadata: the credits multiplier string the upstream
   * reports (e.g. `"x0.00"` for free) and promotional badges like
   * `badge:限时免费:#FF0000` or `badge:夜间折扣:#1E90FF`.
   *
   * The multiplier reaches the browser through the host LLM seam, which has no
   * locale service, so {@link normalizeCredits} trims it to a
   * language-neutral display form (`x0.79`) that reads the same in every UI
   * language. The raw upstream string (which may spell `x0.79 credits`) stays
   * on {@link CodeBuddyModelBilling.credits} for diagnostics.
   */
  billing?: CodeBuddyModelBilling;
}
/** Reasoning metadata the upstream catalog declares for one model. */
interface CodeBuddyModelReasoning {
  /** Whether the model does any reasoning at all (upstream `supportsReasoning`). */
  supports: boolean;
  /** Whether the model can only think (upstream `onlyReasoning`). */
  onlyReasoning: boolean;
  /** Selectable effort values; absent means the model has no explicit set. */
  supportedEfforts?: readonly CodeBuddyEffort[];
  /** Default effort the upstream uses when none is chosen. */
  defaultEffort?: CodeBuddyEffort;
  /** Whether thinking can be switched off; false means it is always on. */
  canDisableThinking: boolean;
}
/** The concrete effort spellings CodeBuddy exposes on the wire. */
type CodeBuddyEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** Billing convenience metadata reported for one model. */
interface CodeBuddyModelBilling {
  /** Credits multiplier, e.g. `"x0.00"` (free) or `"x0.79"`. */
  credits?: string;
  /** Promotional tags, e.g. `"限时免费"`, `"夜间折扣"`. */
  badges?: readonly string[];
  /** Whether the model is currently free (`x0.00` credits). */
  free: boolean;
}
/** One billing package and its remaining credit (a full resource package). */
interface CodeBuddyCreditAccount {
  /** Package code as the upstream reports it (may be absent). */
  packageCode?: string;
  packageName: string;
  /** Total capacity of this package. */
  total: number;
  /** Remaining capacity of this package. */
  remain: number;
  /** Used capacity of this package. */
  used: number;
  /** Backward-compatible alias for the total (the older card's `size`). */
  size: number;
  /** Expiry as epoch milliseconds; absent means no known expiry (long-lived). */
  expireAtMs?: number;
  /** Whether the package has already expired. */
  expired: boolean;
  /** Whether the package expires within the soon window (7 days). */
  expiringSoon: boolean;
}
/** Aggregated credit answer for one credential. */
interface CodeBuddyCredits {
  total: number;
  accounts: readonly CodeBuddyCreditAccount[];
}
/** One official usage row (a single billing request). */
interface CodeBuddyUsageRow {
  requestId: string;
  model: string;
  client: string;
  credit: number;
  /** Local display of the request time (upstream format preserved). */
  requestTime: string;
  /** Epoch milliseconds of the request, for sorting. */
  ts: number;
  /** Local date key `YYYY-MM-DD`. */
  date: string;
}
/** Daily usage aggregation, optionally broken down by model. */
interface CodeBuddyUsageDaily {
  /** Local date key `YYYY-MM-DD`. */
  date: string;
  /** Total credits consumed that day. */
  usage: number;
  /** Per-model breakdown for that day, when the upstream row carries a model. */
  models?: {
    model: string;
    requestCount: number;
    credit: number;
  }[];
}
/** Aggregate usage stats for one credential over a 31-day window. */
interface CodeBuddyUsageStats {
  /** `complete` when the window was fetched in full; `partial` / `unavailable` degrade. */
  status: 'complete' | 'partial' | 'unavailable';
  /** Inclusive window start date `YYYY-MM-DD`. */
  rangeStart: string;
  /** Inclusive window end date `YYYY-MM-DD`. */
  rangeEnd: string;
  /** When the window was collected (epoch ms). */
  collectedAt: number;
  summary: {
    usageToday: number;
    usage7Days: number;
    usageThisMonth: number;
  };
  /** One entry per day in the window (zero-filled). */
  daily: readonly CodeBuddyUsageDaily[];
  /** Per-model aggregation across the whole window. */
  models: readonly {
    model: string;
    requestCount: number;
    credit: number;
  }[];
  /** Most recent requests, newest first. */
  requests: readonly CodeBuddyUsageRow[];
  /** Max per-account detail rows kept in `requests`. */
  detailLimit: number;
}
/** Token refresh answer; fields the upstream omits stay absent. */
interface CodeBuddyRefreshOutcome {
  accessToken: string;
  refreshToken?: string;
  expiresInSec?: number;
  domain?: string;
}
/** Chat answer: either a live SSE response or a classified failure. */
type CodeBuddyChatResult = {
  ok: true;
  response: Response;
} | {
  ok: false;
  status: number;
  kind: UpstreamErrorKind;
  message: string;
};
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
declare function normalizeCredits(credits: string | undefined): string | undefined;
/** Classify an upstream failure from its HTTP status and body excerpt. */
declare function classifyUpstreamError(status: number, body: string): UpstreamErrorKind;
/** Region for a login domain; an empty domain means CN (matching upstream tooling). */
declare function regionOf(domain: string): CodeBuddyRegion;
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
declare function prepareChatBody(source: string): string;
/**
 * Upstream HTTP client. One instance serves the whole plugin; requests take
 * the credential explicitly so token refreshes apply on the next call.
 */
declare class CodeBuddyUpstreamClient {
  /**
   * Begin resolving the client identity as soon as a client exists.
   *
   * Request headers are assembled synchronously, so the version headers can
   * only appear once resolution has settled. Warming it here means the first
   * request already carries them in practice, and a request issued before the
   * probe finishes still carries `X-IDE-Type`/`X-IDE-Name` in the meantime.
   */
  constructor();
  /** POST the chat endpoint; a successful answer is the raw SSE response. */
  chatStream(credential: CodeBuddyCredential, bodyJson: string, signal?: AbortSignal): Promise<CodeBuddyChatResult>;
  /** POST the token-refresh endpoint; the caller merges the outcome. */
  refreshToken(credential: CodeBuddyCredential): Promise<CodeBuddyRefreshOutcome>;
  /** GET the personal model catalog and keep the `cli` agent's models only. */
  fetchModels(credential: CodeBuddyCredential): Promise<readonly CodeBuddyUpstreamModel[]>;
  /** POST the billing endpoint for the aggregated remaining credit. */
  fetchCredits(credential: CodeBuddyCredential): Promise<CodeBuddyCredits>;
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
  fetchUsage(credential: CodeBuddyCredential, windowDays?: number): Promise<CodeBuddyUsageStats>;
  /**
   * POST the CN daily check-in endpoint. The answer is classified for the
   * card rather than thrown: a transport or envelope failure, and an upstream
   * "already checked in" business code, all come back as plain outcomes so
   * the browser half never has to interpret upstream error text.
   */
  checkIn(credential: CodeBuddyCredential): Promise<CodeBuddyCheckInOutcome>;
}
//#endregion
//#region src/account-store.d.ts
/** Current on-disk format version; readers reject others. */
declare const ACCOUNTS_FORMAT_VERSION = 1;
/** On-disk shape of the accounts document. */
interface AccountsDocument {
  version: typeof ACCOUNTS_FORMAT_VERSION;
  /** Stable id of the currently active account, or undefined when none is active. */
  activeId?: string;
  /** All stored accounts, keyed by stable id. */
  accounts: Record<string, StoredAccount>;
}
/** One stored account as it appears on disk. */
interface StoredAccount {
  /** Stable client-side id for this account (uuid or similar). */
  id: string;
  /** Upstream user id. */
  uid: string;
  /** Display name from the upstream profile. */
  nickname?: string;
  /** Login domain (cn / global). */
  domain: string;
  /** Enterprise id, if the account belongs to an enterprise. */
  enterpriseId?: string;
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, epoch milliseconds. */
  expiresAtMs: number;
  /** Refresh token expiry, epoch milliseconds. */
  refreshExpiresAtMs?: number;
  /** When this account was first stored. */
  addedAtMs: number;
  /** Last daily check-in outcome, so the card can render today's state. */
  lastCheckIn?: {
    /** Local date (YYYY-MM-DD) the check-in result was recorded. */
    date: string;
    result: 'ok' | 'already' | 'failed';
  };
}
/** Read-only summary of one account for status display. */
interface AccountSummary {
  id: string;
  uid: string;
  nickname?: string;
  domain: string;
  enterpriseId?: string;
  expiresAtMs: number;
  active: boolean;
  lastCheckIn?: StoredAccount['lastCheckIn'];
}
/**
 * Multi-account credential store.
 *
 * The store reads and writes a JSON document under `$DSH_HOME`. Writes are
 * atomic and lock-protected. Reads are immutable snapshots — callers that
 * need a credential must copy it out.
 */
declare class AccountStore {
  private readonly path;
  constructor(path?: string);
  /** Read the full document; returns an empty document when the file is absent. */
  read(): Promise<AccountsDocument>;
  /** Read and re-write the document inside a lock, applying a transform. */
  private mutate;
  /** Add a new account (or overwrite if the id already exists). Returns the stored account. */
  add(account: Omit<StoredAccount, 'addedAtMs'>): Promise<StoredAccount>;
  /** Remove an account by id. Returns true if the account existed. */
  remove(id: string): Promise<boolean>;
  /** Set the active account by id. Returns false when the account does not exist. */
  setActive(id: string): Promise<boolean>;
  /** Clear the active account (so the CLI file fallback takes over). */
  clearActive(): Promise<void>;
  /** Get the active account's stored credential, or undefined when none is active. */
  activeCredential(): Promise<CodeBuddyCredential | undefined>;
  /** Get a specific account's stored credential. */
  credentialFor(id: string): Promise<CodeBuddyCredential | undefined>;
  /** Update a stored account's tokens (after a refresh). */
  updateTokens(id: string, tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAtMs: number;
    refreshExpiresAtMs?: number;
    domain?: string;
  }): Promise<void>;
  /** Record a daily check-in outcome for an account. No-op when the id is unknown. */
  recordCheckIn(id: string, date: string, result: 'ok' | 'already' | 'failed'): Promise<void>;
  /** Summaries of all stored accounts, with the active one flagged. */
  summaries(): Promise<readonly AccountSummary[]>;
  /** Convert a stored account to a CodeBuddyCredential. */
  private toCredential;
}
//#endregion
//#region src/auth.d.ts
/** Normalized CodeBuddy credential, timestamps in epoch milliseconds. */
interface CodeBuddyCredential {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  refreshExpiresAtMs?: number;
  domain: string;
  uid: string;
  enterpriseId?: string;
  nickname?: string;
  /** Which storage the credential was read from; refreshes are always `dsh`. */
  source: 'cli' | 'dsh';
}
/** Read-only sign-in summary for status and doctor output. */
interface CodeBuddyAuthStatus {
  state: 'signed-in' | 'signed-out';
  expiresAtMs?: number;
  refreshExpiresAtMs?: number;
  nickname?: string;
  domain?: string;
  source?: 'cli' | 'dsh';
}
/** Constructor options; only {@link refresh} is required. */
interface CodeBuddyStoreOptions {
  /** Explicit CLI auth-file path, overriding env and platform defaults. */
  cliPath?: string;
  /** Explicit plugin-owned copy path, defaulting under `$DSH_HOME`. */
  ownPath?: string;
  /** Performs the upstream token refresh. */
  refresh: (credential: CodeBuddyCredential) => Promise<CodeBuddyRefreshOutcome>;
  /** Refresh this long before actual expiry; default five minutes. */
  refreshMarginMs?: number;
  /** Multi-account store; when present, its active account wins over the CLI file. */
  accountStore?: AccountStore;
}
/** Basename of the plugin-owned credential copy inside the Harness home. */
declare const CODEBUDDY_AUTH_FILENAME = ".codebuddy-cli-auth.json";
/** Env variable that overrides the CLI auth-file location. */
declare const CODEBUDDY_AUTH_FILE_ENV = "CODEBUDDY_CLI_AUTH_FILE";
/** Plugin-owned copy path inside the Harness home. */
declare function codebuddyOwnAuthPath(): string;
/**
 * Platform-default candidates for the auth directory, in probe order.
 * Windows probes both AppData roots: current builds write under
 * `%LOCALAPPDATA%` (Local), older ones under `%APPDATA%` (Roaming). WSL probes
 * those same Windows locations through its mounted Windows profile before the
 * native Linux location.
 */
declare function defaultAuthDirCandidates(): string[];
/** First platform-default candidate; see {@link defaultAuthDirCandidates}. */
declare function defaultAuthDir(): string | undefined;
/**
 * Parse a CodeBuddy auth document in either on-disk shape: the nested form
 * `{"auth":{...},"account":{...}}` (both the CLI and the desktop IDE write
 * this) and the flat panel form. Returns undefined when the document carries
 * no access token.
 */
declare function parseCodeBuddyAuth(text: string): CodeBuddyCredential | undefined;
/**
 * Read-only credential store with demand-driven refresh.
 *
 * Refresh policy: refresh only when the access token is inside the margin
 * (or already expired), keep the refreshed credential in the plugin-owned
 * copy, and never write the CLI's auth file. A failed refresh still
 * returns a not-yet-expired token so an unreachable refresh endpoint does
 * not take down a working session.
 */
declare class CodeBuddyCredentialStore {
  private readonly refresh;
  private readonly refreshMarginMs;
  private readonly ownPath;
  private cliPathOverride;
  private inflight;
  private readonly accountStore;
  constructor(options: CodeBuddyStoreOptions);
  /**
   * Configuration precedence for the CLI file: the plugin's configured path,
   * then the environment variable, then the platform defaults. An explicit
   * path is used verbatim; the defaults are a discovery order.
   */
  private resolveCliCandidates;
  /** The first auth-directory candidate, for diagnostics. */
  cliAuthDir(): string | undefined;
  /**
   * Repoint the CLI auth file; a settings change applies on the next read.
   */
  setCliPath(path: string | undefined): void;
  /** The configured CLI auth-file path, for diagnostics. */
  cliAuthPath(): string | undefined;
  /** The plugin-owned copy path, for diagnostics. */
  ownAuthPath(): string;
  /** Read the freshest stored credential without refreshing anything. */
  current(): Promise<CodeBuddyCredential | undefined>;
  /**
   * The credential to send upstream: {@link current}, refreshed on demand.
   * Single-flight, so parallel requests share one refresh.
   */
  resolve(): Promise<CodeBuddyCredential>;
  /** Read-only sign-in summary; never refreshes and never throws. */
  status(): Promise<CodeBuddyAuthStatus>;
  /** Remove the plugin-owned copy; the CLI's auth file is untouched. */
  logout(): Promise<void>;
  private needsRefresh;
  private refreshNow;
  private saveOwn;
  /**
   * Discover the best CLI credential: scan each default directory (or use a
   * single explicit path verbatim) in probe order and take the first
   * directory that yields a ranked candidate. Only an absent candidate
   * (ENOENT) falls through to the next; a present directory with no parsable
   * `.info` file is authoritative for its slot, so a stale older-version
   * location never silently wins over a broken newer one.
   */
  private readCli;
  private readOwn;
  /** Whether any auth-directory candidate yields a credential; diagnostics only. */
  cliFilePresent(): Promise<boolean>;
}
//#endregion
//#region src/catalog.d.ts
/** One model entry the adapter exposes. */
type CodeBuddyModelInfo = CodeBuddyUpstreamModel;
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
declare const FALLBACK_CODEBUDDY_MODELS: readonly CodeBuddyModelInfo[];
/** Mutable catalog shared by the shim's `/v1/models` and the adapter. */
declare class CodeBuddyCatalog {
  private models;
  /** Current entries; the fallback list until the upstream answer lands. */
  current(): readonly CodeBuddyModelInfo[];
  /** Replace the list; callers invalidate their adapter snapshot after this. */
  set(models: readonly CodeBuddyModelInfo[]): void;
}
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
declare function filterEnabledModels(models: readonly CodeBuddyModelInfo[], enabled: readonly string[] | undefined): readonly CodeBuddyModelInfo[];
//#endregion
//#region src/shim.d.ts
/** Minimal logger surface the plugin context already provides. */
interface ShimLogger {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
/** What the plugin needs from a running shim. */
interface CodeBuddyShim {
  /** Resolves once the listener is up; rejects if listening failed. */
  ready: Promise<void>;
  /** The shim origin, e.g. `http://127.0.0.1:39271`; valid after ready. */
  baseUrl(): string;
  /**
   * The per-process shared secret the plugin's own client must carry as
   * `Authorization: Bearer <token>`. Lives only in memory; the adapter
   * resolves this instead of the upstream access token, because the shim
   * resolves the real credential itself via the store.
   */
  token(): string;
  /** Stop serving and destroy open connections. */
  close(): Promise<void>;
}
/** Constructor dependencies. */
interface CodeBuddyShimOptions {
  store: CodeBuddyCredentialStore;
  client: Pick<CodeBuddyUpstreamClient, 'chatStream'>;
  catalog: CodeBuddyCatalog;
  logger?: ShimLogger;
}
/**
 * Start the loopback endpoint. Requests carry any bearer; the loopback bind
 * is the boundary, and the upstream credential comes from the store alone.
 */
declare function createCodeBuddyShim(options: CodeBuddyShimOptions): CodeBuddyShim;
//#endregion
//#region src/adapter.d.ts
/** Provider route this bundle owns. */
declare const CODEBUDDY_PROVIDER = "codebuddy-cli";
/** Provider idle ceiling while one stream read is outstanding. */
declare const CODEBUDDY_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Constructor dependencies. */
interface CodeBuddyAdapterOptions {
  shim: CodeBuddyShim;
  store: CodeBuddyCredentialStore;
  catalog: CodeBuddyCatalog;
  /**
   * Read the user's enabled-model allowlist at call time. Undefined (or an
   * empty answer) offers the whole catalog; see {@link filterEnabledModels}.
   * Read live rather than captured so a settings edit applies to the next
   * picker read without re-registering the provider.
   */
  enabledModels?: () => readonly string[] | undefined;
  /** Resolve the durable attachment service at request time, when present. */
  resolveAttachments?: () => AttachmentStore | undefined;
}
/** What {@link createCodeBuddyAdapter} hands back. */
interface CodeBuddyAdapter {
  adapter: PiAiAdapter;
  /** Rebuild the adapter's provider snapshot; call after a catalog update. */
  invalidate: () => void;
}
/**
 * Assemble the adapter. The provider's `getModels` reads the live catalog,
 * and every model's `baseUrl` is re-resolved per read so the shim's
 * ephemeral port applies from the first snapshot after startup.
 */
declare function createCodeBuddyAdapter(options: CodeBuddyAdapterOptions): CodeBuddyAdapter;
//#endregion
//#region src/host-heartbeat.d.ts
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
declare const CODEBUDDY_HOST_HEARTBEAT_FILENAME = ".codebuddy-host-heartbeat.json";
/** Current on-disk heartbeat format; readers reject others. */
declare const HEARTBEAT_FORMAT_VERSION = 1;
/** On-disk shape of the heartbeat. */
interface CodeBuddyHostHeartbeat {
  version: typeof HEARTBEAT_FORMAT_VERSION;
  package: 'dsh-codebuddy-cli';
  pluginVersion: string;
  /** Epoch milliseconds when the host registered the provider. */
  registeredAt: number;
  /** Host process PID, to distinguish a stale heartbeat after a crash. */
  pid: number;
}
/** Absolute path of the host heartbeat file. */
declare function codebuddyHostHeartbeatPath(): string;
/** Remove the heartbeat on plugin disposal so a stale file does not linger. */
declare function clearHostHeartbeat(): Promise<void>;
/** Read and validate the heartbeat; returns `undefined` when absent or malformed. */
declare function readHostHeartbeat(): Promise<CodeBuddyHostHeartbeat | undefined>;
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
declare function processStartTimeMs(pid: number): number | undefined;
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
declare function isHeartbeatProcessAlive(heartbeat: CodeBuddyHostHeartbeat): boolean;
//#endregion
//#region src/index.d.ts
/** Stable Cordis plugin name. */
declare const name = "llm-codebuddy-cli";
/** The model registry required before the provider can register. */
declare const inject: string[];
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
declare const CODEBUDDY_SETTINGS_NS: SettingsNamespace;
/** Plugin configuration. */
interface Config {
  /** Explicit CodeBuddy CLI auth-file path, overriding env and platform defaults. */
  authFile?: string;
  /**
   * Allowlist of CodeBuddy model ids the model pickers offer.
   *
   * The CodeBuddy roster is long (15 rows and growing), and the composer's
   * model seat lists every served model at once. This narrows what the pickers
   * show without touching dispatch: an absent or empty list means the whole
   * catalog, so an untouched install behaves exactly as before, and a session
   * already pinned to a de-selected model keeps working.
   */
  enabledModels?: string[];
}
declare const Config: z<Config>;
/**
 * Start the loopback endpoint, register the `codebuddy` provider, and
 * refresh the model catalog from the upstream once credentials allow it.
 * The static fallback catalog serves from the first moment, so an offline
 * upstream never leaves the provider empty.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { CODEBUDDY_AUTH_FILENAME, CODEBUDDY_AUTH_FILE_ENV, CODEBUDDY_HOST_HEARTBEAT_FILENAME, CODEBUDDY_IDE_NAME, CODEBUDDY_IDE_TYPE, CODEBUDDY_PROVIDER, CODEBUDDY_SETTINGS_NS, CODEBUDDY_STREAM_IDLE_TIMEOUT_MS, CODEBUDDY_UNKNOWN_VERSION, type CodeBuddyAdapter, type CodeBuddyAuthStatus, CodeBuddyCatalog, type CodeBuddyChatResult, type CodeBuddyClientIdentity, type CodeBuddyCredential, CodeBuddyCredentialStore, type CodeBuddyCreditAccount, type CodeBuddyCredits, type CodeBuddyEffort, type CodeBuddyHostHeartbeat, type CodeBuddyModelBilling, type CodeBuddyModelInfo, type CodeBuddyModelReasoning, type CodeBuddyRefreshOutcome, type CodeBuddyShim, CodeBuddyUpstreamClient, type CodeBuddyUpstreamModel, type CodeBuddyUsageDaily, type CodeBuddyUsageRow, type CodeBuddyUsageStats, Config, FALLBACK_CODEBUDDY_MODELS, type UpstreamErrorKind, apply, classifyUpstreamError, clearHostHeartbeat, clientIdentityHeaders, codebuddyHostHeartbeatPath, codebuddyOwnAuthPath, createCodeBuddyAdapter, createCodeBuddyShim, defaultAuthDir, defaultAuthDirCandidates, filterEnabledModels, inject, isHeartbeatProcessAlive, name, normalizeCredits, parseCodeBuddyAuth, prepareChatBody, processStartTimeMs, readHostHeartbeat, regionOf, resolveClientIdentity, resolveCodeBuddyCliVersion, userAgentFor };