document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    switchTab('usuarios');
});

let state = { usuarios: [], productos: [], ventas: [] };
let currentEntity = 'usuarios';

// Cargar todos los datos desde Flask (/api.php)
async function loadAllData() {
    try {
        await Promise.all([
            fetchData('usuarios'),
            fetchData('productos'),
            fetchData('ventas')
        ]);
        updateSummary();
        renderTable(currentEntity);
    } catch (err) {
        showNotice("Error al conectar con la base de datos.", false);
    }
}

async function fetchData(entity) {
    let res = await fetch(`/api.php?entity=${entity}&action=list`);
    let json = await res.json();
    state[entity] = json.data || [];
}

function showNotice(msg, ok) {
    let notice = document.getElementById('notice');
    notice.className = `notice ${ok ? 'ok' : 'error'}`;
    notice.innerText = msg;
    notice.style.display = 'block';
    setTimeout(() => { notice.style.display = 'none'; }, 4000);
}

function updateSummary() {
    document.getElementById('active-users').innerText = state.usuarios.filter(u => Number(u.activo)).length;
    document.getElementById('product-count').innerText = state.productos.length;
    document.getElementById('sale-count').innerText = state.ventas.length;
}

// Cambiar de sección visualmente
function switchTab(entity) {
    currentEntity = entity;
    let container = document.getElementById('section-container');
    
    let titles = { usuarios: 'Directorio de Usuarios', productos: 'Catálogo de Productos', ventas: 'Historial de Ventas' };
    let btnText = { usuarios: '+ Nuevo Usuario', productos: '+ Nuevo Producto', ventas: '+ Nueva Venta' };

    let headers = {
        usuarios: '<th>Nombre</th><th>Email</th><th>Teléfono</th><th>Estado</th><th class="text-end">Acciones</th>',
        productos: '<th>Producto</th><th>Descripción</th><th>Precio</th><th>Stock</th><th>Estado</th><th class="text-end">Acciones</th>',
        ventas: '<th>Cliente</th><th>Producto</th><th>Cant.</th><th>Subtotal</th><th>Impuesto</th><th>Total</th><th class="text-end">Acciones</th>'
    };

    container.innerHTML = `
        <div class="crud-glass-card">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="text-primary m-0 fw-bold">${titles[entity]}</h3>
                <button class="btn primary-btn btn-sm" onclick="openModal('${entity}')">${btnText[entity]}</button>
            </div>
            <input type="search" class="form-control mb-3 rounded-pill px-3" placeholder="Filtrar registros..." oninput="filterTable(this.value, '${entity}')">
            <div class="table-responsive">
                <table class="table align-middle">
                    <thead><tr>${headers[entity]}</tr></thead>
                    <tbody id="${entity}-table-body"></tbody>
                </table>
            </div>
        </div>
    `;
    renderTable(entity);
}

function renderTable(entity, customData = null) {
    let data = customData || state[entity];
    let tbody = document.getElementById(`${entity}-table-body`);
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No hay registros todavía.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((row, index) => {
        let id = row.id_usuario || row.id_producto || row.id_venta;
        let badge = Number(row.activo) ? '<span class="badge-active">Activo</span>' : '<span class="badge-inactive">Inactivo</span>';

        if (entity === 'usuarios') {
            return `<tr>
                <td><b>${row.nombre || ''}</b></td><td>${row.email || ''}</td><td>${row.telefono || ''}</td><td>${badge}</td>
                <td class="text-end"><button class="btn btn-sm btn-outline-primary me-1" onclick="openModal('usuarios', ${id})">Editar</button><button class="btn btn-sm btn-outline-danger btn-delete" data-id="${id}" data-entity="usuarios">Borrar</button></td>
            </tr>`;
        }
        if (entity === 'productos') {
            return `<tr>
                <td><b>${row.nombre || ''}</b></td><td>${row.descripcion || ''}</td><td>$${Number(row.precio || 0).toFixed(2)}</td><td>${row.stock || 0}</td><td>${badge}</td>
                <td class="text-end"><button class="btn btn-sm btn-outline-primary me-1" onclick="openModal('productos', ${id})">Editar</button><button class="btn btn-sm btn-outline-danger btn-delete" data-id="${id}" data-entity="productos">Borrar</button></td>
            </tr>`;
        }
        if (entity === 'ventas') {
            let sub = row.subtotal ?? row.total_bruto ?? 0;
            let imp = row.impuesto ?? row.total_impuesto ?? 0;
            let tot = row.total ?? row.total_final ?? 0;
            return `<tr>
                <td><b>${row.usuario || 'N/D'}</b></td><td>${row.producto || 'N/D'}</td><td>${row.cantidad || 1}</td><td>$${Number(sub).toFixed(2)}</td><td>$${Number(imp).toFixed(2)}</td><td><strong>$${Number(tot).toFixed(2)}</strong></td>
                <td class="text-end"><button class="btn btn-sm btn-outline-danger btn-delete" data-id="${id}" data-entity="ventas">Borrar</button></td>
            </tr>`;
        }
    }).join('');
}

function filterTable(query, entity) {
    let q = query.toLowerCase();
    let filtered = state[entity].filter(row => Object.values(row).some(val => String(val || '').toLowerCase().includes(q)));
    renderTable(entity, filtered);
}

// Abrir modal dinámico para crear o editar
function openModal(entity, id = null) {
    let modalTitle = document.getElementById('modalTitle');
    let formFields = document.getElementById('formFields');
    let recordId = document.getElementById('recordId');
    
    let record = id ? state[entity].find(r => Number(r.id_usuario || r.id_producto || r.id_venta) === Number(id)) : null;
    recordId.value = id || '';
    modalTitle.innerText = `${id ? 'Editar' : 'Nuevo'} ${entity.slice(0, -1)}`;

    if (entity === 'usuarios') {
        formFields.innerHTML = `
            <div class="mb-3"><label class="form-label">Nombre</label><input type="text" class="form-control" name="nombre" value="${record?.nombre || ''}" required></div>
            <div class="mb-3"><label class="form-label">Email</label><input type="email" class="form-control" name="email" value="${record?.email || ''}" required></div>
            <div class="mb-3"><label class="form-label">Teléfono</label><input type="text" class="form-control" name="telefono" value="${record?.telefono || ''}"></div>
            <div class="form-check"><input class="form-check-input" type="checkbox" name="activo" value="1" ${!record || Number(record.activo) ? 'checked' : ''}><label class="form-check-label">Usuario activo</label></div>
        `;
    } else if (entity === 'productos') {
        formFields.innerHTML = `
            <div class="mb-3"><label class="form-label">Nombre</label><input type="text" class="form-control" name="nombre" value="${record?.nombre || ''}" required></div>
            <div class="mb-3"><label class="form-label">Descripción</label><textarea class="form-control" name="descripcion">${record?.descripcion || ''}</textarea></div>
            <div class="row"><div class="col mb-3"><label class="form-label">Precio</label><input type="number" step="0.01" class="form-control" name="precio" value="${record?.precio || ''}" required></div>
            <div class="col mb-3"><label class="form-label">Stock</label><input type="number" class="form-control" name="stock" value="${record?.stock || ''}" required></div></div>
            <div class="mb-3"><label class="form-label">Imagen (archivo)</label><input type="text" class="form-control" name="imagen" value="${record?.imagen || ''}"></div>
            <div class="form-check"><input class="form-check-input" type="checkbox" name="activo" value="1" ${!record || Number(record.activo) ? 'checked' : ''}><label class="form-check-label">Producto activo</label></div>
        `;
    } else if (entity === 'ventas') {
        let activeUsers = state.usuarios.filter(u => Number(u.activo));
        let activeProds = state.productos.filter(p => Number(p.activo));
        
        formFields.innerHTML = `
            <div class="mb-3"><label class="form-label">Usuario</label><select class="form-select" name="id_usuario" required>${activeUsers.map(u => `<option value="${u.id_usuario}">${u.nombre}</option>`).join('')}</select></div>
            <div class="mb-3"><label class="form-label">Producto</label><select class="form-select" name="id_producto" required>${activeProds.map(p => `<option value="${p.id_producto}">${p.nombre} ($${p.precio})</option>`).join('')}</select></div>
            <div class="row"><div class="col mb-3"><label class="form-label">Cantidad</label><input type="number" class="form-control" name="cantidad" value="1" min="1" required></div>
            <div class="col mb-3"><label class="form-label">Impuesto (%)</label><input type="number" step="0.01" class="form-control" name="tasa_impuesto" value="16" required></div></div>
        `;
    }

    new bootstrap.Modal(document.getElementById('dataModal')).show();
}

// Enviar formulario (Guardar / Actualizar)
document.getElementById('dynamicForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    let formData = new FormData(this);
    let data = {};
    formData.forEach((val, key) => data[key] = val);

    let checkboxes = this.querySelectorAll('input[type=checkbox]');
    checkboxes.forEach(cb => { data[cb.name] = cb.checked ? 1 : 0; });

    let idKey = currentEntity === 'usuarios' ? 'id_usuario' : currentEntity === 'productos' ? 'id_producto' : 'id_venta';
    if (data.id) data[idKey] = data.id;
    delete data.id;

    if (currentEntity === 'ventas') {
        let prod = state.productos.find(p => Number(p.id_producto) === Number(data.id_producto));
        let precio = prod ? Number(prod.precio) : 0;
        let cant = Number(data.cantidad) || 1;
        let tasa = Number(data.tasa_impuesto) || 0;
        let sub = precio * cant;
        let imp = sub * (tasa / 100);
        let tot = sub + imp;

        data.subtotal = sub; data.impuesto = imp; data.total = tot;
        data.total_bruto = sub; data.total_impuesto = imp; data.total_final = tot;
    }

    try {
        let res = await fetch(`/api.php?entity=${currentEntity}&action=save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        let result = await res.json();
        
        if (res.ok) {
            showNotice(result.message || 'Guardado exitosamente', true);
            bootstrap.Modal.getInstance(document.getElementById('dataModal')).hide();
            loadAllData();
        } else {
            showNotice(result.error || 'Error al guardar', false);
        }
    } catch (err) {
        showNotice('Error de conexión con el servidor', false);
    }
});

// Manejo seguro del evento de borrado mediante delegación de clics
document.addEventListener('click', async function(e) {
    let btn = e.target.closest('.btn-delete');
    if (!btn) return;

    let entity = btn.getAttribute('data-entity');
    let id = btn.getAttribute('data-id');

    if (!confirm('¿Estás segura de eliminar este registro?')) return;

    let idKey = entity === 'usuarios' ? 'id_usuario' : entity === 'productos' ? 'id_producto' : 'id_venta';
    let data = {};
    data[idKey] = Number(id);

    try {
        let res = await fetch(`/api.php?entity=${entity}&action=delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        let result = await res.json();
        if (res.ok) {
            showNotice(result.message || 'Eliminado correctamente', true);
            loadAllData();
        } else {
            showNotice(result.error || 'No se pudo eliminar', false);
        }
    } catch (err) {
        showNotice('Error de conexión con el servidor', false);
    }
});
