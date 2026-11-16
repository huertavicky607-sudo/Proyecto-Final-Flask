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

/* ---------- Compra: envía artículos + dirección de entrega al servidor ---------- */
window.swCheckout = async function (envio, items) {
    const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, envio })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Inicia sesión para comprar.'); }
    if (!res.ok) throw new Error(data.error || 'No se pudo procesar la compra.');
    return data;
};

/* ---------- Leaflet bajo demanda (mapa de entrega) ---------- */
function swCargarLeaflet() {
    if (window.L) return Promise.resolve();
    if (window.__swLeaflet) return window.__swLeaflet;
    window.__swLeaflet = new Promise((ok, mal) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        css.crossOrigin = '';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        js.crossOrigin = '';
        js.onload = ok;
        js.onerror = () => { window.__swLeaflet = null; mal(new Error('No se pudo cargar el mapa.')); };
        document.head.appendChild(js);
    });
    return window.__swLeaflet;
}

/* ---------- Ventana de compra (pago SIMULADO, solo para pruebas) ----------
   Paso 1: el cliente marca su dirección de entrega en el mapa.
   Paso 2: datos de la tarjeta (nunca se envían al servidor).
   swPago({ total, unidades, pagar }) → pagar(envio) registra la compra.
   Devuelve una promesa con el resultado de pagar(), o null si se cancela. */
window.swPago = function ({ total, unidades = 1, pagar }) {
    const dinero = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const TIENDA = [19.6006437, -99.1022204];   // Starwish Coacalco

    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'pay-modal';
        modal.innerHTML = `
        <div class="pay-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-title">
            <button type="button" class="pay-close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>

            <ol class="pay-steps">
                <li class="active" data-step="envio"><span>1</span> Envío</li>
                <li data-step="pago"><span>2</span> Pago</li>
            </ol>

            <!-- ===== Paso 1: dirección de entrega ===== -->
            <div class="pay-view" data-view="envio">
                <h3 id="pay-title"><i class="fa-solid fa-location-dot"></i> ¿A dónde te lo enviamos?</h3>
                <p class="pay-sub">Usa tu ubicación o toca el mapa para marcar tu domicilio. Puedes arrastrar el marcador.</p>
                <button type="button" class="btn-outline-pill pay-geo" id="pay-geo"><i class="fa-solid fa-location-crosshairs"></i> Usar mi ubicación</button>
                <div class="pay-map" id="pay-map"><p class="pay-map-msg">Cargando mapa…</p></div>
                <div class="form-field">
                    <label for="pay-dir">Dirección de entrega</label>
                    <input id="pay-dir" autocomplete="street-address" placeholder="Calle, número, colonia, ciudad" maxlength="200">
                </div>
                <div class="form-field">
                    <label for="pay-ref">Referencias (opcional)</label>
                    <input id="pay-ref" autocomplete="off" placeholder="Ej. Casa azul, portón negro" maxlength="50">
                </div>
                <p class="pay-error" id="err-envio" hidden></p>
                <button type="button" class="btn-primary-pill" id="pay-next">Continuar al pago <i class="fa-solid fa-arrow-right"></i></button>
            </div>

            <!-- ===== Paso 2: tarjeta ===== -->
            <div class="pay-view" data-view="pago" hidden>
                <h3><i class="fa-solid fa-lock"></i> Pago seguro</h3>
                <p class="pay-test"><i class="fa-solid fa-flask"></i> Modo de prueba: no se realiza ningún cargo. Usa la tarjeta <strong>4242 4242 4242 4242</strong>.</p>
                <button type="button" class="pay-back" id="pay-back"><i class="fa-solid fa-arrow-left"></i> <span id="pay-dir-resumen"></span></button>

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

                    <p class="pay-error" id="pay-error" hidden></p>

                    <div class="pay-total"><span>Total a pagar (${unidades} pieza(s))</span><strong>${dinero(total)}</strong></div>
                    <button type="submit" class="btn-primary-pill" id="pay-submit"><i class="fa-solid fa-lock"></i> Pagar ${dinero(total)}</button>
                </form>
            </div>

            <!-- ===== Listo ===== -->
            <div class="pay-view" data-view="ok" hidden>
                <div class="pay-ok-icon"><i class="fa-solid fa-check"></i></div>
                <h3>¡Pago aprobado!</h3>
                <p class="pay-sub">Tu pedido fue registrado y va en camino.</p>
                <div class="pay-receipt">
                    <div><span>Folio</span><strong id="pay-folio"></strong></div>
                    <div><span>Tarjeta</span><strong id="pay-last4"></strong></div>
                    <div><span>Total</span><strong id="pay-paid"></strong></div>
                    <div class="pay-receipt-dir"><span>Entrega en</span><strong id="pay-entrega"></strong></div>
                </div>
                <button type="button" class="btn-primary-pill" id="pay-done">Seguir comprando</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        const $ = s => modal.querySelector(s);
        const inNombre = $('#pay-nombre'), inNum = $('#pay-num'), inExp = $('#pay-exp'),
              inCvv = $('#pay-cvv'), inDir = $('#pay-dir'), inRef = $('#pay-ref'),
              err = $('#pay-error'), errEnvio = $('#err-envio'),
              btn = $('#pay-submit'), card = $('#pay-card');
        let resultado = null;
        let procesando = false;
        let mapa = null, marcador = null, punto = null;

        function vista(nombre) {
            modal.querySelectorAll('.pay-view').forEach(v => { v.hidden = v.dataset.view !== nombre; });
            modal.querySelectorAll('.pay-steps li').forEach(li => {
                li.classList.toggle('active', li.dataset.step === nombre);
                li.classList.toggle('done', nombre !== 'envio' && li.dataset.step === 'envio');
            });
            $('.pay-steps').hidden = nombre === 'ok';
            $('.pay-dialog').scrollTop = 0;
        }

        function cerrar() {
            if (procesando) return;
            if (mapa) mapa.remove();
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

        /* ---------- Paso 1: mapa de entrega ---------- */
        let ultimaBusqueda = 0;
        async function direccionDe(lat, lng) {
            const id = ++ultimaBusqueda;
            inDir.placeholder = 'Buscando dirección…';
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es&zoom=18`);
                const d = await r.json();
                if (id !== ultimaBusqueda) return;   // llegó una respuesta vieja
                const a = d.address || {};
                const partes = [
                    [a.road, a.house_number].filter(Boolean).join(' '),
                    a.neighbourhood || a.suburb,
                    a.city || a.town || a.village || a.municipality,
                    a.state, a.postcode
                ].filter(Boolean);
                inDir.value = partes.join(', ') || d.display_name || '';
            } catch (e) {
                /* sin internet o servicio ocupado: el cliente la escribe a mano */
            } finally {
                inDir.placeholder = 'Calle, número, colonia, ciudad';
            }
        }

        function marcar(lat, lng, zoom) {
            punto = { lat, lng };
            if (!marcador) {
                marcador = L.marker([lat, lng], { draggable: true }).addTo(mapa);
                marcador.on('dragend', () => {
                    const p = marcador.getLatLng();
                    punto = { lat: p.lat, lng: p.lng };
                    direccionDe(p.lat, p.lng);
                });
            } else {
                marcador.setLatLng([lat, lng]);
            }
            mapa.setView([lat, lng], zoom || Math.max(mapa.getZoom(), 16));
            direccionDe(lat, lng);
            errEnvio.hidden = true;
        }

        swCargarLeaflet().then(() => {
            if (!document.body.contains(modal)) return;
            $('#pay-map').innerHTML = '';
            mapa = L.map($('#pay-map')).setView(TIENDA, 12);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(mapa);
            mapa.on('click', e => marcar(e.latlng.lat, e.latlng.lng));
            setTimeout(() => mapa.invalidateSize(), 150);
        }).catch(() => {
            $('#pay-map').innerHTML = '<p class="pay-map-msg">No se pudo cargar el mapa. Escribe tu dirección abajo.</p>';
        });

        $('#pay-geo').addEventListener('click', () => {
            const b = $('#pay-geo');
            if (!navigator.geolocation || !window.isSecureContext) {
                swToast('La ubicación solo funciona en https:// o en localhost');
                return;
            }
            if (!mapa) { swToast('Espera a que cargue el mapa'); return; }
            b.disabled = true;
            b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Buscando…';
            navigator.geolocation.getCurrentPosition(pos => {
                marcar(pos.coords.latitude, pos.coords.longitude, 17);
                b.disabled = false;
                b.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Usar mi ubicación';
            }, e => {
                b.disabled = false;
                b.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Usar mi ubicación';
                swToast(e.code === 1 ? 'Negaste el permiso de ubicación' : 'No se pudo obtener tu ubicación');
            }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
        });

        function direccionCompleta() {
            const ref = inRef.value.trim();
            return inDir.value.trim() + (ref ? ` (Ref: ${ref})` : '');
        }

        $('#pay-next').addEventListener('click', () => {
            if (!punto) {
                errEnvio.textContent = 'Marca tu domicilio en el mapa o usa tu ubicación.';
                errEnvio.hidden = false;
                return;
            }
            if (inDir.value.trim().length < 8) {
                errEnvio.textContent = 'Escribe tu dirección de entrega.';
                errEnvio.hidden = false;
                inDir.focus();
                return;
            }
            $('#pay-dir-resumen').textContent = direccionCompleta();
            vista('pago');
            setTimeout(() => inNombre.focus(), 50);
        });
        $('#pay-back').addEventListener('click', () => {
            vista('envio');
            if (mapa) setTimeout(() => mapa.invalidateSize(), 50);
        });

        /* ---------- Paso 2: tarjeta ---------- */
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
            const vencida = !aa || new Date(2000 + aa, mm) <= new Date();   // 1er día del mes siguiente
            if (inNombre.value.trim().length < 3) return [inNombre, 'Escribe el nombre del titular.'];
            if (!luhn(num)) return [inNum, 'El número de tarjeta no es válido.'];
            if (!mm || mm < 1 || mm > 12 || vencida) return [inExp, 'La fecha de vencimiento no es válida.'];
            if (inCvv.value.length < 3) return [inCvv, 'El CVV debe tener 3 o 4 dígitos.'];
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
                const envio = { direccion: direccionCompleta(), lat: punto.lat, lng: punto.lng };
                resultado = await pagar(envio);
                const num = inNum.value.replace(/\D/g, '');
                $('#pay-folio').textContent = (resultado && resultado.folio) || 'SW-' + Date.now().toString().slice(-8);
                $('#pay-last4').textContent = (marca(num) || 'Tarjeta') + ' •••• ' + num.slice(-4);
                $('#pay-paid').textContent = dinero(resultado && resultado.total_final != null ? resultado.total_final : total);
                $('#pay-entrega').textContent = envio.direccion;
                vista('ok');
            } catch (ex) {
                err.textContent = ex.message;
                err.hidden = false;
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-lock"></i> Pagar ${dinero(total)}`;
            } finally {
                procesando = false;
            }
        });
    });
};

/* ---------- Aviso de cookies ----------
   sw_cookies = 'todas' (acepta métricas) | 'necesarias' (solo sesión y carrito).
   Se puede volver a abrir desde el enlace "Cookies" del pie de página. */
window.swConsentimiento = function () {
    const c = document.cookie.split('; ').find(x => x.startsWith('sw_cookies='));
    return c ? c.split('=')[1] : null;
};
(function () {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;

    function guardar(valor) {
        document.cookie = 'sw_cookies=' + valor + '; max-age=31536000; path=/; SameSite=Lax';
        banner.classList.remove('show');
        setTimeout(() => { banner.hidden = true; }, 300);
        document.dispatchEvent(new CustomEvent('sw-consentimiento', { detail: valor }));
    }
    function abrir() {
        banner.hidden = false;
        requestAnimationFrame(() => banner.classList.add('show'));
    }

    document.getElementById('cookie-ok')?.addEventListener('click', () => guardar('todas'));
    document.getElementById('cookie-no')?.addEventListener('click', () => guardar('necesarias'));
    document.querySelectorAll('[data-abrir-cookies]').forEach(a => a.addEventListener('click', e => {
        e.preventDefault();
        abrir();
    }));

    if (!window.swConsentimiento()) setTimeout(abrir, 600);
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
