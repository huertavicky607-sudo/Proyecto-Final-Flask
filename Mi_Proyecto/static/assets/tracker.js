/* =====================================================================
   tracker.js: registra vistas, clics y tiempo en página para /metrics.
   Solo funciona si el visitante aceptó las cookies ("Aceptar todas").
   ===================================================================== */
(function () {
    'use strict';
    let iniciado = false;

    function leerCookie(nombre) {
        const c = document.cookie.split('; ').find(x => x.startsWith(nombre + '='));
        return c ? c.split('=')[1] : null;
    }

    function iniciar() {
        if (iniciado) return;
        iniciado = true;

        let visitanteId = leerCookie('visitante_id');
        if (!visitanteId) {
            visitanteId = 'v_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
            document.cookie = 'visitante_id=' + visitanteId + '; max-age=31536000; path=/; SameSite=Lax';
        }

        function enviar(tipo, detalle, segundos) {
            const datos = JSON.stringify({
                visitante_id: visitanteId,
                tipo: tipo,
                pagina: window.location.pathname,
                detalle: detalle || '',
                segundos: segundos || 0
            });
            // sendBeacon sigue funcionando aunque la página se esté cerrando
            if (tipo === 'tiempo' && navigator.sendBeacon) {
                navigator.sendBeacon('/api/tracker', new Blob([datos], { type: 'application/json' }));
                return;
            }
            fetch('/api/tracker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: datos,
                keepalive: true
            }).catch(() => {});
        }

        enviar('vista', document.title);

        const inicio = Date.now();
        let tiempoEnviado = false;
        window.addEventListener('pagehide', () => {
            if (tiempoEnviado) return;
            tiempoEnviado = true;
            const seg = Math.round((Date.now() - inicio) / 1000);
            if (seg > 0) enviar('tiempo', seg + ' s', seg);
        });

        document.addEventListener('click', e => {
            const el = e.target.closest('a, button');
            if (!el) return;
            const texto = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
            if (texto) enviar('clic', texto);
        });
    }

    if (leerCookie('sw_cookies') === 'todas') iniciar();
    document.addEventListener('sw-consentimiento', e => { if (e.detail === 'todas') iniciar(); });
})();
