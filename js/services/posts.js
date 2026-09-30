/** Shared repository: live API -> static JSON -> last successful local cache. */
(function () {
    'use strict';

    var CACHE_KEY = 'omiblog_z';
    var TIMEOUT_MS = 8000;
    var pending = null;

    async function fetchPosts(url) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
        try {
            var response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var data = await response.json();
            if (!data || !Array.isArray(data.posts)) throw new Error('Invalid posts format');
            return data;
        } finally {
            clearTimeout(timer);
        }
    }

    function readCache() {
        try {
            var posts = JSON.parse(localStorage.getItem(CACHE_KEY));
            if (Array.isArray(posts)) return { posts: posts };
        } catch (error) {}
        return { posts: [] };
    }

    function cachePosts(data) {
        try {
            var serialized = JSON.stringify(data.posts);
            // Avoid a storage-event/refetch loop between open tabs.
            if (localStorage.getItem(CACHE_KEY) !== serialized) {
                localStorage.setItem(CACHE_KEY, serialized);
            }
        } catch (error) {}
        return data;
    }

    function load() {
        if (!pending) {
            pending = fetchPosts('/api/posts-data')
                .catch(function () { return fetchPosts('data/posts.json'); })
                .then(cachePosts)
                .catch(function (error) {
                    console.warn('Cannot load posts; using local cache:', error.message);
                    return readCache();
                })
                .finally(function () { pending = null; });
        }
        return pending;
    }

    window.OmiBlog = window.OmiBlog || {};
    window.OmiBlog.posts = Object.freeze({ load: load, cacheKey: CACHE_KEY });
})();
