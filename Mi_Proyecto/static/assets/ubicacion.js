document.addEventListener("DOMContentLoaded", () => {
    // Dar un pequeño respiro para que el DOM y jQuery Mobile estabilicen la vista
    setTimeout(inicializarMapa, 300);
});

function inicializarMapa() {
    const contenedor = document.getElementById('mapa');
    if (!contenedor || contenedor._leaflet_id) return;

    // Corregir la ruta de los iconos con el CDN oficial
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const btnCapturar = document.getElementById('btn-capturar');
    const mensaje     = document.getElementById('mensaje');
    const datos       = document.getElementById('datos');
    const historial   = document.getElementById('historial');

    function mostrar(texto, clase) {
        mensaje.textContent = texto;
        mensaje.className = clase;
        mensaje.hidden = false;
    }

    // Inicializar mapa centrado por defecto
    const mapa = L.map('mapa').setView([19.43, -99.13], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);

    const capaGuardadas = L.featureGroup().addTo(mapa);
    const capaActual    = L.layerGroup().addTo(mapa);

    // Forzar doble redibujado para vencer el retraso visual de jQuery Mobile
    setTimeout(() => { mapa.invalidateSize(); }, 300);
    setTimeout(() => { mapa.invalidateSize(); }, 800);

    if (btnCapturar) {
        btnCapturar.addEventListener('click', () => {
            if (!window.isSecureContext || !navigator.geolocation) {
                mostrar('La ubicación solo funciona en https:// o en localhost.', 'error');
                return;
            }
            btnCapturar.disabled = true;
            mostrar('Buscando tu ubicación…', 'info');
            navigator.geolocation.getCurrentPosition(guardar, fallo, {
                enableHighAccuracy: false,
                timeout: 20000,
                maximumAge: 60000,
            });
        });
    }

    const errores = {
        1: 'Negaste el permiso de ubicación.',
        2: 'No se pudo determinar tu ubicación.',
        3: 'Se agotó el tiempo de espera.',
    };

    function fallo(error) {
        if (btnCapturar) btnCapturar.disabled = false;
        mostrar(errores[error.code] ?? error.message, 'error');
    }

    async function guardar(posicion) {
        const { latitude, longitude, accuracy } = posicion.coords;

        capaActual.clearLayers();
        L.circle([latitude, longitude], { radius: accuracy }).addTo(capaActual);
        mapa.setView([latitude, longitude], 16);
        mapa.invalidateSize();
        mostrarDatos(latitude, longitude, accuracy);

        try {
            const respuesta = await fetch('/api/guardar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitud: latitude, longitud: longitude, precision: accuracy }),
            });
            const json = await respuesta.json();
            if (btnCapturar) btnCapturar.disabled = false;

            if (!respuesta.ok) {
                mostrar(json.error, 'error');
                return;
            }
            mostrar('Ubicación guardada en la base de datos.', 'exito');
            cargarHistorial();
        } catch (e) {
            if (btnCapturar) btnCapturar.disabled = false;
            mostrar('Error de red al guardar la ubicación.', 'error');
        }
    }

    function mostrarDatos(lat, lng, precision) {
        const enlace = document.createElement('a');
        enlace.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
        enlace.target = '_blank';
        enlace.textContent = 'Abrir en OpenStreetMap';
        datos.textContent = `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)} (±${Math.round(precision)} m) · `;
        datos.append(enlace);
        datos.hidden = false;
    }

    async function cargarHistorial() {
        try {
            const respuesta = await fetch('/api/ubicaciones');
            if (!respuesta.ok) return;
            const ubicaciones = await respuesta.json();
            
            capaGuardadas.clearLayers();
            if (historial) historial.innerHTML = '';
            for (const u of ubicaciones) {
                const texto = `${u.nombre} · ${u.creado_en}`;

                const etiqueta = document.createElement('span');
                etiqueta.textContent = texto;
                L.marker([u.latitud, u.longitud]).bindPopup(etiqueta).addTo(capaGuardadas);

                const li = document.createElement('li');
                li.textContent = `${texto} → ${u.latitud.toFixed(5)}, ${u.longitud.toFixed(5)} (±${u.precision_m} m)`;
                if (historial) historial.append(li);
            }
        } catch (error) {
            console.error("No se pudo cargar el historial:", error);
        }
    }

    cargarHistorial().then(() => {
        if (capaGuardadas.getLayers().length) {
            mapa.fitBounds(capaGuardadas.getBounds(), { maxZoom: 16, padding: [20, 20] });
            mapa.invalidateSize();
        }
    });
}
