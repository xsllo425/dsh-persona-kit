window.__ModuleLoader__.load({
	id: "dsh-persona-kit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var h = react.createElement;
		// The picker was ported from dsh-meme, whose call sites use `React.*`. Give them the module handle instead
		// of rewriting every line: without it the picker threw on first render and the 😊 button never appeared
		// once the old plugin was uninstalled.
		var React = react;

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
		var EN = { "表情": "sticker", "✦ 解锁成就": "✦ Achievement unlocked", "读取中…": "Loading…", "读取失败": "Could not load", "成就　{a} / {b}": "Achievements  {a} / {b}", "关闭": "Close", "全部": "All", "只看通用成就": "General achievements only", "{n} 的成就": "{n}'s achievements", "解锁于 {d}": "Unlocked {d}", "徽章": "Badges", "累计天数": "Days", "当前连续": "Streak", "最长连续": "Best streak", "对话轮次": "Turns", "已得": "Earned", "未得": "Locked", "点一枚徽章看详情": "Pick a badge for details", "隐藏成就，解锁后才知道条件": "Secret badge — its condition appears once earned", "{a} / {b}": "{a} / {b}", "裁剪失败": "Crop failed", "读不出这张图": "Cannot read this picture", "头像设置": "Avatar settings", "更换…": "Change…", "上传中…": "Uploading…", "上传失败": "Upload failed", "移除": "Remove", "恢复默认": "Reset to default", "她（{n}）": "Her ({n})", "她的头像": "Her picture", "显示她的头像": "Show her picture", "显示她的名字": "Show her name", "头像位置": "Picture position", "内容上方": "Above the text", "内容左侧": "Beside the text", "名字下方的小字": "Small line under the name", "关系": "Relationship", "数值（友情、默契等）": "Number (friendship, teamwork, …)", "两者": "Both", "不显示": "Hidden", "我": "Me", "我的头像": "My picture", "显示我的头像": "Show my picture", "我的名字": "My name", "显示在左下角账号处": "Shown on the account button (bottom left)", "用我的名字和头像替换左下角的账号信息": "Replace the account name and picture at the bottom left with mine", "大小 {n} 像素": "Size {n} px", "图片需小于 2 MB。png、jpg 会裁成正方形；gif、webp 原样使用。": "Pictures must be under 2 MB. png/jpg are cropped square; gif/webp are used as they are.", "好感": "Affinity", "说话强度 ": "Intensity ", "更正经": "More serious", "更玩梗": "More playful", "她怎么称呼你（可不填）": "What she calls you (optional)", "关系 ": "Relationship ", " · 距「{next}」还差 {need} 点": " · {need} to “{next}”", " · 已是最高的称号": " · top title reached", "聊天热度（上下文）{n}%": "Chat heat (context) {n}%", "{metric} {aff} · 聊过 {s} 个会话 {t} 轮 · 最近 {day}": "{metric} {aff} · {s} sessions, {t} turns · last {day}", "查看全部角色": "All roles", "{m}月{d}日": "{m}/{d}", "和她们的羁绊": "Your bonds", "另一段关系：{n}·{t}（{m} {a}）": "Another bond: {n} · {t} ({m} {a})", "命令服务不可用": "Command service unavailable", "切换失败": "Switch failed", "人设": "Role", "人设：{n}，说话强度：{l}（点开切换或调节）": "Role: {n}, intensity: {l} (click to switch or adjust)", "选择人设": "Choose a role", "成就…": "Achievements…", "头像设置…": "Avatar settings…", "表情包": "Stickers", "搜索描述 / 关键词…": "Search descriptions or keywords…", "清空": "Clear", "收起筛选": "Hide filters", "展开筛选(按图库 / 情绪挑图)": "Show filters (by pack or mood)", "筛选": "Filters", "共 ": "Showing ", " 张": "", "图库": "Packs", "点一下只看这个图库;再点取消。都不点 = 全部图库": "Click a pack to show only it; click again to undo. None selected means every pack.", "情绪": "Mood", "点一下只看这个情绪;再点取消。都不点 = 全部情绪": "Click a mood to show only it; click again to undo. None selected means every mood.", "还没有可发的表情包": "No stickers to send yet", "加载中…": "Loading…", "没有匹配的表情包": "No sticker matches that", "已显示 {a} / {b} 张 —— 点这里或往下滑看剩下的": "Showing {a} of {b} — click here or scroll down for the rest.", "滚轮缩放 · 双击复位 · Esc 或点背景关闭": "Scroll to zoom · double-click to reset · Esc or click the backdrop to close", "生气": "Angry", "开心": "Happy", "难过": "Sad", "害羞": "Shy", "困惑": "Confused", "日常": "Everyday", "惊讶": "Surprised", "睡觉": "Sleepy", "喵喵": "Meow", "早上好": "Good morning", "上班": "At work", "喜欢": "Like", "看看": "Look", "回复": "Reply", "叹气": "Sigh", "笨蛋": "Idiot", "傻瓜": "Fool", "给钱": "Pay up", "彩色": "Colour", "CPU": "CPU" };
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
				.then(function () { infoAt = 0; refreshKnownRoles(); return loadInfo(true); }).catch(function () {});
		}

		// ---- which role each session is on, asked in one go ----
		// Switching sessions used to make the pill fall back to the plain "人设" label for as long as /session
		// took to answer. This map is the server's own knowledge of every session, so the pill can draw the role
		// it is about to land on straight away; /session then corrects it if anything changed.
		var knownRoles = null, knownAt = 0;
		function loadKnownRoles(force) {
			if (!force && knownRoles && Date.now() - knownAt < 8000) return Promise.resolve(knownRoles);
			knownAt = Date.now();
			return fetchJson(API + "/sessions").then(function (j) {
				if (j && j.ok && j.sessions && typeof j.sessions === "object") { knownRoles = j.sessions; notify(); }
				return knownRoles;
			}).catch(function () { return knownRoles; });
		}
		function knownOf(sid) {
			if (!knownRoles) return null;
			var s = String(sid);
			return knownRoles[s] || knownRoles["session-" + s] || knownRoles[s.replace(/^session-/, "")] || null;
		}
		/** Forget the map after a change here, then ask again in the background. */
		function refreshKnownRoles() { knownAt = 0; loadKnownRoles(true); }
		/** What the pill shows: this session's own answer when it is here, otherwise what the server already knows. */
		function pillLabel(sid) {
			var live = info && info.sid === sid ? info : null;
			if (live) {
				return live.roleId && live.levels
					? { name: live.name, level: live.levels[live.level - 1].name, accent: live.accent || "" }
					: { name: L("人设"), level: "", accent: "" };
			}
			var k = knownOf(sid);
			return k ? { name: k.name, level: k.levelName || "", accent: k.accent || "" } : { name: L("人设"), level: "", accent: "" };
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
			// Only what actually goes on screen may be marked seen: the box holds three rows, and reporting
			// the whole list used to bury the fourth badge for good — it was never drawn, yet the server was
			// told it had been read, so it never came back either.
			var shown = fresh.slice(0, 3);
			shown.forEach(function (a) { toastShown[a.key] = true; });
			if (toastEl) { toastEl.remove(); toastEl = null; }
			window.clearTimeout(toastTimer);
			var el = document.createElement("div");
			el.className = "dsh-pk-toast";
			var head = document.createElement("div");
			head.className = "dsh-pk-toast-head";
			head.textContent = L("✦ 解锁成就");
			el.appendChild(head);
			shown.forEach(function (a) {
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
			postJson("/achievements/seen", { keys: shown.map(function (a) { return a.key; }) }).catch(function () {});
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
			// what the wall shows: every badge, only the earned ones, or only the ones still waiting
			var view = (function () { try { var v = window.localStorage.getItem("dsh-persona-kit/ach-view"); return v === "got" || v === "lock" ? v : "all"; } catch (e) { return "all"; } })();
			var picked = ""; // the badge whose details are shown under the filters
			function add(parent, tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; parent.appendChild(n); return n; }
			function showDetail(box, it) {
				box.textContent = "";
				if (!it) { add(box, "div", "dsh-pk-meta", L("点一枚徽章看详情")); return; }
				add(box, "div", "dsh-pk-ov-name", it.name);
				// the server never sent a hidden badge's condition, so there is nothing to show here either
				if (it.hidden && !it.unlocked) { add(box, "div", "dsh-pk-meta", L("隐藏成就，解锁后才知道条件")); return; }
				add(box, "div", "dsh-pk-meta", it.desc + (it.reward ? " · " + it.reward : ""));
				if (it.unlocked) { if (it.at) add(box, "div", "dsh-pk-meta", L("解锁于 {d}", { d: fmtDay(it.at) })); return; }
				var bar = add(box, "div", "dsh-pk-bar"); var f = document.createElement("i"); f.style.width = Math.round(it.value / it.gte * 100) + "%"; bar.appendChild(f);
				add(box, "div", "dsh-pk-meta", it.value + " / " + it.gte);
			}
			var curRole = "";
			function stamp(it, detail) {
				var b = document.createElement("button");
				b.type = "button"; b.className = "dsh-pk-stamp"; b.title = it.name || "";
				// a seal holds one character of the name; a hidden badge keeps its question mark until it is earned
				var glyph = Array.from(it.hidden && !it.unlocked ? "？" : String(it.name || ""))[0] || "✦";
				var txt = document.createTextNode(glyph);
				if (it.hidden && !it.unlocked) b.appendChild(txt);
				else {
					// the badge art; if the file is missing the seal falls back to the character
					var im = document.createElement("img");
					im.alt = ""; im.draggable = false; im.src = API + "/badge/" + encodeURIComponent(it.id) + ".png" + (it.scope === "role" && curRole ? "?role=" + encodeURIComponent(curRole) : "");
					im.onerror = function () { im.remove(); b.classList.remove("dsh-pk-stamp-img"); b.appendChild(txt); };
					b.classList.add("dsh-pk-stamp-img"); b.appendChild(im);
				}
				if (it.unlocked) b.setAttribute("data-on", "");
				if (it.hidden && !it.unlocked) b.setAttribute("data-secret", "");
				b.onclick = function () { picked = it.key; showDetail(detail, it); };
				return b;
			}
			function render(j, r) {
				curRole = r || "";
				card.textContent = "";
				var sum = j.summary || {};
				var head = add(card, "div", "dsh-pk-ov-head", L("成就　{a} / {b}", { a: sum.badges || 0, b: sum.total || 0 }));
				var x = add(head, "button", "dsh-pk-link", L("关闭")); x.type = "button"; x.onclick = closeAchievements;
				var stats = add(card, "div", "dsh-pk-ach-sum");
				[[(sum.badges || 0) + " / " + (sum.total || 0), L("徽章")], [sum.days || 0, L("累计天数")], [sum.streakNow || 0, L("当前连续")], [sum.streakBest || 0, L("最长连续")], [sum.turns || 0, L("对话轮次")]].forEach(function (o) {
					var cell = add(stats, "div", "dsh-pk-ach-stat");
					add(cell, "b", "", String(o[0])); add(cell, "span", "", o[1]);
				});
				var seg = add(card, "div", "dsh-pk-seg dsh-pk-ach-seg");
				[["all", L("全部")], ["got", L("已得")], ["lock", L("未得")]].forEach(function (o) {
					var b = add(seg, "button", "", o[1]);
					b.type = "button"; b.setAttribute("aria-pressed", view === o[0] ? "true" : "false");
					b.onclick = function () { view = o[0]; try { window.localStorage.setItem("dsh-persona-kit/ach-view", view); } catch (e) {} render(j, r); };
				});
				var sel = document.createElement("select");
				sel.className = "dsh-pk-select";
				var none = document.createElement("option"); none.value = ""; none.textContent = L("只看通用成就"); sel.appendChild(none);
				(roles || []).forEach(function (rl) { var o = document.createElement("option"); o.value = rl.id; o.textContent = L("{n} 的成就", { n: rl.name }); if (rl.id === r) o.selected = true; sel.appendChild(o); });
				sel.onchange = function () { picked = ""; load(sel.value); };
				card.appendChild(sel);
				var detail = add(card, "div", "dsh-pk-ach-detail");
				var shown = j.list.filter(function (it) { return view === "all" || (view === "got" ? it.unlocked : !it.unlocked); });
				(j.series || []).forEach(function (s) {
					var items = shown.filter(function (it) { return it.series === s.id; });
					if (!items.length) return;
					var all = j.list.filter(function (it) { return it.series === s.id; });
					var group = add(card, "div", "dsh-pk-ach-group");
					add(group, "span", "", s.name);
					add(group, "em", "", L("{a} / {b}", { a: all.filter(function (it) { return it.unlocked; }).length, b: all.length }));
					var grid = add(card, "div", "dsh-pk-ach-grid");
					items.forEach(function (it) { grid.appendChild(stamp(it, detail)); });
				});
				showDetail(detail, j.list.filter(function (it) { return it.key === picked; })[0]);
			}
			function load(r) {
				fetchJson(API + "/achievements?role=" + encodeURIComponent(r)).then(function (j) {
					if (achEl !== el) return;
					if (!j || !j.ok) { card.textContent = L("读取失败"); return; }
					render(j, r);
				}).catch(function () { if (achEl === el) card.textContent = L("读取失败"); });
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
		// clicking the picture or the name opens the avatar panel. The header is a full-width block, so the click
		// must land on the picture/name itself: the box around them (and blank reply rows, where the header is the
		// only content) is not a button.
		function onAvatarClick(e) {
			if (e.button !== 0) return;
			var hit = e.target && e.target.closest ? e.target.closest(".dsh-pk-pic, .dsh-pk-nm, .dsh-pk-mt") : null;
			if (!hit || !hit.closest(".dsh-pk-head")) return;
			var head = hit.closest(".dsh-pk-head");
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
			// "steering" is a message sent while the agent is still running: the host gives it its own row kind,
			// but on screen it is one of mine, so it must get my picture like any other message of mine.
			var rows = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"], [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]');
			// One turn renders several response rows with identical attributes: the transition prose first, then
			// the delivered answer. Picking "the first row of the turn" therefore always picked the transition
			// and never moved, which is the reported bug. Pick one row per turn instead: once the turn is
			// delivered the LAST response row is the answer (the same row a sticker lands on), before that the
			// FIRST row is where the reply begins.
			var delivered = {};
			try {
				var tails = document.querySelectorAll('[data-chat-flow-kind="turn-tail"], [data-turn-process]');
				for (var ti = 0; ti < tails.length; ti++) {
					var tt = tails[ti].getAttribute("data-chat-turn") || tails[ti].getAttribute("data-turn-process");
					if (tt) delivered[tt] = true;
				}
			} catch (e) {}
			var bucket = {}, target = {};
			for (var bi = 0; bi < rows.length; bi++) {
				var bRow = rows[bi];
				var bKind = bRow.getAttribute("data-chat-flow-kind");
				if (bKind === "user" || bKind === "steering") continue; // my own rows are not part of the turn's answer
				var bTurn = bRow.getAttribute("data-chat-turn") || ("n" + bi);
				(bucket[bTurn] || (bucket[bTurn] = [])).push(bRow);
			}
			Object.keys(bucket).forEach(function (t) {
				var list = bucket[t];
				target[t] = delivered[t] ? list[list.length - 1] : list[0];
			});
			var seenTurn = {};
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i], want = "", d = {};
				var kind = row.getAttribute("data-chat-flow-kind");
				if (kind === "user" || kind === "steering") { if (me) { want = "user"; d = { pic: me, name: "", meta: "" }; } }
				else {
					var turn = row.getAttribute("data-chat-turn") || ("n" + i);
					// every row of the turn that is not the chosen one must lose its head, or a moved avatar
					// would leave a copy behind on the row it left
					if (target[turn] === row && !seenTurn[turn]) {
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
			return h(Fold, { id: "level", label: h("span", null, L("说话强度 "), h("b", null, lv.name)) },
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
			return h(Fold, { id: "rel", defaultOpen: false, label: h("span", null, L("关系 "), h("b", null, b.trackName + "·" + b.title)) },
				h(TrackPicker, { bond: b }),
				h("div", { className: "dsh-pk-meta" }, (b.metric || L("好感")) + " " + b.affinity + (b.next ? L(" · 距「{next}」还差 {need} 点", { next: b.next, need: b.need }) : L(" · 已是最高的称号"))),
				h(Bar, { value: b.progress }),
				h("div", { className: "dsh-pk-meta" }, L("聊天热度（上下文）{n}%", { n: b.heat })),
				h(Bar, { value: b.heat / 100 }),
				h("button", { type: "button", className: "dsh-pk-link dsh-pk-all", onClick: props.onOverview }, L("查看全部角色")));
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
					sub.textContent = L("{metric} {aff} · 聊过 {s} 个会话 {t} 轮 · 最近 {day}", { metric: r.metric || L("好感"), aff: r.affinity, s: r.sessions, t: r.turns, day: fmtDay(r.lastAt) });
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
		// ---- collapsible sections: every one of these remembers whether you left it open ----
		var FOLD_KEY = "dsh-persona-kit/fold-";
		// the bond section had its own key before folding was shared; honour it so nobody's panel suddenly collapses
		var FOLD_LEGACY = { rel: "dsh-persona-kit/rel-open" };
		function foldGet(id, def) { try { var v = window.localStorage.getItem(FOLD_KEY + id); if (v === null && FOLD_LEGACY[id]) v = window.localStorage.getItem(FOLD_LEGACY[id]); return v === null ? def : v === "1"; } catch (e) { return def } }
		function foldSet(id, n) { try { window.localStorage.setItem(FOLD_KEY + id, n ? "1" : "0"); } catch (e) {} }
		/** @param props defaultOpen (true), cls for the body wrapper, label may be any node */
		function Fold(props) {
			var s = react.useState(function () { return foldGet(props.id, props.defaultOpen !== false) }), open = s[0], setOpen = s[1];
			var toggle = function () { var n = !open; setOpen(n); foldSet(props.id, n); };
			return h("div", { className: "dsh-pk-sec" },
				h("div", { className: "dsh-pk-title dsh-pk-fold", onClick: toggle, role: "button", "aria-expanded": open ? "true" : "false" },
					h("span", { className: "dsh-pk-caret" }, open ? "▾" : "▸"), props.label),
				open ? h("div", { className: props.cls }, props.children) : null);
		}
		function RoleList(props) {
			return h(Fold, { id: "roles", cls: "dsh-pk-roles", label: L("人设") },
				(roles || []).map(function (r) {
					var on = r.id === props.current;
					return h("button", { key: r.id, type: "button", className: "dsh-pk-role", "data-on": on ? "" : undefined, disabled: props.busy, onClick: function () { props.onPick(on ? null : r.id); }, style: { "--pk-accent": r.accent || "#d9a514" } },
						r.image ? h("img", { src: r.image, alt: "", draggable: false }) : h("i", null),
						h("span", null, r.name),
						on ? h("em", null, "✓") : null);
				}));
		}
		// The composer's text box; the meme picker uses it to anchor its panel.
		function composerInput() { return document.querySelector("[data-composer-input]") || document.querySelector("[data-composer-card] textarea"); }
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
				fetchRoles().then(f);
				fetchTracks().then(f);
				loadKnownRoles(false);
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
			// The session's own answer is the truth; until it is here, draw what /sessions already knows for it,
			// so switching sessions does not flick the pill back to the plain unbound label first.
			var lab = pillLabel(sid);
			// Open only after fresh data is in: a role switched elsewhere would otherwise flash the old knob first.
			var toggle = function () {
				if (open) { setOpen(false); return; }
				setErr("");
				Promise.all([loadInfo(true), fetchRoles()]).then(function () { setOpen(true); });
			};
			var pickRole = function (id) {
				setBusy(true); setErr("");
				switchRole(sid, id).catch(function (e) { setErr(String((e && e.message) || e)); })
					.then(function () { refreshKnownRoles(); infoAt = 0; return loadInfo(true); })
					.then(function () { setBusy(false); });
			};
			return h("span", { className: "dsh-pk", ref: rootRef, style: lab.accent ? { "--pk-accent": lab.accent } : undefined },
				h("button", { type: "button", className: "dsh-pk-pill", title: lab.level ? L("人设：{n}，说话强度：{l}（点开切换或调节）", { n: lab.name, l: lab.level }) : L("选择人设"), "aria-haspopup": "dialog", "aria-expanded": open ? "true" : "false", onClick: toggle },
					h("span", null, lab.name), lab.level ? h("b", null, lab.level) : null),
				open ? h("div", { className: "dsh-pk-pop" },
					h(RoleList, { current: bound ? inf.roleId : null, busy: busy, onPick: pickRole }),
					bound ? h(Slider, { info: inf, onPick: saveLevel }) : null,
					bound ? h(BondSection, { info: inf, onOverview: function () { setOpen(false); openOverview(); } }) : null,
					h("div", { className: "dsh-pk-sec" }, h("button", { type: "button", className: "dsh-pk-link dsh-pk-all", onClick: function () { setOpen(false); openAchievements(bound ? inf.roleId : ""); } }, L("成就…")), h("button", { type: "button", className: "dsh-pk-link dsh-pk-all", onClick: function () { setOpen(false); openAvatarPanel(bound ? inf.roleId : ""); } }, L("头像设置…"))),
					err ? h("div", { className: "dsh-pk-err" }, err) : null) : null);
		}

		var CSS = [
			".dsh-pk-sticker{margin:8px 0 2px;line-height:0}.dsh-pk-sticker img{max-height:150px;max-width:min(260px,70%);border-radius:10px;display:block}",
			"[data-pk-av]{position:relative;display:flex;flex-direction:column}[data-pk-av]>*{min-width:0}.dsh-pk-head{order:-1;display:flex;align-items:center;gap:8px;margin:0 0 8px;cursor:pointer;user-select:none;pointer-events:none}.dsh-pk-head .dsh-pk-pic,.dsh-pk-head .dsh-pk-nm,.dsh-pk-head .dsh-pk-mt{pointer-events:auto}.dsh-pk-head[data-kind='user'] .dsh-pk-pic{pointer-events:none}.dsh-pk-head[data-kind='user']{flex-direction:row-reverse}",
			".dsh-pk-pic{width:var(--pk-av-size,30px);height:var(--pk-av-size,30px);border-radius:50%;background-color:var(--dsw-alias-bg-layer-2,#fff);background-size:cover;background-position:50% 20%;background-repeat:no-repeat;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)}",
			".dsh-pk-txt{display:flex;flex-direction:column;justify-content:center;min-width:0;line-height:16px}.dsh-pk-nm{font-size:13px;opacity:.78}.dsh-pk-mt{font-size:11px;opacity:.5}.dsh-pk-nm:empty,.dsh-pk-mt:empty{display:none}",
			"[data-pk-layout='side'] [data-pk-av='ai']{padding-left:calc(var(--pk-av-size,30px) + 12px)}[data-pk-layout='side'] [data-pk-av='user']{padding-right:calc(var(--pk-av-size,30px) + 12px)}",
			"[data-pk-layout='side'] .dsh-pk-head{display:block;margin-bottom:4px}[data-pk-layout='side'] .dsh-pk-head .dsh-pk-pic{position:absolute;top:0}[data-pk-layout='side'] .dsh-pk-head[data-kind='ai'] .dsh-pk-pic{left:0}[data-pk-layout='side'] .dsh-pk-head[data-kind='user'] .dsh-pk-pic{right:0}",
			"[data-pk-layout='side'] .dsh-pk-head .dsh-pk-txt{min-height:calc(var(--pk-av-size,30px) / 2)}",
			".dsh-pk{position:relative;display:inline-flex;align-items:center;flex:none;--pk-accent:#d9a514}",
			".dsh-pk-pill{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:0;border-radius:6px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;",
			"  color:color-mix(in srgb,var(--pk-accent) 70%,var(--dsw-alias-label-primary,#141413));background:color-mix(in srgb,var(--pk-accent) 14%,transparent)}",
			".dsh-pk-pill:hover,.dsh-pk-pill[aria-expanded=true]{background:color-mix(in srgb,var(--pk-accent) 26%,transparent)}",
			".dsh-pk-pop{position:absolute;left:0;bottom:calc(100% + 8px);z-index:40;width:max-content;max-width:300px;padding:10px 14px 12px;border-radius:12px;",
			"  background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.06));box-shadow:var(--dsw-shadow-lv3,0 4px 18px rgba(0,0,0,.14));user-select:none}",
			".dsh-pk-pill b{margin-left:6px;font-weight:600;opacity:.75}.dsh-pk-sec+.dsh-pk-sec{margin-top:8px;padding-top:8px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}.dsh-pk-roles{display:flex;flex-direction:column;gap:2px;min-width:200px}.dsh-pk-role{display:flex;align-items:center;gap:8px;height:30px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;text-align:left}.dsh-pk-role:hover{background:color-mix(in srgb,var(--pk-accent) 14%,transparent)}.dsh-pk-role[data-on]{background:color-mix(in srgb,var(--pk-accent) 20%,transparent);font-weight:600}.dsh-pk-role img,.dsh-pk-role i{width:22px;height:22px;object-fit:contain;flex:none}.dsh-pk-role span{flex:1}.dsh-pk-role em{font-style:normal;color:var(--pk-accent)}.dsh-pk-err{margin-top:6px;font-size:12px;color:var(--dsw-alias-state-error-primary,#c0453a)}.dsh-pk-bar{height:6px;border-radius:3px;margin:3px 0 6px;background:color-mix(in srgb,currentColor 12%,transparent);overflow:hidden}.dsh-pk-bar i{display:block;height:100%;background:var(--pk-accent);border-radius:3px}.dsh-pk-meta{font-size:11px;opacity:.65}.dsh-pk-note{margin-top:4px;font-size:12px;line-height:17px;color:var(--pk-accent);max-width:270px;white-space:normal}.dsh-pk-link{float:right;border:0;background:transparent;color:var(--pk-accent);font:inherit;font-size:12px;cursor:pointer;padding:0}.dsh-pk-ov{position:fixed;inset:0;z-index:2000;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.28));display:flex;align-items:center;justify-content:center;animation:dsh-pk-fade .12s ease-out}@keyframes dsh-pk-fade{from{opacity:0}to{opacity:1}}.dsh-pk-ov-card{width:min(460px,92vw);max-height:80vh;overflow:auto;padding:16px 18px;border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.06));box-shadow:var(--dsw-shadow-lv3,0 8px 30px rgba(0,0,0,.25))}.dsh-pk-ov-head{font-size:15px;font-weight:600;margin-bottom:10px}.dsh-pk-ov-row{display:flex;gap:12px;align-items:center;padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-ov-row>img,.dsh-pk-ov-row>i{width:44px;height:44px;object-fit:contain;flex:none}.dsh-pk-ov-row>div{flex:1;min-width:0}.dsh-pk-ov-name{font-size:14px;font-weight:600}.dsh-pk-track-pick{display:flex;flex-direction:column;gap:4px;margin:4px 0 6px}.dsh-pk-select,.dsh-pk-nick{width:100%;box-sizing:border-box;height:26px;padding:0 6px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;font:inherit;font-size:12px}.dsh-pk-select{background-color:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328)}.dsh-pk-fold{cursor:pointer;user-select:none}.dsh-pk-caret{display:inline-block;width:14px;opacity:.6}.dsh-pk-dot{font-style:normal;color:var(--pk-accent);margin-left:6px;font-size:10px}.dsh-pk-all{float:none;display:block;margin-top:4px}.dsh-pk-av-card{width:min(360px,92vw)}.dsh-pk-av-sec{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-av-row{display:flex;gap:12px;align-items:center;margin:6px 0}.dsh-pk-av-prev{width:56px;height:56px;border-radius:50%;object-fit:cover;object-position:50% 20%;flex:none;background:color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-av-btns{display:flex;gap:6px;margin-top:4px}.dsh-pk-btn{height:26px;padding:0 10px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}.dsh-pk-btn:hover{background:color-mix(in srgb,currentColor 8%,transparent)}.dsh-pk-check{display:flex;align-items:center;gap:4px;font-size:13px;margin:4px 0}.dsh-pk-range{width:100%}.dsh-pk-choice{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;font-size:13px}.dsh-pk-select-sm{width:auto;min-width:110px}.dsh-pk-select option{background-color:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328)}.dsh-pk-select option:checked{background-color:color-mix(in srgb,var(--pk-accent,#d9a514) 22%,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#1f2328)}.dsh-pk-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 14%,transparent);margin:4px 0}.dsh-pk-seg button{height:24px;padding:0 12px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;opacity:.7}.dsh-pk-seg button[aria-pressed=true]{opacity:1;font-weight:600;background:color-mix(in srgb,var(--pk-accent) 18%,transparent)}.dsh-pk-toast{position:fixed;right:20px;bottom:90px;z-index:2100;max-width:300px;padding:10px 14px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.06));box-shadow:var(--dsw-shadow-lv3,0 6px 24px rgba(0,0,0,.2));cursor:pointer;animation:dsh-pk-in .25s ease-out}.dsh-pk-toast-head{font-size:12px;color:#d9a514;margin-bottom:4px}.dsh-pk-toast-row{display:flex;flex-direction:column;margin:3px 0;font-size:12px}.dsh-pk-toast-row b{font-size:13px}.dsh-pk-toast-row span{opacity:.65}@keyframes dsh-pk-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.dsh-pk-ach-card{width:min(430px,92vw)}.dsh-pk-ach-sum{display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 10px}.dsh-pk-ach-stat{display:flex;flex-direction:column;min-width:48px}.dsh-pk-ach-stat b{font-size:15px;font-weight:600}.dsh-pk-ach-stat span{font-size:10px;opacity:.55}.dsh-pk-ach-detail{margin:2px 0 6px;padding:8px 10px;border-radius:9px;background:color-mix(in srgb,currentColor 5%,transparent);min-height:32px}.dsh-pk-ach-group{display:flex;justify-content:space-between;align-items:baseline;margin:10px 0 2px;font-size:12px;opacity:.6}.dsh-pk-ach-group em{font-style:normal;font-size:11px;color:var(--pk-accent);opacity:.9}.dsh-pk-ach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:7px;margin:4px 0}.dsh-pk-stamp{width:100%;aspect-ratio:1;min-height:38px;border-radius:50%;border:2px solid color-mix(in srgb,currentColor 16%,transparent);background:transparent;color:inherit;font:inherit;font-size:15px;line-height:1;cursor:pointer;opacity:.42;transition:transform .12s ease,opacity .12s ease}.dsh-pk-stamp[data-on]{opacity:1;color:#d9a514;border-color:var(--pk-accent);background:color-mix(in srgb,var(--pk-accent) 10%,transparent)}.dsh-pk-stamp[data-secret]{opacity:.3;border-style:dashed}.dsh-pk-stamp-img{padding:0;border:0;background:transparent;overflow:visible}.dsh-pk-stamp-img img{display:block;width:100%;height:100%;object-fit:contain;filter:grayscale(1)}.dsh-pk-stamp-img[data-on] img{filter:none}.dsh-pk-stamp-img[data-on]{background:transparent;border:0}.dsh-pk-stamp:hover{transform:translateY(-1px);opacity:.85}.dsh-pk-stamp[data-on]:hover{opacity:1}.dsh-pk-ach-seg{width:100%;display:flex;margin:0 0 6px}.dsh-pk-ach-seg button{flex:1}[data-pk-wait]{display:none!important}[data-pk-acct-name]{font-size:0!important;line-height:0}[data-pk-acct-name]::after{content:attr(data-pk-acct-name);font-size:var(--pk-acct-fs,14px);line-height:normal;white-space:nowrap}[data-pk-acct-pic]{background:var(--pk-acct-img) center/cover no-repeat!important;border-radius:50%}img[data-pk-acct-pic]{content:var(--pk-acct-img);object-fit:cover;background:none!important}svg[data-pk-acct-pic]>*,[data-pk-acct-pic]>svg{visibility:hidden}.dsh-pk-title{font-size:13px}.dsh-pk-title b{color:var(--pk-accent);margin-left:4px}",
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
			// The panel is fixed to the viewport and placed from the composer's box (see placePicker): inside the
			// overlay slot there is no positioned ancestor to hang an absolute panel from, so `bottom:100%` landed
			// off-screen and the 😊 button looked dead.
			"[data-pk-memes].meme-picker[data-pk-placed]{visibility:visible}",
		].join("\n");
		function installStyle() {
			var old = document.getElementById(STYLE_ID); if (old) old.remove();
			var s = document.createElement("style"); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
			return function () { var x = document.getElementById(STYLE_ID); if (x) x.remove(); };
		}
		/**
		 * The picker's own stylesheet. It carries data-plugin so the host claims the tag for this plugin: an
		 * unclaimed style left behind would survive an uninstall and keep styling nothing.
		 */
		function installMemeStyle() {
			if (typeof document === "undefined" || !document.head) return null;
			var el = document.createElement("style");
			el.setAttribute("data-plugin", "dsh-persona-kit");
			el.textContent = memePickerCSS;
			document.head.appendChild(el);
			return el;
		}


		// ---- meme library: the picker, the picture zoom, and the [sticker: word] renderer ----
		//
		// Ported from the dsh-meme plugin, which this one replaces. The rules below are its own, kept as they
		// were because each one was paid for by a real bug report: the incremental scan replaced a full
		// document TreeWalker, the ghost span keeps hosts that compare textContent from rewriting the bubble,
		// and the scheduler queues one scan instead of restarting a debounce, which is what made pictures
		// arrive late during streaming.
		var memeLibraryRevision = 0
		var memeIndexListeners = new Set()
		const memePickerCSS = [
			'[data-pk-memes].meme-trigger{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:transparent;border:none;line-height:1;outline:none;transition:background .12s,color .12s}',
			'[data-pk-memes].meme-trigger:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
			'[data-pk-memes].meme-trigger.active{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}',
			// box-sizing 必须是 border-box:高度自适应是拿 getBoundingClientRect 量的(带 padding/border),
			// 而 max-height 默认按 content-box 算 —— 少了这句,面板实际比算出来的高一个 padding+border,
			// 上缘直接顶到视口外面去(实测 607px 的上限渲染成 633px、top=-10)。
			// 宽度按「一行正好 5 格」定:格子外框 78(76 + 两条 1px 边框)+ 间距 8,5 格要 422 的网格
			// 内宽;面板 480 时网格内宽约 441(已扣掉面板 padding/border、网格 padding 和滚动条),
			// 留够余量不至于被滚动条挤成 4 格,也还不到 6 格的 508。窄窗口仍由 92vw 兜底。
			'[data-pk-memes].meme-picker{position:fixed;visibility:hidden;box-sizing:border-box;width:min(480px,92vw);z-index:30;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:8px;padding:12px;max-height:min(46vh,calc(100vh - 32px));overflow:hidden;font-size:12px;color:var(--dsw-alias-label-primary)}',
			'[data-pk-memes].meme-picker .mp-head{display:flex;gap:6px;align-items:center;flex:none}',
			'[data-pk-memes].meme-picker .mp-search{flex:1 1 auto;min-width:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 9px;font-size:12px;outline:none;transition:border-color .12s ease}',
			'[data-pk-memes].meme-picker .mp-search:focus{border-color:var(--dsw-alias-brand-primary)}',
			'[data-pk-memes].meme-picker .mp-clear{flex:none;padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px}',
			'[data-pk-memes].meme-picker .mp-clear:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
			'[data-pk-memes].meme-picker .mp-count{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
			// 筛选区开关:复用 chip(.mp-tag)的外观,右侧小三角表示展开/收起
			'[data-pk-memes].meme-picker .mp-toggle{flex:none}',
			'[data-pk-memes].meme-picker .mp-toggle .caret{margin-left:4px;font-size:9px;line-height:1;opacity:.75}',
			'[data-pk-memes].meme-picker .mp-filters{flex:none;display:flex;flex-direction:column;gap:6px;max-height:min(168px,32vh);overflow-y:auto}',
			'[data-pk-memes].meme-picker .mp-filter-row{display:flex;gap:4px;align-items:flex-start;flex-wrap:wrap}',
			'[data-pk-memes].meme-picker .mp-filter-label{flex:none;width:26px;font-size:11px;line-height:21px;color:var(--dsw-alias-label-secondary)}',
			'[data-pk-memes].meme-picker .mp-tag{padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);cursor:pointer;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;flex:none;transition:background .12s,color .12s,border-color .12s}',
			'[data-pk-memes].meme-picker .mp-tag:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
			'[data-pk-memes].meme-picker .mp-tag.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1)}',
			'[data-pk-memes].meme-picker .mp-tag .n{opacity:.65;margin-left:3px;font-size:10px}',
			// min-height:0 是必须的:flex 子项的默认 min-height:auto 会按内容撑开,网格就不收缩了,
			// 面板会被撑破(而不是出现滚动条)。
			'[data-pk-memes].meme-picker .mp-grid{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-wrap:wrap;gap:8px;padding:2px}',
			'[data-pk-memes].meme-picker .mp-cell{width:76px;height:76px;flex:0 0 76px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;overflow:hidden;cursor:pointer;background-color:var(--dsw-alias-bg-layer-2);background-size:contain;background-position:center center;background-repeat:no-repeat;padding:0;display:block;transition:border-color .12s,transform .12s,box-shadow .12s}',
			'[data-pk-memes].meme-picker .mp-cell:hover{border-color:var(--dsw-alias-brand-primary);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.15)}',
			'[data-pk-memes].meme-picker .mp-empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:28px 0}',
			'[data-pk-memes].meme-picker .mp-hint{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);text-align:center}',
			'[data-pk-memes].meme-picker .mp-more{background:none;border:0;width:100%;padding:4px 0;cursor:pointer;font:inherit}',
			'[data-pk-memes].meme-picker .mp-more:hover{color:var(--dsw-alias-brand-primary)}',
			// 悬浮预览(issue #30 第 2 条):fixed + pointer-events:none,浮在格子旁边不挡点击;
			// 位置在 layout effect 里按实测尺寸算(右侧放不下翻左边、垂直钳制),见 MemeBoard。
			'[data-pk-memes].meme-picker .mp-hover{position:fixed;z-index:60;width:176px;pointer-events:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:8px;box-shadow:0 12px 32px rgba(0,0,0,.32);display:flex;flex-direction:column;gap:6px}',
			'[data-pk-memes].meme-picker .mp-hover-img{width:144px;height:144px;margin:0 auto;border-radius:8px;background-color:var(--dsw-alias-bg-base);background-size:contain;background-position:center center;background-repeat:no-repeat}',
			'[data-pk-memes].meme-picker .mp-hover-tag{align-self:flex-start;font-size:10px;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-radius:999px;padding:1px 8px}',
			'[data-pk-memes].meme-picker .mp-hover-cap{font-size:12px;line-height:1.45;max-height:3.9em;overflow:hidden;word-break:break-word}',
			'[data-pk-memes].meme-picker .mp-hover-file{font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
		].join('')

		let pickerCache = null
		/** 一批渲染的表情格数:一次全铺就是上千个 DOM 节点 + 上千个图片请求,不值得。滚到底自动再来一批。 */
		const PICKER_PAGE = 240
		/**
		 * 筛选区(图库 / 情绪两排 chip)是否展开。默认收起:图库一多,两排 chip 能占掉小面板的
		 * 一多半高度,把网格挤没;收起后只剩一个带计数的「筛选」按钮,发现性还在。展开状态记在
		 * 模块里 —— 同一个页面会话内关掉面板再打开不用重新展开。
		 */
		let pickerFiltersOpen = false
		/**
		 * 面板顶边与宿主顶栏之间留的呼吸间距(px)。顶着顶栏贴脸很难看,留一点点白。
		 * 只在实际被顶栏挡住时才加 —— 面板本来就在下方(没被挡)时加它会白白压矮一截。
		 */
		const PICKER_TOP_GAP = 12
		/**
		 * 面板高度上限:视口高度的 46%(沿用 CSS 里那个 46vh)。自适应只往下收、不往上撑破这个
		 * 上限 —— 半屏高左右最能兼顾「看得到够多图」和「不把对话顶掉」,再高就喧宾夺主了。
		 */
		const PICKER_MAX_VH = 0.46

		// 标签(库里存的是英文) -> 人话;UI 上只显示这个
		var TAG_ZH = {
			angry: L("生气"), happy: L("开心"), sad: L("难过"), shy: L("害羞"), confused: L("困惑"),
			daily: L("日常"), surprised: L("惊讶"), sleep: L("睡觉"), meow: L("喵喵"), morning: L("早上好"),
			work: L("上班"), like: L("喜欢"), see: L("看看"), reply: L("回复"), sigh: L("叹气"),
			baka: L("笨蛋"), fool: L("傻瓜"), givemoney: L("给钱"), color: L("彩色"), cpu: L("CPU"),
		}
		function tagZh(t) { return TAG_ZH[t] || t }

		// 一行图库 id:相对行是 "<pack>/memes/<tag>/<file>",绝对地址带 "/persona-kit/memes/<pack>/…"
		function packOfUrl(url) {
			var u = String(url || "")
			var abs = u.indexOf("/persona-kit/memes/")
			if (abs >= 0) return u.slice(abs + "/persona-kit/memes/".length).split("/")[0]
			var cut = u.indexOf("/")
			return cut > 0 ? u.slice(0, cut) : ""
		}

		// 图库里的一行 -> 浏览器能直接用的图片地址。API 给的是相对路径("<pack>/memes/…"),
		// 直接塞进 url() 会按站点根解析成 404(面板全白就是这个原因)
		function memeUrlOf(u, path) {
			var raw = String(u || path || "").replace(/^\//, "")
			if (!raw) return ""
			if (/^https?:\/\//.test(raw)) return raw
			return "/persona-kit/memes/" + raw
		}
		// 图库多选的范围:空数组 = 不筛(全部图库)
		function pickerPackScope(memes, selPacks) {
			var rows = Array.isArray(memes) ? memes : []
			if (!selPacks || selPacks.length === 0) return rows
			return rows.filter(function (m) { return selPacks.indexOf(packOfUrl(m.url)) >= 0 })
		}
		function pickerTagCounts(memes, selPacks) {
			const counts = new Map()
			for (const m of pickerPackScope(memes, selPacks)) {
				const tag = String(m.tag || '').trim()
				if (!tag) continue
				counts.set(tag, (counts.get(tag) || 0) + 1)
			}
			return [...counts].map(([tag, count]) => ({ tag, count }))
				.sort((a, b) => (b.count - a.count) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
		}

		function pickerFilter(memes, selPacks, selTags, query) {
			let rows = pickerPackScope(memes, selPacks)
			if (selTags && selTags.length) rows = rows.filter((m) => selTags.includes(String(m.tag || '').trim()))
			const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
			if (tokens.length) {
				rows = rows.filter((m) => {
					// 标签的中文显示也进 haystack:chip 上写的是「开心」,用户就会照着打「开心」,
					// 而库里存的是 happy(与情绪筛选同义,不会多出意外的结果)
					const hay = ((m.tag || '') + ' ' + tagZh(m.tag || '') + ' ' + (m.caption || '') + ' ' + (m.keywords || '') + ' ' + (m.file_name || '')).toLowerCase()
					return tokens.every((t) => hay.includes(t))
				})
			}
			return rows
		}

		function fitPanelHeight(natural, available, floor = 180, cap = Infinity) {
			const min = Number(floor) > 0 ? Number(floor) : 180
			const nat = Math.ceil(Number(natural) || 0)
			const room = Math.floor(Number(available) || 0)
			const top = Number(cap) > 0 ? Math.floor(Number(cap)) : Infinity
			return Math.max(min, Math.min(nat || min, room || min, top))
		}

		function naturalPanelHeight(panel) {
			const outer = Math.ceil(Number(panel.getBoundingClientRect().height) || 0)
			const grid = panel.querySelector('.mp-grid')
			if (!grid) return outer
			const hidden = Number(grid.scrollHeight) - Number(grid.clientHeight)
			return outer + (hidden > 0 ? Math.ceil(hidden) : 0)
		}

		function panelVisibleTop(top, bottom, probe) {
			const from = Math.ceil(Number(top) || 0)
			const to = Math.floor(Number(bottom) || 0)
			if (to <= from) return to
			if (probe(from)) return from // 面板顶边就没被挡
			if (!probe(to - 1)) return to // 整块都被挡
			let lo = from
			let hi = to - 1
			while (lo < hi) {
				const mid = Math.floor((lo + hi) / 2)
				if (probe(mid)) hi = mid
				else lo = mid + 1
			}
			return lo
		}

		function previewPosition(cell, size, viewport) {
			const w = Number(size && size.width) || 176
			const hh = Number(size && size.height) || 184
			const vw = Number(viewport && viewport.width) || 0
			const vh = Number(viewport && viewport.height) || 0
			let left = cell.right + 10
			if (vw && left + w > vw - 8) left = cell.left - 10 - w
			if (left < 8) left = 8
			let top = cell.top - 2
			const maxTop = Math.max(8, vh - hh - 8)
			if (top > maxTop) top = maxTop
			if (top < 8) top = 8
			return { left: Math.round(left), top: Math.round(top) }
		}

		function inKeepZone(zones, x, y, slack = 4) {
			for (const z of zones || []) {
				if (!z || z.right <= z.left || z.bottom <= z.top) continue
				if (x >= z.left - slack && x <= z.right + slack && y >= z.top - slack && y <= z.bottom + slack) return true
			}
			return false
		}

		function uniqueKeys(rows) {
			const seen = new Map()
			return rows.map((m) => {
				const base = String((m && (m.url || m.path)) || '')
				const n = (seen.get(base) || 0) + 1
				seen.set(base, n)
				return base + '#' + n
			})
		}

		function makeMemeStore() {
			let open = false
			const subs = new Set()
			return {
				get: () => open,
				set: (v) => { open = !!v; subs.forEach((fn) => fn()) },
				toggle: () => { open = !open; subs.forEach((fn) => fn()) },
				subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn) },
			}
		}

		function installMemeZoom(doc) {
			const d = doc || (typeof document === 'undefined' ? null : document)
			// 回归测试里那些只搭了必要部分的假 document 可能不给 addEventListener:那种环境
			// 直接不装 —— 真实宿主一定有。别为一个可选增强把整个 apply() 带崩。
			if (!d || typeof d.addEventListener !== 'function' || d.__dshMemeZoom) return () => {}
			d.__dshMemeZoom = true

			let box = null
			let pic = null
			let scale = 1

			const close = () => {
				if (!box) return
				box.style.display = 'none'
				scale = 1
				pic.style.transform = 'scale(1)'
			}

			const ensure = () => {
				if (box) return box
				box = d.createElement('div')
				box.setAttribute('data-meme-zoom', '1')
				box.style.cssText = 'position:fixed;inset:0;z-index:2150;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.78);backdrop-filter:blur(6px);cursor:zoom-out;padding:24px;box-sizing:border-box'
				pic = d.createElement('img')
				pic.setAttribute('data-meme-zoom-img', '1')
				pic.style.cssText = 'max-width:100%;max-height:100%;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);display:block;transition:transform .12s ease-out;transform-origin:center center'
				box.appendChild(pic)
				const tip = d.createElement('div')
				tip.textContent = L("滚轮缩放 · 双击复位 · Esc 或点背景关闭")
				tip.style.cssText = 'position:absolute;bottom:18px;left:0;right:0;text-align:center;color:rgba(255,255,255,.72);font-size:12px;pointer-events:none'
				box.appendChild(tip)
				box.addEventListener('click', (e) => { if (e.target === box) close() })
				box.addEventListener('wheel', (e) => {
					e.preventDefault()
					scale = Math.min(6, Math.max(.4, scale * (e.deltaY < 0 ? 1.15 : .87)))
					pic.style.transform = 'scale(' + scale + ')'
				}, { passive: false })
				box.addEventListener('dblclick', () => { scale = 1; pic.style.transform = 'scale(1)' })
				;(d.body || d.documentElement).appendChild(box)
				return box
			}

			const open = (url, alt) => {
				if (!url) return
				ensure()
				pic.src = url
				pic.alt = alt || ''
				scale = 1
				pic.style.transform = 'scale(1)'
				box.style.display = 'flex'
			}

			const onKeydown = (e) => { if (e.key === 'Escape') close() }
			const onClick = (e) => {
				const t = e.target
				if (!t || t.tagName !== 'IMG' || t === pic) return
				if (!t.closest || !t.closest('[data-chat-flow],[data-chat-flow-key]')) return
				e.preventDefault()
				e.stopPropagation()
				open(t.currentSrc || t.src, t.alt)
			}

			d.addEventListener('keydown', onKeydown, true)
			d.addEventListener('click', onClick, true)

			return () => {
				d.removeEventListener('keydown', onKeydown, true)
				d.removeEventListener('click', onClick, true)
				if (box && box.parentNode) box.parentNode.removeChild(box)
				box = null
				pic = null
				delete d.__dshMemeZoom
			}
		}

		function makeMemeButton(store) {
			return function MemeButton(props) {
				const open = React.useSyncExternalStore(store.subscribe, store.get)
				return React.createElement('button', {
					className: open ? 'meme-trigger active' : 'meme-trigger', 'data-pk-memes': '',
					title: L("表情包"),
					onClick: (e) => {
						e.preventDefault(); e.stopPropagation()
						store.toggle()
					},
				}, React.createElement('svg', { viewBox: '0 0 24 24', width: 20, height: 20, style: { display: 'block' } },
					// Material 标准笑脸,currentColor 跟随主题
					React.createElement('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z', fill: 'currentColor' }),
				))
			}
		}

		function MemeBoard(props) {
			const h = React.createElement
			const store = props.store
			const actions = props.inputActions
			// 草稿要从宿主实时读:本 slot 的 props 只有 inputActions 加 hooks 派生的 useInput
			// (宿主输入栏就是 useInput((s) => s)),没有 props.input;读不存在的属性不报错,
			// 只会静默拿到 undefined —— 别再回头去读 props.input.draft。
			// 拿不到钩子(宿主侧改动)时兜底为空串,即修复前的行为,不因此崩。
			const useLiveInput = typeof props.useInput === 'function' ? props.useInput : (() => null)
			const inputState = useLiveInput((s) => s)
			const open = React.useSyncExternalStore(store.subscribe, store.get)
			const [data, setData] = React.useState(() => pickerCache || { packs: [], memes: [] })
			const [loaded, setLoaded] = React.useState(!!pickerCache)
			const [q, setQ] = React.useState('')
			const [selPacks, setSelPacks] = React.useState([]) // 空 = 不筛:全部图库
			const [selTags, setSelTags] = React.useState([])   // 空 = 不筛:全部情绪
			const [showFilters, setShowFilters] = React.useState(() => pickerFiltersOpen) // 筛选区展开状态(默认收起)
			const [hover, setHover] = React.useState(null)     // 悬浮预览:{ meme, cellRect }
			// 网格一次只铺一批:全铺就是上千节点 + 上千图片请求。滚到底再加一批,筛选变了就回到第一批。
			const [shownCount, setShownCount] = React.useState(PICKER_PAGE)
			React.useEffect(() => { setShownCount(PICKER_PAGE) }, [q, selPacks, selTags])
			const panelRef = React.useRef(null)
			const previewRef = React.useRef(null)
			const keepRef = React.useRef(null) // 预览停留区 [格子矩形, 预览框矩形],pointermove 判「还在不在」
			const topLimitRef = React.useRef(null) // { limit, nat }:宿主顶栏下沿 + 量它时的自然高度(作失效键)

			// 打开时拉全量(packId=all,带包前缀 url):多选筛选和情绪计数都要全量数据。
			// 本机 5 个图库 1645 张约 0.3s / 454KB,换来「跨图库找图不用来回切」;
			// 上一次的结果先顶上渲染,后台再刷新。
			React.useEffect(() => {
				if (!open) return
				let alive = true
				const revision = memeLibraryRevision
				fetch('/persona-kit/memes-api?packId=all')
					.then((r) => r.json())
					.then((res) => {
						if (!alive || revision !== memeLibraryRevision || !res || !res.ok) return
						const next = {
							packs: Array.isArray(res.packs) ? res.packs : [],
							memes: Array.isArray(res.memes) ? res.memes : [],
						}
						pickerCache = next
						// 打开面板也同步索引:其它页面或 AI 学图带来的变化无需刷新整个页面。
						for (const listener of memeIndexListeners) listener(next.memes)
						setData(next)
						setLoaded(true)
					})
					.catch(() => {})
				return () => { alive = false }
			}, [open])

			// 点外部(非面板、非 😊 按钮)自动收起。
			React.useEffect(() => {
				if (!open) return
				const onDown = (e) => {
					const t = e && e.target
					if (t && t.closest && !t.closest('[data-pk-memes].meme-picker') && !t.closest('[data-pk-memes].meme-trigger')) {
						store.set(false)
					}
				}
				document.addEventListener('pointerdown', onDown)
				return () => document.removeEventListener('pointerdown', onDown)
			}, [open])

			const viewport = (what) => {
				try {
					const root = document.documentElement
					const v = what === 'w' ? root.clientWidth : root.clientHeight
					return v || (what === 'w' ? window.innerWidth : window.innerHeight) || 0
				} catch (e) { return 0 }
			}

			// 悬浮预览定位:默认浮在格子右侧,右侧放不下翻到左侧;垂直按实测的预览高度钳制 ——
			// 面板 overflow:hidden,最下面一排不钳制就会被裁掉。算完把「格子 ∪ 预览框」记成停留区:
			// 指针从格子挪到大图上不能闪掉,钳制改了位置也要同步更新,否则会被误判成「已经离开」。
			const placePreview = () => {
				const el = previewRef.current
				if (!hover || !el || !hover.cellRect) { keepRef.current = null; return }
				try {
					const rect = el.getBoundingClientRect()
					const pos = previewPosition(hover.cellRect, rect, { width: viewport('w'), height: viewport('h') })
					el.style.left = pos.left + 'px'
					el.style.top = pos.top + 'px'
					keepRef.current = [hover.cellRect, el.getBoundingClientRect()]
				} catch (e) { keepRef.current = null }
			}
			const useLayout = typeof React.useLayoutEffect === 'function' ? React.useLayoutEffect : React.useEffect
			// 预览的关闭时机:指针离开「当前格子 ∪ 预览框」就关(4px 容差),分三处兜住 ——
			// ① 离开格子:pointerleave 里按停留区判(指针挪到探出面板的大图上时不能误关);
			//    「从格子 A 直接滑到格子 B」时 DOM 事件顺序是 leave(A) → enter(B),B 的那次
			//    setHover 在后、同一批里胜出,所以不会闪。
			// ② 停在探出去的预览上继续往外滑:面板收不到 pointermove(指针已经在面板外),所以
			//    监听挂 document;落在格子上时交给 ①(否则会跟 enter 抢着清掉预览)。
			// ③ 指针整个离开窗口:document 的 pointerleave。
			useLayout(() => {
				placePreview()
				if (!hover) return
				const onMove = (e) => {
					const t = e.target
					if (t && t.closest && t.closest('.mp-cell')) return
					if (!inKeepZone(keepRef.current, e.clientX, e.clientY)) setHover(null)
				}
				const onLeave = () => setHover(null)
				document.addEventListener('pointermove', onMove)
				document.addEventListener('pointerleave', onLeave)
				return () => {
					document.removeEventListener('pointermove', onMove)
					document.removeEventListener('pointerleave', onLeave)
				}
			}, [hover])

			// 量「宿主顶栏下沿」:面板得先真的长到那个位置才量得出来,所以先把 max-height 放到「底边到
			// 窗口顶」摆一次(有限值 —— 不是 none),再从面板顶往下命中测试。测完原样还回去。
			//
			// 两个坑都踩过:① 量到的一半是「加载中」时的矮面板(那时顶栏根本没挡到它),这个值必须
			// 跟着内容失效,否则网格出来以后还拿旧值算,面板被压到最小高度;所以缓存按自然高度作键。
			// ② 这一放一收会改网格的可用高度、把 grid.scrollTop 夹掉(和 #33 同一个坑),量完写回。
			const measureTopLimit = (panel, bottom, nat) => {
				const grid = panel.querySelector('.mp-grid')
				const keep = grid ? grid.scrollTop : 0
				let limit = 16
				try {
					const prev = panel.style.maxHeight
					panel.style.maxHeight = Math.max(0, bottom - 16) + 'px'
					const box = panel.getBoundingClientRect()
					const x = Math.round(box.left + Math.min(box.width / 2, 80))
					const probe = (y) => {
						const el = document.elementFromPoint(x, y)
						return !!(el && panel.contains(el))
					}
					const visibleTop = panelVisibleTop(box.top, bottom, probe)
					// 被挡住时可见起点就是顶栏下沿,再往下留 PICKER_TOP_GAP 的呼吸间距;没被挡
					// (可见起点就是面板自己的顶边)就不加,否则面板会白白矮一截、还永远长不回来。
					limit = Math.max(16, visibleTop > box.top ? visibleTop + PICKER_TOP_GAP : visibleTop)
					panel.style.maxHeight = prev
				} catch (e) { limit = 16 } // 量不出来就退回「只留窗口边距」的老行为
				if (grid && grid.scrollTop !== keep) grid.scrollTop = keep
				topLimitRef.current = { limit, nat }
				return limit
			}

			// 面板高度自适应:头/筛选不收缩,只有网格内部滚动。自然高度 = 当前高度 + 网格藏起来的那截
			// (见 naturalPanelHeight —— 不再靠撤 max-height 去量,那会把滚动位置夹掉);可用高度 =
			// 实测底边到「宿主顶栏下沿」(见 topLimit,顶栏会盖在面板上面)。取小就是最终高度。
			const fitPanel = () => {
				try {
					const panel = panelRef.current
						|| (typeof document.querySelector === 'function' ? document.querySelector('[data-pk-memes].meme-picker') : null)
					if (!panel) return
					const nat = naturalPanelHeight(panel)
					const bottom = Math.floor(panel.getBoundingClientRect().bottom)
					const cached = topLimitRef.current
					const limit = cached && cached.nat === nat ? cached.limit : measureTopLimit(panel, bottom, nat)
					const avail = Math.floor(bottom - limit)
					const cap = Math.floor(viewport('h') * PICKER_MAX_VH)
					const finalH = fitPanelHeight(nat, avail, 180, cap)
					// 判断依据必须是「这个节点当前的内联高度」,不能用跨挂载记的 ref(历史 bug:
					// 关掉面板再打开,新节点没有内联 max-height、却因为 ref 记着同一个数值被判成
					// 「不用改」,于是回退到 CSS 默认的 46vh —— 表现就是反复点笑脸高度会变,
					// 而且窗口越高差得越多)。这样写是幂等的:值一样就不写,写过的节点也不会重复改。
					const want = finalH + 'px'
					if (panel.style.maxHeight !== want) panel.style.maxHeight = want
					// 排查用现场记录:控制台里一眼看出「新代码有没有加载 / 算出什么」
					panel.setAttribute('data-meme-picker-fit', 'nat=' + nat + ' avail=' + avail + ' h=' + finalH + ' top=' + limit)
				} catch (e) { /* 纯增强:算不出来就退回 CSS 的 46vh,不能影响面板本身 */ }
			}
			// The overlay slot has no positioned ancestor to hang an absolute panel from, so the panel anchors to the
			// viewport, sitting just above the composer. Without this the 😊 button toggled state but nothing showed.
			const placePicker = () => {
				try {
					const panel = panelRef.current
					if (!panel) return
					const input = composerInput()
					const vw = viewport('w'), vh = viewport('h')
					const width = Math.min(480, Math.round(vw * 0.92))
					panel.style.width = width + 'px'
					let left = 8, bottom = 96
					if (input) {
						const r = input.getBoundingClientRect()
						left = Math.max(8, Math.min(r.left, vw - width - 8))
						bottom = Math.max(8, Math.round(vh - r.top + 8))
					}
					panel.style.left = Math.round(left) + 'px'
					panel.style.bottom = Math.round(bottom) + 'px'
					panel.setAttribute('data-pk-placed', '1')
				} catch (e) { /* 纯增强:算不出来就交给 CSS,不能影响面板本身 */ }
			}
			useLayout(() => { if (open) { placePicker(); fitPanel() } })

			React.useEffect(() => {
				if (!open) return
				// 几何变了(窗口 / 宿主容器 / 输入框高):顶栏下沿要重量,别拿旧值
				const onResize = () => { topLimitRef.current = null; placePicker(); fitPanel() }
				const win = typeof window !== 'undefined' ? window : null
				if (win && typeof win.addEventListener === 'function') win.addEventListener('resize', onResize)
				let ro = null
				try {
					// 输入框变高(打多行)时宿主容器跟着变 → 面板跟着收紧
					if (typeof ResizeObserver === 'function' && panelRef.current && panelRef.current.parentElement) {
						ro = new ResizeObserver(onResize)
						ro.observe(panelRef.current.parentElement)
					}
				} catch (e) { ro = null }
				return () => {
					if (win && typeof win.removeEventListener === 'function') win.removeEventListener('resize', onResize)
					if (ro) ro.disconnect()
				}
			}, [open])

			if (!open) return null

			// 点击:发 [表情: 描述] 文本,前端按描述配图。
			const send = async (m) => {
				if (!m) return
				// 纯文本:[表情: 描述] —— 模型只看到文字;前端按描述配图。
				const setText = (text) => { try { if (actions && actions.setDraft) actions.setDraft(text) } catch (e) {} }
				const desc = (m.caption || m.keywords || m.tag || L("表情")).slice(0, 80)
				const text = '[' + MEME_WORD + ': ' + desc + ']'
				const cur = inputState && typeof inputState.draft === 'string' ? inputState.draft : ''
				setText(cur.trim() ? cur + '\n' + text : text)
				try { if (actions && actions.submit) actions.submit() } catch (e) {}
				store.set(false)
			}

			// 多选 chip:点一下选中(只看它),再点取消;一个都不选 = 不筛
			const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : list.concat([id]))
			const clearAll = () => { setQ(''); setSelPacks([]); setSelTags([]) }
			const hasFilter = !!(q.trim() || selPacks.length || selTags.length)
			const selCount = selPacks.length + selTags.length
			// 展开状态记到模块级:面板关掉再打开不用重新展开(同一页面会话内)
			const toggleFilters = () => { const next = !showFilters; pickerFiltersOpen = next; setShowFilters(next) }

			const tagCounts = pickerTagCounts(data.memes, selPacks)
			const rows = pickerFilter(data.memes, selPacks, selTags, q)
			const cells = rows.slice(0, shownCount)
			const packCounts = (() => {
				const m = new Map()
				for (const row of data.memes) {
					const pid = packOfUrl(row.url)
					if (pid) m.set(pid, (m.get(pid) || 0) + 1)
				}
				return m
			})()
			const packChips = data.packs
				.map((p) => ({ id: p.id, name: p.name || p.id, count: packCounts.get(p.id) || p.count || 0 }))
				.filter((p) => p.count > 0)

			const gridCellKeys = uniqueKeys(cells)
			const gridCells = cells.map((m, i) => h('div', {
				key: gridCellKeys[i],
				className: 'mp-cell',
				// 刻意不给 title:原生 tooltip 要等一会儿才冒出来,正好压在悬浮预览上面,两个提示重着显示
				// (描述、文件名预览里都有,不用再来一份)
				onClick: () => send(m),
				onPointerEnter: (e) => {
					try { setHover({ meme: m, cellRect: e.currentTarget.getBoundingClientRect() }) } catch (err) { setHover(null) }
				},
				// 离开格子:只有指针既不在格子里、也不在预览框里(见上面的停留区)才关
				onPointerLeave: (e) => {
					if (!inKeepZone(keepRef.current, e.clientX, e.clientY)) setHover(null)
				},
				style: { backgroundImage: 'url("' + memeUrlOf(m.url, m.path) + '")' },
			}))

			return h('div', {
				className: 'meme-picker', 'data-pk-memes': '',
				ref: panelRef,
				'data-meme-picker': '1',
				onClick: (e) => e.stopPropagation(),
				// 滚动后格子的屏幕位置就不对了,预览跟着清掉(关闭时机见上面的 layout effect)
				onWheel: () => setHover(null),
			},
				h('div', { className: 'mp-head' },
					h('input', {
						type: 'text', className: 'mp-search', value: q,
						placeholder: L("搜索描述 / 关键词…"),
						onChange: (e) => setQ(e.target.value),
						onKeyDown: (e) => { if (e.key === 'Escape') { setQ(''); if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur() } },
					}),
					hasFilter ? h('button', { type: 'button', className: 'mp-clear', onClick: clearAll }, L("清空")) : null,
					// 筛选区默认收起(图库一多两排 chip 能吃掉大半个面板);有选中的筛选就显示选了几个,免得收起时看不出来
					h('button', {
						type: 'button',
						className: 'mp-tag mp-toggle' + (selCount ? ' on' : ''),
						title: showFilters ? L("收起筛选") : L("展开筛选(按图库 / 情绪挑图)"),
						'aria-expanded': showFilters ? 'true' : 'false',
						onClick: toggleFilters,
					}, L("筛选") + (selCount ? ' ' + selCount : ''), h('span', { className: 'caret' }, showFilters ? '▲' : '▼')),
					h('span', { className: 'mp-count' }, L("共 ") + rows.length + L(" 张")),
				),
				// 两排多选 chip:都不选 = 不筛。情绪只列当前图库范围内真实存在的,按数量降序带计数。
				// 收起时不渲染(而不是 display:none):省掉几十个 chip 的节点与重排。
				showFilters
					? h('div', { className: 'mp-filters' },
						packChips.length
							? h('div', { className: 'mp-filter-row' },
								h('span', { className: 'mp-filter-label' }, L("图库")),
								packChips.map((p) => h('button', {
									type: 'button', key: p.id,
									className: 'mp-tag' + (selPacks.includes(p.id) ? ' on' : ''),
									title: L("点一下只看这个图库;再点取消。都不点 = 全部图库"),
									onClick: () => toggle(selPacks, setSelPacks, p.id),
								}, p.name, h('span', { className: 'n' }, String(p.count)))),
							)
							: null,
						tagCounts.length
							? h('div', { className: 'mp-filter-row' },
								h('span', { className: 'mp-filter-label' }, L("情绪")),
								tagCounts.map((t) => h('button', {
									type: 'button', key: t.tag,
									className: 'mp-tag' + (selTags.includes(t.tag) ? ' on' : ''),
									title: L("点一下只看这个情绪;再点取消。都不点 = 全部情绪"),
									onClick: () => toggle(selTags, setSelTags, t.tag),
								}, tagZh(t.tag), h('span', { className: 'n' }, String(t.count)))),
							)
							: null,
					)
					: null,
				data.memes.length === 0
					? h('div', { className: 'mp-empty' }, loaded ? L("还没有可发的表情包") : L("加载中…"))
					: (rows.length === 0
						? h('div', { className: 'mp-empty' }, L("没有匹配的表情包"))
						: h('div', {
							className: 'mp-grid',
							// 滚到接近底部就再铺一批:一次全铺太贵,但不该拿一堵看不见的墙挡用户。
							onScroll: (e) => {
								const g = e.currentTarget
								if (!g || rows.length <= cells.length) return
								if (g.scrollTop + g.clientHeight >= g.scrollHeight - 120) setShownCount(cells.length + PICKER_PAGE)
							},
						}, gridCells)),
				rows.length > cells.length
					? h('button', {
						type: 'button',
						className: 'mp-hint mp-more',
						onClick: () => setShownCount(cells.length + PICKER_PAGE),
					},
						L("已显示 {a} / {b} 张 —— 点这里或往下滑看剩下的", { a: cells.length, b: rows.length }))
					: null,
				// 悬浮预览:大图(contain 不裁切)+ 情绪 + 描述 + 文件名;pointer-events:none 不挡点击
				hover ? h('div', {
					className: 'mp-hover', ref: previewRef,
					style: {
						left: (hover.cellRect ? hover.cellRect.right + 10 : 0) + 'px',
						top: (hover.cellRect ? hover.cellRect.top - 2 : 0) + 'px',
					},
				},
					h('div', { className: 'mp-hover-img', style: { backgroundImage: 'url("' + memeUrlOf(hover.meme.url, hover.meme.path) + '")' } }),
					hover.meme.tag ? h('span', { className: 'mp-hover-tag' }, tagZh(hover.meme.tag)) : null,
					h('div', { className: 'mp-hover-cap' }, hover.meme.caption || hover.meme.file_name),
					hover.meme.caption ? h('div', { className: 'mp-hover-file' }, hover.meme.file_name) : null,
				) : null,
			)
		}

		const foldCaption = (s) => String(s || '').trim()
			.replace(/[\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f«»]/g, '"')
			.replace(/\s+/g, ' ')
		const looseCaption = (s) => foldCaption(s).replace(/["'\s]/g, '')
		// 描述里按中英文标点切词,长词优先(两字以下太泛,不参与匹配)。
		const splitDescTokens = (s) => foldCaption(s)
			.split(/[\s,.!?;:、，。！？；：""''()（）\[\]【】《》…·～~\-]+/)
			.map((t) => t.replace(/["']/g, ''))
			.filter((t) => t.length >= 2)
			.sort((a, b) => b.length - a.length)
		// 分词兜底的 haystack:caption/关键词/文件名的折叠与紧凑形态 + 分词。
		const buildMemeSearch = (rows, toUrl) => (rows || []).map((row) => {
			const hay = []
			const parts = []
			for (const s of [row.caption, row.keywords, row.file_name]) {
				const f = foldCaption(s)
				if (!f) continue
				const l = looseCaption(s)
				hay.push(f, ...(l && l !== f ? [l] : []))
				parts.push(s)
			}
			const tokens = [...new Set(splitDescTokens(parts.join(' ')))]
			return { hay, tokens, url: toUrl(row) }
		})
		// 组合匹配:精确(原文/折叠/紧凑三级)→ 分词在 caption/关键词里双向包含。
		const matchDesc = (desc, index, search) => {
			if (index) {
				const raw = String(desc || '').trim()
				const exact = index.get(raw) || index.get(foldCaption(raw)) || index.get(looseCaption(raw))
				if (exact) return exact
			}
			const needles = [...new Set(splitDescTokens(desc).map(looseCaption).filter(Boolean))]
			let best = null
			let bestLength = 0
			let bestCount = 0
			for (const row of search || []) {
				let longest = 0
				let count = 0
				for (const needle of needles) {
					let length = row.hay.some((hay) => hay.includes(needle)) ? needle.length : 0
					for (const token of row.tokens || []) {
						const t = looseCaption(token)
						if (t && (needle.includes(t) || t.includes(needle))) length = Math.max(length, Math.min(needle.length, t.length))
					}
					if (length) { longest = Math.max(longest, length); count++ }
				}
				if (longest > bestLength || (longest === bestLength && count > bestCount)) {
					best = row.url
					bestLength = longest
					bestCount = count
				}
			}
			return best
		}


			const MEME_TEXT_RE = /\[表情:\s*([^\]]+)\](?:\((https?:\/\/[^\s)]+)\))?/g
			// acceptNode 用不带 g 的副本。带 g 的正则 test() 会推进 lastIndex,下一个文本节点从
			// 上次的位置往后找——于是「这一条运气不好」的消息被静默跳过、永远不出图,还得等下一轮
			// 扫描碰巧把游标绕回 0(历史 bug:表现就是「表情有时显示不出来」)。
			const MEME_TEXT_TEST = /\[表情:\s*([^\]]+)\](?:\((https?:\/\/[^\s)]+)\))?/
			let memeIndex = null
			let memeSearch = [] // 分词兜底用的 haystack:[{hay:[...], url}]
			let memeIndexLoading = false
			let memeIndexRetryAfter = 0 // 失败后的冷却截止时刻(ms):冷却期内不再发请求
			let memeIndexAttempts = 0
			let memeIndexWarned = false
			let memeIndexGeneration = 0
			let memeIndexController = null
			let disposed = false
			// 索引拉取失败必须保持「可重试」状态。早先失败会往 memeIndex 写一个空 Map 兜底,
			// 而入口守卫是 `if (memeIndex || memeIndexLoading) return`——空 Map 也是真值,
			// 于是这个会话剩下的 [表情: x] 全部退化成描述文字,无报错、无提示,只能靠刷新恢复。
			// 现在失败就保持 null:之后再扫描到未装饰的 [表情: x] 会自然重试(指数退避,
			// 后端起来了自愈)。不另起定时器——扫描本身就是触发点,少一个要清理的生命周期。
			const MEME_INDEX_TIMEOUT = 15000
			const MEME_INDEX_RETRY_BASE = 2000
			const MEME_INDEX_RETRY_MAX = 30000
			const absMemeUrl = (u, path) => {
				if (u && /^https?:\/\//.test(u)) return u
				// Rows come back as "<pack>/memes/<tag>/<file>" and every one of them is served under this
				// plugin's prefix — a bare relative string would resolve against the site root and 404.
				const tail = String(u || path || '').replace(/^\//, '')
				if (!tail) return ''
				const rel = API + '/memes/' + tail
				try { return new URL(rel, window.location.origin).href } catch (e) { return rel }
			}
			const addCaptionKey = (map, key, url) => {
				const raw = String(key || '').trim()
				if (!raw) return
				map.set(raw, url)
				map.set(foldCaption(raw), url)
				const loose = looseCaption(raw)
				if (loose) map.set(loose, url)
			}
			const findMemeUrl = (desc) => matchDesc(desc, memeIndex, memeSearch)
			const setMemeIndex = (rows) => {
				const next = new Map()
				for (const row of rows) {
					const url = absMemeUrl(row.url, row.path)
					addCaptionKey(next, row.caption, url)
					addCaptionKey(next, row.file_name, url)
					addCaptionKey(next, row.keywords, url)
					addCaptionKey(next, String(row.caption || '').slice(0, 80), url)
					addCaptionKey(next, String(row.caption || '').slice(0, 100), url)
				}
				memeIndex = next
				memeSearch = buildMemeSearch(rows, (row) => absMemeUrl(row.url, row.path))
				memeIndexAttempts = 0
				memeIndexRetryAfter = 0
				decorateMemeText()
			}
			const loadMemeIndex = () => {
				if (disposed || memeIndex || memeIndexLoading) return
				if (Date.now() < memeIndexRetryAfter) return // 冷却中:上一次失败还没到重试时刻
				memeIndexLoading = true
				memeIndexAttempts++
				// fetch 挂起(既不 resolve 也不 reject)时连 catch 都不走,超时自己 abort 兜底
				const controller = typeof AbortController === 'function' ? new AbortController() : null
				memeIndexController = controller
				const generation = memeIndexGeneration
				const timeoutTimer = controller ? setTimeout(() => controller.abort(), MEME_INDEX_TIMEOUT) : 0
				// 拉全部包(带包前缀 URL),任意组的 [表情: 描述] 都能配图
				fetch('/persona-kit/memes-api?packId=all', controller ? { signal: controller.signal } : undefined)
					.then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
					.then((res) => {
						if (disposed || generation !== memeIndexGeneration) return
						if (!res || !res.ok || !Array.isArray(res.memes)) throw new Error('invalid meme index response')
						setMemeIndex(res.memes)
					})
					.catch((error) => {
						if (disposed || generation !== memeIndexGeneration) return
						// 失败保持 null(下次扫描还能重试),退避到下次重试时刻;提示只打一次,别刷屏
						const backoff = Math.min(MEME_INDEX_RETRY_MAX, MEME_INDEX_RETRY_BASE * Math.pow(2, Math.max(0, memeIndexAttempts - 1)))
						memeIndexRetryAfter = Date.now() + backoff
						if (!memeIndexWarned) {
							memeIndexWarned = true
							console.warn('[dsh-persona-kit] meme index failed, retrying in' + Math.round(backoff / 1000) + 's before the next try:', error && error.message ? error.message : error)
						}
					})
					.finally(() => {
						if (timeoutTimer) clearTimeout(timeoutTimer)
						if (generation === memeIndexGeneration) {
							memeIndexLoading = false
							memeIndexController = null
						}
					})
			}
			const refreshMemeIndex = (rows) => {
				if (disposed) return
				memeIndexGeneration++
				if (memeIndexController) memeIndexController.abort()
				memeIndexController = null
				memeIndexLoading = false
				memeIndex = null
				memeSearch = []
				memeIndexAttempts = 0
				memeIndexRetryAfter = 0
				if (Array.isArray(rows)) setMemeIndex(rows)
				else loadMemeIndex()
			}
			memeIndexListeners.add(refreshMemeIndex)
			// 把 [表情: x] 换成 <img> 之后,气泡里的 textContent 就变了。有些插件(注入记忆条那类)
			// 靠比对 textContent 判断「消息被改过」,于是重写 DOM → img 被打回文字 → 我们再装饰,
			// 来回打回闪个不停(issue #22 第 2 条)。所以每处替换都在 img 后面挂一个 display:none
			// 的 ghost span 装回原文标记:整段 textContent 与替换前逐字一致,谁来比都不觉得变过。
			const ghostFor = (raw) => {
				const ghost = document.createElement('span')
				ghost.setAttribute('data-meme-hidden', '1')
				ghost.style.cssText = 'display:none'
				ghost.textContent = raw
				return ghost
			}
			// 判断「这层是不是已经空了、要不要隐藏」必须无视 ghost:ghost 里装着原文标记,
			// 拿 textContent 判空会永远非空,气泡里会留一块空白。
			const textWithoutGhosts = (el) => {
				let out = ''
				for (const child of el.childNodes) {
					if (child.nodeType === 3) { out += child.nodeValue || ''; continue }
					if (child.nodeType !== 1) continue
					if (child.dataset && child.dataset.memeHidden) continue
					out += textWithoutGhosts(child)
				}
				return out
			}
			// 流式渲染会覆盖我们的注入,同一个 [表情: x] 可能被装饰两次 → 同一消息行挂两张相同的图
			// (issue #22 第 3 条:刷新后稳态只剩一张,说明是竞态而不是双注入)。按「消息行 + 描述」
			// 幂等去重:没有重复时零副作用,所以每轮扫描完无脑跑一次就行。
			const dedupeMemeImages = () => {
				const seenByRow = new Map()
				for (const img of document.querySelectorAll('img[data-meme-img]')) {
					const row = img.closest('[data-time-hover-root],[data-chat-flow-key]') || img.parentElement
					if (!row) continue
					let seen = seenByRow.get(row)
					if (!seen) seenByRow.set(row, seen = new Set())
					const caption = img.getAttribute('data-meme-img') || ''
					if (seen.has(caption)) { img.remove(); continue } // 留先出现的那张(已被提到行首的)
					seen.add(caption)
				}
			}
			// ---- 本地补丁(2026-10-20):增量扫描配套 ----
			// 文字节点该不该被装饰:判据与原 acceptNode 完全一致(增量扫描复用同一套,
			// 免得两条路径行为分叉)。
			const memeTextAcceptable = (node) => {
				const parent = node.parentElement
				if (!parent) return false
				// 只渲染「对话」气泡。轨迹 / Think / 工具卡 / 输入框保持纯文本。
				// 容器标记认两个:老版本是 data-chat-flow,DSH 0.1.2 起消息行是 data-chat-flow-key
				// (issue #22 附录,使用者在新版上实测)。只认前者的话新版上 TreeWalker 一个节点都
				// 扫不到、表情永不转图;多认一个纯增益。
				const flowEl = parent.closest('[data-chat-flow],[data-chat-flow-key]')
				if (!flowEl) return false
				if (parent.closest('input,textarea,[contenteditable="true"],[data-variant="think"],[data-variant="others"],pre,code')) {
					return false
				}
				// 自己的 ghost 里装着 [表情: x] 原文,不排掉就会被反复装饰
				if (parent.closest('[data-meme-hidden]')) return false
				if (parent.dataset && parent.dataset.memeDecorated) return false
				// 0.2 宿主(dsh-client-ui-chat 0.2.0-rc.2)源码核对:① 工具/步骤轨迹整行是
				// data-chat-flow-kind="turn-process",宿主自己枚举行时也排除它,不排的话新版上
				// 轨迹文本会被装饰;② 分组折叠容器 ChatGroupSeat 的根上同时挂着
				// data-chat-group-key 和 data-chat-flow-key,分组头部文本最近命中的是分组本身,
				// 放行会把图提到分组顶上。消息行(FlowItem)只有 flow-key,不受影响。两个标记
				// 老版宿主都没有,加了纯增益。
				if (parent.closest('[data-chat-flow-kind="turn-process"]')) return false
				if (flowEl.getAttribute('data-chat-group-key') !== null) return false
				return MEME_TEXT_TEST.test(node.nodeValue || '')
			}
			// 清理孤儿标记与隐藏残留:scope 为元素时只清它自己和它的后代,为 null 时清全文档。
			// 返回「标记被清掉、需要重新装饰」的元素列表。
			const cleanupMemeMarkers = (scope) => {
				const root = scope && scope.nodeType === 1 ? scope : null
				const list = []
				if (root) {
					if (root.dataset && (root.dataset.memeDecorated || root.dataset.memeEmpty)) list.push(root)
					for (const el of root.querySelectorAll('[data-meme-decorated],[data-meme-empty]')) list.push(el)
				} else {
					for (const el of document.querySelectorAll('[data-meme-decorated],[data-meme-empty]')) list.push(el)
				}
				const revived = []
				for (const el of list) {
					if (!el.querySelector('img[data-meme-img],[data-meme-hidden]')) {
						if (el.dataset.memeDecorated) revived.push(el)
						delete el.dataset.memeDecorated
					}
					if (el.dataset.memeEmpty && textWithoutGhosts(el).trim()) {
						delete el.dataset.memeEmpty
						el.style.display = ''
					}
				}
				return revived
			}
			// 装饰一批文本节点:全量扫描与增量扫描共用同一段装饰逻辑。
			// forceDedupe=true(全量路径)照旧每轮去重;增量路径只在真的装饰了东西时才去重。
			const decorateMemeNodes = (nodes, forceDedupe) => {
				let decoratedAny = false
				for (const node of nodes) {
					const parent = node.parentElement
					if (!parent || parent.dataset.memeDecorated) continue
					const text = node.nodeValue || ''
					MEME_TEXT_RE.lastIndex = 0
					const matches = []
					let m
					while ((m = MEME_TEXT_RE.exec(text))) matches.push(m)
					if (matches.length === 0) continue
					const needsLookup = matches.some((hit) => !hit[2])
					if (needsLookup && !memeIndex) {
						loadMemeIndex()
						continue
					}
					parent.dataset.memeDecorated = '1'
					decoratedAny = true
					const frag = document.createDocumentFragment()
					const imgs = []
					let last = 0
					for (const hit of matches) {
						if (hit.index > last) frag.appendChild(document.createTextNode(text.slice(last, hit.index)))
						const src = hit[2] || findMemeUrl(hit[1])
						if (src) {
							const img = document.createElement('img')
							img.src = src
							img.alt = hit[0].slice(0, 60)
							img.title = hit[0].slice(0, 60)
							img.dataset.memeImg = foldCaption(hit[1]) // 去重用的描述标记
							img.style.cssText = 'max-width:180px;max-height:180px;border-radius:10px;display:block;margin:8px 0'
							frag.appendChild(img)
							frag.appendChild(ghostFor(hit[0]))
							imgs.push(img)
						} else {
							// 无命中:降级只显示描述原文,不把 [表情: ...] 标记裸露给用户。方括号单独用 ghost
							// 藏起来——可见的只有描述本身,而 textContent 仍是替换前那个 [表情: x] 逐字不差,
							// 否则比对 textContent 的插件照样会把这条打回(issue #22 第 2 条)。
							const at = hit[0].indexOf(']') - hit[1].length
							frag.appendChild(ghostFor(hit[0].slice(0, at)))
							frag.appendChild(document.createTextNode(hit[1]))
							frag.appendChild(ghostFor(hit[0].slice(at + hit[1].length)))
						}
						last = hit.index + hit[0].length
					}
					if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
					parent.replaceChild(frag, node)
					const row = parent.closest('[data-time-hover-root],[data-chat-flow-key]')
					if (row && imgs.length > 0) {
						// 用户 / steering 消息是右对齐的,但那个右对齐挂在气泡外面那层 flex 列容器
						// (宿主 MessageItem 的 userRow,align-items:flex-end)上;而这里为了掏空气泡把图
						// 提到了行元素(FlowItem,只是个普通 block)的行首,block 图落在 block 容器里默认
						// 贴左 → 自己发的表情包跑到屏幕左边(助手行本来就左对齐,一直看不出来)。按行角色
						// 补一次左外边距 auto 把图推回右边。data-chat-flow-kind 是 0.2 宿主才有的标记,
						// 老宿主取不到,行为保持原样。
						const kind = row.getAttribute('data-chat-flow-kind')
						if (kind === 'user' || kind === 'steering') {
							for (const img of imgs) img.style.marginLeft = 'auto'
						}
						for (const img of imgs) row.insertBefore(img, row.firstChild)
						// 中间层被掏空才隐藏,并打 memeEmpty 标记(回显逻辑见函数开头的清理段)
						let el = parent
						while (el && el !== row) {
							if (!textWithoutGhosts(el).trim()) {
								el.style.display = 'none'
								el.dataset.memeEmpty = '1'
							}
							el = el.parentElement
						}
					}
				}
				if (forceDedupe || decoratedAny) dedupeMemeImages()
				return decoratedAny
			}
			const decorateMemeText = () => {
				// 宿主重渲染(切语言/切主题/HMR)会让 React 对纯文本 children 走 textContent 覆写:
				// 注入的 img 和 ghost 一起被抹掉、原文裸露,而 data-meme-decorated 在元素属性上,
				// 覆写不影响它 → 标记还在、注入已不在,下面的 acceptNode 见标记就永久跳过,图再也
				// 回不来,刷新页面才恢复(issue #26)。每轮扫描先摘孤儿标记:注入 = img + ghost,
				// 两个都不在了才认孤儿;降级装饰(图库未命中、只有 ghost)不能动,否则每轮扫描都在
				// 白白重写这段 DOM。摘完标记本轮就会重新装饰;上一轮幸存的同描述图由 dedupeMemeImages 去重。
				// 同一轮顺带处理「隐藏残留」:hide walk 只藏不露,React 之后往同一个元素写回可见文本
				// (流式追加/编辑消息)时元素还带着 display:none,内容会永久不可见——按「现在有没有
				// 可见文本」翻回来,只动打过 data-meme-empty 标记的,宿主自己隐藏的元素不碰。
				cleanupMemeMarkers(null)
				const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
					acceptNode(node) {
						return memeTextAcceptable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
					},
				})
				const nodes = []
				let n
				while ((n = walker.nextNode())) nodes.push(n)
				decorateMemeNodes(nodes, true)
			}
			// 设置侧边栏「表情包」行的齿轮图标替换成笑脸(dsh navIcon 硬编码,不支持自定义)
			// 扫描是「全文档 TreeWalker + 每个文本节点跑一遍正则」,不便宜;流式输出期间
			// mutation 密集,每来一条就整篇扫一遍会在长会话里雪崩(点进去明显卡顿)。
			// 防抖 300ms,但必须有 maxWait 兜底:纯 trailing 防抖在 mutation 连续不断时会被
			// 无限重排(每次 mutation 都清掉重排 300ms),页面从此不再扫描、[表情: x] 一路
			// 裸露,刷新也不自愈——这是比卡顿更难查的一层。
			// 相邻两次扫描之间的最小间隔。扫描一结束就把下一次排上，窗内的变动合并到窗末尾。
			// 旧实现是 300ms 纯 trailing 防抖：每来一条 mutation 就重置定时器，当变动比 300ms
			// 更密时定时器永远等不到触发点，只能靠 SCAN_MAX_WAIT 兜底 —— 图于是永远比文字晚
			// 一大截（实测中位 600ms、p90 1100ms）。改成「排一次就不重排」后问题消失。
			const SCAN_MIN_GAP = 300
			// 兜底上界：从本轮第一次变动算起，最多推迟这么久。
			const SCAN_MAX_WAIT = 1200
			let scanTimer = 0
			let scanDeadline = 0
			let scanning = false
			// ---- 本地补丁(2026-10-20):增量扫描 ----
			// 原版每轮扫描都全文档 TreeWalker 一遍(每个文本节点 4 次 closest + 一遍正则),
			// 流式输出期间每 ≤1.2s 一遍,会话越长越慢(插件自己的注释也写了「长会话里雪崩」)。
			// 这里只处理 MutationObserver 记录里真正变过的文本节点/新增子树;
			// 只有结构性重排(删了别的东西元素)才回退全量扫描。首轮与索引到达仍走全量。
			const MEME_NODE_TEXT = 3
			const MEME_NODE_ELEMENT = 1
			const MEME_PENDING_LIMIT = 2000
			let pendingRecords = []
			let forceFullScan = true
			const collectMemeTextNodes = (node, out) => {
				if (!node) return
				if (node.nodeType === MEME_NODE_TEXT) { out.push(node); return }
				if (node.nodeType !== MEME_NODE_ELEMENT) return
				const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
				let n
				while ((n = walker.nextNode())) out.push(n)
			}
			// 增量装饰:只处理记录里指向的节点。返回 false = 需要回退全量扫描。
			const decorateMemeIncremental = (records) => {
				const candidates = []
				for (const record of records) {
					if (record.type === 'characterData') {
						collectMemeTextNodes(record.target, candidates)
						continue
					}
					if (record.type !== 'childList') continue
					const target = record.target
					if (target && target.nodeType === MEME_NODE_ELEMENT) {
						// React 重写 textContent 会把注入的 img/ghost 一起抹掉 → 元素上的标记成了孤儿,
						// 不清掉这个元素就永远不会再被装饰(issue #26)。这里按变化到的容器局部清理。
						for (const el of cleanupMemeMarkers(target)) collectMemeTextNodes(el, candidates)
					}
					for (const added of record.addedNodes) collectMemeTextNodes(added, candidates)
					for (const removed of record.removedNodes) {
						// 删掉的是自己注入的 img/ghost → 上面的局部清理已经处理;
						// 删掉的是别的东西 → 布局变了,全量扫描才稳妥。
						if (removed.nodeType !== MEME_NODE_ELEMENT) continue
						const ours = typeof removed.matches === 'function' && removed.matches('img[data-meme-img],[data-meme-hidden]')
						if (!ours) return false
					}
				}
				const nodes = []
				for (const node of candidates) {
					if (!node.isConnected) continue
					if (!memeTextAcceptable(node)) continue
					nodes.push(node)
				}
				if (nodes.length > 0) decorateMemeNodes(nodes, false)
				return true
			}
			const runScan = () => {
				if (scanning) return // 重入保护:装饰本身改 DOM,会再触发 observer
				scanning = true
				try {
					const records = pendingRecords
					pendingRecords = []
					let handled = false
					if (!forceFullScan && records.length > 0 && records.length <= MEME_PENDING_LIMIT) {
						handled = decorateMemeIncremental(records)
					}
					if (!handled) decorateMemeText()
					forceFullScan = false
				} catch (error) {
					// 装饰失败不该打断宿主渲染:最多是这一轮表情不转图
					console.warn('[dsh-persona-kit] meme decoration failed:', error && error.message ? error.message : error)
				} finally {
					scanning = false
				}
			}
			let lastScanAt = 0
			// 关键：已排期的扫描不再被后续变动重排（旧实现每次都 clearTimeout 重来）。
			// 触发时刻由「上次扫描时刻」唯一定出，后续变动只合并、不改变它，因此密流式
			// 也不会把扫描无限往后推 —— 那正是旧实现「图比文字晚一大截」的根因。
			const scheduleScan = () => {
				if (scanTimer !== 0) return // 本轮已有排期，合流即可
				const now = Date.now()
				if (scanDeadline === 0) scanDeadline = now + SCAN_MAX_WAIT
				const due = lastScanAt === 0 ? now : lastScanAt + SCAN_MIN_GAP
				const wait = Math.max(0, Math.min(due, scanDeadline) - now)
				scanTimer = setTimeout(() => {
					scanTimer = 0
					scanDeadline = 0
					lastScanAt = Date.now()
					runScan()
				}, wait)
			}
			const memeObserver = new MutationObserver((records) => {
				// 只认真正影响文本的变动;纯属性变化(宿主的 hover/动画很吵)不值得重扫。
				// 记录攒起来给增量扫描用(本地补丁 2026-10-20)。
				let relevant = 0
				for (const record of records) {
					if (record.type === 'characterData' || record.addedNodes.length || record.removedNodes.length) {
						pendingRecords.push(record)
						relevant++
					}
				}
				if (relevant > 0) scheduleScan()
			})
			memeObserver.observe(document.body, { childList: true, subtree: true, characterData: true })

		var MEME_WORD = /[\u3400-\u9fff]+/.exec(MEME_TEXT_RE.source)[0]

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
				// ---- meme library: the 😊 button and the board it opens ----
				// The button takes the composer's left slot and the board the overlay slot above the composer.
				// Both roots carry data-pk-memes, which is what every rule below is scoped to.
				var memeStyleEl = installMemeStyle();
				ctx.effect(function () { return function () { if (memeStyleEl) memeStyleEl.remove(); }; }, "dsh-persona-kit: meme styles");
				var disposeZoom = installMemeZoom();
				ctx.effect(function () { return function () { disposeZoom(); }; }, "dsh-persona-kit: meme zoom");
				// bring up the picture lookup and the renderer that turns a sticker marker into a picture
				loadMemeIndex();
				runScan();
				ctx.effect(function () {
					return function () {
						disposed = true;
						memeIndexGeneration++;
						if (memeIndexController) memeIndexController.abort();
						try { memeObserver.disconnect(); } catch (e) {}
					};
				}, "dsh-persona-kit: meme renderer");
				var memeStore = makeMemeStore();
				var MemeButton = makeMemeButton(memeStore);
				// while another plugin already draws a composer dock, the dock row is full: the 😊 button stays in
				// the left slot on its own and the pill keeps following the dock, so the two never stack up.
				slots.inject("conversation.input.left", function () {
					return slots.register({ name: "conversation.input.left", id: "persona-kit-memes", order: 5, label: L("表情包") }, function () { return h(MemeButton, {}); });
				});
				slots.inject("conversation.input.overlay", function () {
					return slots.register({ name: "conversation.input.overlay", id: "persona-kit-memes", order: 42, label: L("表情包") }, function (props) {
						return h(MemeBoard, { store: memeStore, inputActions: props && props.inputActions, useInput: props && props.useInput });
					});
				});
				loadIdentity();
				loadKnownRoles(true);
				var identityTimer = window.setInterval(function () { if (document.visibilityState === "visible") loadIdentity(); }, 5000);
				ctx.effect(function () { return function () { window.clearInterval(identityTimer); }; }, "dsh-persona-kit: identity poll");
				document.addEventListener("click", onAvatarClick, true);
				ctx.effect(function () { return function () { document.removeEventListener("click", onAvatarClick, true); closeAvatarPanel(); }; }, "dsh-persona-kit: avatar click");
				var avRaf = 0;
				var avPending = false;
				function flushAvatars() {
					avRaf = 0;
					if (!avPending) return;
					avPending = false;
					try { applyAccount(); } catch (e) {}
					try { applyAvatars(); } catch (e) {}
				}
				observer = new MutationObserver(function (records) {
					schedule();
					// a new message row: batch avatar calculations into one animation frame
					var needAv = false;
					for (var ri = 0; ri < records.length && !needAv; ri++) {
						var added = records[ri].addedNodes;
						for (var ai = 0; ai < added.length; ai++) {
							var an = added[ai];
							if (an.nodeType === 1 && (an.hasAttribute && an.hasAttribute("data-chat-flow-kind") || (an.querySelector && an.querySelector("[data-chat-flow-kind]")))) { needAv = true; break; }
						}
					}
					if (needAv) {
						avPending = true;
						if (!avRaf) avRaf = window.requestAnimationFrame(flushAvatars);
					}
				});
				// attributeFilter matters: folding or expanding a delivered answer only flips attributes, so without
				// these the avatar would stay on the row it was placed on until something else re-rendered.
				observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-turn-process-hidden", "data-turn-process-answer"] });
				ctx.effect(function () { return function () { if (observer) observer.disconnect(); }; }, "dsh-persona-kit: observer");
				window.__dshPersonaKit = { get: function () { return { sid: cur.sid, info: info, last: last, state: getState() }; }, identity: function () { return identity; }, setLang: setLang, lang: function () { return LANG; }, pillLabel: pillLabel, known: function () { return knownRoles; }, loadKnownRoles: loadKnownRoles, run: function (line) { var svc = commandsService(); return svc ? Promise.resolve(svc.execute(String(cur.sid), line, [])) : Promise.reject(new Error("no commands service")); } };
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
