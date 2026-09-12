window.__ModuleLoader__.load({
	id: "dsh-codebuddy-cli",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		/**
		* The provider id this plugin registers in the Harness LLM seam.
		*
		* Shared with the browser half so the composer dock can match the session's
		* `modelSelection` projection against this provider before reading a rate;
		* the host-side spelling lives in `adapter.ts` (`CODEBUDDY_PROVIDER`) and a
		* test asserts the two stay in sync.
		*/
		const CODEBUDDY_PROVIDER_ID = "codebuddy-cli";
		/** Plugin-owned credit-statistics endpoint (aggregates usage across accounts). */
		const CODEBUDDY_CREDIT_STATS_PATH = "/plugins/dsh-codebuddy-cli/credit-stats";
		//#endregion
		//#region \0dsh-css:D:\Company\dsh-plugin\dsh-codebuddy-cli\src\client\CodeBuddyPluginCard.module.css.mjs
		const css = ".RLBsyG_card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}.RLBsyG_card:hover{border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.RLBsyG_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.RLBsyG_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.RLBsyG_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.RLBsyG_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.RLBsyG_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.RLBsyG_chevronOpen{transform:rotate(180deg)}.RLBsyG_body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.RLBsyG_bodyBlock{margin:12px 0 0}.RLBsyG_bodyRow{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;display:flex}.RLBsyG_bodyText{color:var(--dsw-alias-label-secondary);margin:8px 0 0;font-size:13px;line-height:1.5}.RLBsyG_bodyError{color:var(--dsw-alias-label-error);margin:8px 0 0;font-size:13px;line-height:1.5}.RLBsyG_statusDot{box-sizing:border-box;corner-shape:round;border-radius:50%;flex:none;width:8px;height:8px;display:inline-block}.RLBsyG_statusDotSignedIn{background:var(--dsw-alias-state-success-primary)}.RLBsyG_statusDotError{background:var(--dsw-alias-label-error)}.RLBsyG_statusDotSignedOut{background:var(--dsw-alias-label-dimmed)}.RLBsyG_statusLine{min-width:0;color:var(--dsw-alias-label-primary);align-items:center;gap:6px;font-size:14px;font-weight:500;line-height:22px;display:inline-flex}.RLBsyG_refresh{appearance:none;border:1px solid var(--dsw-alias-border-l2);font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.RLBsyG_refresh:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_refresh:disabled{opacity:.4;cursor:default}.RLBsyG_refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.RLBsyG_quotaList{flex-direction:column;gap:12px;margin:12px 0 0;display:flex}.RLBsyG_quotaLabel{color:var(--dsw-alias-label-secondary);justify-content:space-between;gap:12px;font-size:13px;line-height:20px;display:flex}.RLBsyG_progressTrack{corner-shape:round;background:var(--dsw-alias-bg-layer-2);border-radius:999px;height:6px;overflow:hidden}.RLBsyG_progressFill{border-radius:inherit;background:var(--dsw-alias-brand-primary);height:100%}.RLBsyG_choiceList{flex-direction:column;gap:2px;margin:8px 0 0;display:flex}.RLBsyG_choiceRow{cursor:pointer;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:center;gap:8px;margin:0 -6px;padding:5px 6px;font-size:13px;line-height:20px;display:flex}.RLBsyG_choiceRow:hover{background:var(--dsw-alias-bg-layer-3)}.RLBsyG_choiceRowDisabled{cursor:default;opacity:.5}.RLBsyG_choiceRowDisabled:hover{background:0 0}.RLBsyG_choiceBox{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);flex:none;margin:0}.RLBsyG_choiceName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.RLBsyG_choiceMeta{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;flex:none;align-items:center;gap:6px;display:inline-flex}.RLBsyG_choiceActions{flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0 0;display:flex}.RLBsyG_choiceSave{appearance:none;font:inherit;cursor:pointer;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-onbrand,#fff);border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.RLBsyG_choiceSave:hover:not(:disabled){filter:brightness(1.08)}.RLBsyG_choiceSave:disabled{opacity:.4;cursor:default}.RLBsyG_choiceSave:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.RLBsyG_badge{corner-shape:round;white-space:nowrap;background:var(--dsw-alias-state-success-subtle,#22a06b1f);color:var(--dsw-alias-state-success-primary,#22a06b);border-radius:999px;align-items:center;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;display:inline-flex}.RLBsyG_tabBar{border-bottom:.5px solid var(--dsw-alias-border-l2);gap:2px;margin:0 0 12px;padding-bottom:1px;display:flex;overflow-x:auto}.RLBsyG_tab{appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);white-space:nowrap;background:0 0;border:0;border-radius:8px 8px 0 0;padding:7px 12px;font-size:13px;font-weight:500;line-height:1.5;position:relative}.RLBsyG_tab:hover{color:var(--dsw-alias-label-primary)}.RLBsyG_tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.RLBsyG_tabActive{color:var(--dsw-alias-label-primary);font-weight:600}.RLBsyG_tabActive:after{content:\"\";background:var(--dsw-alias-brand-primary);border-radius:2px;height:2px;position:absolute;bottom:-1px;left:12px;right:12px}.RLBsyG_accountGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px;display:grid}@media (width<=520px){.RLBsyG_accountGrid{grid-template-columns:minmax(0,1fr)}}.RLBsyG_accountCard{border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);border-radius:14px;flex-direction:column;min-width:0;display:flex;overflow:hidden}.RLBsyG_accountCardHeader{border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);align-items:center;gap:10px;padding:12px 14px;display:flex}.RLBsyG_accountCardActiveHeader{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, var(--dsw-alias-bg-layer-3))}.RLBsyG_accountAvatar{width:40px;height:40px;color:var(--dsw-alias-label-onbrand,#fff);background:var(--dsw-alias-brand-primary);border-radius:50%;flex:none;justify-content:center;align-items:center;font-size:15px;font-weight:600;display:flex}.RLBsyG_accountCardName{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:14px;font-weight:600;line-height:1.4;overflow:hidden}.RLBsyG_accountCardChips{flex-wrap:wrap;gap:4px;margin-top:6px;display:flex}.RLBsyG_accountCardBody{flex-direction:column;gap:10px;padding:12px 14px;display:flex}.RLBsyG_accountCardCreditRow{align-items:baseline;gap:8px;display:flex}.RLBsyG_accountCardCreditTotal{font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--dsw-alias-label-primary);font-size:22px;font-weight:600;line-height:1}.RLBsyG_accountCardCreditMeta{color:var(--dsw-alias-label-secondary);font-size:12px}.RLBsyG_accountCardCreditUpdated{color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-left:auto;font-size:12px}.RLBsyG_accountCardSectionLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500}.RLBsyG_accountCardResource{min-width:0}.RLBsyG_accountCardResourceRow{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;font-size:12px;display:grid}.RLBsyG_accountCardResourceRemain{background:var(--dsw-alias-bg-layer-3);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);border-radius:8px;padding:2px 8px;font-weight:500}.RLBsyG_accountCardResourceName{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);overflow:hidden}.RLBsyG_accountCardResourceExpiry{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}.RLBsyG_accountCardResourceExpirySoon{color:var(--dsw-alias-state-warning-primary,#d97706)}.RLBsyG_accountCardResourceExpiryExpired{color:var(--dsw-alias-label-error)}.RLBsyG_accountCardViewAll{appearance:none;font:inherit;cursor:pointer;width:fit-content;color:var(--dsw-alias-brand-primary);text-align:left;background:0 0;border:0;padding:0;font-size:12px;font-weight:500}.RLBsyG_accountCardViewAll:hover{color:var(--dsw-alias-brand-primary-hover,var(--dsw-alias-brand-primary));text-decoration:underline}.RLBsyG_accountCardFooter{border-top:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:8px 14px;display:flex}.RLBsyG_accountCardActivePill{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);border:.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 25%, transparent);border-radius:999px;align-items:center;gap:6px;padding:3px 10px;font-size:12px;font-weight:500;display:inline-flex}.RLBsyG_accountCardCheckInOk{color:var(--dsw-alias-state-success-primary,#22a06b);font-size:12px;font-weight:500}.RLBsyG_accountCardCheckInFail{color:var(--dsw-alias-label-error);font-size:12px}.RLBsyG_statsSummaryGrid{border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0;margin-top:12px;display:grid;overflow:hidden}.RLBsyG_statsMetric{text-align:center;flex-direction:column;justify-content:center;align-items:center;gap:4px;padding:14px 8px;display:flex}.RLBsyG_statsMetricLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:4px;font-size:12px;font-weight:500;display:inline-flex}.RLBsyG_statsMetricValue{font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--dsw-alias-label-primary);font-size:22px;font-weight:600;line-height:1.1}.RLBsyG_statsPanelCard{border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);border-radius:14px;margin-top:12px;padding:12px 14px}.RLBsyG_statsPanelHeader{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;display:flex}.RLBsyG_statsPanelTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}.RLBsyG_statsRangeTabs{background:var(--dsw-alias-bg-layer-3);border-radius:8px;gap:2px;padding:2px;display:inline-flex}.RLBsyG_statsRangeTab{appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:6px;padding:4px 8px;font-size:12px}.RLBsyG_statsRangeTab:hover{color:var(--dsw-alias-label-primary)}.RLBsyG_statsRangeTabActive{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;box-shadow:0 1px 2px #00000014}.RLBsyG_statsModelRows{flex-direction:column;gap:10px;margin-top:8px;display:flex}.RLBsyG_statsModelRow{min-width:0}.RLBsyG_statsModelRowHead{justify-content:space-between;align-items:center;gap:8px;font-size:12px;display:flex}.RLBsyG_statsModelRowName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);font-weight:500;overflow:hidden}.RLBsyG_statsModelRowMeta{white-space:nowrap;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.RLBsyG_statsModelRowMeta strong{color:var(--dsw-alias-label-primary);font-weight:600}.RLBsyG_statsDetailTabs{background:var(--dsw-alias-bg-layer-3);border-radius:8px;gap:2px;width:fit-content;margin-top:8px;padding:2px;display:flex}.RLBsyG_statsDetailTab{appearance:none;font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-radius:6px;padding:4px 10px;font-size:12px}.RLBsyG_statsDetailTab:hover{color:var(--dsw-alias-label-primary)}.RLBsyG_statsDetailTabActive{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;box-shadow:0 1px 2px #00000014}.RLBsyG_statsTableWrap{margin-top:8px;overflow-x:auto}.RLBsyG_statsTable{border-collapse:collapse;width:100%;font-size:12px}.RLBsyG_statsTable th{text-align:left;color:var(--dsw-alias-label-secondary);border-bottom:.5px solid var(--dsw-alias-border-l2);white-space:nowrap;padding:6px 8px;font-weight:500}.RLBsyG_statsTable td{border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);vertical-align:top;padding:6px 8px}.RLBsyG_statsTable td:first-child,.RLBsyG_statsTable th:first-child{padding-left:0}.RLBsyG_statsTable tr:last-child td{border-bottom:0}.RLBsyG_statsAlert{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 12px;font-size:12px;line-height:1.5;display:flex}.RLBsyG_statsAlertWarning{color:var(--dsw-alias-state-warning-primary,#b45309);background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,#b45309) 8%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-warning-primary,#b45309) 25%, transparent)}.RLBsyG_statsAlertError{color:var(--dsw-alias-label-error);background:color-mix(in srgb, var(--dsw-alias-label-error) 8%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-label-error) 25%, transparent)}.RLBsyG_statsFilterButton{appearance:none;border:.5px solid var(--dsw-alias-border-l2);font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:8px;align-items:center;gap:6px;max-width:200px;padding:4px 10px;font-size:12px;line-height:1.5;display:inline-flex}.RLBsyG_statsFilterButton:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_statsFilterMenu{z-index:60;min-width:180px;max-height:280px;color:var(--dsw-alias-label-secondary);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px #00000029), 0 0 0 1px var(--dsw-alias-border-l1,#0000000f);border-radius:10px;padding:4px;font-size:12px;line-height:20px;position:absolute;top:calc(100% + 4px);right:0;overflow-y:auto}.RLBsyG_statsFilterItem{appearance:none;font:inherit;cursor:pointer;width:100%;color:var(--dsw-alias-label-secondary);text-align:left;background:0 0;border:0;border-radius:6px;align-items:center;gap:8px;padding:5px 8px;font-size:12px;display:flex}.RLBsyG_statsFilterItem:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}.RLBsyG_statsFilterCheck{color:var(--dsw-alias-brand-primary);flex:none;font-weight:600}.RLBsyG_statsChartLegend{color:var(--dsw-alias-label-secondary);flex-wrap:wrap;justify-content:center;gap:12px;margin-top:10px;font-size:12px;display:flex}.RLBsyG_statsChartLegendItem{align-items:center;gap:5px;display:inline-flex}.RLBsyG_statsChartLegendSwatch{border-radius:2px;width:8px;height:8px}.RLBsyG_statsChartTooltip{z-index:40;min-width:170px;max-width:260px;color:var(--dsw-alias-label-secondary);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px #0000002e), 0 0 0 1px var(--dsw-alias-border-l1,#0000000f);pointer-events:none;border-radius:10px;padding:8px 10px;font-size:12px;line-height:18px;position:absolute;top:6px;left:8px}.RLBsyG_statsChartTooltipTitle{color:var(--dsw-alias-label-primary);margin-bottom:4px;font-size:12px;font-weight:600}.RLBsyG_statsChartTooltipTotal{color:var(--dsw-alias-label-tertiary);margin-bottom:6px;font-size:11px}.RLBsyG_statsChartTooltipRow{align-items:center;gap:6px;min-width:0;display:flex}.RLBsyG_statsChartTooltipName{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.RLBsyG_statsChartTooltipValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);flex:none;font-weight:500}";
		const tagId = "dsh-codebuddy-cli/CodeBuddyPluginCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-codebuddy-cli";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CodeBuddyPluginCard_module_css_default = {
			"accountAvatar": "RLBsyG_accountAvatar",
			"accountCard": "RLBsyG_accountCard",
			"accountCardActiveHeader": "RLBsyG_accountCardActiveHeader",
			"accountCardActivePill": "RLBsyG_accountCardActivePill",
			"accountCardBody": "RLBsyG_accountCardBody",
			"accountCardCheckInFail": "RLBsyG_accountCardCheckInFail",
			"accountCardCheckInOk": "RLBsyG_accountCardCheckInOk",
			"accountCardChips": "RLBsyG_accountCardChips",
			"accountCardCreditMeta": "RLBsyG_accountCardCreditMeta",
			"accountCardCreditRow": "RLBsyG_accountCardCreditRow",
			"accountCardCreditTotal": "RLBsyG_accountCardCreditTotal",
			"accountCardCreditUpdated": "RLBsyG_accountCardCreditUpdated",
			"accountCardFooter": "RLBsyG_accountCardFooter",
			"accountCardHeader": "RLBsyG_accountCardHeader",
			"accountCardName": "RLBsyG_accountCardName",
			"accountCardResource": "RLBsyG_accountCardResource",
			"accountCardResourceExpiry": "RLBsyG_accountCardResourceExpiry",
			"accountCardResourceExpiryExpired": "RLBsyG_accountCardResourceExpiryExpired",
			"accountCardResourceExpirySoon": "RLBsyG_accountCardResourceExpirySoon",
			"accountCardResourceName": "RLBsyG_accountCardResourceName",
			"accountCardResourceRemain": "RLBsyG_accountCardResourceRemain",
			"accountCardResourceRow": "RLBsyG_accountCardResourceRow",
			"accountCardSectionLabel": "RLBsyG_accountCardSectionLabel",
			"accountCardViewAll": "RLBsyG_accountCardViewAll",
			"accountGrid": "RLBsyG_accountGrid",
			"badge": "RLBsyG_badge",
			"body": "RLBsyG_body",
			"bodyBlock": "RLBsyG_bodyBlock",
			"bodyError": "RLBsyG_bodyError",
			"bodyRow": "RLBsyG_bodyRow",
			"bodyText": "RLBsyG_bodyText",
			"card": "RLBsyG_card",
			"cardOpen": "RLBsyG_cardOpen",
			"chevron": "RLBsyG_chevron",
			"chevronOpen": "RLBsyG_chevronOpen",
			"choiceActions": "RLBsyG_choiceActions",
			"choiceBox": "RLBsyG_choiceBox",
			"choiceList": "RLBsyG_choiceList",
			"choiceMeta": "RLBsyG_choiceMeta",
			"choiceName": "RLBsyG_choiceName",
			"choiceRow": "RLBsyG_choiceRow",
			"choiceRowDisabled": "RLBsyG_choiceRowDisabled",
			"choiceSave": "RLBsyG_choiceSave",
			"description": "RLBsyG_description",
			"headText": "RLBsyG_headText",
			"header": "RLBsyG_header",
			"name": "RLBsyG_name",
			"progressFill": "RLBsyG_progressFill",
			"progressTrack": "RLBsyG_progressTrack",
			"quotaLabel": "RLBsyG_quotaLabel",
			"quotaList": "RLBsyG_quotaList",
			"refresh": "RLBsyG_refresh",
			"statsAlert": "RLBsyG_statsAlert",
			"statsAlertError": "RLBsyG_statsAlertError",
			"statsAlertWarning": "RLBsyG_statsAlertWarning",
			"statsChartLegend": "RLBsyG_statsChartLegend",
			"statsChartLegendItem": "RLBsyG_statsChartLegendItem",
			"statsChartLegendSwatch": "RLBsyG_statsChartLegendSwatch",
			"statsChartTooltip": "RLBsyG_statsChartTooltip",
			"statsChartTooltipName": "RLBsyG_statsChartTooltipName",
			"statsChartTooltipRow": "RLBsyG_statsChartTooltipRow",
			"statsChartTooltipTitle": "RLBsyG_statsChartTooltipTitle",
			"statsChartTooltipTotal": "RLBsyG_statsChartTooltipTotal",
			"statsChartTooltipValue": "RLBsyG_statsChartTooltipValue",
			"statsDetailTab": "RLBsyG_statsDetailTab",
			"statsDetailTabActive": "RLBsyG_statsDetailTabActive",
			"statsDetailTabs": "RLBsyG_statsDetailTabs",
			"statsFilterButton": "RLBsyG_statsFilterButton",
			"statsFilterCheck": "RLBsyG_statsFilterCheck",
			"statsFilterItem": "RLBsyG_statsFilterItem",
			"statsFilterMenu": "RLBsyG_statsFilterMenu",
			"statsMetric": "RLBsyG_statsMetric",
			"statsMetricLabel": "RLBsyG_statsMetricLabel",
			"statsMetricValue": "RLBsyG_statsMetricValue",
			"statsModelRow": "RLBsyG_statsModelRow",
			"statsModelRowHead": "RLBsyG_statsModelRowHead",
			"statsModelRowMeta": "RLBsyG_statsModelRowMeta",
			"statsModelRowName": "RLBsyG_statsModelRowName",
			"statsModelRows": "RLBsyG_statsModelRows",
			"statsPanelCard": "RLBsyG_statsPanelCard",
			"statsPanelHeader": "RLBsyG_statsPanelHeader",
			"statsPanelTitle": "RLBsyG_statsPanelTitle",
			"statsRangeTab": "RLBsyG_statsRangeTab",
			"statsRangeTabActive": "RLBsyG_statsRangeTabActive",
			"statsRangeTabs": "RLBsyG_statsRangeTabs",
			"statsSummaryGrid": "RLBsyG_statsSummaryGrid",
			"statsTable": "RLBsyG_statsTable",
			"statsTableWrap": "RLBsyG_statsTableWrap",
			"statusDot": "RLBsyG_statusDot",
			"statusDotError": "RLBsyG_statusDotError",
			"statusDotSignedIn": "RLBsyG_statusDotSignedIn",
			"statusDotSignedOut": "RLBsyG_statusDotSignedOut",
			"statusLine": "RLBsyG_statusLine",
			"tab": "RLBsyG_tab",
			"tabActive": "RLBsyG_tabActive",
			"tabBar": "RLBsyG_tabBar"
		};
		//#endregion
		//#region src/client/AccountCard.tsx
		/**
		* Account card (workbuddy-switch style) and the OAuth sign-in entry point.
		*
		* Each stored CodeBuddy account renders as one card: an avatar block, the
		* display name with a masked identity, status chips (checked-in, token
		* expired, suggested priority), the aggregated credit total with the number
		* of packages and a refresh time, the soon-to-expire resource bars with
		* expiry dates and progress, and a footer with "set as current" (or the
		* active pill). The card also opens an "all packages" dialog and a small
		* action menu (refresh token / manual check-in / delete).
		*
		* The account grid header carries the "OAuth sign in to add account" button,
		* which starts the polling login and opens the auth URL in a new tab.
		*
		* @module dsh-codebuddy-cli/client/account-card
		*/
		/** Avatar color tones (deterministic from the display name). */
		const AVATAR_TONES = [
			"rgba(16, 185, 129, 0.14)",
			"rgba(139, 92, 246, 0.14)",
			"rgba(14, 165, 233, 0.14)",
			"rgba(245, 158, 11, 0.14)",
			"rgba(244, 63, 94, 0.14)",
			"rgba(13, 148, 136, 0.14)"
		];
		function avatarTone(name) {
			let hash = 0;
			for (let i = 0; i < name.length; i += 1) hash = hash * 31 + name.charCodeAt(i) >>> 0;
			return AVATAR_TONES[hash % AVATAR_TONES.length];
		}
		function cx$2(...names) {
			return names.filter((name) => name !== void 0 && name !== "").join(" ");
		}
		/** Format a number with thousands separators. */
		function formatNumber$2(value) {
			return new Intl.NumberFormat(void 0).format(value);
		}
		/** Format an epoch-ms date as `MM/DD 到期` or `长期有效`. */
		function formatExpiry(expireAtMs) {
			if (expireAtMs === void 0) return "";
			const date = new Date(expireAtMs);
			if (Number.isNaN(date.getTime())) return "";
			return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
		}
		/** Format a full date for the packages dialog. */
		function formatFullDate(expireAtMs) {
			if (expireAtMs === void 0) return "";
			const date = new Date(expireAtMs);
			if (Number.isNaN(date.getTime())) return "";
			return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
		}
		/** Resource packages with remaining > 0, sorted by expiry (earliest first). */
		function usableResources(credits) {
			if (credits === void 0) return [];
			return credits.accounts.filter((account) => account.remain > 0).map((account, index) => ({
				account,
				index
			})).sort((left, right) => {
				const le = left.account.expireAtMs ?? Number.POSITIVE_INFINITY;
				const re = right.account.expireAtMs ?? Number.POSITIVE_INFINITY;
				return le === re ? left.index - right.index : le - re;
			}).map((entry) => entry.account);
		}
		/** One resource bar row: remaining chip, name, expiry, progress. */
		function ResourceBar({ resource, t }) {
			const percent = resource.total > 0 ? Math.max(0, Math.min(100, resource.remain / resource.total * 100)) : 0;
			const expiryClass = resource.expired ? CodeBuddyPluginCard_module_css_default.accountCardResourceExpiryExpired : resource.expiringSoon ? CodeBuddyPluginCard_module_css_default.accountCardResourceExpirySoon : void 0;
			const expiryText = resource.expired ? t("accountCardExpired") : resource.expiringSoon ? t("accountCardExpiresIn7d") : resource.expireAtMs !== void 0 ? t("accountCardExpiresAt", { date: formatExpiry(resource.expireAtMs) }) : t("accountCardLongLived");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.accountCardResource,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodeBuddyPluginCard_module_css_default.accountCardResourceRow,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.accountCardResourceRemain,
							children: formatNumber$2(resource.remain)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.accountCardResourceName,
							title: resource.packageName,
							children: resource.packageName
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cx$2(CodeBuddyPluginCard_module_css_default.accountCardResourceExpiry, expiryClass),
							children: expiryText
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.progressTrack,
					style: { marginTop: 4 },
					role: "progressbar",
					"aria-label": resource.packageName,
					"aria-valuemin": 0,
					"aria-valuemax": 100,
					"aria-valuenow": percent,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.progressFill,
						style: {
							width: `${percent}%`,
							...resource.expiringSoon || resource.expired ? { background: "var(--dsw-alias-state-warning-primary, #d97706)" } : {}
						}
					})
				})]
			});
		}
		/** Small status chip (badge). */
		function Chip({ tone, children }) {
			const style = {
				display: "inline-flex",
				alignItems: "center",
				gap: 3,
				padding: "1px 8px",
				borderRadius: 999,
				fontSize: 11,
				lineHeight: "17px",
				fontWeight: 500,
				whiteSpace: "nowrap"
			};
			if (tone === "success") {
				style.background = "color-mix(in srgb, var(--dsw-alias-state-success-primary, #22a06b) 12%, transparent)";
				style.color = "var(--dsw-alias-state-success-primary, #22a06b)";
			} else if (tone === "warning") {
				style.background = "color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97706) 12%, transparent)";
				style.color = "var(--dsw-alias-state-warning-primary, #d97706)";
			} else if (tone === "danger") {
				style.background = "color-mix(in srgb, var(--dsw-alias-label-error) 12%, transparent)";
				style.color = "var(--dsw-alias-label-error)";
			} else {
				style.background = "var(--dsw-alias-bg-layer-3)";
				style.color = "var(--dsw-alias-label-secondary)";
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style,
				children
			});
		}
		/** Account card component. */
		function AccountCard({ account, onChanged, t }) {
			const [resourcesOpen, setResourcesOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [menuError, setMenuError] = (0, react.useState)(void 0);
			const [checkInNote, setCheckInNote] = (0, react.useState)(void 0);
			const mounted = (0, react.useRef)(true);
			const name = account.nickname ?? account.uid ?? t("accountCardUnnamed");
			const expired = account.expiresAtMs > 0 && account.expiresAtMs < Date.now();
			const resources = usableResources(account.credits);
			const visible = resources.slice(0, 2);
			const all = resources;
			const avatarStyle = {
				background: avatarTone(name),
				color: "var(--dsw-alias-label-primary)"
			};
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			const run = async (path, body) => {
				setBusy(true);
				setMenuError(void 0);
				try {
					const response = await fetch(path, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						credentials: "same-origin",
						body: JSON.stringify(body)
					});
					if (!response.ok) {
						const detail = await response.json().catch(() => void 0);
						const message = typeof detail?.error === "string" ? detail.error : `HTTP ${String(response.status)}`;
						throw new Error(message);
					}
					onChanged();
				} catch (cause) {
					if (mounted.current) setMenuError(cause instanceof Error ? cause.message : t("requestFailed"));
				} finally {
					if (mounted.current) setBusy(false);
				}
			};
			const runCheckIn = async () => {
				setBusy(true);
				setMenuError(void 0);
				setCheckInNote(void 0);
				try {
					const response = await fetch(CODEBUDDY_CHECKIN_PATH, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						credentials: "same-origin",
						body: JSON.stringify({ id: account.id })
					});
					const body = await response.json().catch(() => void 0);
					if (!response.ok) {
						const detail = typeof body?.error === "string" ? body.error : `HTTP ${String(response.status)}`;
						throw new Error(detail);
					}
					if (mounted.current) setCheckInNote(body);
					onChanged();
				} catch (cause) {
					if (mounted.current) setMenuError(cause instanceof Error ? cause.message : t("requestFailed"));
				} finally {
					if (mounted.current) setBusy(false);
				}
			};
			const checkInFeedback = () => {
				if (checkInNote === void 0) return null;
				if (checkInNote.status === "ok" || checkInNote.status === "already") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodeBuddyPluginCard_module_css_default.accountCardCheckInOk,
					children: t(checkInNote.status === "ok" ? "checkInSuccess" : "checkInAlready")
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodeBuddyPluginCard_module_css_default.accountCardCheckInFail,
					children: t("checkInFailed", { message: checkInNote.message })
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: CodeBuddyPluginCard_module_css_default.accountCard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: cx$2(CodeBuddyPluginCard_module_css_default.accountCardHeader, account.active ? CodeBuddyPluginCard_module_css_default.accountCardActiveHeader : void 0),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CodeBuddyPluginCard_module_css_default.accountAvatar,
								style: avatarStyle,
								children: name.charAt(0).toUpperCase()
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									minWidth: 0,
									flex: 1
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: CodeBuddyPluginCard_module_css_default.accountCardName,
									title: name,
									children: name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: CodeBuddyPluginCard_module_css_default.accountCardChips,
									children: [account.checkedInToday === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chip, {
										tone: "success",
										children: t("accountCardCheckedIn")
									}) : account.checkedInToday === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chip, {
										tone: "neutral",
										children: t("accountCardNotCheckedIn")
									}) : null, expired ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chip, {
										tone: "danger",
										children: t("accountCardTokenExpired")
									}) : null]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									position: "relative",
									flex: "none"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CodeBuddyPluginCard_module_css_default.refresh,
									"aria-label": t("accountCardMore"),
									title: t("accountCardMore"),
									onClick: () => {
										setMenuOpen(!menuOpen);
									},
									style: { padding: "4px 8px" },
									children: "⋯"
								}), menuOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										position: "absolute",
										right: 0,
										top: "calc(100% + 4px)",
										zIndex: 50,
										minWidth: 150,
										padding: 4,
										borderRadius: 10,
										background: "var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff))",
										boxShadow: "var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,0.16)), 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,0.06))",
										fontSize: 12,
										lineHeight: "20px",
										color: "var(--dsw-alias-label-secondary)"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: busy,
											onClick: () => {
												setMenuOpen(false);
												run(CODEBUDDY_SWITCH_ACCOUNT_PATH, { id: account.id });
											},
											style: { ...menuItemStyle },
											children: t("accountCardSetActive")
										}),
										account.checkedInToday !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: busy,
											onClick: () => {
												setMenuOpen(false);
												runCheckIn();
											},
											style: { ...menuItemStyle },
											children: t("accountCardCheckIn")
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: busy,
											onClick: () => {
												setMenuOpen(false);
												if (window.confirm(t("accountConfirmDelete"))) run(CODEBUDDY_DELETE_ACCOUNT_PATH, { id: account.id });
											},
											style: {
												...menuItemStyle,
												color: "var(--dsw-alias-label-error)"
											},
											children: t("accountCardDelete")
										}),
										menuError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												padding: "4px 8px",
												color: "var(--dsw-alias-label-error)"
											},
											children: menuError
										}) : null
									]
								}) : null]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: CodeBuddyPluginCard_module_css_default.accountCardBody,
						children: account.creditError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								fontSize: 13,
								color: "var(--dsw-alias-label-error)"
							},
							children: [
								t("accountCardCreditError"),
								": ",
								account.creditError
							]
						}) : account.credits === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 13,
								color: "var(--dsw-alias-label-secondary)"
							},
							children: t("accountCardCreditWaiting")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodeBuddyPluginCard_module_css_default.accountCardCreditRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CodeBuddyPluginCard_module_css_default.accountCardCreditTotal,
										children: formatNumber$2(account.credits.total)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CodeBuddyPluginCard_module_css_default.accountCardCreditMeta,
										children: t("accountCardPackageCount", { count: String(account.credits.accounts.length) })
									}),
									account.creditUpdatedAtMs !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CodeBuddyPluginCard_module_css_default.accountCardCreditUpdated,
										children: t("accountCardUpdatedAt", { time: formatTime(account.creditUpdatedAtMs) })
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CodeBuddyPluginCard_module_css_default.accountCardSectionLabel,
								children: t("accountCardExpiringSoon")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 8,
									marginTop: 6
								},
								children: visible.length > 0 ? visible.map((resource, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResourceBar, {
									resource,
									t
								}, `${resource.packageName}-${String(index)}`)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										fontSize: 12,
										color: "var(--dsw-alias-label-tertiary)"
									},
									children: t("accountCardNoCredit")
								})
							})] }),
							all.length > 2 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: CodeBuddyPluginCard_module_css_default.accountCardViewAll,
								onClick: () => {
									setResourcesOpen(true);
								},
								children: [t("accountCardViewAll"), " →"]
							}) : null
						] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: CodeBuddyPluginCard_module_css_default.accountCardFooter,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								minWidth: 0,
								flex: 1
							},
							children: [checkInFeedback(), account.checkedInToday !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CodeBuddyPluginCard_module_css_default.refresh,
								disabled: busy,
								onClick: () => {
									runCheckIn();
								},
								children: busy ? t("checkingIn") : t("accountCardCheckIn")
							}) : null]
						}), account.active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.accountCardActivePill,
							children: t("accountCardActive")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: CodeBuddyPluginCard_module_css_default.refresh,
							disabled: busy,
							onClick: () => {
								run(CODEBUDDY_SWITCH_ACCOUNT_PATH, { id: account.id });
							},
							children: t("accountCardSetActive")
						})]
					}),
					resourcesOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: dialogBackdropStyle,
						onClick: () => {
							setResourcesOpen(false);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: dialogStyle,
							role: "dialog",
							"aria-label": t("accountCardAllPackages"),
							onClick: (event) => event.stopPropagation(),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: {
										margin: "0 0 4px",
										fontSize: 14,
										fontWeight: 600,
										color: "var(--dsw-alias-label-primary)"
									},
									children: t("accountCardAllPackages")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										margin: "0 0 12px",
										fontSize: 12,
										color: "var(--dsw-alias-label-secondary)"
									},
									children: t("accountCardPackagesOf", {
										name,
										count: String(all.length)
									})
								}),
								all.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										padding: "12px 0",
										textAlign: "center",
										fontSize: 13,
										color: "var(--dsw-alias-label-secondary)"
									},
									children: t("accountCardNoCredit")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 10,
										maxHeight: "60vh",
										overflowY: "auto"
									},
									children: all.map((resource, index) => {
										const percent = resource.total > 0 ? Math.max(0, Math.min(100, resource.remain / resource.total * 100)) : 0;
										const expiryText = resource.expired ? t("accountCardExpired") : resource.expiringSoon ? t("accountCardExpiresIn7d") : resource.expireAtMs !== void 0 ? t("accountCardExpiresAt", { date: formatFullDate(resource.expireAtMs) }) : t("accountCardLongLived");
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												alignItems: "flex-start",
												justifyContent: "space-between",
												gap: 8
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: { minWidth: 0 },
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													style: {
														fontSize: 13,
														fontWeight: 500,
														color: "var(--dsw-alias-label-primary)",
														overflow: "hidden",
														textOverflow: "ellipsis",
														whiteSpace: "nowrap"
													},
													children: resource.packageName
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													style: {
														fontSize: 11,
														color: "var(--dsw-alias-label-secondary)",
														marginTop: 2
													},
													children: expiryText
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													flex: "none",
													textAlign: "right",
													fontSize: 12
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														fontWeight: 500,
														color: "var(--dsw-alias-label-primary)"
													},
													children: [
														formatNumber$2(resource.remain),
														" / ",
														formatNumber$2(resource.total)
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													style: {
														fontSize: 11,
														color: "var(--dsw-alias-label-secondary)",
														marginTop: 2
													},
													children: t("accountCardUsed", { used: formatNumber$2(resource.used) })
												})]
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: CodeBuddyPluginCard_module_css_default.progressTrack,
											style: { marginTop: 6 },
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: CodeBuddyPluginCard_module_css_default.progressFill,
												style: { width: `${percent}%` }
											})
										})] }, `${resource.packageName}-${String(index)}`);
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CodeBuddyPluginCard_module_css_default.choiceSave,
									style: { marginTop: 14 },
									onClick: () => {
										setResourcesOpen(false);
									},
									children: t("collapse")
								})
							]
						})
					}) : null
				]
			});
		}
		const menuItemStyle = {
			appearance: "none",
			border: 0,
			background: "none",
			font: "inherit",
			cursor: "pointer",
			display: "flex",
			alignItems: "center",
			gap: 6,
			width: "100%",
			padding: "5px 8px",
			borderRadius: 6,
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary)",
			textAlign: "left"
		};
		const dialogBackdropStyle = {
			position: "fixed",
			inset: 0,
			zIndex: 1e3,
			background: "rgba(0,0,0,0.4)",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: 24
		};
		const dialogStyle = {
			boxSizing: "border-box",
			width: "min(440px, 100%)",
			padding: 18,
			borderRadius: 14,
			background: "var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff))",
			boxShadow: "var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,0.16))",
			fontSize: 12,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		/** Format an epoch-ms time as `HH:MM`. */
		function formatTime(ms) {
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) return "—";
			return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
		}
		/** The account grid: a "sign in" button plus one card per stored account. */
		function AccountCards({ accounts, onChanged, t }) {
			const [loginState, setLoginState] = (0, react.useState)({ phase: "idle" });
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (loginState.phase !== "polling") return;
				const controller = new AbortController();
				const startTime = Date.now();
				const poll = async () => {
					if (Date.now() - startTime > 3e5) {
						if (mounted.current) setLoginState({
							phase: "done",
							error: t("accountLoginTimeout")
						});
						return;
					}
					try {
						const body = await (await fetch(CODEBUDDY_LOGIN_POLL_PATH, {
							method: "POST",
							headers: {
								"content-type": "application/json",
								accept: "application/json"
							},
							credentials: "same-origin",
							body: JSON.stringify({ state: loginState.state }),
							...controller.signal.aborted ? {} : { signal: controller.signal }
						})).json().catch(() => void 0);
						if (body === void 0) return;
						if (body.done) {
							if (body.error !== void 0) {
								if (mounted.current) setLoginState({
									phase: "done",
									error: t("accountLoginFailed", { message: body.error })
								});
							} else {
								if (mounted.current) setLoginState({ phase: "idle" });
								onChanged();
							}
							return;
						}
					} catch {}
					await new Promise((resolve) => setTimeout(resolve, 5e3));
					if (!controller.signal.aborted && mounted.current) poll();
				};
				poll();
				return () => {
					controller.abort();
				};
			}, [
				loginState,
				onChanged,
				t
			]);
			const startLogin = async () => {
				setLoginState({ phase: "starting" });
				try {
					const response = await fetch(CODEBUDDY_LOGIN_START_PATH, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						credentials: "same-origin",
						body: "{}"
					});
					const body = await response.json().catch(() => void 0);
					if (body === void 0 || !body.ok || body.authUrl === void 0 || body.state === void 0) {
						const error = body?.error ?? `HTTP ${response.status}`;
						setLoginState({
							phase: "done",
							error: t("accountLoginFailed", { message: error })
						});
						return;
					}
					window.open(body.authUrl, "_blank", "noopener");
					setLoginState({
						phase: "polling",
						authUrl: body.authUrl,
						state: body.state
					});
				} catch (cause) {
					setLoginState({
						phase: "done",
						error: t("accountLoginFailed", { message: cause instanceof Error ? cause.message : t("requestFailed") })
					});
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
						flexWrap: "wrap"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodeBuddyPluginCard_module_css_default.bodyText,
						style: { margin: 0 },
						children: t("accountPanelHint")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CodeBuddyPluginCard_module_css_default.choiceSave,
						disabled: loginState.phase === "starting" || loginState.phase === "polling",
						onClick: () => {
							startLogin();
						},
						children: loginState.phase === "starting" ? t("accountLoginStarting") : loginState.phase === "polling" ? t("accountLoginPolling") : t("accountCardAdd")
					})]
				}),
				loginState.phase === "polling" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: CodeBuddyPluginCard_module_css_default.bodyText,
					style: { marginTop: 6 },
					children: [
						t("accountLoginPolling"),
						" ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: CodeBuddyPluginCard_module_css_default.refresh,
							style: { padding: "2px 8px" },
							onClick: () => {
								window.open(loginState.authUrl, "_blank", "noopener");
							},
							children: t("accountLoginOpen")
						})
					]
				}) : null,
				loginState.phase === "done" && loginState.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: CodeBuddyPluginCard_module_css_default.bodyError,
					style: { marginTop: 6 },
					children: loginState.error
				}) : null,
				accounts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 12,
						padding: "20px 12px",
						textAlign: "center",
						borderRadius: 12,
						border: "0.5px dashed var(--dsw-alias-border-l3)",
						fontSize: 13,
						color: "var(--dsw-alias-label-tertiary)"
					},
					children: t("accountCardNoAccounts")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.accountGrid,
					children: accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
						account,
						onChanged,
						t
					}, account.id))
				})
			] });
		}
		//#endregion
		//#region src/client/CreditStatsPanel.tsx
		/**
		* Credit statistics panel (workbuddy-switch style).
		*
		* Renders the aggregated official usage for all stored accounts: a summary
		* card (remaining credit / today / 7-day / month), a daily trend chart with
		* per-account filtering and a stacked model chart, a per-model breakdown, and
		* a detail panel with the credit packages and the recent request list.
		*
		* Each of the trend / model / detail cards carries its own account filter
		* (dropdown menu) and the trend + model cards carry their own range switch,
		* mirroring the workbuddy-switch statistics page.
		*
		* Data comes from the plugin's `/plugins/dsh-codebuddy-cli/credit-stats`
		* route. The panel refreshes the official usage on demand (POST with
		* `refresh: true`).
		*
		* @module dsh-codebuddy-cli/client/credit-stats-panel
		*/
		function cx$1(...names) {
			return names.filter((name) => name !== void 0 && name !== "").join(" ");
		}
		function formatNumber$1(value) {
			if (value === null || value === void 0 || !Number.isFinite(value)) return "—";
			return new Intl.NumberFormat(void 0, { maximumFractionDigits: 2 }).format(value);
		}
		function formatChartDate(date) {
			return date.slice(5).replace("-", "/");
		}
		function formatDateTime(ts) {
			if (ts === null || ts === void 0) return "—";
			const date = new Date(ts);
			if (Number.isNaN(date.getTime())) return "—";
			return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
		}
		const RANGES = [
			{
				key: "30d",
				labelKey: "statsTrendRange30d"
			},
			{
				key: "today",
				labelKey: "statsTrendRangeToday"
			},
			{
				key: "7d",
				labelKey: "statsTrendRange7d"
			},
			{
				key: "month",
				labelKey: "statsTrendRangeMonth"
			}
		];
		function dateKey(date) {
			const pad = (v) => String(v).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
		}
		function daysAgo(days) {
			const date = /* @__PURE__ */ new Date();
			date.setHours(12, 0, 0, 0);
			date.setDate(date.getDate() - days);
			return dateKey(date);
		}
		/** Filter a daily series to the selected range. */
		function chartPoints(daily, range) {
			const today = dateKey(/* @__PURE__ */ new Date());
			const first = range === "today" ? today : range === "7d" ? daysAgo(6) : daysAgo(29);
			return daily.filter((point) => {
				if (range === "month") return point.date.startsWith(`${today.slice(0, 7)}-`);
				return point.date >= first && point.date <= today;
			});
		}
		/** Sum usage across a daily series. */
		function sumUsage(daily) {
			return daily.reduce((sum, point) => sum + point.usage, 0);
		}
		/** Inline Users icon (no external icon dependency). */
		function UsersIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				viewBox: "0 0 24 24",
				width: "14",
				height: "14",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "9",
						cy: "7",
						r: "4"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })
				]
			});
		}
		/**
		* Account filter dropdown (workbuddy-switch style). Each statistics card owns
		* its own filter state; `allowAll: false` hides the "all accounts" option so
		* the detail card forces a single-account view. Exported so the remaining-
		* credit tab can reuse the same control.
		*/
		function AccountFilterMenu({ accounts, accountFilter, onAccountFilterChange, t, allowAll = true, ariaLabel }) {
			const [open, setOpen] = (0, react.useState)(false);
			const active = accountFilter !== null && accounts.some((a) => a.accountId === accountFilter) ? accounts.find((a) => a.accountId === accountFilter) : void 0;
			const effective = active !== void 0 ? active.accountId : null;
			const label = active !== void 0 ? active.accountName ?? active.accountId : allowAll ? t("statsTrendAllAccounts") : accounts[0] !== void 0 ? accounts[0].accountName ?? accounts[0].accountId : t("statsTrendAllAccounts");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					position: "relative",
					flex: "none"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: CodeBuddyPluginCard_module_css_default.statsFilterButton,
					onClick: () => {
						setOpen(!open);
					},
					"aria-label": ariaLabel,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsersIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							maxWidth: 150,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: label
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodeBuddyPluginCard_module_css_default.statsFilterMenu,
					role: "menu",
					children: [allowAll ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitem",
						className: CodeBuddyPluginCard_module_css_default.statsFilterItem,
						onClick: () => {
							onAccountFilterChange(null);
							setOpen(false);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: t("statsTrendAllAccounts")
						}), effective === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.statsFilterCheck,
							children: "✓"
						}) : null]
					}) : null, accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitem",
						className: CodeBuddyPluginCard_module_css_default.statsFilterItem,
						onClick: () => {
							onAccountFilterChange(account.accountId);
							setOpen(false);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								flex: 1,
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: account.accountName ?? account.accountId
						}), effective === account.accountId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.statsFilterCheck,
							children: "✓"
						}) : null]
					}, account.accountId))]
				}) : null]
			});
		}
		/** Model color palette (theme tokens so dark mode stays readable). */
		const MODEL_COLORS = [
			"var(--stats-color-1, #10b981)",
			"var(--stats-color-2, #0d9488)",
			"var(--stats-color-3, #8b5cf6)",
			"var(--stats-color-4, #f59e0b)",
			"var(--stats-color-5, #f43f5e)",
			"var(--stats-color-6, #6366f1)",
			"var(--stats-color-7, #0ea5e9)",
			"var(--stats-color-8, #84cc16)"
		];
		const MAX_MODELS = 5;
		const OTHER_MODEL = "其他";
		/** Build stacked chart data: top models by consumption, the rest folded into「其他」. */
		function buildStackedChart(daily) {
			const totals = /* @__PURE__ */ new Map();
			for (const point of daily) for (const model of point.models ?? []) totals.set(model.model, (totals.get(model.model) ?? 0) + model.credit);
			const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_MODELS).map(([model]) => model);
			const points = daily.map((point) => {
				const entry = {
					date: point.date,
					total: point.usage
				};
				for (const model of point.models ?? []) {
					const key = top.includes(model.model) ? model.model : OTHER_MODEL;
					entry[key] = (typeof entry[key] === "number" ? entry[key] : 0) + model.credit;
				}
				return entry;
			});
			const models = [...top];
			if (points.some((point) => point[OTHER_MODEL] !== void 0)) models.push(OTHER_MODEL);
			return {
				models,
				points
			};
		}
		/** A stacked bar chart drawn as inline SVG (no chart library in the plugin). */
		function StackedTrendChart({ points, models, t }) {
			const [hover, setHover] = (0, react.useState)(null);
			if (points.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "14px 0",
					textAlign: "center",
					fontSize: 12,
					color: "var(--dsw-alias-label-tertiary)"
				},
				children: t("statsTrendNoData")
			});
			const series = models.length > 0 ? models : ["total"];
			const segmentLabel = (model) => model === "total" ? t("statsTrendTotalLabel") : model;
			const width = 680;
			const height = 200;
			const chartBottom = 178;
			const max = Math.max(...points.map((p) => p.total), 1);
			const barGap = 3;
			const barWidth = Math.min(28, Math.max(2, (width - points.length * barGap) / points.length));
			const gridLines = [
				.25,
				.5,
				.75,
				1
			];
			const bars = points.map((point, index) => {
				const x = index * (barWidth + barGap);
				const stackTop = chartBottom;
				const visible = series.map((model, mi) => ({
					model,
					mi,
					value: typeof point[model] === "number" ? point[model] : 0
				})).filter((segment) => segment.value > 0);
				return visible.map((segment, si) => {
					const h = segment.value / max * 170;
					const isTop = si === visible.length - 1;
					const y = stackTop - visible.slice(0, si).reduce((sum, s) => sum + s.value / max * 170, 0) - h;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x,
						y,
						width: barWidth,
						height: Math.max(1, h),
						fill: MODEL_COLORS[segment.mi % MODEL_COLORS.length] ?? MODEL_COLORS[0],
						rx: isTop ? 3 : 0,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("title", { children: `${point.date} · ${segmentLabel(segment.model)} ${formatNumber$1(segment.value)}` })
					}, `${point.date}-${segment.model}`);
				});
			});
			const hovered = hover !== null ? points[hover] : void 0;
			const hoveredModels = hovered !== void 0 ? series.map((model, mi) => ({
				model,
				color: MODEL_COLORS[mi % MODEL_COLORS.length] ?? MODEL_COLORS[0],
				value: typeof hovered[model] === "number" ? hovered[model] : 0
			})).filter((segment) => segment.value > 0) : [];
			const hoveredTotal = hoveredModels.reduce((sum, segment) => sum + segment.value, 0);
			const labelIndices = [.../* @__PURE__ */ new Set([
				0,
				Math.floor((points.length - 1) / 2),
				points.length - 1
			])];
			const renderTooltip = () => {
				if (hovered === void 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodeBuddyPluginCard_module_css_default.statsChartTooltip,
					role: "status",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodeBuddyPluginCard_module_css_default.statsChartTooltipTitle,
							children: t("statsTrendTooltipTitle", { date: formatChartDate(hovered.date) })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodeBuddyPluginCard_module_css_default.statsChartTooltipTotal,
							children: t("statsTrendTooltipTotal", { usage: formatNumber$1(hoveredTotal) })
						}),
						hoveredModels.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodeBuddyPluginCard_module_css_default.statsChartTooltipRow,
							style: { color: "var(--dsw-alias-label-tertiary)" },
							children: t("statsTrendTooltipNone")
						}) : hoveredModels.map((segment) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CodeBuddyPluginCard_module_css_default.statsChartTooltipRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodeBuddyPluginCard_module_css_default.statsChartLegendSwatch,
									style: { backgroundColor: segment.color },
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodeBuddyPluginCard_module_css_default.statsChartTooltipName,
									children: segmentLabel(segment.model)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodeBuddyPluginCard_module_css_default.statsChartTooltipValue,
									children: formatNumber$1(segment.value)
								})
							]
						}, segment.model))
					]
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { position: "relative" },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						viewBox: `0 0 ${width} ${height}`,
						style: {
							width: "100%",
							height: "auto",
							display: "block"
						},
						role: "img",
						"aria-label": "credit trend chart",
						children: [
							gridLines.map((fraction) => {
								const gy = chartBottom - fraction * 170;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
									x1: 0,
									x2: width,
									y1: gy,
									y2: gy,
									stroke: "var(--dsw-alias-border-l2)",
									strokeWidth: 1,
									strokeDasharray: "3 3"
								}, fraction);
							}),
							bars,
							points.map((point, index) => {
								const x = index * (barWidth + barGap);
								const w = barWidth + barGap;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
									x,
									y: 0,
									width: w,
									height,
									fill: "transparent",
									style: { cursor: "pointer" },
									onMouseEnter: () => {
										setHover(index);
									},
									onMouseLeave: () => {
										setHover(null);
									}
								}, `hit-${point.date}`);
							})
						]
					}),
					renderTooltip(),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							justifyContent: "space-between",
							marginTop: 2
						},
						children: labelIndices.map((pointIndex, labelIndex) => {
							const point = points[pointIndex];
							if (point === void 0) return null;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 10,
									color: "var(--dsw-alias-label-tertiary)",
									whiteSpace: "nowrap"
								},
								children: formatChartDate(point.date)
							}, `label-${labelIndex}`);
						})
					}),
					series.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.statsChartLegend,
						children: series.map((model, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CodeBuddyPluginCard_module_css_default.statsChartLegendItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CodeBuddyPluginCard_module_css_default.statsChartLegendSwatch,
								style: { backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length] ?? MODEL_COLORS[0] },
								"aria-hidden": "true"
							}), segmentLabel(model)]
						}, model))
					}) : null
				]
			});
		}
		/** One model row with a ratio bar. */
		function ModelRow({ model, totalCredit, totalRequests, t }) {
			const percent = (totalCredit > 0 ? model.credit / totalCredit : totalRequests > 0 ? model.requestCount / totalRequests : 0) * 100;
			const label = model.model === "—" ? t("statsModelUnknown") : model.model;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.statsModelRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodeBuddyPluginCard_module_css_default.statsModelRowHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CodeBuddyPluginCard_module_css_default.statsModelRowName,
						title: label,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: CodeBuddyPluginCard_module_css_default.statsModelRowMeta,
						children: [t("statsModelLine", {
							credit: formatNumber$1(model.credit),
							count: formatNumber$1(model.requestCount)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: { marginLeft: 4 },
							children: percent < .05 ? "<0.1%" : `${percent.toFixed(1)}%`
						})]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.progressTrack,
					style: { marginTop: 5 },
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.progressFill,
						style: { width: `${Math.min(100, Math.max(0, percent))}%` }
					})
				})]
			});
		}
		/** The recent-requests table. */
		function UsageTable({ requests, showAccount, t }) {
			if (requests.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "16px 0",
					textAlign: "center",
					fontSize: 13,
					color: "var(--dsw-alias-label-secondary)"
				},
				children: t("statsDetailNoOfficial")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: CodeBuddyPluginCard_module_css_default.statsTableWrap,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
					className: CodeBuddyPluginCard_module_css_default.statsTable,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("statsUsageRequestTime") }),
						showAccount ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("statsUsageAccount") }) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: { textAlign: "right" },
							children: t("statsUsageConsumed")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("statsUsageModel") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("statsUsageClient") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("statsUsageRequestId") })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: requests.map((request) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								whiteSpace: "nowrap",
								color: "var(--dsw-alias-label-tertiary)"
							},
							children: request.requestTime
						}),
						showAccount ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								maxWidth: 130,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							title: request.accountName,
							children: request.accountName ?? request.accountId
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								textAlign: "right",
								fontWeight: 500,
								color: "var(--dsw-alias-brand-primary)"
							},
							children: formatNumber$1(request.credit)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								maxWidth: 160,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							title: request.model,
							children: request.model
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								maxWidth: 100,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							title: request.client,
							children: request.client
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								fontFamily: "monospace",
								fontSize: 10,
								color: "var(--dsw-alias-label-tertiary)",
								maxWidth: 160,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							title: request.requestId,
							children: request.requestId
						})
					] }, `${request.requestId}-${request.requestTime}`)) })]
				})
			});
		}
		/** Credit packages of one (or all) accounts as progress rows. */
		function CreditResources({ accounts, selectedId, t }) {
			const visible = selectedId === null ? accounts : accounts.filter((a) => a.id === selectedId);
			if (visible.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "16px 0",
					textAlign: "center",
					fontSize: 13,
					color: "var(--dsw-alias-label-secondary)"
				},
				children: t("statsDetailNoStats")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: visible.map((account) => {
				const name = account.nickname ?? account.uid ?? account.id;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [selectedId === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 12,
						fontWeight: 500,
						color: "var(--dsw-alias-label-primary)",
						padding: "8px 0 4px"
					},
					children: name
				}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditResourcesInner, {
					credits: account.credits,
					t
				})] }, account.id);
			}) });
		}
		function CreditResourcesInner({ credits, t }) {
			if (credits === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "12px 0",
					fontSize: 13,
					color: "var(--dsw-alias-label-secondary)"
				},
				children: t("statsDetailNoPackages")
			});
			const resources = credits.accounts.filter((account) => account.remain > 0);
			if (resources.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "12px 0",
					fontSize: 13,
					color: "var(--dsw-alias-label-secondary)"
				},
				children: t("accountCardNoCredit")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					padding: "8px 0"
				},
				children: resources.map((resource, index) => {
					const percent = resource.total > 0 ? Math.max(0, Math.min(100, resource.remain / resource.total * 100)) : 0;
					const expiryText = resource.expired ? t("accountCardExpired") : resource.expiringSoon ? t("accountCardExpiresIn7d") : resource.expireAtMs !== void 0 ? t("statsResourceExpires", { date: `${String(new Date(resource.expireAtMs).getMonth() + 1).padStart(2, "0")}/${String(new Date(resource.expireAtMs).getDate()).padStart(2, "0")}` }) : t("accountCardLongLived");
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodeBuddyPluginCard_module_css_default.statsModelRowHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.statsModelRowName,
							title: resource.packageName,
							children: resource.packageName
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CodeBuddyPluginCard_module_css_default.statsModelRowMeta,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
								formatNumber$1(resource.remain),
								" / ",
								formatNumber$1(resource.total)
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { marginLeft: 4 },
								children: expiryText
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.progressTrack,
						style: { marginTop: 5 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodeBuddyPluginCard_module_css_default.progressFill,
							style: { width: `${percent}%` }
						})
					})] }, `${resource.packageName}-${String(index)}`);
				})
			});
		}
		/** Find the usage account backing a filter selection (for per-account series). */
		function usageAccountFor(status, accountId) {
			if (accountId === null) return void 0;
			return status.accounts.find((account) => account.accountId === accountId);
		}
		/**
		* The credit-statistics panel. Fetches the aggregated document on mount,
		* exposes a manual refresh (POST refresh:true), and renders the summary,
		* trend chart, model breakdown and detail tabs — each with its own account
		* filter like the workbuddy-switch statistics page.
		*/
		function CreditStatsPanel({ accounts, onChanged, t }) {
			const [load, setLoad] = (0, react.useState)({ phase: "loading" });
			const [trendRange, setTrendRange] = (0, react.useState)("30d");
			const [trendAccount, setTrendAccount] = (0, react.useState)(null);
			const [modelRange, setModelRange] = (0, react.useState)("30d");
			const [modelAccount, setModelAccount] = (0, react.useState)(null);
			const [detailAccount, setDetailAccount] = (0, react.useState)(null);
			const [detailTab, setDetailTab] = (0, react.useState)("credits");
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			const fetchStats = (0, react.useCallback)(async (refresh) => {
				setLoad({ phase: "loading" });
				try {
					const response = await fetch(CODEBUDDY_CREDIT_STATS_PATH, {
						method: refresh ? "POST" : "GET",
						headers: refresh ? {
							"content-type": "application/json",
							accept: "application/json"
						} : { accept: "application/json" },
						credentials: "same-origin",
						...refresh ? { body: JSON.stringify({ refresh: true }) } : {}
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const value = await response.json();
					if (mounted.current) setLoad({
						phase: "ok",
						value
					});
					if (refresh) onChanged();
				} catch (error) {
					if (mounted.current) setLoad({
						phase: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				}
			}, [onChanged, t]);
			(0, react.useEffect)(() => {
				fetchStats(false);
			}, [fetchStats]);
			const status = load.phase === "ok" ? load.value : void 0;
			const filterAccounts = status !== void 0 && status.accounts.length > 0 ? status.accounts.map((account) => ({
				accountId: account.accountId,
				accountName: account.accountName
			})) : accounts.map((account) => ({
				accountId: account.id,
				accountName: account.nickname ?? account.uid ?? account.id
			}));
			const effectiveTrendAccount = trendAccount !== null && status !== void 0 && status.accounts.some((a) => a.accountId === trendAccount) ? trendAccount : null;
			const trendUsageAccount = status !== void 0 ? usageAccountFor(status, effectiveTrendAccount) : void 0;
			const trendPoints = chartPoints(status !== void 0 ? effectiveTrendAccount !== null ? trendUsageAccount?.ok === true ? trendUsageAccount.daily ?? [] : [] : status.daily : [], trendRange);
			const stacked = buildStackedChart(trendPoints);
			const hasModelDetail = trendPoints.some((point) => (point.models?.length ?? 0) > 0);
			const chartModels = stacked.models.length > 1 && hasModelDetail ? stacked.models : ["total"];
			const chartData = chartModels.length > 1 ? stacked.points : trendPoints.map((point) => ({
				date: point.date,
				total: point.usage
			}));
			const effectiveModelAccount = modelAccount !== null && status !== void 0 && status.accounts.some((a) => a.accountId === modelAccount) ? modelAccount : null;
			const modelUsageAccount = status !== void 0 ? usageAccountFor(status, effectiveModelAccount) : void 0;
			const modelBasePoints = status !== void 0 ? chartPoints(effectiveModelAccount !== null ? modelUsageAccount?.ok === true ? modelUsageAccount.daily ?? [] : [] : status.daily, modelRange) : [];
			const modelMap = /* @__PURE__ */ new Map();
			for (const point of modelBasePoints) for (const item of point.models ?? []) {
				const entry = modelMap.get(item.model) ?? {
					requestCount: 0,
					credit: 0
				};
				entry.requestCount += item.requestCount;
				entry.credit += item.credit;
				modelMap.set(item.model, entry);
			}
			const modelRows = [...modelMap.entries()].map(([model, value]) => ({
				model,
				requestCount: value.requestCount,
				credit: value.credit
			})).sort((a, b) => b.credit - a.credit || b.requestCount - a.requestCount || a.model.localeCompare(b.model));
			const modelTotalCredit = modelRows.reduce((sum, m) => sum + m.credit, 0);
			const modelTotalRequests = modelRows.reduce((sum, m) => sum + m.requestCount, 0);
			const effectiveDetailAccount = detailAccount !== null && accounts.some((a) => a.id === detailAccount) ? detailAccount : accounts[0]?.id ?? null;
			const detailShowAccount = accounts.length > 1;
			const detailRequests = status !== void 0 ? effectiveDetailAccount !== null ? status.requests.filter((r) => r.accountId === effectiveDetailAccount) : status.requests : [];
			const summaryCards = status === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.statsSummaryGrid,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SummaryMetric, {
						label: t("statsRemaining"),
						value: formatNumber$1(accounts.reduce((sum, a) => sum + (a.credits?.total ?? 0), 0))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SummaryMetric, {
						label: t("statsTodayUsage"),
						value: formatNumber$1(status.summary.usageToday)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SummaryMetric, {
						label: t("stats7dUsage"),
						value: formatNumber$1(status.summary.usage7Days)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SummaryMetric, {
						label: t("statsMonthUsage"),
						value: formatNumber$1(status.summary.usageThisMonth)
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
						flexWrap: "wrap"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodeBuddyPluginCard_module_css_default.bodyText,
						style: { margin: 0 },
						children: t("statsHeading")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CodeBuddyPluginCard_module_css_default.choiceSave,
						disabled: load.phase === "loading",
						onClick: () => {
							fetchStats(true);
						},
						children: load.phase === "loading" ? t("statsRefreshing") : t("statsRefresh")
					})]
				}),
				load.phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cx$1(CodeBuddyPluginCard_module_css_default.statsAlert, CodeBuddyPluginCard_module_css_default.statsAlertError),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("statsLoadFailed"),
						": ",
						load.message
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: CodeBuddyPluginCard_module_css_default.refresh,
						style: { padding: "2px 8px" },
						onClick: () => {
							fetchStats(true);
						},
						children: t("statsRetry")
					})]
				}) : null,
				load.phase === "loading" && status === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "20px 0",
						fontSize: 13,
						color: "var(--dsw-alias-label-secondary)"
					},
					children: t("statsLoading")
				}) : status !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					accounts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.statsAlert,
						children: t("statsNoAccounts")
					}) : null,
					status.status !== "complete" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: cx$1(CodeBuddyPluginCard_module_css_default.statsAlert, CodeBuddyPluginCard_module_css_default.statsAlertWarning),
						children: status.status === "partial" ? `${t("statsOfficialPartial")} — ${t("statsOfficialPartialDetail", {
							ok: String(status.accounts.filter((a) => a.ok).length),
							total: String(status.accounts.length)
						})}` : t("statsOfficialUnavailable")
					}) : null,
					summaryCards,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodeBuddyPluginCard_module_css_default.statsPanelCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodeBuddyPluginCard_module_css_default.statsPanelHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodeBuddyPluginCard_module_css_default.statsPanelTitle,
									children: t("statsTrendTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8,
										flexWrap: "wrap"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFilterMenu, {
										accounts: filterAccounts,
										accountFilter: effectiveTrendAccount,
										onAccountFilterChange: setTrendAccount,
										t,
										ariaLabel: t("statsFilterTrend")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: CodeBuddyPluginCard_module_css_default.statsRangeTabs,
										children: RANGES.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cx$1(CodeBuddyPluginCard_module_css_default.statsRangeTab, trendRange === option.key ? CodeBuddyPluginCard_module_css_default.statsRangeTabActive : void 0),
											onClick: () => {
												setTrendRange(option.key);
											},
											"aria-pressed": trendRange === option.key,
											children: t(option.labelKey)
										}, option.key))
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 12,
									color: "var(--dsw-alias-label-tertiary)",
									marginBottom: 8
								},
								children: t("statsTrendFromOfficial", {
									start: status.rangeStart,
									end: status.rangeEnd
								})
							}),
							effectiveTrendAccount !== null && (trendUsageAccount === void 0 || trendUsageAccount.ok !== true) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									padding: "14px 0",
									textAlign: "center",
									fontSize: 13,
									color: "var(--dsw-alias-label-secondary)"
								},
								children: t("statsTrendAccountUnavailable")
							}) : chartData.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									padding: "14px 0",
									textAlign: "center",
									fontSize: 12,
									color: "var(--dsw-alias-label-tertiary)"
								},
								children: t("statsTrendNoData")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StackedTrendChart, {
								points: chartData,
								models: chartModels,
								t
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									justifyContent: "space-between",
									marginTop: 8,
									fontSize: 12,
									color: "var(--dsw-alias-label-secondary)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("statsTrendTotal", { usage: formatNumber$1(sumUsage(trendPoints)) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("statsDataUpdatedAt", { time: formatDateTime(status.collectedAt) }) })]
							})] })
						]
					}),
					status.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodeBuddyPluginCard_module_css_default.statsPanelCard,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CodeBuddyPluginCard_module_css_default.statsPanelHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CodeBuddyPluginCard_module_css_default.statsPanelTitle,
								children: t("statsModelHeading")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									flexWrap: "wrap"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 12,
											color: "var(--dsw-alias-label-secondary)"
										},
										children: t("statsModelCount", { count: String(modelRows.length) })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFilterMenu, {
										accounts: filterAccounts,
										accountFilter: effectiveModelAccount,
										onAccountFilterChange: setModelAccount,
										t,
										ariaLabel: t("statsFilterModel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: CodeBuddyPluginCard_module_css_default.statsRangeTabs,
										children: RANGES.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: cx$1(CodeBuddyPluginCard_module_css_default.statsRangeTab, modelRange === option.key ? CodeBuddyPluginCard_module_css_default.statsRangeTabActive : void 0),
											onClick: () => {
												setModelRange(option.key);
											},
											"aria-pressed": modelRange === option.key,
											children: t(option.labelKey)
										}, option.key))
									})
								]
							})]
						}), effectiveModelAccount !== null && (modelUsageAccount === void 0 || modelUsageAccount.ok !== true) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								padding: "16px 0",
								textAlign: "center",
								fontSize: 13,
								color: "var(--dsw-alias-label-secondary)"
							},
							children: t("statsTrendAccountUnavailable")
						}) : modelRows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								padding: "16px 0",
								textAlign: "center",
								fontSize: 13,
								color: "var(--dsw-alias-label-secondary)"
							},
							children: t("statsModelEmpty")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									justifyContent: "space-between",
									fontSize: 12,
									color: "var(--dsw-alias-label-secondary)",
									marginBottom: 8
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("statsModelTotal", {
									requests: formatNumber$1(modelTotalRequests),
									credit: formatNumber$1(modelTotalCredit)
								}) })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CodeBuddyPluginCard_module_css_default.statsModelRows,
								children: modelRows.slice(0, 8).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRow, {
									model,
									totalCredit: modelTotalCredit,
									totalRequests: modelTotalRequests,
									t
								}, model.model))
							}),
							modelRows.length > 8 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									margin: "10px 0 0",
									fontSize: 11,
									color: "var(--dsw-alias-label-tertiary)"
								},
								children: t("statsModelMore", { limit: "8" })
							}) : null
						] })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodeBuddyPluginCard_module_css_default.statsPanelCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodeBuddyPluginCard_module_css_default.statsPanelHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodeBuddyPluginCard_module_css_default.statsPanelTitle,
									children: t("statsDetailHeading")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8,
										flexWrap: "wrap"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFilterMenu, {
										accounts: filterAccounts,
										accountFilter: effectiveDetailAccount,
										onAccountFilterChange: setDetailAccount,
										t,
										ariaLabel: t("statsFilterDetail"),
										allowAll: false
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											fontSize: 12,
											color: "var(--dsw-alias-label-tertiary)"
										},
										children: t("statsDetailRecentCollected", { time: formatDateTime(status.collectedAt) })
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodeBuddyPluginCard_module_css_default.statsDetailTabs,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: cx$1(CodeBuddyPluginCard_module_css_default.statsDetailTab, detailTab === "credits" ? CodeBuddyPluginCard_module_css_default.statsDetailTabActive : void 0),
									onClick: () => {
										setDetailTab("credits");
									},
									children: t("statsDetailCredits")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: cx$1(CodeBuddyPluginCard_module_css_default.statsDetailTab, detailTab === "requests" ? CodeBuddyPluginCard_module_css_default.statsDetailTabActive : void 0),
									onClick: () => {
										setDetailTab("requests");
									},
									children: t("statsDetailRequests")
								})]
							}),
							detailTab === "credits" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditResources, {
								accounts,
								selectedId: effectiveDetailAccount,
								t
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageTable, {
								requests: detailRequests,
								showAccount: detailShowAccount,
								t
							})
						]
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						padding: "20px 0",
						textAlign: "center",
						fontSize: 13,
						color: "var(--dsw-alias-label-tertiary)"
					},
					children: t("statsNone")
				})
			] });
		}
		function SummaryMetric({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.statsMetric,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.statsMetricLabel,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.statsMetricValue,
					children: value
				})]
			});
		}
		//#endregion
		//#region src/client/CodeBuddyPluginCard.tsx
		/** CodeBuddy status card contributed to Harness Plugin configuration. */
		const POLL_INTERVAL_MS = 6e4;
		/**
		* Join CSS-module class names, skipping empties. The css-module declaration
		* types every lookup as `string | undefined` under noUncheckedIndexedAccess
		* (the host package sits behind clsx's tolerant signature; this card avoids
		* the extra dependency with the same two-line helper).
		*/
		function cx(...names) {
			return names.filter((name) => name !== void 0 && name !== "").join(" ");
		}
		const quotaTitleStyle = {
			margin: "0 0 8px",
			fontSize: 13,
			lineHeight: 1.5,
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		/** Localize an upstream promotional badge label, with an unknown-badge fallback. */
		function modelBadgeLabel(badge, t) {
			if (badge === "限时免费") return t("badgeLimitedFree");
			if (badge === "夜间折扣") return t("badgeNightDiscount");
			return badge;
		}
		function formatNumber(value) {
			return new Intl.NumberFormat(void 0).format(value);
		}
		function progressFillStyle(percent) {
			return { width: `${Math.max(0, Math.min(100, percent))}%` };
		}
		/** One billing package as a labeled progress bar. */
		function CreditBar({ label, remain, size, t }) {
			const detail = size > 0 ? t("exactRemaining", {
				remain: formatNumber(remain),
				size: formatNumber(size)
			}) : t("creditPackageUnknownSize", { remain: formatNumber(remain) });
			const percent = size > 0 ? remain / size * 100 : 100;
			const display = new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(percent);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodeBuddyPluginCard_module_css_default.quotaLabel,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("percentRemaining", { percent: display }) })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.progressTrack,
					role: "progressbar",
					"aria-label": label,
					"aria-valuemin": 0,
					"aria-valuemax": 100,
					"aria-valuenow": percent,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.progressFill,
						style: progressFillStyle(percent)
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: CodeBuddyPluginCard_module_css_default.bodyText,
					children: detail
				})
			] });
		}
		/**
		* One model offer row: name, promotional badges, and the billing rate.
		*/
		function ModelOfferRow({ model, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.quotaLabel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						flexWrap: "wrap"
					},
					children: [model.badges?.map((badge) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CodeBuddyPluginCard_module_css_default.badge,
						children: modelBadgeLabel(badge, t)
					}, badge)), model.free === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CodeBuddyPluginCard_module_css_default.badge,
						children: t("freeModel")
					}) : null]
				})]
			}), model.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: CodeBuddyPluginCard_module_css_default.bodyText,
				children: t("rate", { rate: model.credits })
			})] });
		}
		/**
		* The enabled-model checkbox list.
		*
		* The draft lives here rather than in the parent's status state because the
		* card polls the status route every minute while open: folding the selection
		* into that polled document would overwrite a half-made choice each time a poll
		* landed. The draft seeds from the Host's answer, survives polls, and is
		* re-seeded only when the user saves or the Host's own selection changes.
		*/
		function ModelSelection({ selection, onSaved, t }) {
			const hostKey = selection.choices.filter((choice) => choice.enabled).map((choice) => choice.id).join(",");
			const [draft, setDraft] = (0, react.useState)(() => selection.choices.filter((choice) => choice.enabled).map((choice) => choice.id));
			const [seeded, setSeeded] = (0, react.useState)(hostKey);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saved, setSaved] = (0, react.useState)(false);
			const [savedKey, setSavedKey] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(void 0);
			if (seeded !== hostKey) {
				setSeeded(hostKey);
				setDraft(selection.choices.filter((choice) => choice.enabled).map((choice) => choice.id));
				setSaved(hostKey === savedKey);
			}
			const checked = new Set(draft);
			const all = selection.choices.length;
			const wire = draft.length === all ? [] : draft;
			const stored = selection.choices.filter((choice) => choice.enabled).map((choice) => choice.id);
			const dirty = selection.restricted ? draft.length !== stored.length || draft.some((id) => !stored.includes(id)) : draft.length !== all;
			const toggle = (id) => {
				setSaved(false);
				setError(void 0);
				setDraft((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
			};
			const save = async () => {
				setSaving(true);
				setError(void 0);
				try {
					const response = await fetch(CODEBUDDY_MODELS_PATH, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json"
						},
						credentials: "same-origin",
						body: JSON.stringify({ enabledModels: wire })
					});
					if (!response.ok) {
						const detail = await response.json().catch(() => void 0);
						const message = typeof detail?.error === "string" ? detail.error : `HTTP ${String(response.status)}`;
						throw new Error(message);
					}
					const landed = (await response.json().catch(() => void 0))?.selection;
					setSavedKey(landed === void 0 ? void 0 : landed.choices.filter((choice) => choice.enabled).map((choice) => choice.id).join(","));
					setSaved(true);
					onSaved?.();
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : t("requestFailed"));
				} finally {
					setSaving(false);
				}
			};
			const disabled = !selection.writable || saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.quotaList,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodeBuddyPluginCard_module_css_default.bodyText,
						style: { margin: 0 },
						children: selection.restricted ? t("optionalModelsHint") : t("optionalModelsAllHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodeBuddyPluginCard_module_css_default.choiceList,
						children: selection.choices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: disabled ? cx(CodeBuddyPluginCard_module_css_default.choiceRow, CodeBuddyPluginCard_module_css_default.choiceRowDisabled) : cx(CodeBuddyPluginCard_module_css_default.choiceRow),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									className: CodeBuddyPluginCard_module_css_default.choiceBox,
									checked: checked.has(choice.id),
									disabled,
									onChange: () => {
										toggle(choice.id);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodeBuddyPluginCard_module_css_default.choiceName,
									children: choice.name
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: CodeBuddyPluginCard_module_css_default.choiceMeta,
									children: [choice.badges?.map((badge) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CodeBuddyPluginCard_module_css_default.badge,
										children: modelBadgeLabel(badge, t)
									}, badge)), choice.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: choice.credits })]
								})
							]
						}, choice.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodeBuddyPluginCard_module_css_default.choiceActions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CodeBuddyPluginCard_module_css_default.choiceSave,
								disabled: disabled || !dirty,
								onClick: () => {
									save();
								},
								children: saving ? t("optionalModelsSaving") : t("optionalModelsSave")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CodeBuddyPluginCard_module_css_default.refresh,
								disabled: disabled || draft.length === all,
								onClick: () => {
									setSaved(false);
									setDraft(selection.choices.map((choice) => choice.id));
								},
								children: t("optionalModelsSelectAll")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: CodeBuddyPluginCard_module_css_default.refresh,
								disabled: disabled || draft.length === 0,
								onClick: () => {
									setSaved(false);
									setDraft([]);
								},
								children: t("optionalModelsClear")
							}),
							saved && !dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CodeBuddyPluginCard_module_css_default.bodyText,
								style: { margin: 0 },
								children: t("optionalModelsSaved")
							}) : null
						]
					}),
					!selection.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodeBuddyPluginCard_module_css_default.bodyText,
						children: t("optionalModelsReadOnly")
					}) : null,
					selection.writable && draft.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodeBuddyPluginCard_module_css_default.bodyText,
						children: t("optionalModelsEmptyWarning")
					}) : null,
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodeBuddyPluginCard_module_css_default.bodyError,
						children: t("optionalModelsSaveFailed", { message: error })
					})
				]
			});
		}
		/** Render CodeBuddy sign-in state and the tabbed panel as one expandable card. */
		function CodeBuddyPluginCard({ t }) {
			if (t === void 0) throw new Error("CodeBuddy plugin card requires its translation function");
			const [open, setOpen] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("accounts");
			const [status, setStatus] = (0, react.useState)({ status: "signed-out" });
			const [busy, setBusy] = (0, react.useState)(false);
			const [remainingAccount, setRemainingAccount] = (0, react.useState)(null);
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			const refresh = (0, react.useCallback)(async (signal) => {
				try {
					const response = await fetch(CODEBUDDY_STATUS_PATH, {
						headers: { accept: "application/json" },
						credentials: "same-origin",
						...signal === void 0 ? {} : { signal }
					});
					const value = await response.json().catch(() => void 0);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					if (mounted.current && signal?.aborted !== true) setStatus(value);
				} catch (error) {
					if (mounted.current && signal?.aborted !== true) setStatus({
						status: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				}
			}, [t]);
			const handleChanged = (0, react.useCallback)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const controller = new AbortController();
				refresh(controller.signal);
				return () => {
					controller.abort();
				};
			}, [open, refresh]);
			(0, react.useEffect)(() => {
				if (!open || status.status !== "signed-in") return;
				const controller = new AbortController();
				const timer = window.setInterval(() => {
					refresh(controller.signal);
				}, POLL_INTERVAL_MS);
				return () => {
					window.clearInterval(timer);
					controller.abort();
				};
			}, [
				open,
				refresh,
				status.status
			]);
			const manualRefresh = async () => {
				setBusy(true);
				try {
					await refresh();
				} finally {
					if (mounted.current) setBusy(false);
				}
			};
			const title = t("title");
			const accounts = "accounts" in status && status.accounts !== void 0 ? status.accounts : [];
			const signedIn = status.status === "signed-in";
			const remainingOptions = accounts.map((account) => ({
				accountId: account.id,
				accountName: account.nickname ?? account.uid ?? account.id
			}));
			const effectiveRemainingAccount = remainingAccount !== null && accounts.some((a) => a.id === remainingAccount) ? remainingAccount : accounts[0]?.id ?? null;
			const remainingCredits = effectiveRemainingAccount !== null ? accounts.find((a) => a.id === effectiveRemainingAccount)?.credits : void 0;
			const tabs = [
				{
					key: "accounts",
					label: t("tabAccounts")
				},
				{
					key: "models",
					label: t("tabModels")
				},
				{
					key: "stats",
					label: t("tabCreditStats")
				},
				{
					key: "remaining",
					label: t("tabRemaining")
				}
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? cx(CodeBuddyPluginCard_module_css_default.card, CodeBuddyPluginCard_module_css_default.cardOpen) : cx(CodeBuddyPluginCard_module_css_default.card),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: CodeBuddyPluginCard_module_css_default.header,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: CodeBuddyPluginCard_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.name,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.description,
							children: t("intro")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? cx(CodeBuddyPluginCard_module_css_default.chevron, CodeBuddyPluginCard_module_css_default.chevronOpen) : cx(CodeBuddyPluginCard_module_css_default.chevron) })]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodeBuddyPluginCard_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodeBuddyPluginCard_module_css_default.bodyBlock,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodeBuddyPluginCard_module_css_default.bodyRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: CodeBuddyPluginCard_module_css_default.statusLine,
									role: "status",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										className: cx(CodeBuddyPluginCard_module_css_default.statusDot, status.status === "signed-in" ? CodeBuddyPluginCard_module_css_default.statusDotSignedIn : status.status === "error" ? CodeBuddyPluginCard_module_css_default.statusDotError : CodeBuddyPluginCard_module_css_default.statusDotSignedOut)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: signedIn ? status.nickname === void 0 ? t("signedInAs", { nickname: "" }).replace(/[:：]\s*$/, "") : t("signedInAs", { nickname: status.nickname }) : status.status === "error" ? t("requestFailed") : t("signedOut") })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: CodeBuddyPluginCard_module_css_default.refresh,
										disabled: busy,
										onClick: () => {
											manualRefresh();
										},
										children: busy ? t("refreshing") : t("refresh")
									})
								})]
							}),
							signedIn && status.expiresAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: CodeBuddyPluginCard_module_css_default.bodyText,
								children: t("accessTokenExpires", { time: new Intl.DateTimeFormat(void 0, {
									dateStyle: "medium",
									timeStyle: "short"
								}).format(new Date(status.expiresAt)) })
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CodeBuddyPluginCard_module_css_default.tabBar,
								role: "tablist",
								"aria-label": t("accountPanelHeading"),
								children: tabs.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									role: "tab",
									"aria-selected": tab === item.key,
									className: cx(CodeBuddyPluginCard_module_css_default.tab, tab === item.key ? CodeBuddyPluginCard_module_css_default.tabActive : void 0),
									onClick: () => {
										setTab(item.key);
									},
									children: item.label
								}, item.key))
							}),
							tab === "accounts" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								role: "tabpanel",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCards, {
									accounts,
									onChanged: handleChanged,
									t
								})
							}) : null,
							tab === "models" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "tabpanel",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										style: quotaTitleStyle,
										children: t("modelsHeading")
									}),
									signedIn && status.selection !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelSelection, {
										selection: status.selection,
										onSaved: () => {
											refresh();
										},
										t
									}) : null,
									signedIn && status.models !== void 0 && status.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: CodeBuddyPluginCard_module_css_default.quotaList,
										children: status.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelOfferRow, {
											model,
											t
										}, model.id))
									}) : null
								]
							}) : null,
							tab === "stats" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								role: "tabpanel",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditStatsPanel, {
									accounts,
									onChanged: handleChanged,
									t
								})
							}) : null,
							tab === "remaining" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "tabpanel",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										style: quotaTitleStyle,
										children: t("creditsHeading")
									}),
									signedIn && accounts.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 8,
											margin: "0 0 10px"
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFilterMenu, {
											accounts: remainingOptions,
											accountFilter: effectiveRemainingAccount,
											onAccountFilterChange: setRemainingAccount,
											t,
											ariaLabel: t("creditsFilterAccount"),
											allowAll: false
										})
									}) : null,
									signedIn && remainingCredits !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: CodeBuddyPluginCard_module_css_default.quotaList,
										children: remainingCredits.accounts.filter((account) => account.remain > 0).map((account, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditBar, {
											label: account.packageName,
											remain: account.remain,
											size: account.size,
											t
										}, `${account.packageName}-${String(index)}`))
									}) : null,
									signedIn && effectiveRemainingAccount !== null && remainingCredits === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: CodeBuddyPluginCard_module_css_default.bodyText,
										children: t("creditLoading")
									}) : null,
									signedIn && effectiveRemainingAccount !== null && remainingCredits !== void 0 && remainingCredits.accounts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: CodeBuddyPluginCard_module_css_default.bodyText,
										children: t("creditEmpty")
									}) : null
								]
							}) : null
						]
					})
				}) : null]
			});
		}
		//#endregion
		//#region src/client/credit-line.ts
		/**
		* Pure display helpers for the composer credit line, split out of the
		* component so the Node test environment can exercise them without loading
		* the browser-only DSH slot packages.
		*
		* @module dsh-codebuddy-cli/credit-line
		*/
		/**
		* Display spelling of this plugin's provider.
		*
		* A brand name, not translatable copy: the id (`codebuddy-cli`) is a routing
		* key, so the line shows the product spelling instead. Foreign providers have
		* no such table here — their raw provider id is shown as-is.
		*/
		const CODEBUDDY_PROVIDER_LABEL = "CodeBuddy";
		/** Trim fractional noise: one decimal under 100, integers from there on. */
		function scaleText(candidate) {
			return candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
		}
		/**
		* Compact a credit count the way the composer formats tokens (`1.2K`).
		* Mirrors ui-conversation's ContextMeter `formatTokens` thresholds so the two
		* meters read as one family.
		*/
		function formatCompactCredits(value) {
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${scaleText(value / 1e3)}K`;
			return `${scaleText(value / 1e6)}M`;
		}
		/**
		* Build the credit line from the status document's credit section.
		*
		* Packages with no remaining credit drop out (the card already filters the
		* same way); a signed-in document whose billing answer lists nothing renders
		* as empty rather than hiding the meter, so "0" stays visible and the user
		* can tell "exhausted" apart from "not signed in".
		*/
		function buildCreditLine(credits) {
			if (credits === void 0) return null;
			const rows = credits.accounts.filter((account) => account.remain > 0).map((account) => ({
				packageName: account.packageName,
				remain: account.remain
			})).sort((a, b) => b.remain - a.remain);
			const total = credits.total;
			return {
				compact: formatCompactCredits(total),
				total,
				rows,
				empty: rows.length === 0 && total === 0
			};
		}
		/**
		* The selection the composer is about to use: `next` wins over `lastUsed` —
		* it is the selection the next request will use, which is the one the user
		* just picked. An absent projection (no model chosen yet in this session, or
		* the projection has not landed) resolves to null.
		*
		* Every provider/model read ({@link isCodeBuddySelection},
		* {@link currentCodeBuddyRate}, {@link buildDockLine}) goes through this one
		* helper so they cannot drift apart on which selection counts.
		*/
		function currentModelSelection(selection) {
			return selection?.next ?? selection?.lastUsed ?? null;
		}
		/**
		* Whether the session's current selection belongs to this plugin's provider.
		*
		* The dock itself is *not* gated on this (the line stays mounted for every
		* provider so the composer never loses a row); this only decides whether the
		* CodeBuddy-specific work happens: fetching/polling the plugin's status route
		* and resolving a credits multiplier. False while the projection is missing or
		* carries no selection at all.
		*/
		function isCodeBuddySelection(selection) {
			return currentModelSelection(selection)?.provider === CODEBUDDY_PROVIDER_ID;
		}
		/**
		* Resolve the currently selected CodeBuddy model's billing rate and name.
		*
		* Returns null for a foreign provider, an unknown model, or an absent
		* catalog — the panel then omits the rate row rather than guessing.
		*/
		function currentCodeBuddyRate(selection, catalog) {
			const current = currentModelSelection(selection);
			if (current === null || !isCodeBuddySelection(selection)) return null;
			const rate = catalog?.rates[current.model];
			if (rate === void 0) return null;
			return {
				rate,
				name: catalog?.names[current.model]
			};
		}
		/** Exact credit figure with thousands separators, e.g. `1,642`. */
		function formatCreditTotal(total) {
			return new Intl.NumberFormat(void 0).format(total);
		}
		/**
		* The credit piece of a CodeBuddy line.
		*
		* Every phase produces copy — loading, signed-out and "billing answer missing"
		* each get their own wording — so the row never collapses to nothing while the
		* status document is unusable.
		*/
		function creditSegment(load, credits) {
			if (credits !== null) return {
				kind: "copy",
				key: "creditTotalCompact",
				params: { total: formatCreditTotal(credits.total) }
			};
			if (load.phase === "idle" || load.phase === "loading") return {
				kind: "copy",
				key: "creditLoading"
			};
			if (load.phase === "ok" && load.value.status !== "signed-in") return {
				kind: "copy",
				key: "creditSignedOut"
			};
			return {
				kind: "copy",
				key: "creditUnavailable"
			};
		}
		/**
		* Compose the composer line for whatever the session currently has selected.
		*
		* Always returns a renderable line — that is the point: the composer keeps one
		* stable row whether the user is on a CodeBuddy model, on another provider, or
		* has not picked a model yet.
		*
		* - CodeBuddy selection: credit state, then provider, model and (only when the
		*   catalog knows it) the multiplier.
		* - Any other provider: provider and model as the projection spells them. No
		*   credit piece (the figure is CodeBuddy-only) and no multiplier — the generic
		*   DSH ModelCatalog carries no rate field, so inventing one would be a lie.
		* - No selection yet: a single placeholder piece, so the row still has content.
		*/
		function buildDockLine(selection, load) {
			const current = currentModelSelection(selection);
			const codeBuddy = isCodeBuddySelection(selection);
			const status = load.phase === "ok" ? load.value : void 0;
			const credits = codeBuddy && status?.status === "signed-in" ? buildCreditLine(status.credits) : null;
			const rate = codeBuddy ? currentCodeBuddyRate(selection, status?.catalog) : null;
			const segments = [];
			if (codeBuddy) segments.push(creditSegment(load, credits));
			if (current === null) {
				segments.push({
					kind: "copy",
					key: "dockNoModel"
				});
				return {
					segments,
					codeBuddy,
					credits,
					rate
				};
			}
			segments.push({
				kind: "copy",
				key: "dockProvider",
				params: { provider: codeBuddy ? CODEBUDDY_PROVIDER_LABEL : current.provider }
			});
			segments.push({
				kind: "copy",
				key: "dockModel",
				params: { model: (codeBuddy ? status?.catalog?.names[current.model] : void 0) ?? current.model }
			});
			if (rate !== null) segments.push({
				kind: "text",
				text: rate.rate
			});
			return {
				segments,
				codeBuddy,
				credits,
				rate
			};
		}
		/** Render {@link buildDockLine}'s pieces into the one-line trigger text. */
		function renderDockSegments(segments, t) {
			return segments.map((segment) => segment.kind === "text" ? segment.text : t(segment.key, segment.params)).join(" · ");
		}
		//#endregion
		//#region src/client/CodeBuddyCreditDock.tsx
		/**
		* The composer credit line: one compact row mounted on
		* `conversation.composer.dock` — the same slot the host's session-stats strip
		* occupies, so the figure sits directly under the input box beside the token
		* statistics, styled to read as one family (tertiary 13px text, tabular
		* numbers, same variable palette).
		*
		* The row is always present, whatever the session has selected: it names the
		* current provider and model, and for a CodeBuddy selection prefixes the
		* remaining credit and appends the model's billing multiplier. Loading,
		* signed-out and error states each have their own wording rather than
		* collapsing the row, so the composer's layout never shifts.
		*
		* Clicking opens a small menu-surface panel (same surface vocabulary as the
		* composer's context-occupancy panel) with per-package progress rows, the
		* selected model's billing rate, and a manual refresh. The panel is
		* CodeBuddy-only — for another provider the row is plain text, because this
		* plugin has no billing figures to show for it.
		*/
		const REFRESH_INTERVAL_MS = 6e4;
		const rootStyle = {
			position: "relative",
			display: "block",
			textAlign: "center",
			maxWidth: "var(--dsh-chat-content-width, 48rem)",
			width: "100%",
			margin: "0 auto",
			boxSizing: "border-box",
			padding: "2px calc(var(--dsh-composer-side-clearance, 0px) + 16px) 0px",
			fontSize: "var(--dsh-content-font-size-secondary, 13px)",
			lineHeight: "18px",
			color: "var(--dsw-alias-label-tertiary)",
			whiteSpace: "nowrap",
			overflow: "hidden",
			textOverflow: "ellipsis"
		};
		const triggerStyle = {
			all: "unset",
			cursor: "pointer",
			font: "inherit",
			color: "inherit"
		};
		const panelStyle = {
			position: "absolute",
			bottom: "calc(100% + 8px)",
			left: "50%",
			transform: "translateX(-50%)",
			zIndex: 100,
			boxSizing: "border-box",
			width: 264,
			padding: 12,
			borderRadius: 12,
			background: "var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1, #fff))",
			boxShadow: "var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.16)), 0 0 0 1px var(--dsw-alias-border-l1, rgba(0,0,0,0.06))",
			fontSize: 12,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)",
			textAlign: "left",
			whiteSpace: "normal",
			cursor: "default"
		};
		const panelHeadingStyle = {
			margin: 0,
			display: "flex",
			alignItems: "baseline",
			justifyContent: "space-between",
			gap: 6,
			fontSize: 12,
			color: "var(--dsw-alias-label-primary)",
			fontWeight: 500
		};
		const panelBigStyle = {
			fontSize: 20,
			lineHeight: "26px",
			fontWeight: 600,
			fontVariantNumeric: "tabular-nums",
			color: "var(--dsw-alias-label-primary)"
		};
		const modelRowStyle = {
			display: "flex",
			justifyContent: "space-between",
			gap: 12,
			marginTop: 2,
			color: "var(--dsw-alias-label-secondary)"
		};
		const rowStyle = {
			marginTop: 8,
			display: "flex",
			flexDirection: "column",
			gap: 8,
			maxHeight: 180,
			overflowY: "auto"
		};
		const rowHeadStyle = {
			display: "flex",
			justifyContent: "space-between",
			gap: 12
		};
		const trackStyle = {
			height: 4,
			borderRadius: 999,
			background: "var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08))",
			overflow: "hidden"
		};
		const emptyNoteStyle = {
			margin: "8px 0 0",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const errorStyle = {
			...emptyNoteStyle,
			color: "var(--dsw-alias-state-error-primary, #d92d20)"
		};
		const footerStyle = {
			margin: "10px 0 0",
			display: "flex",
			justifyContent: "flex-end"
		};
		const linkStyle = {
			all: "unset",
			cursor: "pointer",
			color: "var(--dsw-alias-brand-primary, #1677ff)",
			fontSize: 12
		};
		/** Compact per-package progress row. */
		function PackageRow({ account, t }) {
			const percent = account.size > 0 ? Math.max(0, Math.min(100, account.remain / account.size * 100)) : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowHeadStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: account.packageName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: { fontVariantNumeric: "tabular-nums" },
					children: t("creditPackageRemain", {
						remain: new Intl.NumberFormat(void 0).format(account.remain),
						...account.size > 0 ? { size: new Intl.NumberFormat(void 0).format(account.size) } : {}
					})
				})]
			}), percent === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					...trackStyle,
					marginTop: 4
				},
				role: "progressbar",
				"aria-label": account.packageName,
				"aria-valuemin": 0,
				"aria-valuemax": 100,
				"aria-valuenow": percent,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
					width: `${percent}%`,
					height: "100%",
					background: "var(--dsw-alias-brand-primary, #1677ff)"
				} })
			})] });
		}
		/**
		* The composer dock entry: reads the session's `modelSelection` projection and
		* hands the current provider verdict to the always-mounted {@link CreditDockBody}.
		*
		* There is deliberately no provider gate here — unmounting the body would drop
		* the composer's row whenever the user picked a non-CodeBuddy model. The body
		* instead switches its own behaviour on `codeBuddy`: outside this plugin's
		* provider it starts no status request, keeps no interval and closes the panel,
		* while still rendering the provider/model row.
		*/
		function CodeBuddyCreditDock({ useProjection, useSession, t }) {
			if (t === void 0) throw new Error("CodeBuddy credit dock requires its translation function");
			const selection = useProjection("modelSelection");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditDockBody, {
				selection,
				codeBuddy: isCodeBuddySelection(selection),
				useSession,
				t
			});
		}
		/**
		* The dock's stateful half: always mounted, so the composer keeps exactly one
		* row no matter which provider the session is on.
		*/
		function CreditDockBody({ selection, codeBuddy, useSession, t }) {
			const running = useSession((snapshot) => snapshot.running);
			const [load, setLoad] = (0, react.useState)({ phase: "idle" });
			const [open, setOpen] = (0, react.useState)(false);
			const mounted = (0, react.useRef)(true);
			const rootRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			const refresh = async () => {
				try {
					const response = await fetch(CODEBUDDY_STATUS_PATH, {
						headers: { accept: "application/json" },
						credentials: "same-origin"
					});
					const value = await response.json().catch(() => void 0);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					if (mounted.current) setLoad({
						phase: "ok",
						value
					});
				} catch (error) {
					if (mounted.current) setLoad({
						phase: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				}
			};
			(0, react.useEffect)(() => {
				if (!codeBuddy) {
					setLoad({ phase: "idle" });
					setOpen(false);
					return;
				}
				setLoad({ phase: "loading" });
				refresh();
				const timer = window.setInterval(() => {
					refresh();
				}, REFRESH_INTERVAL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [codeBuddy]);
			const wasRunning = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (codeBuddy && wasRunning.current && !running) {
					const timer = window.setTimeout(() => {
						refresh();
					}, 2e3);
					wasRunning.current = running;
					return () => {
						window.clearTimeout(timer);
					};
				}
				wasRunning.current = running;
			}, [running, codeBuddy]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
					setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			const line = buildDockLine(selection, load);
			const lineText = renderDockSegments(line.segments, t);
			const status = load.phase === "ok" && load.value.status === "signed-in" ? load.value : void 0;
			const credits = line.credits;
			if (!(credits !== null)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				style: rootStyle,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: lineText })
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				style: rootStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: triggerStyle,
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					"aria-label": t("creditPanelAria"),
					onClick: () => {
						setOpen(!open);
					},
					children: lineText
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: panelStyle,
					role: "dialog",
					"aria-label": t("creditPanelAria"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: panelHeadingStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("creditsHeading") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: panelBigStyle,
								children: formatCreditTotal(credits.total)
							})]
						}),
						line.rate === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: modelRowStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: line.rate.name ?? t("creditModelFallback") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { fontVariantNumeric: "tabular-nums" },
								children: t("creditRate", { rate: line.rate.rate })
							})]
						}),
						credits.rows.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: rowStyle,
							children: status?.credits?.accounts.filter((account) => account.remain > 0).map((account, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PackageRow, {
								account,
								t
							}, `${account.packageName}-${String(index)}`))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: emptyNoteStyle,
							children: t("creditEmpty")
						}),
						status?.creditsError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle,
							children: t("creditsError", { message: status.creditsError })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: footerStyle,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: linkStyle,
								onClick: () => {
									refresh();
								},
								children: t("refresh")
							})
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Plugin-card copy registered under the settings.codebuddy-cli locale namespace. */
		const en = {
			title: "DSH CodeBuddy CLI Connect",
			intro: "Use the models included in the CodeBuddy CLI directly in DSH — zero configuration, ready out of the box.",
			expand: "Expand",
			collapse: "Collapse",
			loading: "Loading account…",
			signedOut: "Not signed in",
			signedInAs: "Signed in as {nickname}",
			accessTokenExpires: "Access token expires {time} (refresh is automatic)",
			creditsHeading: "Remaining credit",
			percentRemaining: "{percent}% remaining",
			exactRemaining: "{remain} / {size} remaining",
			creditPackageUnknownSize: "{remain} remaining",
			creditsError: "Credit unavailable: {message}",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			requestFailed: "Request failed",
			modelsHeading: "Model offers",
			freeModel: "Free",
			badgeLimitedFree: "Limited-time free",
			badgeNightDiscount: "Night discount",
			rate: "{rate} credits per message",
			creditTotalCompact: "Credits {total}",
			creditRate: "· {rate}",
			creditLoading: "Credits …",
			creditSignedOut: "Credits — not signed in",
			creditUnavailable: "Credits unavailable",
			dockProvider: "Provider {provider}",
			dockModel: "Model {model}",
			dockNoModel: "No model selected",
			creditPanelAria: "CodeBuddy credit details",
			creditPackageRemain: "{remain} / {size}",
			creditModelFallback: "Current model",
			creditEmpty: "No remaining credit.",
			creditsFilterAccount: "Filter remaining credit by account",
			optionalModelsHint: "Check the models to offer in the model pickers. Unchecked models stay usable in sessions already set to them.",
			optionalModelsAllHint: "Every model is offered. Uncheck the ones you do not want in the picker.",
			optionalModelsSelectAll: "Select all",
			optionalModelsClear: "Clear",
			optionalModelsSave: "Save",
			optionalModelsSaving: "Saving…",
			optionalModelsSaved: "Saved",
			optionalModelsReadOnly: "This profile stores no settings, so the selection cannot be saved.",
			optionalModelsEmptyWarning: "No model checked — saving this keeps every model offered.",
			optionalModelsSaveFailed: "Could not save the selection: {message}",
			checkingIn: "Checking in…",
			checkInSuccess: "Checked in",
			checkInAlready: "Already checked in today",
			checkInFailed: "Check-in failed: {message}",
			accountPanelHeading: "Accounts",
			accountPanelHint: "Switch or remove CodeBuddy accounts added through OAuth login.",
			accountLoginStarting: "Starting…",
			accountLoginPolling: "Waiting for sign-in…",
			accountLoginOpen: "Open login page",
			accountLoginTimeout: "Login timed out, please try again",
			accountLoginFailed: "Login failed: {message}",
			accountConfirmDelete: "Remove this account? This cannot be undone.",
			tabAccounts: "Accounts",
			tabModels: "Available models",
			tabCreditStats: "Credit statistics",
			tabRemaining: "Remaining credit",
			accountCardAdd: "OAuth sign in to add account",
			accountCardNoAccounts: "No accounts yet. Sign in with the QR code above to add your first CodeBuddy account.",
			accountCardSetActive: "Set as current",
			accountCardActive: "Current",
			accountCardMore: "More account actions",
			accountCardCheckIn: "Check in",
			accountCardDelete: "Delete account",
			accountCardTokenExpired: "Token expired",
			accountCardCheckedIn: "Checked in",
			accountCardNotCheckedIn: "Not checked in",
			accountCardUpdatedAt: "{time} updated",
			accountCardExpiringSoon: "Expiring soon",
			accountCardViewAll: "View all credit packages",
			accountCardNoCredit: "No available credit",
			accountCardAllPackages: "All credit packages",
			accountCardPackagesOf: "{name} · {count} packages",
			accountCardExpired: "Expired",
			accountCardExpiresIn7d: "Expires within 7 days",
			accountCardExpiresAt: "Expires {date}",
			accountCardLongLived: "Long-lived",
			accountCardUsed: "Used {used}",
			accountCardCreditWaiting: "Waiting for credit…",
			accountCardCreditError: "Credit unavailable",
			accountCardPackageCount: "{count} packages",
			statsHeading: "Credit statistics",
			statsRefresh: "Refresh statistics",
			statsRefreshing: "Refreshing…",
			statsLoading: "Collecting account credits and loading statistics…",
			statsNone: "No statistics yet. Click refresh to try again.",
			statsLoadFailed: "Failed to load statistics",
			statsRetry: "Retry",
			statsNoAccounts: "No current account yet. Sign in or add an account in the Accounts tab first.",
			statsOfficialUnavailable: "Official usage unavailable",
			statsOfficialPartial: "Some accounts not synced",
			statsOfficialPartialDetail: "{ok} of {total} current accounts synced; failed accounts show \"—\".",
			statsRemaining: "Remaining credit",
			statsTodayUsage: "Today usage",
			stats7dUsage: "7-day usage",
			statsMonthUsage: "Month usage",
			statsTrendTitle: "Official credit usage",
			statsTrendRange30d: "30 days",
			statsTrendRangeToday: "Today",
			statsTrendRange7d: "7 days",
			statsTrendRangeMonth: "This month",
			statsTrendAllAccounts: "All accounts",
			statsTrendTotal: "Total {usage} credits for this range",
			statsTrendNoData: "No usage data for this range.",
			statsTrendTooltipTotal: "Total {usage} credits",
			statsTrendTooltipNone: "No usage on this day.",
			statsTrendTooltipTitle: "{date} usage",
			statsTrendTotalLabel: "Total usage",
			statsModelUnknown: "Unknown model",
			statsModelLine: "{credit} credits · {count} requests",
			statsResourceExpires: "Expires {date}",
			accountCardUnnamed: "Unnamed account",
			statsFilterTrend: "Filter trend by account",
			statsFilterModel: "Filter models by account",
			statsFilterDetail: "Filter details by account",
			statsTrendFromOfficial: "From CodeBuddy official request usage · {start} to {end}",
			statsTrendAccountUnavailable: "Official usage for this account is unavailable.",
			statsDataUpdatedAt: "Updated {time}",
			statsModelEmpty: "No model usage details available for this range.",
			statsModelHeading: "By model",
			statsModelCount: "{count} models",
			statsModelTotal: "{requests} requests · {credit} credits total",
			statsModelMore: "Showing the {limit} most-used models; the rest are still counted in the totals above.",
			statsDetailHeading: "Credit details",
			statsDetailCredits: "Credit details",
			statsDetailRequests: "Request usage",
			statsDetailRecentCollected: "Recently collected {time}",
			statsDetailNoPackages: "No resource packages for this account.",
			statsDetailNoStats: "No account statistics.",
			statsDetailNoOfficial: "No official request usage for this account.",
			statsUsageRequestTime: "Request time",
			statsUsageAccount: "Account",
			statsUsageConsumed: "Consumed",
			statsUsageModel: "Model",
			statsUsageClient: "Client",
			statsUsageRequestId: "Request ID"
		};
		const zh = {
			title: "DSH CodeBuddy CLI Connect",
			intro: "在 DSH 中直接使用 CodeBuddy CLI 包含的模型，开箱即用，无需额外配置。",
			expand: "展开",
			collapse: "收起",
			loading: "正在读取账号…",
			signedOut: "未登录",
			signedInAs: "已登录：{nickname}",
			accessTokenExpires: "访问令牌 {time} 过期（自动续期）",
			creditsHeading: "剩余积分",
			percentRemaining: "剩余 {percent}%",
			exactRemaining: "剩余 {remain} / {size}",
			creditPackageUnknownSize: "剩余 {remain}",
			creditsError: "积分查询失败：{message}",
			refresh: "刷新",
			refreshing: "正在刷新…",
			requestFailed: "请求失败",
			modelsHeading: "模型优惠",
			freeModel: "免费",
			badgeLimitedFree: "限时免费",
			badgeNightDiscount: "夜间折扣",
			rate: "{rate} 积分/次",
			creditTotalCompact: "积分 {total}",
			creditRate: "· {rate}",
			creditLoading: "积分 …",
			creditSignedOut: "积分 — 未登录",
			creditUnavailable: "积分不可用",
			dockProvider: "Provider {provider}",
			dockModel: "Model {model}",
			dockNoModel: "未选择模型",
			creditPanelAria: "CodeBuddy 积分明细",
			creditPackageRemain: "{remain} / {size}",
			creditModelFallback: "当前模型",
			creditEmpty: "暂无剩余积分。",
			creditsFilterAccount: "按账号筛选剩余积分",
			optionalModelsHint: "勾选要在模型选择器里出现的模型。未勾选的模型不会消失，已经选定它的会话仍可继续使用。",
			optionalModelsAllHint: "当前提供全部模型。取消勾选即可把不需要的模型从选择器里收起来。",
			optionalModelsSelectAll: "全选",
			optionalModelsClear: "清空",
			optionalModelsSave: "保存",
			optionalModelsSaving: "正在保存…",
			optionalModelsSaved: "已保存",
			optionalModelsReadOnly: "当前 profile 不存储配置，无法保存该选择。",
			optionalModelsEmptyWarning: "未勾选任何模型——这样保存等同于提供全部模型。",
			optionalModelsSaveFailed: "保存失败：{message}",
			checkingIn: "签到中…",
			checkInSuccess: "签到成功",
			checkInAlready: "今天已签到",
			checkInFailed: "签到失败：{message}",
			accountPanelHeading: "账号管理",
			accountPanelHint: "切换或删除通过 OAuth 登录添加的 CodeBuddy 账号。",
			accountLoginStarting: "正在启动…",
			accountLoginPolling: "等待登录…",
			accountLoginOpen: "打开登录页",
			accountLoginTimeout: "登录超时，请重试",
			accountLoginFailed: "登录失败：{message}",
			accountConfirmDelete: "确定删除此账号？此操作不可撤销。",
			tabAccounts: "账号管理",
			tabModels: "可选模型",
			tabCreditStats: "积分统计",
			tabRemaining: "剩余积分",
			accountCardAdd: "扫码登录添加账号",
			accountCardNoAccounts: "暂无账号。点击上方扫码登录，添加你的第一个 CodeBuddy 账号。",
			accountCardSetActive: "设为当前",
			accountCardActive: "当前",
			accountCardMore: "更多账号操作",
			accountCardCheckIn: "手动签到",
			accountCardDelete: "删除账号",
			accountCardTokenExpired: "Token 已过期",
			accountCardCheckedIn: "已签到",
			accountCardNotCheckedIn: "未签到",
			accountCardUpdatedAt: "{time} 更新",
			accountCardExpiringSoon: "即将到期",
			accountCardViewAll: "查看全部积分包",
			accountCardNoCredit: "暂无可用积分",
			accountCardAllPackages: "全部积分包",
			accountCardPackagesOf: "{name} · 共 {count} 个积分包",
			accountCardExpired: "已到期",
			accountCardExpiresIn7d: "7 天内到期",
			accountCardExpiresAt: "{date} 到期",
			accountCardLongLived: "长期有效",
			accountCardUsed: "已用 {used}",
			accountCardCreditWaiting: "等待积分数据…",
			accountCardCreditError: "积分查询失败",
			accountCardPackageCount: "{count} 个积分包",
			statsHeading: "积分统计",
			statsRefresh: "刷新统计",
			statsRefreshing: "正在刷新…",
			statsLoading: "正在采集账号积分并加载统计…",
			statsNone: "暂无统计数据，请点击刷新重试。",
			statsLoadFailed: "统计加载失败",
			statsRetry: "重试",
			statsNoAccounts: "暂无当前账号。请先在「账号管理」扫码登录或添加账号。",
			statsOfficialUnavailable: "官方用量暂不可用",
			statsOfficialPartial: "部分账号官方用量未同步",
			statsOfficialPartialDetail: "已同步 {ok}/{total} 个当前账号；失败账号的官方数值显示为\"—\"。",
			statsRemaining: "剩余积分",
			statsTodayUsage: "今日消耗",
			stats7dUsage: "近 7 天消耗",
			statsMonthUsage: "本月消耗",
			statsTrendTitle: "官方积分消耗",
			statsTrendRange30d: "近 30 天",
			statsTrendRangeToday: "今天",
			statsTrendRange7d: "近 7 天",
			statsTrendRangeMonth: "本月",
			statsTrendAllAccounts: "所有账号",
			statsTrendTotal: "当前口径合计 {usage} 积分",
			statsTrendNoData: "当前范围暂无积分消耗",
			statsTrendTooltipTotal: "合计 {usage} 积分",
			statsTrendTooltipNone: "当天暂无消耗",
			statsTrendTooltipTitle: "{date} 消耗",
			statsTrendTotalLabel: "总消耗",
			statsModelUnknown: "未知模型",
			statsModelLine: "{credit} 积分 · {count} 次",
			statsResourceExpires: "{date} 到期",
			accountCardUnnamed: "未命名账号",
			statsFilterTrend: "按账号筛选趋势",
			statsFilterModel: "按账号筛选模型分类",
			statsFilterDetail: "按账号筛选积分明细",
			statsTrendFromOfficial: "来自 CodeBuddy 官方请求用量 · {start} 至 {end}",
			statsTrendAccountUnavailable: "该账号官方用量暂不可用。",
			statsDataUpdatedAt: "数据更新于 {time}",
			statsModelEmpty: "当前范围暂无可展示的模型消耗明细。",
			statsModelHeading: "按模型分类",
			statsModelCount: "{count} 个模型",
			statsModelTotal: "共 {requests} 次请求 · 合计 {credit} 积分",
			statsModelMore: "已展示消耗最高的 {limit} 个模型，其余模型仍计入上方合计。",
			statsDetailHeading: "积分明细",
			statsDetailCredits: "积分明细",
			statsDetailRequests: "请求用量",
			statsDetailRecentCollected: "最近采集 {time}",
			statsDetailNoPackages: "该账号暂无资源包。",
			statsDetailNoStats: "暂无账号统计。",
			statsDetailNoOfficial: "该账号暂无官方请求用量。",
			statsUsageRequestTime: "请求时间",
			statsUsageAccount: "账号",
			statsUsageConsumed: "消耗",
			statsUsageModel: "模型",
			statsUsageClient: "客户端",
			statsUsageRequestId: "请求 ID"
		};
		//#endregion
		//#region src/client/index.tsx
		/** Stable browser-plugin name. */
		const name = "dsh-codebuddy-cli-client";
		/**
		* Client services required by the Plugin configuration contribution.
		*
		* DSH 0.1.2 removed `@deepseek-ai/dsh-client-runtime` (the package that used to
		* hold the browser `ClientContext` alias and the `slots` service). The services
		* this card relies on now come from narrower packages: the `slots` registry
		* moved to `@deepseek-ai/dsh-client-ui-renderer`, `locale` stayed in
		* `@deepseek-ai/dsh-client-locale`, and the `settings.plugin.item` slot is
		* declared by `@deepseek-ai/dsh-client-ui-settings-plugins`. All three are
		* named in the package's `dsh.client.inject` list, so cordis has activated
		* them before this plugin's fiber starts.
		*/
		const inject = ["slots", "locale"];
		/**
		* Register card copy and the CodeBuddy card under Plugin configuration.
		*
		* The entire body is wrapped so that a DSH slot-API breaking change (for
		* example the rc.6→rc.7 `id`→`key` / `order`→`priority` rename) degrades
		* to a `console.error` instead of throwing into the DSH loader and raising
		* the red "Failed to load plugins" banner. The host provider keeps working:
		* the `codebuddy` model channel is unaffected, and `dsh-codebuddy-cli
		* status` reports host health via the heartbeat file.
		*
		* NOTE: the try/catch boundary of this function is mirrored (duplicated) in
		* `tests/client-fallback.spec.ts`, because the real client entry imports
		* browser-only DSH packages that cannot load in the Node test environment.
		* That test therefore does not import this function — it replicates its
		* shape. If you change the guarded body or the `console.error` message here,
		* update the mirrored `apply()` in that spec too, or the fallback test will
		* silently diverge from this real implementation.
		*/
		function apply(ctx) {
			try {
				const namespace = "settings.codebuddy-cli";
				ctx.effect(() => ctx.locale.register(namespace, {
					zh,
					en
				}), "dsh-codebuddy-cli: settings copy");
				const t = ctx.locale.bind(namespace);
				ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
					name: "settings.plugin.item",
					key: "codebuddy-cli",
					priority: 30,
					inject: () => ({ t })
				}, CodeBuddyPluginCard));
				const creditT = t;
				ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
					name: "conversation.composer.dock",
					id: "codebuddy-credits",
					order: 20,
					locale: namespace,
					inject: () => ({ t: creditT })
				}, CodeBuddyCreditDock));
			} catch (error) {
				console.error("[dsh-codebuddy-cli] client card failed to load (host provider unaffected):", error);
			}
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
