/* =====================================================================
   starwish-extra.js  (se carga desde base.html en todas las páginas)
   ===================================================================== */

/* ---------- Menú lateral (celular) ---------- */
(function () {
    const overlay = document.getElementById('overlay');
    const hamburger = document.querySelector('.menu-hamburger');
    const menu = document.querySelector('.menu-responsive');
    const close = document.querySelector('.btn-close-responsive');
    if (!menu) return;

    function abrir() {
        menu.classList.add('active');
        if (overlay) overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    function cerrar() {
        menu.classList.remove('active');
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    if (hamburger) hamburger.addEventListener('click', abrir);
    if (close) close.addEventListener('click', cerrar);
    if (overlay) overlay.addEventListener('click', cerrar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
})();

/* ---------- Carrito (se guarda en el navegador) ---------- */
(function () {
    const KEY = 'sw_cart_v2';

    function leer() {
        try {
            const datos = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(datos) ? datos : [];
        } catch (e) { return []; }
    }
    function llave(i) { return [i.id_producto, i.color || '', i.talla || ''].join('|'); }
    function total() { return leer().reduce((s, i) => s + (i.cantidad || 0), 0); }

    function pintar() {
        document.querySelectorAll('.count-products-cart').forEach(el => { el.textContent = total(); });
    }
    function guardar(items) {
        try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* modo privado */ }
        pintar();
        document.dispatchEvent(new CustomEvent('sw-cart-change'));
    }
    function animar() {
        document.querySelectorAll('.carrito').forEach(el => {
            el.classList.remove('bump');
            void el.offsetWidth;
            el.classList.add('bump');
        });
    }

    window.swCart = {
        items: leer,
        count: total,
        keyOf: llave,

        /* Devuelve { cantidad, limitado }: cantidad final de esa variante en el carrito */
        add(item) {
            const items = leer();
            const max = item.stock > 0 ? item.stock : Infinity;
            const existente = items.find(i => llave(i) === llave(item));
            let cantidad = item.cantidad;
            let limitado = false;

            if (existente) {
                cantidad = existente.cantidad + item.cantidad;
                if (cantidad > max) { cantidad = max; limitado = true; }
                existente.cantidad = cantidad;
                existente.stock = item.stock;
                existente.precio = item.precio;
            } else {
                if (cantidad > max) { cantidad = max; limitado = true; }
                items.push(Object.assign({}, item, { cantidad }));
            }
            guardar(items);
            animar();
            return { cantidad, limitado };
        },
        setQty(k, cantidad) {
            const items = leer();
            const it = items.find(i => llave(i) === k);
            if (!it) return;
            const max = it.stock > 0 ? it.stock : Infinity;
            it.cantidad = Math.max(1, Math.min(cantidad, max));
            guardar(items);
        },
        remove(k) { guardar(leer().filter(i => llave(i) !== k)); },
        clear() { guardar([]); }
    };

    pintar();
    window.addEventListener('pageshow', pintar);   // al volver con el botón "atrás"
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
    window.__swToastTimer = setTimeout(() => el.classList.remove('show'), 2800);
};

/* ---------- Aviso de cookies ---------- */
(function () {
    const banner = document.getElementById('cookie-banner');
    const boton = document.getElementById('cookie-ok');
    if (!banner || !boton) return;

    const yaVisto = document.cookie.split('; ').some(c => c.startsWith('sw_aviso_cookies='));
    if (!yaVisto) banner.hidden = false;

    boton.addEventListener('click', () => {
        document.cookie = 'sw_aviso_cookies=1; max-age=31536000; path=/; SameSite=Lax';
        banner.hidden = true;
    });
})();

/* ---------- Mostrar / ocultar contraseña ---------- */
document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
        const campo = document.getElementById(btn.dataset.target);
        if (!campo) return;
        const mostrar = campo.type === 'password';
        campo.type = mostrar ? 'text' : 'password';
        const icono = btn.querySelector('i');
        if (icono) {
            icono.classList.toggle('fa-eye', !mostrar);
            icono.classList.toggle('fa-eye-slash', mostrar);
        }
    });
});
