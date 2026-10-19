// panel.js para Flask
function duracion(segundos) {
    segundos = Number(segundos);
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

function celda(fila, texto, etiqueta = 'td') {
    const c = document.createElement(etiqueta);
    c.textContent = texto ?? '';
    fila.appendChild(c);
    return c;
}

function llenarTabla(id, encabezados, filas, convertir) {
    const tabla = document.getElementById(id);
    if (!tabla) return;
    tabla.replaceChildren();
    
    const thead = tabla.createTHead();
    const encabezado = thead.insertRow();
    encabezados.forEach((texto) => celda(encabezado, texto, 'th'));

    const cuerpo = tabla.createTBody();
    if (!filas || filas.length === 0) {
        const vacia = celda(cuerpo.insertRow(), 'Sin datos todavía.');
        vacia.colSpan = encabezados.length;
        return;
    }
    filas.forEach((dato) => {
        const fila = cuerpo.insertRow();
        convertir(dato).forEach((valor) => celda(fila, valor));
    });
}

function mostrarKpis(r) {
    const kpis = [
        ['Visitantes únicos', r.visitantes],
        ['Sesiones', r.sesiones],
        ['Usuarios identificados', r.usuarios],
        ['Páginas vistas', r.vistas],
        ['Clics', r.clics],
        ['Tiempo promedio por sesión', duracion(r.tiempo_promedio)],
    ];
    const contenedor = document.getElementById('kpis');
    if (!contenedor) return;
    contenedor.replaceChildren();
    
    kpis.forEach(([titulo, valor]) => {
        const div = document.createElement('div');
        div.className = 'kpi';
        celda(div, valor, 'strong');
        celda(div, titulo, 'span');
        contenedor.appendChild(div);
    });
}

const nombresTipo = { vista: '👁 vista', clic: '🖱 clic', tiempo: '⏱ tiempo' };

async function cargarMetricas() {
    try {
        const respuesta = await fetch('/api/metricas'); // O la ruta de tu API en Flask
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.json();

        mostrarKpis(datos.resumen);

        llenarTabla('tabla-recientes', ['Hora', 'Quién', 'Qué', 'Página', 'Detalle'], datos.recientes,
            (f) => [f.hora, f.nombre, nombresTipo[f.tipo] || f.tipo, f.pagina,
                    f.tipo === 'clic' ? f.elemento : f.tipo === 'tiempo' ? duracion(f.segundos) : '']);

        llenarTabla('tabla-paginas', ['Página', 'Vistas', 'Clics', 'Tiempo total'], datos.paginas,
            (f) => [f.pagina, f.vistas, f.clics, duracion(f.segundos)]);

        llenarTabla('tabla-clics', ['Elemento', 'Página', 'Clics'], datos.clics,
            (f) => [f.elemento, f.pagina, f.total]);

        llenarTabla('tabla-usuarios', ['Nombre', 'Sesiones', 'Vistas', 'Clics', 'Tiempo', 'Última actividad'],
            datos.usuarios,
            (f) => [f.nombre, f.sesiones, f.vistas, f.clics, duracion(f.segundos), f.ultima]);

    } catch (error) {
        console.error("Error al cargar métricas:", error);
    }
}

document.addEventListener("DOMContentLoaded", function() {
    cargarMetricas();
    setInterval(cargarMetricas, 5000);
});