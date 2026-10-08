(function ($) {
    'use strict';
    var state = { usuarios: [], productos: [], ventas: [] };
    var labels = { usuarios: 'usuario', productos: 'producto', ventas: 'venta' };

    function request(entity, action, data) {
        return $.ajax({ url: 'api.php?entity=' + entity + '&action=' + action, method: 'POST', contentType: 'application/json', data: data ? JSON.stringify(data) : undefined }).then(function (response) { return response; }).catch(function (xhr) { var message = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'No se pudo conectar con el servidor.'; showNotice(message, false); return $.Deferred().reject().promise(); });
    }
    function escapeHtml(value) { return $('<div>').text(value == null ? '' : value).html(); }
    function money(value) { return '$' + Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 }); }
    function showNotice(message, ok) { $('#notice').text(message).toggleClass('ok', !!ok).stop(true, true).slideDown().delay(3000).slideUp(); }
    function badge(active) { return '<span class="badge ' + (Number(active) ? '' : 'off') + '">' + (Number(active) ? 'Activo' : 'Inactivo') + '</span>'; }
    function actionButtons(entity, row, id) { return '<span class="actions"><button class="action-btn edit" data-entity="' + entity + '" data-id="' + id + '">Editar</button><button class="action-btn delete" data-entity="' + entity + '" data-id="' + id + '">Borrar</button></span>'; }

    function load(entity) {
        return $.getJSON('api.php?entity=' + entity + '&action=list').then(function (response) { state[entity] = response.data || []; render(entity); updateSummary(); if (entity === 'usuarios' || entity === 'productos') updateSaleOptions(); });
    }
    function render(entity) {
        var query = String($('.query-input[data-query="' + entity + '"]').val() || '').toLowerCase().trim();
        var filtered = state[entity].filter(function (row) { return !query || Object.keys(row).some(function (key) { return String(row[key] == null ? '' : row[key]).toLowerCase().indexOf(query) > -1; }); });
        var rows = filtered.map(function (row) {
            if (entity === 'usuarios') return '<tr><td>' + escapeHtml(row.nombre) + '</td><td>' + escapeHtml(row.email) + '</td><td>' + escapeHtml(row.telefono) + '</td><td>' + badge(row.activo) + '</td><td>' + actionButtons(entity, row, row.id_usuario) + '</td></tr>';
            if (entity === 'productos') return '<tr><td>' + escapeHtml(row.nombre) + '</td><td>' + escapeHtml(row.descripcion) + '</td><td>' + money(row.precio) + '</td><td>' + row.stock + '</td><td>' + badge(row.activo) + '</td><td>' + actionButtons(entity, row, row.id_producto) + '</td></tr>';
            return '<tr><td>' + escapeHtml(row.usuario) + '</td><td>' + escapeHtml(row.producto) + '</td><td>' + row.cantidad + '</td><td>' + money(row.total_bruto) + '</td><td>' + money(row.total_impuesto) + '</td><td><strong>' + money(row.total_final) + '</strong></td><td>' + actionButtons(entity, row, row.id_venta) + '</td></tr>';
        }).join('');
        $('#' + entity + '-list').html(rows || '<tr><td colspan="8">No hay registros todavía.</td></tr>');
    }
    function updateSummary() { $('#active-users').text(state.usuarios.filter(function (item) { return Number(item.activo); }).length); $('#product-count').text(state.productos.length); $('#sale-count').text(state.ventas.length); }
    function updateSaleOptions() { $('#sale-user').html(state.usuarios.filter(function (x) { return Number(x.activo); }).map(function (x) { return '<option value="' + x.id_usuario + '">' + escapeHtml(x.nombre) + '</option>'; }).join('')); $('#sale-product').html(state.productos.filter(function (x) { return Number(x.activo); }).map(function (x) { return '<option value="' + x.id_producto + '">' + escapeHtml(x.nombre) + ' - ' + money(x.precio) + '</option>'; }).join('')); }
    function resetForm(form) { form[0].reset(); form.find('input[type=hidden]').val(''); form.find('input[type=checkbox]').prop('checked', true); }
    function fillForm(entity, row) { var form = $('#' + (entity === 'usuarios' ? 'usuario' : entity === 'productos' ? 'producto' : 'venta') + '-form-data'); Object.keys(row).forEach(function (key) { var field = form.find('[name="' + key + '"]'); if (field.is(':checkbox')) field.prop('checked', Number(row[key]) === 1); else if (field.length) field.val(row[key]); }); }
    function openForm(entity, row) { var id = entity === 'usuarios' ? 'usuario' : entity === 'productos' ? 'producto' : 'venta'; var form = $('#' + id + '-form-data'); resetForm(form); $('#' + id + '-form-title').text(row ? 'Editar ' + labels[entity] : 'Nuevo ' + labels[entity]); if (row) fillForm(entity, row); $.mobile.changePage('#' + id + '-form', { role: 'dialog' }); }

    $(document).on('pagecreate', '#inicio', function () { load('usuarios'); load('productos'); load('ventas'); });
    $(document).on('input', '.query-input', function () { render($(this).data('query')); });
    $(document).on('click', '[data-mode="new"]', function () { openForm($(this).attr('href').indexOf('usuario') > -1 ? 'usuarios' : $(this).attr('href').indexOf('producto') > -1 ? 'productos' : 'ventas'); });
    $(document).on('click', '.edit', function () { var entity = $(this).data('entity'); var id = Number($(this).data('id')); var key = entity === 'usuarios' ? 'id_usuario' : entity === 'productos' ? 'id_producto' : 'id_venta'; openForm(entity, state[entity].filter(function (item) { return Number(item[key]) === id; })[0]); });
    $(document).on('click', '.delete', function () { var button = $(this); if (!window.confirm('¿Eliminar este registro?')) return; var entity = button.data('entity'); var key = entity === 'usuarios' ? 'id_usuario' : entity === 'productos' ? 'id_producto' : 'id_venta'; var data = {}; data[key] = Number(button.data('id')); request(entity, 'delete', data).then(function (result) { showNotice(result.message, true); load(entity); }); });
    $('#usuario-form-data, #producto-form-data, #venta-form-data').on('submit', function (event) { event.preventDefault(); var form = $(this); var entity = form.attr('id').split('-')[0]; entity = entity === 'usuario' ? 'usuarios' : entity === 'producto' ? 'productos' : 'ventas'; var data = {}; form.serializeArray().forEach(function (item) { data[item.name] = item.value; }); form.find('input[type=checkbox]').each(function () { data[this.name] = this.checked ? 1 : 0; }); request(entity, 'save', data).then(function (result) { showNotice(result.message, true); $.mobile.changePage('#' + (entity === 'usuarios' ? 'usuarios' : entity === 'productos' ? 'productos' : 'ventas')); load(entity); }); });
}(jQuery));
