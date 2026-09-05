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
		* The provider id this plugin registers in the Harness LLM seam.
		*
		* Shared with the browser half so the composer dock can match the session's
		* `modelSelection` projection against this provider before reading a rate;
		* the host-side spelling lives in `adapter.ts` (`CODEBUDDY_PROVIDER`) and a
		* test asserts the two stay in sync.
		*/
		const CODEBUDDY_PROVIDER_ID = "codebuddy-cli";
		//#endregion
		//#region \0dsh-css:D:\Company\dsh-plugin\dsh-codebuddy-cli\src\client\CodeBuddyPluginCard.module.css.mjs
		const css = ".RLBsyG_card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}.RLBsyG_card:hover{border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.RLBsyG_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.RLBsyG_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.RLBsyG_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.RLBsyG_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.RLBsyG_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.RLBsyG_chevronOpen{transform:rotate(180deg)}.RLBsyG_body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.RLBsyG_bodyBlock{margin:12px 0 0}.RLBsyG_bodyHeading{color:var(--dsw-alias-label-primary);margin:0 0 8px;font-size:13px;font-weight:600;line-height:1.5}.RLBsyG_bodyRow{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;display:flex}.RLBsyG_bodyText{color:var(--dsw-alias-label-secondary);margin:8px 0 0;font-size:13px;line-height:1.5}.RLBsyG_bodyError{color:var(--dsw-alias-label-error);margin:8px 0 0;font-size:13px;line-height:1.5}.RLBsyG_statusDot{box-sizing:border-box;corner-shape:round;border-radius:50%;flex:none;width:8px;height:8px;display:inline-block}.RLBsyG_statusDotSignedIn{background:var(--dsw-alias-state-success-primary)}.RLBsyG_statusDotError{background:var(--dsw-alias-label-error)}.RLBsyG_statusDotSignedOut{background:var(--dsw-alias-label-dimmed)}.RLBsyG_statusLine{min-width:0;color:var(--dsw-alias-label-primary);align-items:center;gap:6px;font-size:14px;font-weight:500;line-height:22px;display:inline-flex}.RLBsyG_refresh{appearance:none;border:1px solid var(--dsw-alias-border-l2);font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.RLBsyG_refresh:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.RLBsyG_refresh:disabled{opacity:.4;cursor:default}.RLBsyG_refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.RLBsyG_quotaList{flex-direction:column;gap:12px;margin:12px 0 0;display:flex}.RLBsyG_quotaLabel{color:var(--dsw-alias-label-secondary);justify-content:space-between;gap:12px;font-size:13px;line-height:20px;display:flex}.RLBsyG_progressTrack{corner-shape:round;background:var(--dsw-alias-bg-layer-2);border-radius:999px;height:6px;overflow:hidden}.RLBsyG_progressFill{border-radius:inherit;background:var(--dsw-alias-brand-primary);height:100%}.RLBsyG_section{border-top:.5px solid var(--dsw-alias-border-l2);margin:12px 0 0;padding-top:12px}.RLBsyG_sectionToggle{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;align-items:center;gap:6px;min-width:0;margin-left:-2px;padding:2px 6px 2px 2px;display:inline-flex}.RLBsyG_sectionToggle:hover .RLBsyG_sectionHeading{color:var(--dsw-alias-brand-primary)}.RLBsyG_sectionToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.RLBsyG_sectionHeading{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.5;transition:color .16s}.RLBsyG_sectionChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s;transform:rotate(-90deg)}.RLBsyG_sectionChevronOpen{transform:rotate(0)}.RLBsyG_choiceList{flex-direction:column;gap:2px;margin:8px 0 0;display:flex}.RLBsyG_choiceRow{cursor:pointer;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:center;gap:8px;margin:0 -6px;padding:5px 6px;font-size:13px;line-height:20px;display:flex}.RLBsyG_choiceRow:hover{background:var(--dsw-alias-bg-layer-3)}.RLBsyG_choiceRowDisabled{cursor:default;opacity:.5}.RLBsyG_choiceRowDisabled:hover{background:0 0}.RLBsyG_choiceBox{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);flex:none;margin:0}.RLBsyG_choiceName{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.RLBsyG_choiceMeta{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;flex:none;align-items:center;gap:6px;display:inline-flex}.RLBsyG_choiceActions{flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0 0;display:flex}.RLBsyG_choiceSave{appearance:none;font:inherit;cursor:pointer;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-onbrand,#fff);border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.RLBsyG_choiceSave:hover:not(:disabled){filter:brightness(1.08)}.RLBsyG_choiceSave:disabled{opacity:.4;cursor:default}.RLBsyG_choiceSave:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.RLBsyG_badge{corner-shape:round;white-space:nowrap;background:var(--dsw-alias-state-success-subtle,#22a06b1f);color:var(--dsw-alias-state-success-primary,#22a06b);border-radius:999px;align-items:center;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px;display:inline-flex}";
		const tagId = "dsh-codebuddy-cli/CodeBuddyPluginCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-codebuddy-cli";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CodeBuddyPluginCard_module_css_default = {
			"badge": "RLBsyG_badge",
			"body": "RLBsyG_body",
			"bodyBlock": "RLBsyG_bodyBlock",
			"bodyError": "RLBsyG_bodyError",
			"bodyHeading": "RLBsyG_bodyHeading",
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
			"section": "RLBsyG_section",
			"sectionChevron": "RLBsyG_sectionChevron",
			"sectionChevronOpen": "RLBsyG_sectionChevronOpen",
			"sectionHeading": "RLBsyG_sectionHeading",
			"sectionToggle": "RLBsyG_sectionToggle",
			"statusDot": "RLBsyG_statusDot",
			"statusDotError": "RLBsyG_statusDotError",
			"statusDotSignedIn": "RLBsyG_statusDotSignedIn",
			"statusDotSignedOut": "RLBsyG_statusDotSignedOut",
			"statusLine": "RLBsyG_statusLine"
		};
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
		/**
		* Card chrome comes from `CodeBuddyPluginCard.module.css`, which mirrors the
		* host's own `PluginCard.module.css` rule for rule — same tokens, same
		* radius, same paddings, same stroked chevron — so the card reads as part of
		* the Plugin configuration list. This file holds only state and structure.
		*/
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
		function formatTime(ms) {
			return new Intl.DateTimeFormat(void 0, {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(new Date(ms));
		}
		function progressFillStyle(percent) {
			return { width: `${Math.max(0, Math.min(100, percent))}%` };
		}
		/**
		* One collapsible body section: a summary line that always shows, and detail
		* that folds away.
		*
		* The card body carries three lists whose length is set by the account, not by
		* the design — 12 credit packages and 15 catalog models on this machine — so an
		* always-expanded body scrolled past everything else in Plugin configuration.
		* The summary stays outside the fold on purpose: the credit total is the one
		* figure worth reading at a glance, and hiding it behind a chevron would trade
		* one problem for a worse one.
		*
		* The disclosure is a real button with `aria-expanded`, and the detail is simply
		* absent while collapsed rather than hidden with CSS, so assistive tech and tab
		* order agree with what is on screen.
		*/
		function Section({ heading, summary, defaultOpen = false, expandLabel, collapseLabel, children }) {
			const [open, setOpen] = (0, react.useState)(defaultOpen);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodeBuddyPluginCard_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodeBuddyPluginCard_module_css_default.bodyRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: CodeBuddyPluginCard_module_css_default.sectionToggle,
						"aria-expanded": open,
						"aria-label": `${open ? collapseLabel : expandLabel}: ${heading}`,
						onClick: () => {
							setOpen(!open);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? cx(CodeBuddyPluginCard_module_css_default.sectionChevron, CodeBuddyPluginCard_module_css_default.sectionChevronOpen) : cx(CodeBuddyPluginCard_module_css_default.sectionChevron) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodeBuddyPluginCard_module_css_default.sectionHeading,
							children: heading
						})]
					}), summary === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CodeBuddyPluginCard_module_css_default.bodyText,
						children: summary
					})]
				}), open ? children : null]
			});
		}
		function statusDotClass(status) {
			if (status === "signed-in") return cx(CodeBuddyPluginCard_module_css_default.statusDotSignedIn);
			if (status === "error") return cx(CodeBuddyPluginCard_module_css_default.statusDotError);
			return cx(CodeBuddyPluginCard_module_css_default.statusDotSignedOut);
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
		*
		* The rate sits under the name rather than beside it because the row already
		* spends its horizontal budget on badges; stacking keeps long model names and
		* several badges from squeezing the rate into an ellipsis.
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								style: quotaTitleStyle,
								children: t("accountHeading")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CodeBuddyPluginCard_module_css_default.bodyRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: CodeBuddyPluginCard_module_css_default.statusLine,
									role: "status",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										className: cx(CodeBuddyPluginCard_module_css_default.statusDot, statusDotClass(status.status))
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: CodeBuddyPluginCard_module_css_default.refresh,
									disabled: busy,
									onClick: () => {
										manualRefresh();
									},
									children: busy ? t("refreshing") : t("refresh")
								})]
							}),
							status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								status.expiresAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: CodeBuddyPluginCard_module_css_default.bodyText,
									children: t("accessTokenExpires", { time: formatTime(status.expiresAt) })
								}),
								status.selection === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
									heading: t("optionalModelsHeading"),
									summary: t("optionalModelsCount", {
										enabled: String(status.selection.choices.filter((choice) => choice.enabled).length),
										total: String(status.selection.choices.length)
									}),
									expandLabel: t("expand"),
									collapseLabel: t("collapse"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelSelection, {
										selection: status.selection,
										onSaved: () => {
											refresh();
										},
										t
									})
								}),
								status.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
									heading: t("creditsHeading"),
									summary: t("creditsTotal", { total: formatNumber(status.credits.total) }),
									expandLabel: t("expand"),
									collapseLabel: t("collapse"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: CodeBuddyPluginCard_module_css_default.quotaList,
										children: status.credits.accounts.filter((account) => account.remain > 0).map((account, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditBar, {
											label: account.packageName,
											remain: account.remain,
											size: account.size,
											t
										}, `${account.packageName}-${String(index)}`))
									})
								}),
								status.creditsError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: CodeBuddyPluginCard_module_css_default.bodyError,
									children: t("creditsError", { message: status.creditsError })
								}),
								status.models === void 0 || status.models.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
									heading: t("modelsHeading"),
									summary: t("modelsOnPromo", { count: String(status.models.length) }),
									expandLabel: t("expand"),
									collapseLabel: t("collapse"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: CodeBuddyPluginCard_module_css_default.quotaList,
										children: status.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelOfferRow, {
											model,
											t
										}, model.id))
									})
								})
							] }) : null,
							status.status === "signed-out" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: CodeBuddyPluginCard_module_css_default.bodyText,
								children: t("signedOutHint")
							}) : null,
							status.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: CodeBuddyPluginCard_module_css_default.bodyError,
								children: status.message
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
		* Both the dock's provider gate and {@link currentCodeBuddyRate} read through
		* this one helper so the two cannot drift apart on which selection counts.
		*/
		function currentModelSelection(selection) {
			return selection?.next ?? selection?.lastUsed ?? null;
		}
		/**
		* Whether the session's current selection belongs to this plugin's provider.
		*
		* The whole dock is gated on this: the line advertises CodeBuddy spending, so
		* a WorkBuddy / DeepSeek session has nothing to show and must not even ask the
		* status route for credit. False while the projection is missing or carries no
		* selection at all.
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
		/**
		* The composer dock entry: a pure provider gate around {@link CreditDockBody}.
		*
		* The gate holds no state and starts no work — it only reads the session's
		* `modelSelection` projection. The body (which fetches, polls and binds
		* document listeners) is mounted only for a CodeBuddy selection, so switching
		* the session to another provider unmounts it and its effects clean up: no
		* further status requests, no interval, no leftover panel.
		*/
		function CodeBuddyCreditDock({ useProjection, useSession, t }) {
			if (t === void 0) throw new Error("CodeBuddy credit dock requires its translation function");
			const selection = useProjection("modelSelection");
			if (!isCodeBuddySelection(selection)) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreditDockBody, {
				selection,
				useSession,
				t
			});
		}
		/** The dock's stateful half, mounted only while a CodeBuddy model is selected. */
		function CreditDockBody({ selection, useSession, t }) {
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
			modelsOnPromo: "{count} on promo",
			freeModel: "Free",
			badgeLimitedFree: "Limited-time free",
			badgeNightDiscount: "Night discount",
			rate: "{rate} credits per message",
			creditTotalCompact: "Credits {total}",
			creditRate: "· {rate}",
			creditPanelAria: "CodeBuddy credit details",
			creditPackageRemain: "{remain} / {size}",
			creditModelFallback: "Current model",
			creditEmpty: "No remaining credit.",
			optionalModelsHeading: "Available models",
			optionalModelsHint: "Check the models to offer in the model pickers. Unchecked models stay usable in sessions already set to them.",
			optionalModelsAllHint: "Every model is offered. Uncheck the ones you do not want in the picker.",
			optionalModelsCount: "{enabled} of {total} offered",
			optionalModelsSelectAll: "Select all",
			optionalModelsClear: "Clear",
			optionalModelsSave: "Save",
			optionalModelsSaving: "Saving…",
			optionalModelsSaved: "Saved",
			optionalModelsReadOnly: "This profile stores no settings, so the selection cannot be saved.",
			optionalModelsEmptyWarning: "No model checked — saving this keeps every model offered.",
			optionalModelsSaveFailed: "Could not save the selection: {message}"
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
			modelsOnPromo: "{count} 个在优惠",
			freeModel: "免费",
			badgeLimitedFree: "限时免费",
			badgeNightDiscount: "夜间折扣",
			rate: "{rate} 积分/次",
			creditTotalCompact: "积分 {total}",
			creditRate: "· {rate}",
			creditPanelAria: "CodeBuddy 积分明细",
			creditPackageRemain: "{remain} / {size}",
			creditModelFallback: "当前模型",
			creditEmpty: "暂无剩余积分。",
			optionalModelsHeading: "可选模型",
			optionalModelsHint: "勾选要在模型选择器里出现的模型。未勾选的模型不会消失，已经选定它的会话仍可继续使用。",
			optionalModelsAllHint: "当前提供全部模型。取消勾选即可把不需要的模型从选择器里收起来。",
			optionalModelsCount: "已启用 {enabled} / {total}",
			optionalModelsSelectAll: "全选",
			optionalModelsClear: "清空",
			optionalModelsSave: "保存",
			optionalModelsSaving: "正在保存…",
			optionalModelsSaved: "已保存",
			optionalModelsReadOnly: "当前 profile 不存储配置，无法保存该选择。",
			optionalModelsEmptyWarning: "未勾选任何模型——这样保存等同于提供全部模型。",
			optionalModelsSaveFailed: "保存失败：{message}"
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
