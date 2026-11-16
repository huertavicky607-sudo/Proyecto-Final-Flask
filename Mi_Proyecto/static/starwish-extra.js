/* =====================================================================
   starwish-extra.js
   <script src="{{ url_for('static', filename='starwish-extra.js') }}"></script>
   ===================================================================== */

/* ---------- Carrito: el contador se guarda en el navegador ---------- */
(function () {
    const KEY = 'sw_cart_count';

    function leer() {
        try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; }
    }
    function guardar(n) {
        try { localStorage.setItem(KEY, String(n)); } catch (e) { /* modo privado: se ignora */ }
    }
    function pintar() {
        document.querySelectorAll('.count-products-cart').forEach(el => { el.textContent = leer(); });
    }

    window.swCart = {
        count: leer,
        add(n) { guardar(leer() + n); pintar(); },
        clear() { guardar(0); pintar(); }
    };

    pintar();
})();

/* ---------- Aviso flotante ---------- */
window.swToast = function (mensaje) {
    let el = document.getElementById('sw-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sw-toast';
        el.className = 'sw-toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.textContent = mensaje;
    el.classList.add('show');
    clearTimeout(window.__swToastTimer);
    window.__swToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
};
