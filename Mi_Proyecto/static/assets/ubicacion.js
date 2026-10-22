(function () {
    let mapaUbicacion = null;

    function inicializarMapa() {
        const contenedor = document.getElementById('mapa');
        if (!contenedor) return;

        // Si el mapa ya fue creado, solo le pedimos que recalcule su tamaño actual
        if (mapaUbicacion) {
            setTimeout(() => {
                mapaUbicacion.invalidateSize();
            }, 300);
            return;
        }

        // Validar que Leaflet esté disponible
        if (typeof L === 'undefined') return;

        // Corregir las rutas de los iconos con el CDN oficial
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        // Crear la instancia del mapa
        mapaUbicacion = L.map('mapa').setView([19.43, -99.13], 13);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapaUbicacion);

        const capaGuardadas = L.featureGroup().addTo(mapaUbicacion);
        const capaActual    = L.layerGroup().addTo(mapaUbicacion);

        // Doble reintento para asegurar que los mosaicos cuadren perfectamente
        setTimeout(() => { mapaUbicacion.invalidateSize(); }, 300);
        setTimeout(() => { mapaUbicacion.invalidateSize(); }, 700);

        const btnCapturar = document.getElementById('btn-capturar');
        const mensaje     = document.getElementById('mensaje');
        const datos       = document.getElementById('datos');
        const historial   = document.getElementById('historial');

        function mostrar(texto, clase) {
            if (!mensaje) return;
            mensaje.textContent = texto;
            mensaje.className = clase;
            mensaje.hidden = false;
        }

        if (btnCapturar && !btnCapturar.hasAttribute('data-binded')) {
            btnCapturar.setAttribute('data-binded', 'true');
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
            mapaUbicacion.setView([latitude, longitude], 16);
            mapaUbicacion.invalidateSize();
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
            if (!datos) return;
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
                mapaUbicacion.fitBounds(capaGuardadas.getBounds(), { maxZoom: 16, padding: [20, 20] });
                mapaUbicacion.invalidateSize();
            }
        });
    }

    // Escuchar tanto la carga de la página como los eventos de navegación de la app
    window.addEventListener('pageshow', () => {
        setTimeout(inicializarMapa, 250);
    });

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(inicializarMapa, 250);
    });
})();
