const btnCapturar = document.getElementById('btn-capturar');
const mensaje     = document.getElementById('mensaje');
const datos       = document.getElementById('datos');
const historial   = document.getElementById('historial');

function mostrar(texto, clase) {
    mensaje.textContent = texto;
    mensaje.className = clase;
    mensaje.hidden = false;
}

// ---------- El mapa: Leaflet + mosaicos de OpenStreetMap ----------
const mapa = L.map('mapa').setView([19.43, -99.13], 10); // Ciudad de México por defecto
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(mapa);

const capaGuardadas = L.featureGroup().addTo(mapa);
const capaActual    = L.layerGroup().addTo(mapa);

btnCapturar.addEventListener('click', () => {
    if (!window.isSecureContext || !navigator.geolocation) {
        mostrar('La ubicación solo funciona en https:// o en localhost.', 'error');
        return;
    }
    btnCapturar.disabled = true;
    mostrar('Buscando tu ubicación…', 'info');
    navigator.geolocation.getCurrentPosition(guardar, fallo, {
        enableHighAccuracy: false, // Cambiado a false para que la laptop use red/wifi sin agotar el tiempo
        timeout: 20000,           // Subimos a 20 segundos de espera
        maximumAge: 60000,        // Permitir caché reciente para mayor velocidad
    });
});

const errores = {
    1: 'Negaste el permiso de ubicación.',
    2: 'No se pudo determinar tu ubicación.',
    3: 'Se agotó el tiempo de espera.',
};

function fallo(error) {
    btnCapturar.disabled = false;
    mostrar(errores[error.code] ?? error.message, 'error');
}

async function guardar(posicion) {
    const { latitude, longitude, accuracy } = posicion.coords;

    capaActual.clearLayers();
    L.circle([latitude, longitude], { radius: accuracy }).addTo(capaActual);
    mapa.setView([latitude, longitude], 16);
    mostrarDatos(latitude, longitude, accuracy);

    // Apunta a la ruta de Flask
    const respuesta = await fetch('/api/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitud: latitude, longitud: longitude, precision: accuracy }),
    });
    const json = await respuesta.json();
    btnCapturar.disabled = false;

    if (!respuesta.ok) {
        mostrar(json.error, 'error');
        return;
    }
    mostrar('Ubicación guardada en la base de datos.', 'exito');
    cargarHistorial();
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
        historial.innerHTML = '';
        for (const u of ubicaciones) {
            const texto = `${u.nombre} · ${u.creado_en}`;

            const etiqueta = document.createElement('span');
            etiqueta.textContent = texto;
            L.marker([u.latitud, u.longitud]).bindPopup(etiqueta).addTo(capaGuardadas);

            const li = document.createElement('li');
            li.textContent = `${texto} → ${u.latitud.toFixed(5)}, ${u.longitud.toFixed(5)} (±${u.precision_m} m)`;
            historial.append(li);
        }
    } catch (error) {
        console.error("No se pudo cargar el historial:", error);
    }
}

cargarHistorial().then(() => {
    if (capaGuardadas.getLayers().length) {
        mapa.fitBounds(capaGuardadas.getBounds(), { maxZoom: 16, padding: [20, 20] });
    }
});
