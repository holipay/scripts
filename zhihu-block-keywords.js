// ==UserScript==
// @name         知乎标题关键词屏蔽（精简版·可拖动·可最小化·带关键词列表）
// @namespace    https://github.com/
// @version      2.0
// @description  知乎关键词屏蔽精简版，支持面板拖动+最小化，远程URL同步，性能优化版
// @author       holipay
// @match        *://*.zhihu.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'zhihu_block_keywords_simple';
    const REMOTE_URL_KEY = 'zhihu_block_keywords_remote_url';
    const CARD_SELECTORS = '.TopstoryItem, .ContentItem, .List-item';
    const TITLE_SELECTORS = 'h2, .ContentItem-title, .TopstoryContent-title';

    // ==================== 存储 + 缓存 ====================
    let _cachedWords = null;

    function getWords() {
        if (_cachedWords) return _cachedWords;
        try { _cachedWords = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch { _cachedWords = []; }
        return _cachedWords;
    }

    function saveWords(words) {
        _cachedWords = null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    }

    // ==================== 核心过滤 ====================
    // 记录上次的关键词列表指纹，避免关键词未变时重复扫描
    let _lastWordsFingerprint = '';

    function filterContent() {
        const words = getWords().map(w => w.toLowerCase().trim()).filter(Boolean);
        const fingerprint = words.join('|');

        if (fingerprint === _lastWordsFingerprint) return;
        _lastWordsFingerprint = fingerprint;

        document.querySelectorAll(CARD_SELECTORS).forEach(card => {
            if (words.length === 0) {
                card.style.display = '';
                card.removeAttribute('data-zb-hidden');
                return;
            }
            const title = card.querySelector(TITLE_SELECTORS)?.textContent.toLowerCase() || '';
            if (words.some(word => title.includes(word))) {
                card.style.display = 'none';
                card.setAttribute('data-zb-hidden', '1');
            } else {
                card.style.display = '';
                card.removeAttribute('data-zb-hidden');
            }
        });
    }

    // 仅处理新增卡片（关键词不变时高效跳过）
    function filterNewCards() {
        const words = getWords().map(w => w.toLowerCase().trim()).filter(Boolean);
        if (!words.length) return;

        document.querySelectorAll(CARD_SELECTORS + ':not([data-zb-processed])').forEach(card => {
            card.setAttribute('data-zb-processed', '1');
            const title = card.querySelector(TITLE_SELECTORS)?.textContent.toLowerCase() || '';
            if (words.some(word => title.includes(word))) {
                card.style.display = 'none';
                card.setAttribute('data-zb-hidden', '1');
            }
        });
    }

    let filterTimer = null;
    function filterNewCardsDebounced() {
        if (filterTimer) clearTimeout(filterTimer);
        filterTimer = setTimeout(filterNewCards, 300);
    }

    // ==================== 远程同步关键词 ====================
    async function fetchRemoteWords(url) {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const text = await resp.text();
        return text.split(/[\n\r]+/)
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('#'));
    }

    async function updateFromRemote(url) {
        if (!url || !url.startsWith('http')) {
            alert('请输入有效的URL（以http/https开头）');
            return;
        }
        localStorage.setItem(REMOTE_URL_KEY, url);
        try {
            const remoteWords = await fetchRemoteWords(url);
            if (!remoteWords.length) { alert('远程列表为空'); return; }
            const localWords = getWords();
            const lowerLocal = localWords.map(w => w.toLowerCase());
            const newWords = remoteWords.filter(w => !lowerLocal.includes(w.toLowerCase()));
            const merged = [...localWords, ...newWords];
            saveWords(merged);
            renderWordList();
            filterContent();
            alert(`更新完成！远程 ${remoteWords.length} 个，新增 ${newWords.length} 个，当前共 ${merged.length} 个关键词`);
        } catch (e) {
            alert('获取远程列表失败: ' + e.message);
        }
    }

    // ==================== 面板 ====================
    function createPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed !important;
            top: 80px !important;
            right: 20px !important;
            z-index: 999999 !important;
            width: 260px !important;
            background: #fff !important;
            border-radius: 8px !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.15) !important;
            overflow: hidden !important;
            font-size: 14px !important;
        `;

        // 拖动条
        const dragBar = document.createElement('div');
        dragBar.style.cssText = `
            padding: 8px 12px !important;
            background: #f5f5f5 !important;
            cursor: move !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            user-select: none !important;
        `;
        const dragTitle = document.createElement('span');
        dragTitle.textContent = '知乎关键词屏蔽';
        dragBar.appendChild(dragTitle);

        const minimizeBtn = document.createElement('span');
        minimizeBtn.textContent = '−';
        minimizeBtn.style.cssText = 'cursor: pointer; font-weight: bold; font-size: 16px;';
        dragBar.appendChild(minimizeBtn);
        panel.appendChild(dragBar);

        const content = document.createElement('div');
        content.style.padding = '12px';
        panel.appendChild(content);

        // 远程同步区域
        const remoteSection = document.createElement('div');
        remoteSection.style.cssText = 'margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;';
        const remoteLabel = document.createElement('div');
        remoteLabel.textContent = '远程关键词URL：';
        remoteLabel.style.cssText = 'font-size: 12px; color: #666; margin-bottom: 4px;';
        remoteSection.appendChild(remoteLabel);
        const remoteInput = document.createElement('input');
        remoteInput.type = 'text';
        remoteInput.placeholder = 'https://example.com/keywords.txt';
        remoteInput.style.cssText = 'width: 100%; padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 12px; margin-bottom: 4px;';
        remoteInput.value = localStorage.getItem(REMOTE_URL_KEY) || '';
        remoteSection.appendChild(remoteInput);
        const remoteBtn = document.createElement('button');
        remoteBtn.textContent = '从URL同步并合并';
        remoteBtn.style.cssText = 'width: 100%; padding: 6px; background: #ff9800; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
        remoteBtn.onclick = () => updateFromRemote(remoteInput.value.trim());
        remoteSection.appendChild(remoteBtn);
        content.appendChild(remoteSection);

        // 关键词输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '输入关键词，回车添加';
        input.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            margin-bottom: 8px;
        `;
        content.appendChild(input);

        // 关键词列表
        const wordList = document.createElement('div');
        wordList.style.cssText = `
            max-height: 120px;
            overflow-y: auto;
            margin-bottom: 8px;
            font-size: 12px;
        `;
        content.appendChild(wordList);

        // 按钮行
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display: flex; gap: 6px;';

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清空所有';
        clearBtn.style.cssText = `
            flex: 1;
            padding: 7px;
            background: #f23838;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        btnRow.appendChild(clearBtn);

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '导出';
        exportBtn.style.cssText = `
            flex: 1;
            padding: 7px;
            background: #167dff;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        btnRow.appendChild(exportBtn);

        const importBtn = document.createElement('button');
        importBtn.textContent = '导入';
        importBtn.style.cssText = `
            flex: 1;
            padding: 7px;
            background: #4CAF50;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;
        btnRow.appendChild(importBtn);

        content.appendChild(btnRow);

        // 关键词计数
        const countDisplay = document.createElement('div');
        countDisplay.style.cssText = 'text-align: center; font-size: 11px; color: #999; margin-top: 6px;';
        content.appendChild(countDisplay);

        // ==================== 渲染关键词列表 ====================
        function renderWordList() {
            wordList.innerHTML = '';
            const words = getWords();
            countDisplay.textContent = `当前 ${words.length} 个关键词`;
            if (words.length === 0) {
                const emptyTip = document.createElement('div');
                emptyTip.textContent = '暂无屏蔽关键词';
                emptyTip.style.cssText = 'color: #999; text-align: center; padding: 8px 0;';
                wordList.appendChild(emptyTip);
                return;
            }
            words.forEach((word, index) => {
                const wordItem = document.createElement('div');
                wordItem.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 4px 6px;
                    background: #f5f5f5;
                    border-radius: 3px;
                    margin-bottom: 3px;
                `;
                const textSpan = document.createElement('span');
                textSpan.textContent = word;
                textSpan.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                wordItem.appendChild(textSpan);

                const deleteBtn = document.createElement('span');
                deleteBtn.textContent = '×';
                deleteBtn.style.cssText = 'color: #f23838; cursor: pointer; margin-left: 8px; font-weight: bold;';
                deleteBtn.onclick = () => {
                    const newWords = getWords().filter((_, i) => i !== index);
                    saveWords(newWords);
                    renderWordList();
                    forceFilterAll();
                };
                wordItem.appendChild(deleteBtn);
                wordList.appendChild(wordItem);
            });
        }

        // ==================== 拖动（addEventListener + 边界检测）====================
        let isDragging = false, startX, startY, startLeft, startTop;
        dragBar.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            let newLeft = startLeft + (e.clientX - startX);
            let newTop = startTop + (e.clientY - startY);
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });

        // ==================== 最小化 ====================
        let minimized = false;
        minimizeBtn.onclick = () => {
            minimized = !minimized;
            content.style.display = minimized ? 'none' : 'block';
            minimizeBtn.textContent = minimized ? '□' : '−';
            dragTitle.textContent = minimized ? '已最小化' : '知乎关键词屏蔽';
        };

        // ==================== 关键词操作：过滤中文输入法组合键 ====================
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            if (e.isComposing) return;
            e.preventDefault();
            addKeyword(input.value);
        });

        function addKeyword(raw) {
            const word = raw.trim();
            if (!word) return;
            const words = getWords();
            if (!words.some(w => w.toLowerCase() === word.toLowerCase())) {
                saveWords([...words, word]);
                renderWordList();
                forceFilterAll();
            }
            input.value = '';
        }

        // 强制全量刷新（关键词变化时调用，重置指纹并重扫所有卡片）
        function forceFilterAll() {
            _lastWordsFingerprint = '';
            // 清除 processed 标记，让全量扫描重新检查所有卡片
            document.querySelectorAll('[data-zb-processed]').forEach(el => {
                el.removeAttribute('data-zb-processed');
            });
            filterContent();
        }

        // 清空
        clearBtn.onclick = () => {
            if (!getWords().length) return;
            if (confirm('确定清空所有关键词吗？')) {
                saveWords([]);
                renderWordList();
                forceFilterAll();
            }
        };

        // 导出
        exportBtn.onclick = () => {
            const words = getWords();
            if (!words.length) return alert('暂无关键词');
            const blob = new Blob([words.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zhihu-block-keywords.txt';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };

        // 导入（合并）
        importBtn.onclick = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.txt';
            inp.onchange = e => {
                const f = e.target.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    const imported = ev.target.result.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean);
                    const existing = getWords();
                    const lowerExisting = existing.map(w => w.toLowerCase());
                    const newWords = imported.filter(w => !lowerExisting.includes(w.toLowerCase()));
                    const merged = [...existing, ...newWords];
                    saveWords(merged);
                    renderWordList();
                    forceFilterAll();
                    alert(`导入完成，新增 ${newWords.length} 个，当前共 ${merged.length} 个关键词`);
                };
                reader.readAsText(f);
            };
            inp.click();
        };

        renderWordList();
        document.body.appendChild(panel);
    }

    // ==================== 初始化 ====================
    let _observer = null;

    function init() {
        createPanel();
        filterContent();
        _observer = new MutationObserver(filterNewCardsDebounced);
        _observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('beforeunload', () => {
        if (_observer) _observer.disconnect();
        if (filterTimer) clearTimeout(filterTimer);
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
