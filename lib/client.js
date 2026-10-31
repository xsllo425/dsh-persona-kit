window.__ModuleLoader__.load({
	id: "dsh-persona-kit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var h = react.createElement;

		/**
		 * dsh-persona-kit client half.
		 *  1. A small pill in the composer shows the persona intensity (1-5); clicking it opens a slider whose knob is
		 *     the active role's own picture. Dragging snaps to a stop and saves it for this session.
		 *  2. When a turn ends (the host adds a "turn-tail" row) it asks the server whether a sticker is due and, if so,
		 *     appends it under the assistant's last reply. Which sticker, and whether, is decided on the server; this
		 *     side only draws. Nothing is written into the conversation; "message row -> image" is remembered per
		 *     session in localStorage so reopening a session shows the same stickers.
		 */
		var API = "/persona-kit";
		// UI language: the server says which ("zh" or "en") in every answer; Chinese is the source text.
		var LANG = "zh";
		var EN = { "表情": "sticker", "✦ 解锁成就": "✦ Achievement unlocked", "读取中…": "Loading…", "读取失败": "Could not load", "成就　{a} / {b}": "Achievements  {a} / {b}", "关闭": "Close", "全部": "All", "通用": "General", "专属": "Role", "只看通用成就": "General achievements only", "{n} 的成就": "{n}'s achievements", "角色专属": "Role-specific", "解锁于 {d}": "Unlocked {d}", "裁剪失败": "Crop failed", "读不出这张图": "Cannot read this picture", "头像设置": "Avatar settings", "更换…": "Change…", "上传中…": "Uploading…", "上传失败": "Upload failed", "移除": "Remove", "恢复默认": "Reset to default", "她（{n}）": "Her ({n})", "她的头像": "Her picture", "显示她的头像": "Show her picture", "显示她的名字": "Show her name", "头像位置": "Picture position", "内容上方": "Above the text", "内容左侧": "Beside the text", "名字下方的小字": "Small line under the name", "关系": "Relationship", "数值（友情、默契等）": "Number (friendship, teamwork, …)", "两者": "Both", "不显示": "Hidden", "我": "Me", "我的头像": "My picture", "显示我的头像": "Show my picture", "我的名字": "My name", "显示在左下角账号处": "Shown on the account button (bottom left)", "用我的名字和头像替换左下角的账号信息": "Replace the account name and picture at the bottom left with mine", "大小 {n} 像素": "Size {n} px", "图片需小于 2 MB。png、jpg 会裁成正方形；gif、webp 原样使用。": "Pictures must be under 2 MB. png/jpg are cropped square; gif/webp are used as they are.", "好感": "Affinity", "说话强度 ": "Intensity ", "更正经": "More serious", "更玩梗": "More playful", "她怎么称呼你（可不填）": "What she calls you (optional)", "关系 ": "Relationship ", "可以转生了": "Ready for rebirth", " · 距「{next}」还差 {need} 点": " · {need} to “{next}”", " · 已是最高的称号": " · top title reached", "聊天热度（上下文）{n}%": "Chat heat (context) {n}%", " · 已转生 {n} 次": " · reborn {n}×", "上下文快满了，可以转生了：她会写好交接说明、开新会话，好感和称号都会带过去。": "The context is almost full — time for a rebirth: she writes a hand-over note and opens a new session; affinity and titles carry over.", "查看全部角色": "All roles", "{m}月{d}日": "{m}/{d}", "和她们的羁绊": "Your bonds", "{metric} {aff} · 聊过 {s} 个会话 {t} 轮 · 转生 {r} 次 · 最近 {day}": "{metric} {aff} · {s} sessions, {t} turns · rebirths {r} · last {day}", "另一段关系：{n}·{t}（{m} {a}）": "Another bond: {n} · {t} ({m} {a})", "命令服务不可用": "Command service unavailable", "切换失败": "Switch failed", "人设": "Role", "关": "Off", "常规": "Normal", "攻略": "Affinity", "输入建议": "Suggestions", "不预测。": "No predictions.", "猜你下一句想说什么，Tab 或 → 采纳。": "Guesses your next message; Tab or → takes it.", "给出能增进感情的一句话，Tab 或 → 采纳。": "Offers a line that would bring you closer; Tab or → takes it.", "每条回复结束后调用一次模型。": " One short model call after each reply.", "人设：{n}，说话强度：{l}（点开切换或调节）": "Role: {n}, intensity: {l} (click to switch or adjust)", "选择人设": "Choose a role", "成就…": "Achievements…", "头像设置…": "Avatar settings…" };
		function L(s, v) {
			var out = LANG === "en" && EN[s] !== undefined ? EN[s] : s;
			if (v) for (var k in v) out = out.split("{" + k + "}").join(String(v[k]));
			return out;
		}
		function paren(s) { return LANG === "en" ? " (" + s + ")" : "（" + s + "）"; }
		function setLang(l) { LANG = l === "en" ? "en" : "zh"; }
		var STYLE_ID = "dsh-persona-kit-style";
		var cur = { sid: "" };
		var info = null;          // last /session answer for cur.sid
		var infoAt = 0;
		var rolesAt = 0;
		var listeners = [];
		var timer = 0, observer = null, baselined = "";
		var last = { why: "", url: "" };

		function fetchJson(url, opts) { return fetch(url, Object.assign({ cache: "no-store" }, opts || {})).then(function (x) { return x.json(); }); }
		function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); try { applyAvatars(); } catch (e) {} }
		function loadInfo(force) {
			var sid = cur.sid;
			if (!sid) return Promise.resolve(null);
			if (!force && info && info.sid === sid && Date.now() - infoAt < 1500) return Promise.resolve(info);
			infoAt = Date.now();
			if (Date.now() - rolesAt > 8000) { rolesAt = Date.now(); fetchRoles().then(function () { try { applyAvatars(); } catch (e) {} }); }
			return fetchJson(API + "/session?session=" + encodeURIComponent(sid)).then(function (j) {
				if (cur.sid !== sid) return info;
				var before = info && info.sid === sid ? info.roleId : undefined;
				if (j && j.lang) setLang(j.lang);
				if (j && (j.ghostDefault === "off" || j.ghostDefault === "normal" || j.ghostDefault === "affinity")) ghostDefault = j.ghostDefault;
				info = j && j.ok ? Object.assign({ sid: sid }, j) : null;
				if (info && before !== undefined && before !== info.roleId) { loadTimeline(true); window.setTimeout(function () { loadTimeline(true); }, 2500); }
				if (info && info.achievementsFresh && info.achievementsFresh.length) showToast(info.achievementsFresh);
				notify();
				return info;
			}).catch(function () { return info; });
		}
		function saveLevel(level) {
			var sid = cur.sid;
			if (!sid) return Promise.resolve();
			if (info) { info.level = level; notify(); }
			return fetchJson(API + "/level", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: sid, level: level }) })
				.then(function () { infoAt = 0; return loadInfo(true); }).catch(function () {});
		}

		// ---- per-session sticker memory (which reply row shows which image) ----
		function stKey(sid) { return "dsh-persona-kit/state/" + sid; }
		// Keep the notes of the 40 most recently used sessions; the rest are dropped (they are only a convenience:
		// which reply showed which sticker, which role wrote which reply).
		var SESSIONS_KEPT = 40, INDEX_KEY = "dsh-persona-kit/index";
		function touchSession(sid) {
			try {
				var list = JSON.parse(window.localStorage.getItem(INDEX_KEY) || "[]");
				if (!Array.isArray(list)) list = [];
				list = list.filter(function (x) { return x !== sid; }); list.push(sid);
				while (list.length > SESSIONS_KEPT) {
					var old = list.shift();
					window.localStorage.removeItem("dsh-persona-kit/state/" + old);
					window.localStorage.removeItem("dsh-persona-kit/av/" + old);
				}
				window.localStorage.setItem(INDEX_KEY, JSON.stringify(list));
			} catch (e) {}
		}
		function loadState(sid) {
			var d = { seen: [], shown: {} };
			try { var v = JSON.parse(window.localStorage.getItem(stKey(sid)) || "null"); if (v && typeof v === "object") d = Object.assign(d, v); } catch (e) {}
			return d;
		}
		function saveState(sid, st) {
			try {
				if (st.seen.length > 300) st.seen = st.seen.slice(-300);
				var keys = Object.keys(st.shown);
				if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(function (k) { delete st.shown[k]; });
				window.localStorage.setItem(stKey(sid), JSON.stringify(st));
			} catch (e) {}
		}
		var state = null, stateSid = "";
		function getState() { if (stateSid !== cur.sid) { state = cur.sid ? loadState(cur.sid) : null; stateSid = cur.sid; } return state; }

		function makeEl(url) {
			var el = document.createElement("div");
			el.className = "dsh-pk-sticker";
			el.setAttribute("data-pk-sticker", "");
			var img = document.createElement("img");
			img.src = url; img.alt = L("表情"); img.draggable = false;
			el.appendChild(img);
			return el;
		}
		function rowByKey(nodeKey) {
			var rows = document.querySelectorAll('[data-chat-group-part="response"][data-chat-node-key]');
			for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute("data-chat-node-key") === nodeKey) return rows[i];
			return null;
		}
		function ensureShown() {
			var st = getState();
			if (!st) return;
			Object.keys(st.shown).forEach(function (k) {
				var row = rowByKey(k);
				if (row && !row.querySelector(":scope > [data-pk-sticker]")) row.appendChild(makeEl(st.shown[k]));
			});
		}
		function processTurn(turn) {
			var sid = cur.sid;
			var st = getState();
			if (!sid || !st) return;
			var rows = document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"][data-chat-turn="' + turn + '"]');
			if (rows.length === 0) return;
			var row = rows[rows.length - 1];
			var text = (row.innerText || "").trim();
			var nodeKey = row.getAttribute("data-chat-node-key");
			if (!nodeKey) return;
			fetchJson(API + "/pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: sid, text: text, plain: !!row.querySelector("pre,table") }) })
				.then(function (j) {
					last.why = j && j.why || "";
					if (!j || !j.url || cur.sid !== sid) return;
					var img = new Image();
					img.onload = function () {
						var s2 = getState();
						if (!s2 || cur.sid !== sid) return;
						s2.shown[nodeKey] = j.url;
						saveState(sid, s2); last.url = j.url;
						ensureShown();
					};
					img.src = j.url;
				}).catch(function () {});
		}
		// ---- achievements: a quiet toast when something unlocks, and a panel with everything ----
		var toastEl = null, toastTimer = 0, toastShown = {};
		function showToast(items) {
			var fresh = items.filter(function (a) { return !toastShown[a.key]; });
			if (!fresh.length) return;
			fresh.forEach(function (a) { toastShown[a.key] = true; });
			if (toastEl) { toastEl.remove(); toastEl = null; }
			window.clearTimeout(toastTimer);
			var el = document.createElement("div");
			el.className = "dsh-pk-toast";
			var head = document.createElement("div");
			head.className = "dsh-pk-toast-head";
			head.textContent = L("✦ 解锁成就");
			el.appendChild(head);
			fresh.slice(0, 3).forEach(function (a) {
				var row = document.createElement("div");
				row.className = "dsh-pk-toast-row";
				var t = document.createElement("b");
				t.textContent = a.name + (a.roleName ? paren(a.roleName) : "");
				var d = document.createElement("span");
				d.textContent = a.desc + (a.reward ? " · " + a.reward : "");
				row.appendChild(t); row.appendChild(d);
				el.appendChild(row);
			});
			el.addEventListener("click", function () { el.remove(); toastEl = null; openAchievements(); });
			document.body.appendChild(el);
			toastEl = el;
			postJson("/achievements/seen", { keys: fresh.map(function (a) { return a.key; }) }).catch(function () {});
			toastTimer = window.setTimeout(function () { if (toastEl === el) { el.remove(); toastEl = null; } }, 7000);
		}
		var achEl = null;
		function closeAchievements() { if (achEl) { achEl.remove(); achEl = null; } }
		function openAchievements(roleId) {
			closeAchievements();
			var el = document.createElement("div");
			el.className = "dsh-pk-ov";
			el.addEventListener("pointerdown", function (e) { if (e.target === el) closeAchievements(); });
			var card = document.createElement("div");
			card.className = "dsh-pk-ov-card dsh-pk-ach-card";
			card.textContent = L("读取中…");
			el.appendChild(card);
			document.body.appendChild(el);
			achEl = el;
			var role = roleId || (info && info.roleId) || "";
			var view = (function () { try { var v = window.localStorage.getItem("dsh-persona-kit/ach-view"); return v === "global" || v === "role" ? v : "all"; } catch (e) { return "all"; } })();
			function load(r) {
				fetchJson(API + "/achievements?role=" + encodeURIComponent(r)).then(function (j) {
					if (achEl !== el) return;
					card.textContent = "";
					function add(parent, tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; }
					var shown = j.list.filter(function (it) { return view === "all" || it.scope === view; });
					var got = shown.filter(function (it) { return it.unlocked; }).length;
					var head = add(card, "div", "dsh-pk-ov-head", L("成就　{a} / {b}", { a: got, b: shown.length }));
					var x = add(head, "button", "dsh-pk-link", L("关闭")); x.type = "button"; x.onclick = closeAchievements;
					var seg = add(card, "div", "dsh-pk-seg dsh-pk-ach-seg");
					[["all", L("全部")], ["global", L("通用")], ["role", L("专属")]].forEach(function (o) {
						var cnt = j.list.filter(function (it) { return o[0] === "all" || it.scope === o[0]; });
						var b = add(seg, "button", "", o[1] + " " + cnt.filter(function (it) { return it.unlocked; }).length + "/" + cnt.length);
						b.type = "button"; b.setAttribute("aria-pressed", view === o[0] ? "true" : "false");
						b.onclick = function () { view = o[0]; try { window.localStorage.setItem("dsh-persona-kit/ach-view", view); } catch (e) {} load(sel.value); };
					});
					var sel = document.createElement("select");
					sel.className = "dsh-pk-select";
					var none = document.createElement("option"); none.value = ""; none.textContent = L("只看通用成就"); sel.appendChild(none);
					(roles || []).forEach(function (rl) { var o = document.createElement("option"); o.value = rl.id; o.textContent = L("{n} 的成就", { n: rl.name }); if (rl.id === r) o.selected = true; sel.appendChild(o); });
					sel.onchange = function () { load(sel.value); };
					if (view !== "global") card.appendChild(sel);
					[["global", L("通用")], ["role", L("角色专属")]].forEach(function (g) {
						if (view !== "all" && view !== g[0]) return;
						var items = j.list.filter(function (it) { return it.scope === g[0]; });
						if (!items.length) return;
						add(card, "div", "dsh-pk-ach-group", g[1]);
						items.sort(function (a, b) { return (b.unlocked ? 1 : 0) - (a.unlocked ? 1 : 0); }).forEach(function (it) {
							var row = add(card, "div", "dsh-pk-ach-row"); if (it.unlocked) row.setAttribute("data-on", "");
							add(row, "span", "dsh-pk-ach-mark", it.unlocked ? "✦" : "·");
							var box = add(row, "div", "");
							add(box, "div", "dsh-pk-ov-name", it.name);
							add(box, "div", "dsh-pk-meta", it.desc + (it.reward ? " · " + it.reward : ""));
							if (!it.unlocked) { var bar = add(box, "div", "dsh-pk-bar"); var f = document.createElement("i"); f.style.width = Math.round(it.value / it.gte * 100) + "%"; bar.appendChild(f); add(box, "div", "dsh-pk-meta", it.value + " / " + it.gte); }
							else if (it.at) add(box, "div", "dsh-pk-meta", L("解锁于 {d}", { d: fmtDay(it.at) }));
						});
					});
				}).catch(function () { card.textContent = L("读取失败"); });
			}
			load(role);
		}

		// ---- avatar settings panel: opened by clicking an avatar, or from the menu ----
		var avV = 0; // bumped after an upload/reset so the new picture is fetched
		function avatarUrl(role) { return API + "/asset?role=" + encodeURIComponent(role) + "&kind=avatar&v=" + avV; }
		var avatarEl = null;
		function closeAvatarPanel() { if (avatarEl) { avatarEl.remove(); avatarEl = null; } }
		function postJson(path, body) { return fetchJson(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(function () { return { ok: false }; }); }
		function squarePng(file) {
			// png/jpeg are cropped to a centred 256px square; gif/webp go up as they are (so animation survives)
			if (!/^image\/(png|jpeg)$/.test(file.type)) return Promise.resolve(file);
			return new Promise(function (resolve, reject) {
				var url = URL.createObjectURL(file), img = new Image();
				img.onload = function () {
					var s = Math.min(img.width, img.height), c = document.createElement("canvas");
					c.width = c.height = 256;
					c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
					URL.revokeObjectURL(url);
					c.toBlob(function (b) { b ? resolve(b) : reject(new Error(L("裁剪失败"))); }, "image/png");
				};
				img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(L("读不出这张图"))); };
				img.src = url;
			});
		}
		function uploadAvatar(target, file) {
			return squarePng(file).then(function (blob) {
				return fetch(API + "/avatar-upload?target=" + encodeURIComponent(target), { method: "POST", body: blob }).then(function (x) { return x.json(); });
			});
		}
		function openAvatarPanel(roleId) {
			closeAvatarPanel();
			var el = document.createElement("div");
			el.className = "dsh-pk-ov";
			el.addEventListener("pointerdown", function (e) { if (e.target === el) closeAvatarPanel(); });
			var card = document.createElement("div");
			card.className = "dsh-pk-ov-card dsh-pk-av-card";
			el.appendChild(card);
			document.body.appendChild(el);
			avatarEl = el;
			var role = roleId || (info && info.roleId) || "";
			var roleName = ((roles || []).filter(function (r) { return r.id === role; })[0] || {}).name || role;
			function render(s) {
				card.textContent = "";
				function add(parent, tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; }
				var head = add(card, "div", "dsh-pk-ov-head", L("头像设置"));
				var x = add(head, "button", "dsh-pk-link", L("关闭")); x.type = "button"; x.onclick = closeAvatarPanel;
				var msg = add(card, "div", "dsh-pk-meta dsh-pk-err", "");
				function refresh() {
					avV += 1; infoAt = 0;
					return Promise.all([loadInfo(true), fetchRoles(), loadIdentity()]).then(function () {
						applyAvatars();
						return fetchJson(API + "/avatar-settings").then(function (j) { if (j && j.ok && avatarEl === el) render(j.settings); });
					});
				}
				function check(parent, label, key) {
					var l = add(parent, "label", "dsh-pk-check"), c = document.createElement("input");
					c.type = "checkbox"; c.checked = !!s[key];
					c.onchange = function () { var p = {}; p[key] = c.checked; postJson("/avatar-settings", p).then(function () { return refresh(); }); };
					l.appendChild(c); l.appendChild(document.createTextNode(" " + label));
				}
				function choice(parent, label, key, options) {
					var row = add(parent, "div", "dsh-pk-choice");
					add(row, "span", "", label);
					var sel = document.createElement("select");
					sel.className = "dsh-pk-select dsh-pk-select-sm";
					options.forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if (s[key] === o[0]) op.selected = true; sel.appendChild(op); });
					sel.onchange = function () { var p = {}; p[key] = sel.value; postJson("/avatar-settings", p).then(function () { return refresh(); }); };
					row.appendChild(sel);
				}
				function picker(parent, target, title, previewUrl) {
					var row = add(parent, "div", "dsh-pk-av-row");
					var pv = add(row, previewUrl ? "img" : "i", "dsh-pk-av-prev");
					if (previewUrl) { pv.src = previewUrl; pv.draggable = false; }
					var box = add(row, "div", ""); add(box, "div", "dsh-pk-ov-name", title);
					var btns = add(box, "div", "dsh-pk-av-btns");
					var up = add(btns, "button", "dsh-pk-btn", L("更换…")); up.type = "button";
					var file = document.createElement("input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp,image/gif"; file.style.display = "none";
					up.onclick = function () { file.click(); };
					file.onchange = function () {
						var f = file.files && file.files[0]; if (!f) return;
						msg.textContent = L("上传中…");
						uploadAvatar(target, f).then(function (r) { if (!r.ok) throw new Error(r.error || L("上传失败")); msg.textContent = ""; return refresh(); }).catch(function (e) { msg.textContent = String((e && e.message) || e); });
					};
					btns.appendChild(file);
					var rs = add(btns, "button", "dsh-pk-btn", target === "user" ? L("移除") : L("恢复默认")); rs.type = "button";
					rs.onclick = function () { postJson("/avatar-reset", { target: target }).then(function () { return refresh(); }); };
				}
				if (role) {
					var sec = add(card, "div", "dsh-pk-av-sec");
					add(sec, "div", "dsh-pk-title", L("她（{n}）", { n: roleName }));
					picker(sec, "role:" + role, L("她的头像"), avatarUrl(role));
					check(sec, L("显示她的头像"), "ai");
					check(sec, L("显示她的名字"), "name");
					choice(sec, L("头像位置"), "layout", [["top", L("内容上方")], ["side", L("内容左侧")]]);
					choice(sec, L("名字下方的小字"), "meta", [["relation", L("关系")], ["affinity", L("数值（友情、默契等）")], ["both", L("两者")], ["none", L("不显示")]]);
				}
				var sec2 = add(card, "div", "dsh-pk-av-sec");
				add(sec2, "div", "dsh-pk-title", L("我"));
				picker(sec2, "user", L("我的头像"), info && info.userAvatar ? info.userAvatar + "?v=" + avV : "");
				check(sec2, L("显示我的头像"), "user");
				var nameRow = add(sec2, "div", "dsh-pk-choice");
				add(nameRow, "span", "", L("我的名字"));
				var nameIn = document.createElement("input");
				nameIn.type = "text"; nameIn.maxLength = 40; nameIn.value = s.accountName || ""; nameIn.placeholder = L("显示在左下角账号处"); nameIn.className = "dsh-pk-nick";
				nameIn.style.width = "170px";
				var saveName = function () { if (nameIn.value !== (s.accountName || "")) postJson("/avatar-settings", { accountName: nameIn.value }).then(function () { return refresh(); }); };
				nameIn.onblur = saveName; nameIn.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); nameIn.blur(); } };
				nameRow.appendChild(nameIn);
				check(sec2, L("用我的名字和头像替换左下角的账号信息"), "account");
				var sec3 = add(card, "div", "dsh-pk-av-sec");
				var sizeTitle = add(sec3, "div", "dsh-pk-title", L("大小 {n} 像素", { n: s.size }));
				var rg = document.createElement("input"); rg.type = "range"; rg.min = "20"; rg.max = "64"; rg.value = String(s.size); rg.className = "dsh-pk-range";
				rg.oninput = function () { document.documentElement.style.setProperty("--pk-av-size", rg.value + "px"); sizeTitle.textContent = L("大小 {n} 像素", { n: rg.value }); };
				rg.onchange = function () { postJson("/avatar-settings", { size: Number(rg.value) }).then(function () { return refresh(); }); };
				sec3.appendChild(rg);
				add(card, "div", "dsh-pk-meta", L("图片需小于 2 MB。png、jpg 会裁成正方形；gif、webp 原样使用。"));
			}
			var known = info && info.avatarSettings;
			if (known) render(known); else card.textContent = L("读取中…");
			fetchJson(API + "/avatar-settings").then(function (j) { if (j && j.ok && avatarEl === el) render(j.settings); else if (!known) card.textContent = L("读取失败"); }).catch(function () { if (!known) card.textContent = L("读取失败"); });
		}
		// clicking the picture or the name opens the avatar panel
		function onAvatarClick(e) {
			if (e.button !== 0) return;
			var head = e.target && e.target.closest ? e.target.closest(".dsh-pk-head") : null;
			if (!head) return;
			e.preventDefault();
			openAvatarPanel(head.getAttribute("data-kind") === "ai" ? head.getAttribute("data-role") || "" : "");
		}

		// ---- avatars: the role's picture beside her replies, the user's picture beside theirs ----
		// Rows are `content-visibility:auto` (paint-contained), so the picture must sit inside the row's own box:
		// the row gets padding and the picture is a pseudo-element in that padding. One avatar per turn on her side.
		// One header per reply (or per message of mine): the picture, and beside it the name with the relation/affinity
		// line under it. It is a real element inside the row (rows are content-visibility:auto, so nothing may paint
		// outside the row box), added by us and tolerated by React the same way the sticker element is.
		function syncHead(row, want, d) {
			var head = null;
			for (var c = row.firstElementChild; c; c = c.nextElementSibling) if (c.classList && c.classList.contains("dsh-pk-head")) { head = c; break; }
			if (!want) { if (head) head.remove(); return; }
			if (!head) {
				head = document.createElement("div");
				head.className = "dsh-pk-head";
				var img = document.createElement("div");
				img.className = "dsh-pk-pic";
				var txt = document.createElement("div"); txt.className = "dsh-pk-txt";
				var nm = document.createElement("span"); nm.className = "dsh-pk-nm";
				var mt = document.createElement("span"); mt.className = "dsh-pk-mt";
				txt.appendChild(nm); txt.appendChild(mt);
				head.appendChild(img); head.appendChild(txt);
				row.insertBefore(head, row.firstChild);
			}
			if (head.getAttribute("data-kind") !== want) head.setAttribute("data-kind", want);
			if (head.getAttribute("data-role") !== (d.role || "")) head.setAttribute("data-role", d.role || "");
			var im = head.firstChild, nmEl = head.lastChild.firstChild, mtEl = head.lastChild.lastChild;
			if (im.getAttribute("data-pic") !== d.pic) { im.setAttribute("data-pic", d.pic); im.style.backgroundImage = 'url("' + d.pic + '")'; }
			if (nmEl.textContent !== (d.name || "")) nmEl.textContent = d.name || "";
			if (mtEl.textContent !== (d.meta || "")) mtEl.textContent = d.meta || "";
			head.lastChild.style.display = d.name || d.meta ? "" : "none";
		}
		function metaText(entry, kind) {
			if (!entry || !entry.bond || kind === "none") return "";
			var rel = entry.bond.trackName + "·" + entry.bond.title, aff = (entry.bond.metric || L("好感")) + " " + entry.bond.affinity;
			return kind === "affinity" ? aff : (kind === "both" ? rel + " · " + aff : rel);
		}
		// ---- the sidebar's account button: my name and my picture instead of the DeepSeek account's ----
		// The button is found by the host's own data-slot; inside it the picture is the first <img> or round box, and the
		// name is the widest text-only element. Both are only restyled (the real nodes stay, so the host keeps working):
		// the name text is hidden and drawn again from a data attribute, the picture is painted over.
		function accountButton() {
			var box = document.querySelector('[data-slot="settings.launcher"]');
			return box ? (box.querySelector("button") || box) : null;
		}
		function findAccountParts(btn) {
			var parts = { pic: null, name: null };
			var kids = btn.querySelectorAll("*");
			for (var i = 0; i < kids.length && !parts.pic; i++) {
				var e = kids[i], r = e.getBoundingClientRect();
				if (r.width < 14 || r.width > 80 || Math.abs(r.width - r.height) > 3) continue;
				var br = getComputedStyle(e).borderRadius;
				if (e.tagName === "IMG" || e.tagName === "SVG" || /50%|9999|\d{2,}px/.test(br)) parts.pic = e;
			}
			var best = 0;
			for (var j = 0; j < kids.length; j++) {
				var n = kids[j];
				if (n === parts.pic || (parts.pic && parts.pic.contains(n)) || n.children.length > 0) continue;
				var t = (n.getAttribute("data-pk-acct-name") !== null ? n.getAttribute("data-pk-acct-name") : n.textContent || "").trim();
				if (!t) continue;
				var w = n.getBoundingClientRect().width;
				if (w > best) { best = w; parts.name = n; }
			}
			return parts;
		}
		var identity = { account: false, name: "", avatar: "" }; // what the sidebar account button should show
		function loadIdentity() {
			return fetchJson(API + "/avatar-settings").then(function (j) {
				if (!j || !j.ok) return;
				if (j.lang) setLang(j.lang);
				identity = { account: !!j.settings.account, name: j.settings.accountName || "", avatar: j.userAvatar || "" };
				applyAccount();
			}).catch(function () {});
		}
		function applyAccount() {
			var set = identity;
			var btn = accountButton();
			if (!btn) return;
			var on = !!(set.account && (set.name || set.avatar));
			var parts = btn.__pkParts;
			// look again until both pieces are found (the button may not be laid out yet) or when the host re-draws it
			if (!parts || !parts.name || !parts.pic || !btn.contains(parts.name) || !btn.contains(parts.pic)) parts = btn.__pkParts = findAccountParts(btn);
			if (!on) {
				btn.querySelectorAll("[data-pk-acct-name],[data-pk-acct-pic]").forEach(function (e) { e.removeAttribute("data-pk-acct-name"); e.removeAttribute("data-pk-acct-pic"); e.style.removeProperty("--pk-acct-img"); e.style.removeProperty("--pk-acct-fs"); });
				return;
			}
			if (parts.name && set.name) {
				if (parts.name.getAttribute("data-pk-acct-name") !== set.name) {
					if (!parts.name.hasAttribute("data-pk-acct-name")) parts.name.style.setProperty("--pk-acct-fs", getComputedStyle(parts.name).fontSize);
					parts.name.setAttribute("data-pk-acct-name", set.name);
				}
			}
			if (parts.pic && set.avatar) {
				var url = 'url("' + set.avatar + "?v=" + avV + '")';
				if (parts.pic.style.getPropertyValue("--pk-acct-img") !== url) parts.pic.style.setProperty("--pk-acct-img", url);
				if (!parts.pic.hasAttribute("data-pk-acct-pic")) parts.pic.setAttribute("data-pk-acct-pic", "1");
			}
		}
		function applyAvatars() {
			try { applyAccount(); } catch (e) {}
			var root = document.documentElement;
			var inf = info && info.sid === cur.sid ? info : null;
			var set = (inf && inf.avatarSettings) || { ai: true, user: true, name: true, size: 30, layout: "top", meta: "relation" };
			var me = inf && inf.userAvatar && set.user ? inf.userAvatar + "?v=" + avV : "";
			root.style.setProperty("--pk-av-size", set.size + "px");
			if (root.getAttribute("data-pk-layout") !== set.layout) root.setAttribute("data-pk-layout", set.layout);
			var av = getAv();
			var pendingTimeline = false;
			if (timeline.sid !== cur.sid) loadTimeline(false);
			var curRole = inf && inf.roleId ? inf.roleId : "";
			var dirty = false;
			var rows = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]');
			var seenTurn = {};
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i], want = "", d = {};
				if (row.getAttribute("data-chat-flow-kind") === "user") { if (me) { want = "user"; d = { pic: me, name: "", meta: "" }; } }
				else {
					var turn = row.getAttribute("data-chat-turn") || ("n" + i);
					if (!seenTurn[turn]) {
						seenTurn[turn] = true;
						// Each reply keeps the role it was written by: the session's own log first, then what this browser
						// remembered, then (for a brand-new reply) the current role.
						var key = row.getAttribute("data-chat-node-key") || "";
						var known = key && av.map[key] !== undefined;
						var tIdx = parseInt(row.getAttribute("data-chat-turn"), 10) - 1;
						var fromLog = timeline.sid === cur.sid && tIdx >= 0 && tIdx < timeline.turns.length && timeline.turns[tIdx] !== null ? timeline.turns[tIdx] : undefined;
						var role = fromLog !== undefined ? fromLog : (known ? av.map[key] : curRole);
						if (!known && fromLog === undefined && tIdx >= 0 && timeline.sid === cur.sid && tIdx >= timeline.turns.length) pendingTimeline = true;
						if (key && (fromLog !== undefined || timeline.sid === cur.sid) && av.map[key] !== role) { av.map[key] = role; dirty = true; }
						var entry = role ? (roles || []).filter(function (r) { return r.id === role; })[0] : null;
						var hasPic = entry ? entry.avatar : (role && role === curRole && !!(inf && inf.avatar));
						if (role && set.ai && hasPic) {
							want = "ai";
							d = { pic: avatarUrl(role), role: role, name: set.name ? (entry ? entry.name : role) : "", meta: metaText(entry, set.meta) };
						}
					}
				}
				var have = row.getAttribute("data-pk-av") || "";
				if (want !== have) { if (want) row.setAttribute("data-pk-av", want); else row.removeAttribute("data-pk-av"); }
				syncHead(row, want, d);
			}
			if (dirty) saveAv(av);
			if (pendingTimeline) loadTimeline(false);
		}

		// role per reply row, remembered per session (localStorage)
		// role per user turn, rebuilt on the server from the session's own role-change notices (covers old replies)
		var timeline = { sid: "", turns: [], at: 0, busy: false };
		var tlSeq = 0;
		function loadTimeline(force) {
			var sid = cur.sid;
			if (!sid) return;
			if (timeline.busy && !force) return;
			if (timeline.sid === sid && !force && Date.now() - timeline.at < 4000) return;
			var mine = ++tlSeq;
			timeline.busy = true;
			fetchJson(API + "/timeline?session=" + encodeURIComponent(sid)).then(function (j) {
				if (mine !== tlSeq) return; // a newer request is on its way; this answer may already be stale
				if (cur.sid !== sid) { timeline.busy = false; return; }
				timeline = { sid: sid, turns: j && j.ok && Array.isArray(j.turns) ? j.turns : [], at: Date.now(), busy: false };
				applyAvatars();
			}).catch(function () { if (mine === tlSeq) timeline.busy = false; });
		}
		var avState = null, avSid = "";
		function getAv() {
			if (avSid !== cur.sid || !avState) {
				avSid = cur.sid;
				avState = { map: {} };
				try { var v = JSON.parse(window.localStorage.getItem("dsh-persona-kit/av/" + cur.sid) || "null"); if (v && v.map) avState = v; } catch (e) {}
			}
			return avState;
		}
		function saveAv(av) {
			try {
				var keys = Object.keys(av.map);
				if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(function (k) { delete av.map[k]; });
				window.localStorage.setItem("dsh-persona-kit/av/" + cur.sid, JSON.stringify(av));
			} catch (e) {}
		}

		var MEME_RAW = /\[表情[:：]/;
		function guardMemeRows() {
			if (!document.__dshMemeZoom) return; // no dsh-meme here: nothing will ever turn the text into a picture
			var rows = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]');
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				var decorated = !!row.querySelector("img[data-meme-img],[data-meme-hidden]");
				if (row.hasAttribute("data-pk-wait")) { if (decorated) row.removeAttribute("data-pk-wait"); continue; }
				if (decorated || row.hasAttribute("data-pk-waited")) continue;
				if (MEME_RAW.test(row.textContent || "")) {
					row.setAttribute("data-pk-wait", "1");
					row.setAttribute("data-pk-waited", "1");
					(function (r) { window.setTimeout(function () { r.removeAttribute("data-pk-wait"); }, 1600); })(row);
				}
			}
		}
		function scan() {
			timer = 0;
			if (document.visibilityState !== "visible") return;
			var st = getState();
			if (!st) return;
			var tails = document.querySelectorAll('[data-chat-flow-kind="turn-tail"]');
			var fresh = baselined !== cur.sid;
			for (var i = 0; i < tails.length; i++) {
				var key = (tails[i].getAttribute("data-chat-turn") || "") + ":" + (tails[i].getAttribute("data-chat-node-key") || "");
				if (st.seen.indexOf(key) !== -1) continue;
				st.seen.push(key);
				if (!fresh) { processTurn(tails[i].getAttribute("data-chat-turn")); loadTimeline(true); }
			}
			baselined = cur.sid;
			saveState(cur.sid, st);
			ensureShown();
			applyAvatars();
		}
		function schedule() { if (!timer) timer = window.setTimeout(scan, 400); }

		// ---- the slider ----
		var STOPS = 5;
		function Knob(props) {
			var inf = props.info;
			var style = { left: props.pos + "px" };
			if (inf.accent) style["--pk-accent"] = inf.accent;
			return h("div", { className: "dsh-pk-knob", style: style, "data-dragging": props.dragging ? "" : undefined },
				inf.image ? h("img", { src: inf.image, alt: inf.name || "", draggable: false }) : h("span", null, (inf.name || "?").slice(0, 1)));
		}
		function Slider(props) {
			var inf = props.info;
			var trackRef = react.useRef(null);
			var s1 = react.useState(null), dragPos = s1[0], setDragPos = s1[1];
			var W = 216;
			var stopX = function (i) { return (i - 1) * (W / (STOPS - 1)); };
			var level = inf.level;
			var pos = dragPos !== null ? dragPos : stopX(level);
			var nearest = function (x) { return Math.min(STOPS, Math.max(1, Math.round(x / (W / (STOPS - 1))) + 1)); };
			var localX = function (e) { var r = trackRef.current.getBoundingClientRect(); return Math.min(W, Math.max(0, e.clientX - r.left)); };
			var onDown = function (e) {
				e.preventDefault();
				var el = e.currentTarget, pid = e.pointerId;
				try { el.setPointerCapture(pid); } catch (x) {}
				setDragPos(localX(e));
				var move = function (ev) { setDragPos(localX(ev)); };
				var up = function (ev) {
					el.removeEventListener("pointermove", move);
					el.removeEventListener("pointerup", up);
					el.removeEventListener("pointercancel", up);
					try { el.releasePointerCapture(pid); } catch (x) {}
					var l = nearest(localX(ev));
					setDragPos(null);
					if (l !== level) props.onPick(l);
				};
				el.addEventListener("pointermove", move);
				el.addEventListener("pointerup", up);
				el.addEventListener("pointercancel", up);
			};
			var shown = dragPos !== null ? nearest(dragPos) : level;
			var lv = inf.levels[shown - 1];
			return h("div", { className: "dsh-pk-sec" },
				h("div", { className: "dsh-pk-title" }, L("说话强度 "), h("b", null, lv.name)),
				h("div", { className: "dsh-pk-ends" }, h("span", null, L("更正经")), h("span", null, L("更玩梗"))),
				h("div", { className: "dsh-pk-slide", onPointerDown: onDown },
					h("div", { className: "dsh-pk-track", ref: trackRef, style: { width: W + "px" } },
						h("div", { className: "dsh-pk-rail" }),
						[1, 2, 3, 4, 5].map(function (i) { return h("i", { key: i, className: "dsh-pk-stop", "data-on": i <= shown ? "" : undefined, style: { left: stopX(i) + "px" } }); }),
						h(Knob, { info: inf, pos: pos, dragging: dragPos !== null }))),
				h("div", { className: "dsh-pk-desc" }, lv.line));
		}
		// ---- bond: this role's closeness, and the overview of every role ----
		function Bar(props) { return h("div", { className: "dsh-pk-bar" }, h("i", { style: { width: Math.round(Math.max(0, Math.min(1, props.value)) * 100) + "%" } })); }
		var tracks = null;
		function fetchTracks() { return fetchJson(API + "/tracks").then(function (j) { if (j && j.ok) tracks = j.groups; return tracks; }).catch(function () { return tracks; }); }
		function postBond(patch) {
			var sid = cur.sid;
			if (!sid) return Promise.resolve();
			return fetchJson(API + "/bond", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ session: sid }, patch)) })
				.then(function () { infoAt = 0; return loadInfo(true); }).catch(function () {});
		}
		function TrackPicker(props) {
			var b = props.bond;
			var s1 = react.useState(b.nickname || ""), nick = s1[0], setNick = s1[1];
			react.useEffect(function () { setNick(b.nickname || ""); }, [b.nickname]);
			var commit = function () { if (nick !== (b.nickname || "")) postBond({ nickname: nick }); };
			return h("div", { className: "dsh-pk-track-pick" },
				h("select", { className: "dsh-pk-select", value: b.track, "aria-label": L("关系"), onChange: function (e) { postBond({ track: e.target.value }); } },
					(tracks || []).map(function (g) {
						return h("optgroup", { key: g.id, label: g.name }, g.tracks.map(function (t) { return h("option", { key: t.id, value: t.id }, t.name); }));
					})),
				h("input", { className: "dsh-pk-nick", type: "text", maxLength: 12, value: nick, placeholder: L("她怎么称呼你（可不填）"), list: "dsh-pk-nicks",
					onChange: function (e) { setNick(e.target.value); }, onBlur: commit, onKeyDown: function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); e.target.blur(); } } }),
				h("datalist", { id: "dsh-pk-nicks" }, (b.nicknames || []).map(function (n) { return h("option", { key: n, value: n }); })));
		}

		function BondSection(props) {
			var b = props.info.bond;
			if (!b) return null;
			var s1 = react.useState(function () { try { return window.localStorage.getItem("dsh-persona-kit/rel-open") === "1"; } catch (e) { return false; } }), open = s1[0], setOpen = s1[1];
			var toggle = function () { var n = !open; setOpen(n); try { window.localStorage.setItem("dsh-persona-kit/rel-open", n ? "1" : "0"); } catch (e) {} };
			return h("div", { className: "dsh-pk-sec" },
				h("div", { className: "dsh-pk-title dsh-pk-fold", onClick: toggle, role: "button", "aria-expanded": open ? "true" : "false" },
					h("span", { className: "dsh-pk-caret" }, open ? "▾" : "▸"), L("关系 "), h("b", null, b.trackName + "·" + b.title),
					b.rebirthDue ? h("em", { className: "dsh-pk-dot", title: L("可以转生了") }, "●") : null),
				open ? h("div", null,
					h(TrackPicker, { bond: b }),
					h("div", { className: "dsh-pk-meta" }, (b.metric || L("好感")) + " " + b.affinity + (b.next ? L(" · 距「{next}」还差 {need} 点", { next: b.next, need: b.need }) : L(" · 已是最高的称号"))),
					h(Bar, { value: b.progress }),
					h("div", { className: "dsh-pk-meta" }, L("聊天热度（上下文）{n}%", { n: b.heat }) + (b.rebirths ? L(" · 已转生 {n} 次", { n: b.rebirths }) : "")),
					h(Bar, { value: b.heat / 100 }),
					b.rebirthDue ? h("div", { className: "dsh-pk-note" }, L("上下文快满了，可以转生了：她会写好交接说明、开新会话，好感和称号都会带过去。")) : null,
					h("button", { type: "button", className: "dsh-pk-link dsh-pk-all", onClick: props.onOverview }, L("查看全部角色"))) : null);
		}
		var overviewEl = null;
		function closeOverview() { if (overviewEl) { overviewEl.remove(); overviewEl = null; } }
		function fmtDay(t) { if (!t) return "—"; var d = new Date(t); return L("{m}月{d}日", { m: d.getMonth() + 1, d: d.getDate() }); }
		function openOverview() {
			closeOverview();
			var el = document.createElement("div");
			el.className = "dsh-pk-ov";
			el.addEventListener("pointerdown", function (e) { if (e.target === el) closeOverview(); });
			var card = document.createElement("div");
			card.className = "dsh-pk-ov-card";
			card.textContent = L("读取中…");
			el.appendChild(card);
			document.body.appendChild(el);
			overviewEl = el;
			fetchJson(API + "/stats").then(function (j) {
				if (overviewEl !== el) return;
				card.textContent = "";
				var head = document.createElement("div");
				head.className = "dsh-pk-ov-head";
				head.textContent = L("和她们的羁绊");
				var x = document.createElement("button");
				x.type = "button"; x.className = "dsh-pk-link"; x.textContent = L("关闭"); x.onclick = closeOverview;
				head.appendChild(x);
				card.appendChild(head);
				(j && j.ok ? j.roles : []).forEach(function (r) {
					var row = document.createElement("div");
					row.className = "dsh-pk-ov-row";
					row.style.setProperty("--pk-accent", r.accent || "#d9a514");
					var img = document.createElement(r.image ? "img" : "i");
					if (r.image) { img.src = r.image; img.draggable = false; }
					var box = document.createElement("div");
					var name = document.createElement("div");
					name.className = "dsh-pk-ov-name";
					name.textContent = r.name + "　" + r.title;
					var sub = document.createElement("div");
					sub.className = "dsh-pk-meta";
					sub.textContent = L("{metric} {aff} · 聊过 {s} 个会话 {t} 轮 · 转生 {r} 次 · 最近 {day}", { metric: r.metric || L("好感"), aff: r.affinity, s: r.sessions, t: r.turns, r: r.rebirths, day: fmtDay(r.lastAt) });
					var bar = document.createElement("div");
					bar.className = "dsh-pk-bar";
					var fill = document.createElement("i");
					fill.style.width = Math.round(r.progress * 100) + "%";
					bar.appendChild(fill);
					box.appendChild(name); box.appendChild(sub); box.appendChild(bar);
					(r.others || []).forEach(function (o) {
						var line = document.createElement("div");
						line.className = "dsh-pk-meta";
						line.textContent = L("另一段关系：{n}·{t}（{m} {a}）", { n: o.name, t: o.title, m: o.metric, a: o.affinity });
						box.appendChild(line);
					});
					row.appendChild(img); row.appendChild(box);
					card.appendChild(row);
				});
			}).catch(function () { card.textContent = L("读取失败"); });
		}

		// ---- roles (the role list lives on the server: every role folder that has a card.json) ----
		var roles = null;
		var appCtx = null;
		function fetchRoles() {
			return fetchJson(API + "/roles").then(function (j) { if (j && j.ok) roles = j.roles; return roles; }).catch(function () { return roles; });
		}
		function commandsService() {
			try {
				var ns = appCtx && appCtx.remote && appCtx.remote.namespaces && appCtx.remote.namespaces.get("commands");
				return ns && ns.service && typeof ns.service.execute === "function" ? ns.service : null;
			} catch (error) { return null; }
		}
		/** Switch the session's role with the host's /role command (no model call, nothing is sent). */
		function switchRole(sid, id) {
			var svc = commandsService();
			if (svc === null) return Promise.reject(new Error(L("命令服务不可用")));
			return Promise.resolve(svc.execute(String(sid), "/role " + (id === null ? "none" : id), [])).then(function (res) {
				var r = res && res.result;
				if (r && r.kind === "error") throw new Error(String(r.text || L("切换失败")).split("\n")[0]);
			});
		}
		function RoleList(props) {
			return h("div", { className: "dsh-pk-sec dsh-pk-roles" },
				h("div", { className: "dsh-pk-title" }, L("人设")),
				(roles || []).map(function (r) {
					var on = r.id === props.current;
					return h("button", { key: r.id, type: "button", className: "dsh-pk-role", "data-on": on ? "" : undefined, disabled: props.busy, onClick: function () { props.onPick(on ? null : r.id); }, style: { "--pk-accent": r.accent || "#d9a514" } },
						r.image ? h("img", { src: r.image, alt: "", draggable: false }) : h("i", null),
						h("span", null, r.name),
						on ? h("em", null, "✓") : null);
				}));
		}
		// ---- ghost text: a grey one-line suggestion inside the input box (Tab / → takes it, Esc drops it) ----
		var GHOST_KEY = "dsh-persona-kit/ghost-mode";
		function ghostModes() { return [["off", L("关")], ["normal", L("常规")], ["affinity", L("攻略")]]; }
		var ghostDefault = "off"; // from the server config (info.ghostDefault) until the user picks a mode
		function ghostMode() { try { var v = window.localStorage.getItem(GHOST_KEY); if (v === "off" || v === "normal" || v === "affinity") return v; } catch (e) {} return ghostDefault; }
		function setGhostMode(m) {
			try { window.localStorage.setItem(GHOST_KEY, m); } catch (e) {}
			Object.keys(ghostStores).forEach(function (sid) { ghostStores[sid].text = ""; ghostStores[sid].shownFor = ""; ghostStores[sid].pending = false; });
			ghostListeners.forEach(function (f) { try { f(); } catch (e) {} });
		}
		var ghostStores = {}, ghostListeners = [];
		function ghostStore(sid) { return ghostStores[sid] || (ghostStores[sid] = { text: "", mode: "", dismissed: false, pending: false, recall: null, shownFor: "" }); }
		function ghostRequest(sid, trigger) {
			var st = ghostStore(sid), mode = ghostMode();
			if (mode === "off" || st.pending) return;
			st.pending = true; st.dismissed = false; st.text = "";
			fetchJson(API + "/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: sid, mode: mode }) })
				.then(function (j) {
					st.pending = false;
					if (ghostMode() !== mode) return;
					st.text = j && j.ok && typeof j.text === "string" ? j.text : "";
					st.mode = mode;
					ghostListeners.forEach(function (f) { try { f(); } catch (e) {} });
				}).catch(function () { st.pending = false; });
		}
		function composerInput() { return document.querySelector("[data-composer-input]") || document.querySelector("[data-composer-card] textarea"); }
		function inputText(el) { return !el ? "" : (typeof el.value === "string" ? el.value : (el.textContent || "")); }
		function Ghost(props) {
			var sid = typeof props.sessionId === "string" ? props.sessionId : "";
			var actions = props.inputActions;
			var inputSnap = typeof props.useInput === "function" ? props.useInput(function (x) { return x; }) : props.input;
			var sessSnap = typeof props.useSession === "function" ? props.useSession(function (x) { return x; }) : props.session;
			var draft = inputSnap && typeof inputSnap.draft === "string" ? inputSnap.draft : "";
			var phase = inputSnap && typeof inputSnap.phase === "string" ? inputSnap.phase : "idle";
			var locked = phase === "adjudicating" || phase === "claimed" || phase === "submitting";
			var running = !!(sessSnap && sessSnap.running === true), removed = !!(sessSnap && sessSnap.removed === true);
			var s1 = react.useState(0), tick = s1[1];
			var ghostRef = react.useRef(null), prevRunning = react.useRef(running), live = react.useRef({});
			live.current = { sid: sid, actions: actions, draft: draft, locked: locked, running: running, removed: removed };
			if (sid) { window.__dshPkActions = window.__dshPkActions || {}; window.__dshPkActions[sid] = actions; }
			react.useEffect(function () {
				var f = function () { tick(function (n) { return n + 1; }); };
				ghostListeners.push(f);
				return function () { ghostListeners = ghostListeners.filter(function (x) { return x !== f; }); };
			}, []);
			// the reply just finished: ask for a suggestion (only when the box is empty)
			react.useEffect(function () {
				if (prevRunning.current && !running && sid && !removed && draft.trim() === "") ghostRequest(sid, "turn-end");
				if (running && sid) { var st = ghostStore(sid); st.text = ""; st.recall = null; }
				prevRunning.current = running;
			}, [running, sid]);
			var st = sid ? ghostStore(sid) : null;
			var mode = ghostMode();
			var visible = !!(st && mode !== "off" && st.text && st.mode === mode && !st.dismissed && draft === "" && !running && !locked && !removed);
			react.useEffect(function () {
				var input = composerInput();
				if (input && input.setAttribute) { if (visible) input.setAttribute("data-pk-ghost", "on"); else input.removeAttribute("data-pk-ghost"); }
				var el = ghostRef.current;
				if (!visible || !el || !input) return;
				var place = function () {
					var r = input.getBoundingClientRect(), cs = window.getComputedStyle(input);
					["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "boxSizing"].forEach(function (p) { if (cs[p]) el.style[p] = cs[p]; });
					el.style.left = r.left + "px"; el.style.top = r.top + "px"; el.style.width = r.width + "px"; el.style.height = r.height + "px";
				};
				place();
				var t = window.setInterval(place, 400);
				window.addEventListener("resize", place);
				return function () { window.clearInterval(t); window.removeEventListener("resize", place); if (input.removeAttribute) input.removeAttribute("data-pk-ghost"); };
			}, [visible, st && st.text]);
			return h("div", { className: "dsh-pk-ghost", ref: ghostRef, hidden: !visible, "aria-hidden": "true" }, visible ? st.text : "");
		}
		// keys: Tab / → take the suggestion; Esc drops it; ↑ / ↓ walk through what you sent before (empty box only)
		var recallBusy = false;
		function onGhostKey(e) {
			if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
			var k = e.key;
			if (k !== "Tab" && k !== "ArrowRight" && k !== "Escape" && k !== "ArrowUp" && k !== "ArrowDown") return;
			var input = composerInput(), sid = cur.sid;
			if (!input || !sid || !(document.activeElement === input || input.contains(document.activeElement))) return;
			if (document.querySelector("[data-trigger-menu]")) return;
			var st = ghostStore(sid), text = inputText(input).trim();
			var actions = window.__dshPkActions && window.__dshPkActions[sid];
			if (!actions || typeof actions.setDraft !== "function") return;
			if (k === "Escape") { if (st.text && text === "") { st.dismissed = true; ghostListeners.forEach(function (f) { f(); }); } return; }
			if ((k === "Tab" || k === "ArrowRight") && text === "" && st.text && !st.dismissed) {
				e.preventDefault(); e.stopPropagation();
				var t = st.text; st.text = ""; actions.setDraft(t);
				postJson("/event", { type: "ghost-accept" }).catch(function () {});
				return;
			}
			if ((k === "ArrowUp" || k === "ArrowDown")) {
				var recall = st.recall;
				if (recall && text !== recall.text) { recall = st.recall = null; }
				if (!recall && (text !== "" || k === "ArrowDown")) return;
				var next = recall ? recall.index + (k === "ArrowUp" ? 1 : -1) : 0;
				e.preventDefault(); e.stopPropagation();
				if (next < 0) { st.recall = null; actions.setDraft(""); return; }
				if (recallBusy) return;
				recallBusy = true;
				fetchJson(API + "/sent?session=" + encodeURIComponent(sid) + "&index=" + next).then(function (j) {
					if (j && j.ok && typeof j.text === "string") { st.recall = { index: next, text: j.text.trim() }; actions.setDraft(j.text); }
				}).catch(function () {}).then(function () { recallBusy = false; });
			}
		}
		function GhostMode() {
			var s1 = react.useState(0), tick = s1[1];
			react.useEffect(function () { var f = function () { tick(function (n) { return n + 1; }); }; ghostListeners.push(f); return function () { ghostListeners = ghostListeners.filter(function (x) { return x !== f; }); }; }, []);
			var m = ghostMode();
			return h("div", { className: "dsh-pk-sec" },
				h("div", { className: "dsh-pk-title" }, L("输入建议")),
				h("div", { className: "dsh-pk-seg" }, ghostModes().map(function (o) {
					return h("button", { key: o[0], type: "button", "aria-pressed": m === o[0] ? "true" : "false", onClick: function () { setGhostMode(o[0]); if (o[0] !== "off" && cur.sid) ghostRequest(cur.sid, "mode"); } }, o[1]);
				})),
				h("div", { className: "dsh-pk-meta" }, m === "off" ? L("不预测。") : (m === "normal" ? L("猜你下一句想说什么，Tab 或 → 采纳。") : L("给出能增进感情的一句话，Tab 或 → 采纳。")) + L("每条回复结束后调用一次模型。")));
		}

		function Pill(props) {
			var sid = props && props.sessionId ? String(props.sessionId) : "";
			var s1 = react.useState(0), tick = s1[1];
			var s2 = react.useState(false), open = s2[0], setOpen = s2[1];
			var s3 = react.useState(false), busy = s3[0], setBusy = s3[1];
			var s4 = react.useState(""), err = s4[0], setErr = s4[1];
			var rootRef = react.useRef(null);
			react.useEffect(function () {
				if (cur.sid !== sid) { cur.sid = sid; info = null; infoAt = 0; baselined = ""; touchSession(sid); }
				var f = function () { tick(function (n) { return n + 1; }); };
				listeners.push(f);
				loadInfo(true).then(function (i) {
					if (i && i.sid === sid && !i.roleId && i.carryRole) switchRole(sid, i.carryRole).catch(function () {}).then(function () { return fetchJson(API + "/carried", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: sid }) }); }).then(function () { infoAt = 0; loadInfo(true); });
				});
				fetchRoles().then(f);
				fetchTracks().then(f);
				var poll = window.setInterval(function () { if (document.visibilityState === "visible") loadInfo(false); }, 2000);
				schedule();
				return function () {
					listeners = listeners.filter(function (x) { return x !== f; });
					window.clearInterval(poll);
					if (cur.sid === sid) cur.sid = "";
				};
			}, [sid]);
			react.useEffect(function () {
				if (!open) return;
				var off = function (e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
				document.addEventListener("pointerdown", off, true);
				return function () { document.removeEventListener("pointerdown", off, true); };
			}, [open]);
			if (!sid) return null;
			var inf = info && info.sid === sid ? info : null;
			var bound = !!(inf && inf.roleId && inf.levels);
			var lv = bound ? inf.levels[inf.level - 1] : null;
			// Open only after fresh data is in: a role switched elsewhere would otherwise flash the old knob first.
			var toggle = function () {
				if (open) { setOpen(false); return; }
				setErr("");
				Promise.all([loadInfo(true), fetchRoles()]).then(function () { setOpen(true); });
			};
			var pickRole = function (id) {
				setBusy(true); setErr("");
				switchRole(sid, id).catch(function (e) { setErr(String((e && e.message) || e)); })
					.then(function () { infoAt = 0; return loadInfo(true); })
					.then(function () { setBusy(false); });
			};
			return h("span", { className: "dsh-pk", ref: rootRef, style: bound && inf.accent ? { "--pk-accent": inf.accent } : undefined },
				h("button", { type: "button", className: "dsh-pk-pill", title: bound ? L("人设：{n}，说话强度：{l}（点开切换或调节）", { n: inf.name, l: lv.name }) : L("选择人设"), "aria-haspopup": "dialog", "aria-expanded": open ? "true" : "false", onClick: toggle },
					h("span", null, bound ? inf.name : L("人设")), bound ? h("b", null, lv.name) : null),
				open ? h("div", { className: "dsh-pk-pop" },
					h(RoleList, { current: bound ? inf.roleId : null, busy: busy, onPick: pickRole }),
					bound ? h(Slider, { info: inf, onPick: saveLevel }) : null,
					bound ? h(BondSection, { info: inf, onOverview: function () { setOpen(false); openOverview(); } }) : null,
					h(GhostMode, null),
					h("div", { className: "dsh-pk-sec" }, h("button", { type: "button", className: "dsh-pk-link dsh-pk-all", onClick: function () { setOpen(false); openAchievements(bound ? inf.roleId : ""); } }, L("成就…")), h("button", { type: "button", className: "dsh-pk-link dsh-pk-all", onClick: function () { setOpen(false); openAvatarPanel(bound ? inf.roleId : ""); } }, L("头像设置…"))),
					err ? h("div", { className: "dsh-pk-err" }, err) : null) : null);
		}

		var CSS = [
			".dsh-pk-sticker{margin:8px 0 2px;line-height:0}.dsh-pk-sticker img{max-height:150px;max-width:min(260px,70%);border-radius:10px;display:block}",
			"[data-pk-av]{position:relative;display:flex;flex-direction:column}[data-pk-av]>*{min-width:0}.dsh-pk-head{order:-1;display:flex;align-items:center;gap:8px;margin:0 0 8px;cursor:pointer;user-select:none}.dsh-pk-head[data-kind='user']{flex-direction:row-reverse}",
			".dsh-pk-pic{width:var(--pk-av-size,30px);height:var(--pk-av-size,30px);border-radius:50%;background-color:var(--dsw-alias-bg-elevated,#fff);background-size:cover;background-position:50% 20%;background-repeat:no-repeat;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)}",
			".dsh-pk-txt{display:flex;flex-direction:column;justify-content:center;min-width:0;line-height:16px}.dsh-pk-nm{font-size:13px;opacity:.78}.dsh-pk-mt{font-size:11px;opacity:.5}.dsh-pk-nm:empty,.dsh-pk-mt:empty{display:none}",
			"[data-pk-layout='side'] [data-pk-av='ai']{padding-left:calc(var(--pk-av-size,30px) + 12px)}[data-pk-layout='side'] [data-pk-av='user']{padding-right:calc(var(--pk-av-size,30px) + 12px)}",
			"[data-pk-layout='side'] .dsh-pk-head{display:block;margin-bottom:4px}[data-pk-layout='side'] .dsh-pk-head .dsh-pk-pic{position:absolute;top:0}[data-pk-layout='side'] .dsh-pk-head[data-kind='ai'] .dsh-pk-pic{left:0}[data-pk-layout='side'] .dsh-pk-head[data-kind='user'] .dsh-pk-pic{right:0}",
			"[data-pk-layout='side'] .dsh-pk-head .dsh-pk-txt{min-height:calc(var(--pk-av-size,30px) / 2)}",
			".dsh-pk{position:relative;display:inline-flex;align-items:center;flex:none;--pk-accent:#d9a514}",
			".dsh-pk-pill{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:0;border-radius:6px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;",
			"  color:color-mix(in srgb,var(--pk-accent) 70%,var(--dsw-alias-label-primary,#141413));background:color-mix(in srgb,var(--pk-accent) 14%,transparent)}",
			".dsh-pk-pill:hover,.dsh-pk-pill[aria-expanded=true]{background:color-mix(in srgb,var(--pk-accent) 26%,transparent)}",
			".dsh-pk-pop{position:absolute;left:0;bottom:calc(100% + 8px);z-index:40;width:max-content;max-width:300px;padding:10px 14px 12px;border-radius:12px;",
			"  background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 4px 18px rgba(0,0,0,.14),0 0 0 1px rgba(0,0,0,.06);user-select:none}",
			".dsh-pk-pill b{margin-left:6px;font-weight:600;opacity:.75}.dsh-pk-sec+.dsh-pk-sec{margin-top:8px;padding-top:8px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}.dsh-pk-roles{display:flex;flex-direction:column;gap:2px;min-width:200px}.dsh-pk-role{display:flex;align-items:center;gap:8px;height:30px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;text-align:left}.dsh-pk-role:hover{background:color-mix(in srgb,var(--pk-accent) 14%,transparent)}.dsh-pk-role[data-on]{background:color-mix(in srgb,var(--pk-accent) 20%,transparent);font-weight:600}.dsh-pk-role img,.dsh-pk-role i{width:22px;height:22px;object-fit:contain;flex:none}.dsh-pk-role span{flex:1}.dsh-pk-role em{font-style:normal;color:var(--pk-accent)}.dsh-pk-err{margin-top:6px;font-size:12px;color:#c0453a}.dsh-pk-bar{height:6px;border-radius:3px;margin:3px 0 6px;background:color-mix(in srgb,currentColor 12%,transparent);overflow:hidden}.dsh-pk-bar i{display:block;height:100%;background:var(--pk-accent);border-radius:3px}.dsh-pk-meta{font-size:11px;opacity:.65}.dsh-pk-note{margin-top:4px;font-size:12px;line-height:17px;color:var(--pk-accent);max-width:270px;white-space:normal}.dsh-pk-link{float:right;border:0;background:transparent;color:var(--pk-accent);font:inherit;font-size:12px;cursor:pointer;padding:0}.dsh-pk-ov{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;animation:dsh-pk-fade .12s ease-out}@keyframes dsh-pk-fade{from{opacity:0}to{opacity:1}}.dsh-pk-ov-card{width:min(460px,92vw);max-height:80vh;overflow:auto;padding:16px 18px;border-radius:14px;background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 8px 30px rgba(0,0,0,.25)}.dsh-pk-ov-head{font-size:15px;font-weight:600;margin-bottom:10px}.dsh-pk-ov-row{display:flex;gap:12px;align-items:center;padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-ov-row>img,.dsh-pk-ov-row>i{width:44px;height:44px;object-fit:contain;flex:none}.dsh-pk-ov-row>div{flex:1;min-width:0}.dsh-pk-ov-name{font-size:14px;font-weight:600}.dsh-pk-track-pick{display:flex;flex-direction:column;gap:4px;margin:4px 0 6px}.dsh-pk-select,.dsh-pk-nick{width:100%;box-sizing:border-box;height:26px;padding:0 6px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;font:inherit;font-size:12px}.dsh-pk-fold{cursor:pointer;user-select:none}.dsh-pk-caret{display:inline-block;width:14px;opacity:.6}.dsh-pk-dot{font-style:normal;color:var(--pk-accent);margin-left:6px;font-size:10px}.dsh-pk-all{float:none;display:block;margin-top:4px}.dsh-pk-av-card{width:min(360px,92vw)}.dsh-pk-av-sec{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-av-row{display:flex;gap:12px;align-items:center;margin:6px 0}.dsh-pk-av-prev{width:56px;height:56px;border-radius:50%;object-fit:cover;object-position:50% 20%;flex:none;background:color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-av-btns{display:flex;gap:6px;margin-top:4px}.dsh-pk-btn{height:26px;padding:0 10px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}.dsh-pk-btn:hover{background:color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-check{display:flex;align-items:center;gap:4px;font-size:13px;margin:4px 0}.dsh-pk-range{width:100%}.dsh-pk-choice{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;font-size:13px}.dsh-pk-select-sm{width:auto;min-width:110px}.dsh-pk-ghost{position:fixed;z-index:3;pointer-events:none;margin:0;border:0;background:transparent;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,#8a8f98);opacity:.78;user-select:none}.dsh-pk-ghost[hidden]{display:none}[data-composer-input][data-pk-ghost='on'] + [data-composer-placeholder]{visibility:hidden}[data-composer-input][data-pk-ghost='on'] p:last-child:after{content:none}:where(body):has([data-composer-input][data-pk-ghost='on']) [data-composer-placeholder][data-dsh-synthetic-placeholder]{visibility:hidden}[data-composer-card]:has([data-composer-input][data-pk-ghost='on']) [data-composer-placeholder]{visibility:hidden}.dsh-pk-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 14%,transparent);margin:4px 0}.dsh-pk-seg button{height:24px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;opacity:.7}.dsh-pk-seg button[aria-pressed=true]{opacity:1;font-weight:600;background:color-mix(in srgb,var(--pk-accent) 18%,transparent)}.dsh-pk-toast{position:fixed;right:20px;bottom:90px;z-index:2100;max-width:300px;padding:10px 14px;border-radius:12px;background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 6px 24px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.06);cursor:pointer;animation:dsh-pk-in .25s ease-out}.dsh-pk-toast-head{font-size:12px;color:#d9a514;margin-bottom:4px}.dsh-pk-toast-row{display:flex;flex-direction:column;margin:3px 0;font-size:12px}.dsh-pk-toast-row b{font-size:13px}.dsh-pk-toast-row span{opacity:.65}@keyframes dsh-pk-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.dsh-pk-ach-card{width:min(420px,92vw)}.dsh-pk-ach-group{margin:10px 0 2px;font-size:12px;opacity:.55}.dsh-pk-ach-row{display:flex;gap:10px;align-items:flex-start;padding:6px 0;opacity:.55}.dsh-pk-ach-row[data-on]{opacity:1}.dsh-pk-ach-mark{width:14px;text-align:center;color:#d9a514;flex:none}.dsh-pk-ach-row>div{flex:1;min-width:0}.dsh-pk-ach-seg{width:100%;display:flex;margin:0 0 8px}.dsh-pk-ach-seg button{flex:1}[data-pk-wait]{display:none!important}[data-pk-acct-name]{font-size:0!important;line-height:0}[data-pk-acct-name]::after{content:attr(data-pk-acct-name);font-size:var(--pk-acct-fs,14px);line-height:normal;white-space:nowrap}[data-pk-acct-pic]{background:var(--pk-acct-img) center/cover no-repeat!important;border-radius:50%}img[data-pk-acct-pic]{content:var(--pk-acct-img);object-fit:cover;background:none!important}svg[data-pk-acct-pic]>*,[data-pk-acct-pic]>svg{visibility:hidden}.dsh-pk-title{font-size:13px}.dsh-pk-title b{color:var(--pk-accent);margin-left:4px}",
			".dsh-pk-ends{display:flex;justify-content:space-between;font-size:11px;opacity:.55;margin:2px 0 0}",
			".dsh-pk-slide{margin:2px -10px 0;padding:0 34px 8px;touch-action:none;cursor:pointer;border-radius:10px}.dsh-pk-slide:hover{background:color-mix(in srgb,var(--pk-accent) 6%,transparent)}.dsh-pk-track{position:relative;height:68px;margin:0}",
			".dsh-pk-rail{position:absolute;left:0;right:0;top:48px;height:12px;border-radius:6px;background:color-mix(in srgb,currentColor 12%,transparent)}",
			".dsh-pk-stop{position:absolute;top:51px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:color-mix(in srgb,currentColor 28%,transparent)}",
			".dsh-pk-stop[data-on]{background:var(--pk-accent)}",
			".dsh-pk-knob{position:absolute;top:0;width:54px;height:56px;margin-left:-27px;margin-top:-2px;display:flex;align-items:flex-end;justify-content:center;pointer-events:none;transition:left .14s ease-out;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}",
			".dsh-pk-knob[data-dragging]{transition:none}",
			".dsh-pk-knob img{max-width:100%;max-height:100%;object-fit:contain}",
			".dsh-pk-knob span{width:30px;height:30px;border-radius:50%;background:var(--pk-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}",
			".dsh-pk-desc{margin-top:6px;font-size:12px;line-height:18px;opacity:.7;max-width:270px;white-space:normal}",
		].join("\n");
		function installStyle() {
			var old = document.getElementById(STYLE_ID); if (old) old.remove();
			var s = document.createElement("style"); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
			return function () { var x = document.getElementById(STYLE_ID); if (x) x.remove(); };
		}

		function apply(ctx) {
			try {
				appCtx = ctx;
				ctx.effect(installStyle, "dsh-persona-kit: style");
				var slots = ctx && ctx.slots;
				if (!slots || typeof slots.inject !== "function") { console.warn("[dsh-persona-kit] ctx.slots unavailable"); return; }
				// Same docking as dsh-prompt-gears: prefer dsh-local-tweaks' composer dock, fall back to our own slot.
				var dockDef = { id: "persona-kit", side: "left", order: 52, width: 120, fixed: false, render: function (props) { return h(Pill, props); } };
				var q = window.__dshComposerDockQueue;
				if (q && typeof q.push === "function") q.push(dockDef); else window.__dshComposerDockQueue = [dockDef];
				slots.inject("conversation.input.right", function () {
					return slots.register({ name: "conversation.input.right", id: "persona-kit", order: 61, label: "Intensity / 说话强度" }, function (props) { return window.__dshComposerDock ? null : h(Pill, props || {}); });
				});
				slots.inject("conversation.input.overlay", function () {
					return slots.register({ name: "conversation.input.overlay", id: "persona-kit-ghost", order: 41, label: "Suggestions / 输入建议" }, Ghost);
				});
				window.addEventListener("keydown", onGhostKey, true);
				ctx.effect(function () { return function () { window.removeEventListener("keydown", onGhostKey, true); }; }, "dsh-persona-kit: ghost keys");
				loadIdentity();
				var identityTimer = window.setInterval(function () { if (document.visibilityState === "visible") loadIdentity(); }, 5000);
				ctx.effect(function () { return function () { window.clearInterval(identityTimer); }; }, "dsh-persona-kit: identity poll");
				document.addEventListener("click", onAvatarClick, true);
				ctx.effect(function () { return function () { document.removeEventListener("click", onAvatarClick, true); closeAvatarPanel(); }; }, "dsh-persona-kit: avatar click");
				observer = new MutationObserver(function (records) {
					schedule();
					// a new message row: give it its header now, in the same frame, so nothing jumps afterwards
					var needAv = false;
					for (var ri = 0; ri < records.length && !needAv; ri++) {
						var added = records[ri].addedNodes;
						for (var ai = 0; ai < added.length; ai++) {
							var an = added[ai];
							if (an.nodeType === 1 && (an.hasAttribute && an.hasAttribute("data-chat-flow-kind") || (an.querySelector && an.querySelector("[data-chat-flow-kind]")))) { needAv = true; break; }
						}
					}
					try { guardMemeRows(); } catch (e) {}
					try { applyAccount(); } catch (e) {}
					if (needAv) { try { applyAvatars(); } catch (e) {} }
				});
				observer.observe(document.body, { childList: true, subtree: true });
				ctx.effect(function () { return function () { if (observer) observer.disconnect(); }; }, "dsh-persona-kit: observer");
				window.__dshPersonaKit = { get: function () { return { sid: cur.sid, info: info, last: last, state: getState() }; }, identity: function () { return identity; }, setLang: setLang, lang: function () { return LANG; }, run: function (line) { var svc = commandsService(); return svc ? Promise.resolve(svc.execute(String(cur.sid), line, [])) : Promise.reject(new Error("no commands service")); } };
				console.debug("[dsh-persona-kit] on");
			} catch (error) {
				console.warn("[dsh-persona-kit] failed: " + (error && error.message));
			}
		}

		exports.apply = apply;
		exports.inject = ["slots", "remote"];
		return module.exports;
	}
});
