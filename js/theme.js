/** Shared theme state. Load synchronously in <head> before styles to avoid flashing. */
(function () {
    'use strict';

    var STORAGE_KEY = 'omiblog_theme';
    var root = document.documentElement;

    function normalize(value) {
        return value === 'dark' ? 'dark' : 'light';
    }

    function readTheme() {
        try { return normalize(localStorage.getItem(STORAGE_KEY)); }
        catch (error) { return normalize(root.getAttribute('data-theme')); }
    }

    function applyTheme(mode, persist) {
        mode = normalize(mode);
        root.setAttribute('data-theme', mode);
        document.querySelectorAll('[data-theme-value]').forEach(function (button) {
            button.setAttribute('aria-pressed', String(button.dataset.themeValue === mode));
        });
        if (persist) {
            try { localStorage.setItem(STORAGE_KEY, mode); } catch (error) {}
        }
    }

    // The HTML element is the single source of truth for both pages and native controls.
    applyTheme(readTheme(), false);

    function bindControls() {
        applyTheme(root.getAttribute('data-theme'), false);
        document.querySelectorAll('[data-theme-switch]').forEach(function (control) {
            control.addEventListener('click', function (event) {
                var button = event.target.closest('[data-theme-value]');
                if (button && control.contains(button)) applyTheme(button.dataset.themeValue, true);
            });
            control.addEventListener('keydown', function (event) {
                var mode;
                if (event.key === 'ArrowLeft' || event.key === 'Home') mode = 'light';
                if (event.key === 'ArrowRight' || event.key === 'End') mode = 'dark';
                if (!mode) return;
                event.preventDefault();
                applyTheme(mode, true);
                control.querySelector('[data-theme-value="' + mode + '"]').focus();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindControls, { once: true });
    } else {
        bindControls();
    }

    window.addEventListener('storage', function (event) {
        try { if (event.storageArea !== localStorage) return; } catch (error) { return; }
        if (event.key === STORAGE_KEY || event.key === null) applyTheme(readTheme(), false);
    });
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) applyTheme(readTheme(), false);
    });
})();
