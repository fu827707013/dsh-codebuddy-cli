#!/usr/bin/env node
import { b as codebuddyOwnAuthPath, c as CODEBUDDY_CLI_VERSION, h as FALLBACK_CODEBUDDY_MODELS, i as isHeartbeatProcessAlive, l as CodeBuddyUpstreamClient, o as readHostHeartbeat, r as codebuddyHostHeartbeatPath, y as CodeBuddyCredentialStore } from "./host-heartbeat-B6LKjPG2.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
//#region src/bin.ts
/** Standalone status/diagnostics CLI for the dsh-codebuddy-cli bundle. */
const JSON_SCHEMA_VERSION = 1;
/** Remove token-like strings from an unexpected diagnostic message. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]");
}
function printHelp() {
	process.stdout.write([
		"Usage: dsh-codebuddy-cli <doctor|status|logout> [--json]",
		"",
		"  doctor   secret-free sign-in and environment diagnostics",
		"  status   sign-in state, remaining CodeBuddy credit, and host-bundle health",
		"  logout   remove the plugin-owned credential copy (the CodeBuddy CLI keeps its sign-in)",
		"  --json   emit one secret-free JSON document (doctor/status only)",
		""
	].join("\n"));
}
function printJson(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}
function makeStore() {
	const client = new CodeBuddyUpstreamClient();
	return new CodeBuddyCredentialStore({ refresh: (credential) => client.refreshToken(credential) });
}
async function doctor(jsonOutput) {
	const store = makeStore();
	const status = await store.status();
	const cliPresent = await store.cliFilePresent();
	const heartbeat = await readHostHeartbeat();
	const hostAlive = heartbeat !== void 0 && isHeartbeatProcessAlive(heartbeat);
	const report = {
		schemaVersion: JSON_SCHEMA_VERSION,
		package: "dsh-codebuddy-cli",
		version: CODEBUDDY_CLI_VERSION,
		node: process.version,
		cliAuthFile: {
			path: store.cliAuthPath() ?? "(no platform default; set CODEBUDDY_CLI_AUTH_FILE)",
			present: cliPresent
		},
		ownAuthFile: codebuddyOwnAuthPath(),
		hostHeartbeat: {
			path: codebuddyHostHeartbeatPath(),
			present: heartbeat !== void 0,
			...heartbeat === void 0 ? {} : {
				registeredAt: heartbeat.registeredAt,
				pid: heartbeat.pid
			},
			processAlive: hostAlive
		},
		signIn: status.state,
		fallbackModels: FALLBACK_CODEBUDDY_MODELS.length,
		hints: [
			...status.state === "signed-in" ? [] : ["Run the CodeBuddy CLI once and sign in, then run status again."],
			...cliPresent ? [] : [`No CodeBuddy CLI auth file at the expected path; set CODEBUDDY_CLI_AUTH_FILE if it lives elsewhere.`],
			...hostAlive ? [] : ["Host bundle not running in this DSH profile (or the process exited). The browser card and provider are unavailable until DSH starts the plugin."]
		]
	};
	if (jsonOutput) printJson(report);
	else process.stdout.write([
		`CodeBuddy Connect ${CODEBUDDY_CLI_VERSION} on ${process.version}`,
		`CLI auth file: ${report.cliAuthFile.present ? "present" : "missing"} (${report.cliAuthFile.path})`,
		`Host bundle: ${hostAlive ? `running (pid ${heartbeat.pid})` : heartbeat !== void 0 ? "stale heartbeat (process exited)" : "not started"}`,
		`Sign-in state: ${report.signIn}`,
		`Static fallback models: ${report.fallbackModels}`,
		...report.hints.map((hint) => `Hint: ${hint}`),
		""
	].join("\n"));
	return status.state === "signed-in" && cliPresent ? 0 : 1;
}
async function status(jsonOutput) {
	const store = makeStore();
	const client = new CodeBuddyUpstreamClient();
	const authStatus = await store.status();
	const heartbeat = await readHostHeartbeat();
	const hostAlive = heartbeat !== void 0 && isHeartbeatProcessAlive(heartbeat);
	const hostState = hostAlive ? "running" : heartbeat !== void 0 ? "stale" : "not-started";
	if (authStatus.state !== "signed-in") {
		if (jsonOutput) printJson({
			schemaVersion: JSON_SCHEMA_VERSION,
			package: "dsh-codebuddy-cli",
			version: CODEBUDDY_CLI_VERSION,
			status: "signed-out",
			hostBundle: hostState
		});
		else process.stdout.write(`CodeBuddy Connect: signed out\nHost bundle: ${hostState}\n`);
		return 1;
	}
	let credits;
	try {
		const credential = await store.current();
		if (credential !== void 0) credits = { total: (await client.fetchCredits(credential)).total };
	} catch (error) {
		credits = {
			total: 0,
			error: safeMessage(error)
		};
	}
	const expiresAt = authStatus.expiresAtMs !== void 0 ? new Date(authStatus.expiresAtMs).toISOString() : void 0;
	if (jsonOutput) {
		printJson({
			schemaVersion: JSON_SCHEMA_VERSION,
			package: "dsh-codebuddy-cli",
			version: CODEBUDDY_CLI_VERSION,
			status: "signed-in",
			...expiresAt === void 0 ? {} : { accessTokenExpires: expiresAt },
			...authStatus.nickname === void 0 ? {} : { nickname: authStatus.nickname },
			...authStatus.domain === void 0 || authStatus.domain === "" ? {} : { domain: authStatus.domain },
			source: authStatus.source,
			credits: credits?.total,
			...credits?.error === void 0 ? {} : { creditsError: credits.error },
			hostBundle: hostState
		});
		return 0;
	}
	process.stdout.write([
		`CodeBuddy Connect: signed in${authStatus.nickname === void 0 ? "" : ` as ${authStatus.nickname}`}`,
		...expiresAt === void 0 ? [] : [`Access token expires ${expiresAt} (refresh is automatic)`],
		credits?.error === void 0 ? `Remaining credit: ${credits?.total ?? "unknown"}` : `Remaining credit: unavailable (${credits.error})`,
		`Host bundle: ${hostAlive ? `running (pid ${heartbeat.pid})` : hostState === "stale" ? "stale heartbeat (DSH process exited)" : "not started in this profile"}`,
		"Client card: load failures are logged to the browser console only; the host provider is unaffected.",
		""
	].join("\n"));
	return 0;
}
/** Execute one boot-free command. */
async function run(argv) {
	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
		printHelp();
		return 0;
	}
	const [rawAction, ...flags] = argv;
	if (![
		"doctor",
		"logout",
		"status"
	].includes(rawAction)) {
		process.stderr.write(`dsh-codebuddy-cli: expected doctor, logout, or status; got ${JSON.stringify(rawAction)}\n`);
		return 1;
	}
	const action = rawAction;
	const jsonOutput = flags.includes("--json");
	if (flags.filter((flag) => flag !== "--json").length > 0 || jsonOutput && action === "logout") {
		process.stderr.write(`dsh-codebuddy-cli: invalid options for ${action}: ${flags.join(" ")}\n`);
		return 1;
	}
	try {
		switch (action) {
			case "doctor": return await doctor(jsonOutput);
			case "status": return await status(jsonOutput);
			case "logout":
				await makeStore().logout();
				process.stdout.write(`CodeBuddy Connect: removed ${codebuddyOwnAuthPath()}; the CodeBuddy CLI's sign-in is untouched\n`);
				return 0;
		}
	} catch (error) {
		process.stderr.write(`dsh-codebuddy-cli: ${action} failed: ${safeMessage(error)}\n`);
		return 1;
	}
}
if (process.argv[1] !== void 0 && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await run(process.argv.slice(2));
//#endregion
export { run };
