/**
 * Omiaちゃん Blog — 管理门禁 v2.0 「おまもり」
 * ======================================================
 * 只存密码的 SHA-256 哈希，源码里不再出现明文密码。
 * 匹配成功 → 写入 adm_sesFlag → 跳转 _p/index.html
 */
(function () {
    'use strict';

    if (!/[\?&]admin/.test(location.search)) return;

    var EXPECT_USER_HASH = '4a647de78d0d1b741fd179453801bf1b1fa9909a4f0bef0a7c64c946870a0526';
    var EXPECT_PASS_HASH = '1d58f2649917f5da75f62da2ecb2ec0021b76960f965b0e19c9f8eddc5f6f833';

    function sha256hex(s) {
        return window.crypto.subtle
            .digest('SHA-256', new TextEncoder().encode(s))
            .then(function (buf) {
                var out = '';
                new Uint8Array(buf).forEach(function (b) {
                    out += b.toString(16).padStart(2, '0');
                });
                return out;
            });
    }

    function go() {
        var err = document.getElementById('admErr');
        var u = document.getElementById('admUser').value.trim();
        var p = document.getElementById('admPass').value;

        Promise.all([sha256hex(u), sha256hex(p)]).then(function (hs) {
            if (hs[0] === EXPECT_USER_HASH && hs[1] === EXPECT_PASS_HASH) {
                localStorage.setItem('adm_sesFlag', '1');
                location.href = '_p/index.html';
            } else {
                err.textContent = '凭证错误';
            }
        }).catch(function () {
            err.textContent = '当前环境不支持加密校验，请使用现代浏览器（需 HTTPS）';
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var gate = document.getElementById('adminGate');
        if (gate) gate.style.display = 'flex';
        document.getElementById('admBtn').addEventListener('click', go);
        document.getElementById('admPass').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') go();
        });
    });
})();
