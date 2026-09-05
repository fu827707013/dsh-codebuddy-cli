window.__ModuleLoader__.load({
	id: "dsh-codebuddy-cli",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/status-paths.ts
		/** Node-free constants and types shared by the Host and browser halves. */
		/** Plugin-owned status endpoint consumed by its browser half. */
		const CODEBUDDY_STATUS_PATH = "/plugins/dsh-codebuddy-cli/status";
		//#endregion
		//#region src/client/CodeBuddyPluginCard.tsx
		/** CodeBuddy status card contributed to Harness Plugin configuration. */
		const POLL_INTERVAL_MS = 6e4;
		const cardStyle = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)"
		};
		const headerStyle = {
			boxSizing: "border-box",
			width: "100%",
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 16,
			border: 0,
			padding: "13px 14px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			textAlign: "left",
			cursor: "pointer"
		};
		const headTextStyle = {
			display: "flex",
			minWidth: 0,
			flexDirection: "column",
			gap: 3
		};
		const nameStyle = {
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600
		};
		const descriptionStyle = {
			fontSize: 13,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const chevronStyle = {
			flex: "0 0 auto",
			fontSize: 18,
			lineHeight: 1,
			transition: "transform 120ms ease"
		};
		const cardBodyStyle = {
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			padding: "16px 14px 18px"
		};
		const bodyStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "22px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const rowStyle$1 = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12
		};
		const statusStyle = {
			display: "flex",
			alignItems: "center",
			gap: 9,
			fontSize: 15,
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const buttonStyle = {
			boxSizing: "border-box",
			minHeight: 34,
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 14,
			cursor: "pointer"
		};
		const errorStyle$1 = {
			...bodyStyle,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const quotaListStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 18,
			paddingTop: 2
		};
		const quotaGroupStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const quotaTitleStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const quotaLabelStyle = {
			display: "flex",
			justifyContent: "space-between",
			gap: 12,
			fontSize: 13,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const modelBadgeStyle = {
			display: "flex",
			alignItems: "center",
			gap: 6,
			flexWrap: "wrap"
		};
		const modelOfferStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 2
		};
		const modelRateStyle = {
			fontSize: 12,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const modelBadgeChipStyle = {
			padding: "1px 8px",
			borderRadius: 999,
			fontSize: 11,
			lineHeight: "18px",
			background: "var(--dsw-alias-state-success-subtle, rgba(34, 160, 107, 0.12))",
			color: "var(--dsw-alias-state-success-primary, #22a06b)"
		};
		/** Localize an upstream promotional badge label, with an unknown-badge fallback. */
		function modelBadgeLabel(badge, t) {
			if (badge === "限时免费") return t("badgeLimitedFree");
			if (badge === "夜间折扣") return t("badgeNightDiscount");
			return badge;
		}
		const progressTrackStyle = {
			height: 8,
			overflow: "hidden",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08))"
		};
		function progressFillStyle(percent) {
			return {
				width: `${Math.max(0, Math.min(100, percent))}%`,
				height: "100%",
				borderRadius: "inherit",
				background: "var(--dsw-alias-brand-primary, #1677ff)"
			};
		}
		function dotStyle(status) {
			return {
				width: 9,
				height: 9,
				borderRadius: "50%",
				flex: "0 0 auto",
				background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" ? "var(--dsw-alias-state-error-primary, #d92d20)" : "var(--dsw-alias-label-dimmed, #9aa0a6)"
			};
		}
		function formatNumber(value) {
			return new Intl.NumberFormat(void 0).format(value);
		}
		function formatTime(ms) {
			return new Intl.DateTimeFormat(void 0, {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(new Date(ms));
		}
		/** One billing package as a labeled progress bar. */
		function CreditBar({ label, remain, size, t }) {
			const detail = size > 0 ? t("exactRemaining", {
				remain: formatNumber(remain),
				size: formatNumber(size)
			}) : t("creditPackageUnknownSize", { remain: formatNumber(remain) });
			const percent = size > 0 ? remain / size * 100 : 100;
			const display = new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(percent);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: quotaGroupStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: quotaLabelStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("percentRemaining", { percent: display }) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: progressTrackStyle,
						role: "progressbar",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": percent,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: progressFillStyle(percent) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: detail
					})
				]
			});
		}
		/**
		* One model offer row: name, promotional badges, and the billing rate.
		*
		* The rate sits under the name rather than beside it because the row already
		* spends its horizontal budget on badges; stacking keeps long model names and
		* several badges from squeezing the rate into an ellipsis.
		*/
		function ModelOfferRow({ model, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: modelOfferStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: quotaLabelStyle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: modelBadgeStyle,
						children: [model.badges?.map((badge) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: modelBadgeChipStyle,
							children: modelBadgeLabel(badge, t)
						}, badge)), model.free === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: modelBadgeChipStyle,
							children: t("freeModel")
						}) : null]
					})]
				}), model.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: modelRateStyle,
					children: t("rate", { rate: model.credits })
				})]
			});
		}
		/** Render CodeBuddy sign-in state and credit as one expandable card. */
		function CodeBuddyPluginCard({ t }) {
			if (t === void 0) throw new Error("CodeBuddy plugin card requires its translation function");
			const [open, setOpen] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)({ status: "signed-out" });
			const [busy, setBusy] = (0, react.useState)(false);
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
			const label = status.status === "signed-in" ? status.nickname === void 0 ? t("signedInAs", { nickname: "" }).replace(/[:：]\s*$/, "") : t("signedInAs", { nickname: status.nickname }) : status.status === "error" ? t("requestFailed") : t("signedOut");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: headerStyle,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: headTextStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: nameStyle,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: descriptionStyle,
							children: t("intro")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						style: {
							...chevronStyle,
							transform: open ? "rotate(180deg)" : "none"
						},
						children: "⌄"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: cardBodyStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							style: quotaTitleStyle,
							children: t("accountHeading")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: rowStyle$1,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: statusStyle,
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									style: dotStyle(status.status)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => {
									manualRefresh();
								},
								children: busy ? t("refreshing") : t("refresh")
							})]
						}),
						status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							status.expiresAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: bodyStyle,
								children: t("accessTokenExpires", { time: formatTime(status.expiresAt) })
							}),
							status.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: quotaListStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: rowStyle$1,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										style: quotaTitleStyle,
										children: t("creditsHeading")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: bodyStyle,
										children: t("creditsTotal", { total: formatNumber(status.credits.total) })
									})]
								}), status.credits.accounts.filter((account) => account.remain > 0).map((account, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditBar, {
									label: account.packageName,
									remain: account.remain,
									size: account.size,
									t
								}, `${account.packageName}-${String(index)}`))]
							}),
							status.creditsError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: errorStyle$1,
								children: t("creditsError", { message: status.creditsError })
							}),
							status.models === void 0 || status.models.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: quotaListStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: quotaTitleStyle,
									children: t("modelsHeading")
								}), status.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelOfferRow, {
									model,
									t
								}, model.id))]
							})
						] }) : null,
						status.status === "signed-out" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle,
							children: t("signedOutHint")
						}) : null,
						status.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle$1,
							children: status.message
						}) : null
					]
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
		* Resolve the currently selected CodeBuddy model's billing rate and name.
		*
		* The dock renders nothing for a foreign provider: the line advertises
		* CodeBuddy spending, and a WorkBuddy / DeepSeek session has no CodeBuddy
		* credits to show. `next` wins over `lastUsed` — it is the selection the next
		* request will use, which is the one the user just picked. An absent
		* projection (no model chosen yet in this session) resolves to null.
		*/
		function currentCodeBuddyRate(selection, catalog) {
			const current = selection?.next ?? selection?.lastUsed ?? null;
			if (current === null || current.provider !== "codebuddy-cli") return null;
			const rate = catalog?.rates[current.model];
			if (rate === void 0) return null;
			return {
				rate,
				name: catalog?.names[current.model]
			};
		}
		//#endregion
		//#region src/client/CodeBuddyCreditDock.tsx
		/**
		* The composer credit line: one compact row mounted on
		* `conversation.composer.dock` — the same slot the host's session-stats strip
		* occupies, so the credit figure sits directly under the input box beside the
		* token statistics, styled to read as one family (tertiary 13px text,
		* tabular numbers, same variable palette).
		*
		* The trigger line shows the total remaining credit; clicking opens a small
		* menu-surface panel (same surface vocabulary as the composer's
		* context-occupancy panel) with per-package progress rows, the selected
		* model's billing rate, and a manual refresh.
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
		/** The composer dock entry: compact credit line + click-open details panel. */
		function CodeBuddyCreditDock({ useProjection, useSession, t }) {
			if (t === void 0) throw new Error("CodeBuddy credit dock requires its translation function");
			const selection = useProjection("modelSelection");
			const running = useSession((snapshot) => snapshot.running);
			const [load, setLoad] = (0, react.useState)({ phase: "loading" });
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
				refresh();
				const timer = window.setInterval(() => {
					refresh();
				}, REFRESH_INTERVAL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, []);
			const wasRunning = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (wasRunning.current && !running) {
					const timer = window.setTimeout(() => {
						refresh();
					}, 2e3);
					wasRunning.current = running;
					return () => {
						window.clearTimeout(timer);
					};
				}
				wasRunning.current = running;
			}, [running]);
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
			if (load.phase !== "ok" || load.value.status !== "signed-in") return null;
			const status = load.value;
			const line = buildCreditLine(status.credits);
			if (line === null) return null;
			const rate = currentCodeBuddyRate(selection, status.catalog);
			const headline = t("creditTotalCompact", { total: new Intl.NumberFormat(void 0).format(line.total) });
			const triggerText = rate === null ? headline : `${headline} ${t("creditRate", { rate: rate.rate })}`;
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
					children: triggerText
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: panelStyle,
					role: "dialog",
					"aria-label": t("creditPanelAria"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: panelHeadingStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("creditsHeading") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: panelBigStyle,
								children: new Intl.NumberFormat(void 0).format(line.total)
							})]
						}),
						rate === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: modelRowStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: rate.name ?? t("creditModelFallback") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { fontVariantNumeric: "tabular-nums" },
								children: t("creditRate", { rate: rate.rate })
							})]
						}),
						line.rows.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: rowStyle,
							children: status.credits?.accounts.filter((account) => account.remain > 0).map((account, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PackageRow, {
								account,
								t
							}, `${account.packageName}-${String(index)}`))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: emptyNoteStyle,
							children: t("creditEmpty")
						}),
						status.creditsError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
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
			signedOutHint: "Run the CodeBuddy CLI once and sign in; this plugin follows that sign-in automatically.",
			signedInAs: "Signed in as {nickname}",
			accessTokenExpires: "Access token expires {time} (refresh is automatic)",
			creditsHeading: "Remaining credit",
			creditsTotal: "Total: {total}",
			percentRemaining: "{percent}% remaining",
			exactRemaining: "{remain} / {size} remaining",
			creditPackageUnknownSize: "{remain} remaining",
			creditsError: "Credit unavailable: {message}",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			requestFailed: "Request failed",
			accountHeading: "Account",
			modelsHeading: "Model offers",
			freeModel: "Free",
			badgeLimitedFree: "Limited-time free",
			badgeNightDiscount: "Night discount",
			rate: "{rate} credits per message",
			creditTotalCompact: "Credits {total}",
			creditRate: "· {rate}",
			creditPanelAria: "CodeBuddy credit details",
			creditPackageRemain: "{remain} / {size}",
			creditModelFallback: "Current model",
			creditEmpty: "No remaining credit."
		};
		const zh = {
			title: "DSH CodeBuddy CLI Connect",
			intro: "在 DSH 中直接使用 CodeBuddy CLI 包含的模型，开箱即用，无需额外配置。",
			expand: "展开",
			collapse: "收起",
			loading: "正在读取账号…",
			signedOut: "未登录",
			signedOutHint: "在 CodeBuddy CLI 里登录一次即可，插件会自动跟随当前登录的账号。",
			signedInAs: "已登录：{nickname}",
			accessTokenExpires: "访问令牌 {time} 过期（自动续期）",
			creditsHeading: "剩余积分",
			creditsTotal: "合计：{total}",
			percentRemaining: "剩余 {percent}%",
			exactRemaining: "剩余 {remain} / {size}",
			creditPackageUnknownSize: "剩余 {remain}",
			creditsError: "积分查询失败：{message}",
			refresh: "刷新",
			refreshing: "正在刷新…",
			requestFailed: "请求失败",
			accountHeading: "账号",
			modelsHeading: "模型优惠",
			freeModel: "免费",
			badgeLimitedFree: "限时免费",
			badgeNightDiscount: "夜间折扣",
			rate: "{rate} 积分/次",
			creditTotalCompact: "积分 {total}",
			creditRate: "· {rate}",
			creditPanelAria: "CodeBuddy 积分明细",
			creditPackageRemain: "{remain} / {size}",
			creditModelFallback: "当前模型",
			creditEmpty: "暂无剩余积分。"
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
