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

/* ---------- Compra: envía los artículos al servidor ---------- */
window.swCheckout = async function (items) {
    const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Inicia sesión para comprar.'); }
    if (!res.ok) throw new Error(data.error || 'No se pudo procesar la compra.');
    return data;
};

/* ---------- Ventana de pago (SIMULADA, solo para pruebas) ----------
   swPago({ total, unidades, pagar }) abre el formulario de tarjeta.
   - pagar: función async que registra la compra (la llama al aprobar).
   - Devuelve una promesa con el resultado de pagar(), o null si se cancela.
   Los datos de la tarjeta NUNCA se envían al servidor. */
window.swPago = function ({ total, unidades = 1, pagar }) {
    const dinero = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'pay-modal';
        modal.innerHTML = `
        <div class="pay-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-title">
            <button type="button" class="pay-close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>

            <div class="pay-view" data-view="form">
                <h3 id="pay-title"><i class="fa-solid fa-lock"></i> Pago seguro</h3>
                <p class="pay-test"><i class="fa-solid fa-flask"></i> Modo de prueba: no se realiza ningún cargo. Usa la tarjeta <strong>4242 4242 4242 4242</strong>.</p>

                <div class="pay-card" id="pay-card">
                    <div class="pay-card-front">
                        <div class="pay-card-top"><i class="fa-solid fa-bolt"></i> Starwish <span class="pay-brand" id="pay-brand"></span></div>
                        <div class="pay-chip"></div>
                        <div class="pay-num" id="pv-num">•••• •••• •••• ••••</div>
                        <div class="pay-card-bottom">
                            <div><small>Titular</small><span id="pv-nombre">NOMBRE APELLIDO</span></div>
                            <div><small>Vence</small><span id="pv-exp">MM/AA</span></div>
                        </div>
                    </div>
                    <div class="pay-card-back">
                        <div class="pay-strip"></div>
                        <div class="pay-cvv-box"><small>CVV</small><span id="pv-cvv">•••</span></div>
                    </div>
                </div>

                <form class="pay-form" novalidate>
                    <div class="form-field">
                        <label for="pay-nombre">Nombre en la tarjeta</label>
                        <input id="pay-nombre" autocomplete="off" placeholder="Como aparece en la tarjeta" maxlength="40">
                    </div>
                    <div class="form-field">
                        <label for="pay-num">Número de tarjeta</label>
                        <input id="pay-num" inputmode="numeric" autocomplete="off" placeholder="1234 5678 9012 3456" maxlength="19">
                    </div>
                    <div class="pay-row">
                        <div class="form-field">
                            <label for="pay-exp">Vencimiento</label>
                            <input id="pay-exp" inputmode="numeric" autocomplete="off" placeholder="MM/AA" maxlength="5">
                        </div>
                        <div class="form-field">
                            <label for="pay-cvv">CVV</label>
                            <input id="pay-cvv" inputmode="numeric" autocomplete="off" placeholder="123" maxlength="4">
                        </div>
                    </div>
                    <div class="form-field">
                        <label for="pay-dir">Dirección de envío</label>
                        <input id="pay-dir" autocomplete="off" placeholder="Calle, número, colonia, ciudad" maxlength="120">
                    </div>

                    <p class="pay-error" id="pay-error" hidden></p>

                    <div class="pay-total"><span>Total a pagar (${unidades} pieza(s))</span><strong>${dinero(total)}</strong></div>
                    <button type="submit" class="btn-primary-pill" id="pay-submit"><i class="fa-solid fa-lock"></i> Pagar ${dinero(total)}</button>
                </form>
            </div>

            <div class="pay-view" data-view="ok" hidden>
                <div class="pay-ok-icon"><i class="fa-solid fa-check"></i></div>
                <h3>¡Pago aprobado!</h3>
                <p class="pay-sub">Tu pedido fue registrado correctamente.</p>
                <div class="pay-receipt">
                    <div><span>Folio</span><strong id="pay-folio"></strong></div>
                    <div><span>Tarjeta</span><strong id="pay-last4"></strong></div>
                    <div><span>Total</span><strong id="pay-paid"></strong></div>
                </div>
                <button type="button" class="btn-primary-pill" id="pay-done">Seguir comprando</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        const $ = s => modal.querySelector(s);
        const inNombre = $('#pay-nombre'), inNum = $('#pay-num'), inExp = $('#pay-exp'),
              inCvv = $('#pay-cvv'), inDir = $('#pay-dir'), err = $('#pay-error'),
              btn = $('#pay-submit'), card = $('#pay-card');
        let resultado = null;
        let procesando = false;

        function cerrar() {
            if (procesando) return;
            modal.remove();
            document.body.style.overflow = '';
            document.removeEventListener('keydown', onKey);
            resolve(resultado);
        }
        function onKey(e) { if (e.key === 'Escape') cerrar(); }
        document.addEventListener('keydown', onKey);
        $('.pay-close').addEventListener('click', cerrar);
        $('#pay-done').addEventListener('click', cerrar);
        modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });

        function marca(n) {
            if (/^4/.test(n)) return 'VISA';
            if (/^(5[1-5]|2[2-7])/.test(n)) return 'MASTERCARD';
            if (/^3[47]/.test(n)) return 'AMEX';
            return '';
        }
        function luhn(n) {
            let suma = 0, doble = false;
            for (let i = n.length - 1; i >= 0; i--) {
                let d = +n[i];
                if (doble) { d *= 2; if (d > 9) d -= 9; }
                suma += d; doble = !doble;
            }
            return n.length >= 13 && suma % 10 === 0;
        }

        // Formato y vista previa en vivo
        inNombre.addEventListener('input', () => {
            $('#pv-nombre').textContent = inNombre.value.trim().toUpperCase() || 'NOMBRE APELLIDO';
        });
        inNum.addEventListener('input', () => {
            const d = inNum.value.replace(/\D/g, '').slice(0, 16);
            inNum.value = d.replace(/(.{4})/g, '$1 ').trim();
            $('#pv-num').textContent = (d + '•'.repeat(16 - d.length)).replace(/(.{4})/g, '$1 ').trim();
            $('#pay-brand').textContent = marca(d);
        });
        inExp.addEventListener('input', () => {
            let d = inExp.value.replace(/\D/g, '').slice(0, 4);
            if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
            inExp.value = d;
            $('#pv-exp').textContent = d || 'MM/AA';
        });
        inCvv.addEventListener('input', () => {
            inCvv.value = inCvv.value.replace(/\D/g, '').slice(0, 4);
            $('#pv-cvv').textContent = '•'.repeat(inCvv.value.length) || '•••';
        });
        inCvv.addEventListener('focus', () => card.classList.add('flip'));
        inCvv.addEventListener('blur', () => card.classList.remove('flip'));

        function validar() {
            const num = inNum.value.replace(/\D/g, '');
            const [mm, aa] = inExp.value.split('/').map(Number);
            const hoy = new Date();
            const vencida = !aa || new Date(2000 + aa, mm) <= hoy;   // mes siguiente al vencimiento
            if (inNombre.value.trim().length < 3) return [inNombre, 'Escribe el nombre del titular.'];
            if (!luhn(num)) return [inNum, 'El número de tarjeta no es válido.'];
            if (!mm || mm < 1 || mm > 12 || vencida) return [inExp, 'La fecha de vencimiento no es válida.'];
            if (inCvv.value.length < 3) return [inCvv, 'El CVV debe tener 3 o 4 dígitos.'];
            if (inDir.value.trim().length < 8) return [inDir, 'Escribe tu dirección de envío.'];
            return null;
        }

        $('.pay-form').addEventListener('submit', async e => {
            e.preventDefault();
            modal.querySelectorAll('.pay-form input').forEach(i => i.classList.remove('invalid'));
            const fallo = validar();
            if (fallo) {
                fallo[0].classList.add('invalid');
                fallo[0].focus();
                err.textContent = fallo[1];
                err.hidden = false;
                return;
            }
            err.hidden = true;
            procesando = true;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando pago...';

            try {
                await new Promise(r => setTimeout(r, 1200));   // simula al banco
                resultado = await pagar();
                const num = inNum.value.replace(/\D/g, '');
                $('#pay-folio').textContent = 'SW-' + Date.now().toString().slice(-8);
                $('#pay-last4').textContent = (marca(num) || 'Tarjeta') + ' •••• ' + num.slice(-4);
                $('#pay-paid').textContent = dinero(resultado && resultado.total_final != null ? resultado.total_final : total);
                $('[data-view="form"]').hidden = true;
                $('[data-view="ok"]').hidden = false;
            } catch (ex) {
                err.textContent = ex.message;
                err.hidden = false;
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-lock"></i> Pagar ${dinero(total)}`;
            } finally {
                procesando = false;
            }
        });

        setTimeout(() => inNombre.focus(), 50);
    });
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
