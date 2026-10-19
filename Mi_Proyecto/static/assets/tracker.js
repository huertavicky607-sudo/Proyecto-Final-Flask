(function () {
    'use strict';

    // Obtener o crear cookie de visitante
    function getCookie(name) {
        var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    }

    function setCookie(name, value, days) {
        var expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
    }

    var visitanteId = getCookie('visitante_id');
    if (!visitanteId) {
        visitanteId = 'v_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        setCookie('visitante_id', visitanteId, 365);
    }

    // Enviar evento de rastreo al backend de Flask
    function logEvent(tipo, detalle) {
        $.ajax({
            url: '/api/tracker',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                visitante_id: visitanteId,
                tipo: tipo,
                pagina: window.location.pathname,
                detalle: detalle || ''
            })
        });
    }

    // Registrar vista de página al cargar
    $(document).ready(function () {
        logEvent('vista', document.title);

        var startTime = Date.now();
        // Registrar tiempo al salir/cambiar de página
        $(window).on('beforeunload pagehide', function () {
            var duration = Math.round((Date.now() - startTime) / 1000);
            if (duration > 0) {
                logEvent('tiempo', duration + ' s');
            }
        });

        // Registrar clics en botones y enlaces
        $(document).on('click', 'a, button, .ui-btn', function () {
            var text = $.trim($(this).text()).substring(0, 50);
            if (text) {
                logEvent('clic', text);
            }
        });
    });
})();