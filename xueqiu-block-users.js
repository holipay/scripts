// ==UserScript==
// @name         雪球一键屏蔽用户
// @namespace    https://github.com/
// @version      4.0
// @description  屏蔽雪球用户：作者→隐藏信息和正文（保留跟帖）；评论者→仅隐藏该条评论。支持管理列表、导入导出。
// @author       holipay
// @match        *://xueqiu.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'xueqiu_block_users';

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

    // 从 a.user-name 提取用户ID
    function getUserId(el) {
        try {
            const url = new URL(el.href);
            if (!/^\/[A-Za-z0-9]+$/.test(url.pathname)) return null;
            return url.pathname.slice(1);
        } catch { return null; }
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

    // ====================== 刷新按钮文本 ======================
    // 不重建按钮，只更新文本，避免重复插入
    function refreshButtons() {
        document.querySelectorAll('a.user-name').forEach(el => {
            const btn = el.nextElementSibling;
            if (!btn || !btn.classList.contains('xq-block-btn')) return;
            const uid = getUserId(el);
            if (!uid) return;
            btn.textContent = isBlocked(uid) ? ' [已屏蔽]' : ' [屏蔽]';
        });
    }

    // ====================== 添加 [屏蔽] 按钮 ======================
    function renderButtons(root) {
        const container = root || document;
        container.querySelectorAll('a.user-name:not([data-xq-btn])').forEach(el => {
            const uid = getUserId(el);
            if (!uid) return;
            el.setAttribute('data-xq-btn', '1'); // 标记已处理，避免重复
            const btn = document.createElement('span');
            btn.className = 'xq-block-btn';
            btn.textContent = isBlocked(uid) ? ' [已屏蔽]' : ' [屏蔽]';
            btn.style.cssText = 'color:#f23838!important;margin-left:6px!important;cursor:pointer!important;font-size:12px!important;';
            btn.onclick = e => { e.stopPropagation(); toggleBlock(el); };
            el.parentNode.insertBefore(btn, el.nextSibling);
        });
    }

    // ====================== 核心：扫描并隐藏 ======================
    // 屏蔽策略:
    //   作者被屏蔽 → 隐藏 timeline__item__info + timeline__item__content，保留评论区（跟帖可见）
    //   评论者被屏蔽 → 只隐藏该条评论
    function scanAndHide() {
        // 第一步：恢复所有之前被隐藏的元素（解除屏蔽后需要恢复）
        document.querySelectorAll('[data-xq-blocked]').forEach(el => {
            el.style.display = '';
            el.removeAttribute('data-xq-blocked');
        });

        const blocked = getBlockList();
        if (!blocked.length) return;

        // 遍历每一个帖子
        document.querySelectorAll('div.timeline__item__main, article, [class*="timeline__item"]').forEach(post => {
            // --- 判断帖子作者 ---
            const infoArea = post.querySelector('div.timeline__item__info');
            const authorNameEl = infoArea ? infoArea.querySelector('a.user-name') : null;
            const authorUid = authorNameEl ? getUserId(authorNameEl) : null;

            // 作者被屏蔽 → 只隐藏作者信息和帖子正文，保留评论区（跟帖）
            if (authorUid && blocked.includes(authorUid)) {
                if (infoArea && infoArea.style.display !== 'none') {
                    infoArea.style.display = 'none';
                    infoArea.setAttribute('data-xq-blocked', authorUid);
                }
                const contentArea = post.querySelector('div.timeline__item__bd div.timeline__item__content');
                if (contentArea && contentArea.style.display !== 'none') {
                    contentArea.style.display = 'none';
                    contentArea.setAttribute('data-xq-blocked', authorUid);
                }
                // 不 return，继续往下处理评论区的屏蔽逻辑
            }

            // --- 评论者被屏蔽 → 只隐藏该条评论 ---
            // 雪球评论 DOM:
            //   div.comment__item__main
            //     ├─ div.comment__item__main__hd (包含 a.user-name)
            //     └─ div.comment__item__main__bd (评论正文)
            const commentArea = post.querySelector(
                '[class*="comment__item"], [class*="Comment"], [class*="reply__item"], [class*="Reply"]'
            );
            if (commentArea) {
                commentArea.querySelectorAll('a.user-name').forEach(nameEl => {
                    const uid = getUserId(nameEl);
                    if (!uid || !blocked.includes(uid)) return;

                    // 优先匹配雪球实际 DOM：comment__item__main
                    let commentItem = nameEl.closest('div.comment__item__main');

                    // fallback: 精确选择器
                    if (!commentItem) {
                        commentItem = nameEl.closest(
                            '[class*="comment__item__main"], [class*="reply__item__main"]'
                        );
                    }

                    // fallback: 向上找只含一个 user-name 的块
                    if (!commentItem) {
                        let node = nameEl.parentElement;
                        while (node && node !== commentArea && node !== post) {
                            if (node.querySelectorAll('a.user-name').length > 1) break;
                            node = node.parentElement;
                        }
                        // 确保找到的是合理的容器（至少包含评论内容）
                        if (node && node !== commentArea && node !== post) {
                            commentItem = node;
                        }
                    }

                    if (commentItem && commentItem.style.display !== 'none') {
                        commentItem.style.display = 'none';
                        commentItem.setAttribute('data-xq-blocked', uid);
                    }
                });
            }
        });
    }

    // ====================== DOM 变化监听 ======================
    let _observerTimer = null;
    let _refreshTimer = null;

    function observe() {
        new MutationObserver(mutations => {
            if (_observerTimer) return;
            // 检查是否有新增节点（避免无意义的重扫）
            let hasNewNodes = false;
            for (const m of mutations) {
                if (m.addedNodes.length > 0) { hasNewNodes = true; break; }
            }
            if (!hasNewNodes) return;

            _observerTimer = requestAnimationFrame(() => {
                _observerTimer = null;
                // 只对新增节点渲染按钮
                for (const m of mutations) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return; // 跳过文本节点
                        if (node.matches && node.matches('a.user-name')) {
                            renderButtons(node.parentElement || document);
                        } else if (node.querySelectorAll) {
                            renderButtons(node);
                        }
                    });
                }
                scanAndHide();
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    // ====================== 面板 ======================
    function createPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed!important;top:100px!important;right:20px!important;z-index:999999!important;width:240px!important;background:#fff!important;border-radius:6px!important;box-shadow:0 0 10px rgba(0,0,0,.2)!important;overflow:hidden!important;font-size:14px!important;';

        // 拖动条
        const bar = document.createElement('div');
        bar.style.cssText = 'background:#f5f5f5!important;padding:6px 10px!important;cursor:move!important;display:flex!important;justify-content:space-between!important;user-select:none!important;';
        bar.textContent = '屏蔽面板 v4.0';
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

        // 最小化
        let min = false;
        minBtn.onclick = () => {
            min = !min;
            body.style.display = min ? 'none' : 'block';
            minBtn.textContent = min ? '□' : '−';
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

        // 定期刷新计数（面板可见时才刷新）
        _refreshTimer = setInterval(() => {
            if (!min) refreshCount();
        }, 3000);
    }

    // ====================== 启动 ======================
    function init() {
        createPanel();
        renderButtons();
        scanAndHide();
        observe();
    }

    // 清理定时器
    window.addEventListener('beforeunload', () => {
        if (_refreshTimer) clearInterval(_refreshTimer);
        if (_observerTimer) cancelAnimationFrame(_observerTimer);
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
