/** Homepage discussion: reuse GitHub discussion #5 across domains and URL paths. */
(function () {
    'use strict';

    var GISCUS_ORIGIN = 'https://giscus.app';
    var panel = document.getElementById('discussion');
    var container = document.getElementById('discussionComments');
    var status = document.getElementById('discussionStatus');
    if (!panel || !container || !status) return;

    var script = null;
    var loadTimer = null;

    function theme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function syncTheme() {
        if (script) script.setAttribute('data-theme', theme());
        var frame = container.querySelector('iframe.giscus-frame');
        if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ giscus: { setConfig: { theme: theme() } } }, GISCUS_ORIGIN);
        }
    }

    function showUnavailable() {
        clearTimeout(loadTimer);
        status.textContent = '讨论暂时无法加载，你可以点击上方按钮前往 GitHub 参与。';
        status.hidden = false;
    }

    function loadDiscussion() {
        if (script || !panel.classList.contains('active')) return;
        script = document.createElement('script');
        script.src = GISCUS_ORIGIN + '/client.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        var config = {
            'data-repo': 'sunZshanY/personal_website',
            'data-repo-id': 'R_kgDOTLFsVw',
            'data-category': 'General',
            'data-category-id': 'DIC_kwDOTLFsV84DCJlw',
            'data-mapping': 'number',
            'data-term': '5',
            'data-reactions-enabled': '1',
            'data-emit-metadata': '1',
            'data-input-position': 'top',
            'data-theme': theme(),
            'data-lang': 'zh-CN'
        };
        Object.keys(config).forEach(function (key) { script.setAttribute(key, config[key]); });
        script.addEventListener('error', showUnavailable);
        script.addEventListener('load', function () {
            var frame = container.querySelector('iframe.giscus-frame');
            if (!frame) { showUnavailable(); return; }
            frame.title = 'GitHub Discussions 评论';
            frame.addEventListener('load', syncTheme);
            syncTheme();
        });
        loadTimer = setTimeout(showUnavailable, 15000);
        document.body.appendChild(script);
    }

    window.addEventListener('message', function (event) {
        var frame = container.querySelector('iframe.giscus-frame');
        if (event.origin !== GISCUS_ORIGIN || !frame || event.source !== frame.contentWindow) return;
        var message = event.data && event.data.giscus;
        if (!message || typeof message !== 'object') return;
        if (message.error) { showUnavailable(); return; }
        if (message.discussion) {
            clearTimeout(loadTimer);
            status.hidden = true;
        }
    });

    new MutationObserver(loadDiscussion).observe(panel, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(syncTheme).observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme']
    });

    function openLinkedDiscussion() {
        var url = new URL(window.location.href);
        if (url.searchParams.has('giscus') || ['#discussion', '#discussionComments', '#comments'].includes(url.hash)) {
            var button = document.querySelector('[data-panel="discussion"]');
            if (button) button.click();
        }
        loadDiscussion();
    }

    // The main script wires navigation first. Also reopen this panel after GitHub sign-in.
    window.addEventListener('DOMContentLoaded', openLinkedDiscussion, { once: true });
    window.addEventListener('hashchange', openLinkedDiscussion);
})();
