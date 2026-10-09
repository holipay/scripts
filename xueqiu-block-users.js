// ==UserScript==
// @name         雪球一键屏蔽用户
// @namespace    https://github.com/
// @version      5.0
// @description  屏蔽雪球用户：作者→隐藏信息和正文（保留跟帖）；评论者→仅隐藏该条评论。支持管理列表、导入导出。适配雪球新版 CSS Modules 页面。
// @author       holipay
// @match        *://xueqiu.com/*
// @match        *://*.xueqiu.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'xueqiu_block_users';

    // ====================== 选择器 ======================
    // 雪球已改为 CSS Modules 构建，类名形如 style_user-name_Gwq，
    // 旧的 a.user-name / div.timeline__item__info 已失效，统一改用子串匹配。
    const NAME_SEL = 'a[class*="user-name"], .article__author a.name';
    const POST_ARTICLE_SEL = 'article[class*="timeline__item"]:not([class*="timeline__item__"])';
    const POST_MAIN_SEL = '[class*="timeline__item__main"]';
    const INFO_SEL = '[class*="timeline__item__info"], .article__author';
    const CONTENT_SEL = '[class*="timeline__item__content"], article[class*="article__bd"]';
    const COMMENT_SEL = '[class*="comment__"], [class*="comment-item"], [class*="reply__item"]';
    const HIDDEN_CLS = 'xq-block-hidden';
    const STYLE_ID = 'xq-block-style';

    // 站点路径黑名单：这些单段路径不是用户主页
    const RESERVED_PATHS = new Set([
        'u', 'S', 'hq', 'k', 'about', 'help', 'today', 'login', 'search', 'more',
        'home', 'app', 'download', 'group', 'status', 'statuses', 'ipo', 'fund',
        'money', 'news', 'topic', 'people', 'user', 'users', 'me', 'pm', 'sms',
        'cubes', 'portfolio', 'say', 'says', 'report', 'activity', 'setting'
    ]);

    // ====================== 存储 + 缓存 ======================
    let _cachedList = null;

    function getBlockList() {
        if (_cachedList) return _cachedList;
        try { _cachedList = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch { _cachedList = []; }
        return _cachedList;
    }
    function saveBlockList(list) {
        _cachedList = null; // 清除缓存
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    function isBlocked(uid) {
        return getBlockList().includes(uid);
    }

    // 从用户链接提取用户ID
    // 兼容新版主页 /u/8152922548 与旧版 /8152922548 两种地址，
    // 取不到 href 时回退到 data-tooltip（雪球用它存放用户ID）
    function getUserId(el) {
        try {
            const path = new URL(el.href, location.href).pathname;
            const m = path.match(/^\/(?:u\/)?([A-Za-z0-9]+)\/?$/);
            if (m && !RESERVED_PATHS.has(m[1])) return m[1];
        } catch { /* ignore */ }
        try {
            const tip = el.getAttribute('data-tooltip');
            if (tip && /^\d{4,}$/.test(tip)) return tip;
        } catch { /* ignore */ }
        return null;
    }

    // ====================== 隐藏 / 恢复 ======================
    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = '.' + HIDDEN_CLS + '{display:none!important;}';
        (document.head || document.documentElement).appendChild(s);
    }

    function hideEl(el, uid) {
        if (!el || el.hasAttribute('data-xq-blocked')) return;
        el.setAttribute('data-xq-blocked', uid);
        el.classList.add(HIDDEN_CLS);
    }

    function restoreAll() {
        document.querySelectorAll('[data-xq-blocked]').forEach(el => {
            el.classList.remove(HIDDEN_CLS);
            el.removeAttribute('data-xq-blocked');
        });
    }

    // 是否含有评论区（新版首页时间线没有内嵌评论）
    function hasCommentArea(root) {
        return !!root.querySelector(COMMENT_SEL);
    }

    // ====================== 屏蔽/取消 ======================
    function toggleBlock(el) {
        const uid = getUserId(el);
        if (!uid) return;
        let list = getBlockList();
        if (list.includes(uid)) {
            list = list.filter(id => id !== uid);
            alert('已取消屏蔽');
        } else {
            list.push(uid);
            alert('已屏蔽用户');
        }
        saveBlockList(list);
        refreshButtons();
        scanAndHide();
    }

    // ====================== 刷新/添加 [屏蔽] 按钮 ======================
    function buttonText(uid) {
        return isBlocked(uid) ? ' [已屏蔽]' : ' [屏蔽]';
    }

    function ensureButton(el) {
        const uid = getUserId(el);
        if (!uid) return;
        const parent = el.parentElement;
        if (!parent) return;
        const text = buttonText(uid);

        const next = el.nextElementSibling;
        if (next && next.classList && next.classList.contains('xq-block-btn')) {
            next.setAttribute('data-xq-uid', uid);
            if (next.textContent !== text) next.textContent = text;
            return;
        }

        // 同一父节点下属于该用户的旧按钮（可能被框架挪动过）：重建，保证点击目标最新
        let stale = null;
        parent.querySelectorAll(':scope > .xq-block-btn').forEach(b => {
            if (!stale && b.getAttribute('data-xq-uid') === uid) stale = b;
        });
        if (stale) stale.remove();

        const btn = document.createElement('span');
        btn.className = 'xq-block-btn';
        btn.setAttribute('data-xq-uid', uid);
        btn.textContent = text;
        btn.style.cssText = 'color:#f23838!important;margin-left:6px!important;cursor:pointer!important;font-size:12px!important;';
        btn.onclick = e => { e.stopPropagation(); toggleBlock(el); };
        el.parentNode.insertBefore(btn, el.nextSibling);
    }

    function renderButtons(root) {
        const container = root || document;
        if (!container || !container.querySelectorAll) return;
        if (container.nodeType === 1 && container.matches && container.matches(NAME_SEL)) {
            ensureButton(container);
        }
        container.querySelectorAll(NAME_SEL).forEach(ensureButton);
    }

    function refreshButtons() {
        renderButtons(document);
    }

    // ====================== 核心：扫描并隐藏 ======================
    // 屏蔽策略:
    //   作者被屏蔽 → 有跟帖时只隐藏作者信息+正文（保留评论区）；无跟帖时隐藏整条帖子
    //   评论者被屏蔽 → 只隐藏该条评论
    function collectPostRoots() {
        const roots = new Set();
        document.querySelectorAll(POST_ARTICLE_SEL + ', ' + POST_MAIN_SEL).forEach(el => {
            const art = el.closest(POST_ARTICLE_SEL);
            roots.add(art || el);
        });
        // 长文详情页：作者区 + 正文 + 评论在同一容器内
        document.querySelectorAll('.article__author').forEach(el => {
            roots.add(el.closest('.article__container') || el.parentElement || el);
        });
        // 未登录首页的信息流
        document.querySelectorAll('div[class*="home__timeline__item"]:not([class*="item__ft"])').forEach(el => {
            roots.add(el);
        });
        return roots;
    }

    function findAuthorArea(root) {
        const info = root.querySelector(INFO_SEL);
        if (info) return info;
        const name = root.querySelector(NAME_SEL);
        if (!name) return null;
        // 排除评论作者、转发原作者
        if (name.closest(COMMENT_SEL) || name.closest('[class*="timeline__item__forward"]')) return null;
        return name.parentElement || name;
    }

    function hideAuthor(root, infoArea, uid) {
        // 详情页：评论在正文之后加载，永远只隐藏作者信息与正文
        const isDetail = !!root.querySelector('.article__author');
        if (isDetail || hasCommentArea(root)) {
            // 保留跟帖：只隐藏作者信息与正文
            hideEl(infoArea, uid);
            root.querySelectorAll(CONTENT_SEL).forEach(el => hideEl(el, uid));
        } else {
            hideEl(root, uid);
        }
    }

    // 定位评论容器：顶层评论 div.comment__item[data-id]、楼中楼 div.items[data-id]
    function getCommentContainer(el) {
        const withId = el.closest('[data-id]');
        if (withId && /comment|reply|items/i.test(String(withId.className || '')) &&
            withId.closest('[class*="comment"], [class*="reply"]')) {
            return withId;
        }
        return el.closest('[class*="comment__item__main"], [class*="reply__item__main"], [class*="comment__list"]');
    }

    function scanAndHide() {
        // 第一步：恢复所有之前被隐藏的元素（解除屏蔽后需要恢复）
        restoreAll();

        const blocked = getBlockList();
        if (!blocked.length) return;

        // --- 帖子作者被屏蔽 ---
        collectPostRoots().forEach(root => {
            const infoArea = findAuthorArea(root);
            if (!infoArea) return;
            const nameEl = infoArea.matches && infoArea.matches(NAME_SEL) ? infoArea : infoArea.querySelector(NAME_SEL);
            const uid = nameEl ? getUserId(nameEl) : null;
            if (!uid || !blocked.includes(uid)) return;
            hideAuthor(root, infoArea, uid);
        });

        // --- 评论者被屏蔽：只隐藏该条评论 ---
        document.querySelectorAll(NAME_SEL).forEach(nameEl => {
            if (nameEl.closest('.article__author')) return; // 帖子作者已在上面处理
            const uid = getUserId(nameEl);
            if (!uid || !blocked.includes(uid)) return;
            const commentItem = getCommentContainer(nameEl);
            if (commentItem) hideEl(commentItem, uid);
        });
    }

    // ====================== DOM 变化监听 ======================
    let _observerTimer = null;

    // 300ms 节流：避免高频 mutation 触发重复扫描
    function schedule() {
        if (_observerTimer) return;
        _observerTimer = setTimeout(() => {
            _observerTimer = null;
            try {
                renderButtons(document);
                scanAndHide();
            } catch (e) { /* 忽略渲染竞态 */ }
        }, 300);
    }

    function observe() {
        // 同时监听新增与删除：新版 React 页面会重建/移除节点，按钮需要被重新插入
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    }

    // ====================== 面板 ======================
    function createPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed!important;top:100px!important;right:20px!important;z-index:999999!important;width:240px!important;background:#fff!important;border-radius:6px!important;box-shadow:0 0 10px rgba(0,0,0,.2)!important;overflow:hidden!important;font-size:14px!important;';

        // 拖动条
        const bar = document.createElement('div');
        bar.style.cssText = 'background:#f5f5f5!important;padding:6px 10px!important;cursor:move!important;display:flex!important;justify-content:space-between!important;user-select:none!important;';
        bar.textContent = '屏蔽面板 v5.0';
        const minBtn = document.createElement('span');
        minBtn.textContent = '−';
        minBtn.style.cursor = 'pointer';
        bar.appendChild(minBtn);
        panel.appendChild(bar);

        const body = document.createElement('div');
        body.style.cssText = 'padding:10px;max-height:60vh;overflow-y:auto;';
        panel.appendChild(body);

        // 导入/导出
        const importBtn = document.createElement('button');
        importBtn.textContent = '导入屏蔽列表(文件)';
        importBtn.style.cssText = 'width:100%;padding:6px;margin-bottom:6px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        importBtn.onclick = () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.txt';
            inp.onchange = e => {
                const f = e.target.files[0]; if (!f) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    const users = ev.target.result.split(/\n/).map(s => s.trim()).filter(Boolean);
                    const merged = [...new Set([...getBlockList(), ...users])];
                    saveBlockList(merged);
                    scanAndHide();
                    refreshCount();
                    renderBlockedList();
                    alert('导入成功，共 ' + merged.length + ' 个');
                };
                reader.readAsText(f);
            };
            inp.value = '';
            inp.click();
        };
        body.appendChild(importBtn);

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '导出屏蔽列表';
        exportBtn.style.cssText = 'width:100%;padding:6px;margin-bottom:6px;background:#167dff;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        exportBtn.onclick = () => {
            const d = getBlockList();
            if (!d.length) return alert('无数据');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([d.join('\n')], { type: 'text/plain' }));
            a.download = 'xueqiu-block.txt';
            a.click();
        };
        body.appendChild(exportBtn);

        const countDisplay = document.createElement('div');
        countDisplay.style.cssText = 'text-align:center;font-size:12px;color:#999;margin:6px 0;';
        body.appendChild(countDisplay);

        function refreshCount() {
            countDisplay.textContent = '当前屏蔽: ' + getBlockList().length + ' 人';
        }
        refreshCount();

        // 屏蔽列表管理区域
        const listHeader = document.createElement('div');
        listHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:6px 0 4px;font-size:12px;color:#666;';
        listHeader.innerHTML = '<span>屏蔽列表</span>';
        const toggleListBtn = document.createElement('span');
        toggleListBtn.textContent = '展开';
        toggleListBtn.style.cssText = 'cursor:pointer;color:#167dff;';
        listHeader.appendChild(toggleListBtn);
        body.appendChild(listHeader);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display:none;max-height:200px;overflow-y:auto;margin-bottom:6px;';
        body.appendChild(listContainer);

        let listVisible = false;
        toggleListBtn.onclick = () => {
            listVisible = !listVisible;
            listContainer.style.display = listVisible ? 'block' : 'none';
            toggleListBtn.textContent = listVisible ? '收起' : '展开';
            if (listVisible) renderBlockedList();
        };

        function renderBlockedList() {
            listContainer.innerHTML = '';
            const list = getBlockList();
            if (!list.length) {
                listContainer.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:6px;">无屏蔽用户</div>';
                return;
            }
            list.forEach(uid => {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #f0f0f0;font-size:12px;';
                const nameSpan = document.createElement('span');
                nameSpan.textContent = uid;
                nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                const delBtn = document.createElement('span');
                delBtn.textContent = '删除';
                delBtn.style.cssText = 'color:#f23838;cursor:pointer;margin-left:8px;flex-shrink:0;';
                delBtn.onclick = () => {
                    const updated = getBlockList().filter(id => id !== uid);
                    saveBlockList(updated);
                    scanAndHide();
                    refreshButtons();
                    refreshCount();
                    renderBlockedList();
                };
                item.appendChild(nameSpan);
                item.appendChild(delBtn);
                listContainer.appendChild(item);
            });
        }

        // 最小化（默认最小化）
        let min = true;
        body.style.display = 'none';
        minBtn.textContent = '□';
        minBtn.onclick = () => {
            min = !min;
            body.style.display = min ? 'none' : 'block';
            minBtn.textContent = min ? '□' : '−';
            if (min) {
                clearInterval(_refreshTimer);
                _refreshTimer = null;
            } else {
                _refreshTimer = setInterval(refreshCount, 3000);
            }
        };

        // 拖动（使用 addEventListener，带边界检测）
        let dragging = false, startX, startY, rect;
        bar.addEventListener('mousedown', e => {
            dragging = true;
            rect = panel.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            e.preventDefault(); // 防止文本选中
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            let newLeft = rect.left + e.clientX - startX;
            let newTop = rect.top + e.clientY - startY;
            // 边界检测：不超出视口
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; });

        document.body.appendChild(panel);
    }

    // ====================== 启动 ======================
    let _refreshTimer = null;

    function init() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', init, { once: true });
            return;
        }
        injectStyle();
        createPanel();
        renderButtons();
        scanAndHide();
        observe();
    }

    // 清理定时器
    window.addEventListener('beforeunload', () => {
        if (_refreshTimer) clearInterval(_refreshTimer);
        if (_observerTimer) clearTimeout(_observerTimer);
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
