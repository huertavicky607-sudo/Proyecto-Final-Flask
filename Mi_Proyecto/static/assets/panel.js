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

function agregarBarras(id, columna, filas, campo) {
    const maximo = Math.max(...filas.map((f) => Number(f[campo])), 1);
    document.querySelectorAll(`#${id} tbody tr`).forEach((tr, i) => {
        if (!filas[i] || !tr.cells[columna]) return;
        const barra = document.createElement('span');
        barra.className = 'barra';
        barra.style.width = `${(Number(filas[i][campo]) / maximo) * 100}%`;
        tr.cells[columna].appendChild(barra);
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
        div.className = 'metric-card';
        celda(div, valor, 'h3');
        celda(div, titulo, 'p');
        contenedor.appendChild(div);
    });
}

const nombresTipo = { vista: '👁 vista', clic: '🖱 clic', tiempo: '⏱ tiempo' };

async function cargar() {
    const estado = document.getElementById('estado');
    try {
        const respuesta = await fetch('/api/metricas');
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.json();

        mostrarKpis(datos.resumen);

        llenarTabla('tabla-recientes', ['Hora', 'Quién', 'Qué', 'Página', 'Detalle'], datos.recientes,
            (f) => [f.hora, f.nombre, nombresTipo[f.tipo] || f.tipo, f.pagina,
                    f.tipo === 'clic' ? f.elemento : f.tipo === 'tiempo' ? duracion(f.segundos) : '']);

        llenarTabla('tabla-paginas', ['Página', 'Vistas', 'Clics', 'Tiempo total'], datos.paginas,
            (f) => [f.pagina, f.vistas, f.clics, duracion(f.segundos)]);
        agregarBarras('tabla-paginas', 1, datos.paginas, 'vistas');

        llenarTabla('tabla-clics', ['Elemento', 'Página', 'Clics'], datos.clics,
            (f) => [f.elemento, f.pagina, f.total]);
        agregarBarras('tabla-clics', 2, datos.clics, 'total');

        llenarTabla('tabla-usuarios', ['Nombre', 'Carrera', 'Sesiones', 'Vistas', 'Clics', 'Tiempo', 'Última actividad'],
            datos.usuarios,
            (f) => [f.nombre, f.carrera, f.sesiones, f.vistas, f.clics, duracion(f.segundos), f.ultima]);

        llenarTabla('tabla-carreras', ['Carrera', 'Usuarios', 'Clics', 'Tiempo total'], datos.carreras,
            (f) => [f.carrera, f.usuarios, f.clics, duracion(f.segundos)]);
        agregarBarras('tabla-carreras', 3, datos.carreras, 'segundos');

        if(estado) estado.textContent = `Última actualización: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        if(estado) estado.textContent = `No se pudieron cargar las métricas.`;
    }
}

document.addEventListener("DOMContentLoaded", function() {
    cargar();
    setInterval(cargar, 5000);
});
