import os
import pymysql
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'clave_secreta_desarrollo')

# ----------------------------------------------------
# CONFIGURACIÓN DE BASE DE DATOS (RAILWAY / RENDER)
# ----------------------------------------------------
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', 3306))
DB_USER = os.getenv('DB_USER', 'root')
DB_PASS = os.getenv('DB_PASS', '')
DB_NAME = os.getenv('DB_NAME', 'railway')

def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )

def init_db():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # 1. Tabla Encuesta UPVM
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS respuestas (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nombre VARCHAR(100),
                    pregunta1 VARCHAR(100),
                    pregunta2 VARCHAR(100),
                    pregunta3 VARCHAR(100),
                    pregunta4 TEXT,
                    pregunta5 VARCHAR(100),
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # 2. Tabla Mensajería
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mensajes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    usuario VARCHAR(50) NOT NULL,
                    texto TEXT NOT NULL,
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # 3. Tablas para el CRUD de Ventas y Usuarios
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    email VARCHAR(150) NOT NULL UNIQUE,
                    telefono VARCHAR(20),
                    activo TINYINT(1) NOT NULL DEFAULT 1,
                    password VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS productos (
                    id_producto INT AUTO_INCREMENT PRIMARY KEY,
                    nombre VARCHAR(150) NOT NULL,
                    descripcion TEXT,
                    precio DECIMAL(10, 2) NOT NULL,
                    stock INT NOT NULL DEFAULT 0,
                    imagen VARCHAR(255),
                    activo TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ventas (
                    id_venta INT AUTO_INCREMENT PRIMARY KEY,
                    id_usuario INT NOT NULL,
                    id_producto INT NOT NULL,
                    cantidad INT NOT NULL DEFAULT 1,
                    precio_unit DECIMAL(10, 2) NOT NULL,
                    total_bruto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                    tasa_impuesto DECIMAL(5, 2) NOT NULL DEFAULT 16.00,
                    total_impuesto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                    total_final DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
                    FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
                )
            """)
            # 4. Tabla para Seguimiento de Cookies y Eventos
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS eventos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    visitante_id VARCHAR(100),
                    usuario_id INT,
                    tipo VARCHAR(50),
                    pagina VARCHAR(255),
                    detalle TEXT,
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        conn.commit()
        conn.close()
        print("Estructura de Base de Datos inicializada correctamente.")
    except Exception as e:
        print(f"Aviso de conexión DB: {e}")

#init_db()

# ----------------------------------------------------
# RUTAS DE AUTENTICACIÓN Y REGISTRO
# ----------------------------------------------------

@app.route('/')
def index():
    if 'usuario_id' in session:
        return redirect(url_for('menu'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        email = request.form.get('correo', '').strip()
        password = request.form.get('password', '')

        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT id_usuario, nombre, password FROM usuarios WHERE email = %s", (email,))
                usuario = cursor.fetchone()

                if usuario:
                    pwd_db = usuario['password']
                    es_valido = False

                    # Si la contraseña en la BD ya es un hash seguro
                    if pwd_db.startswith('pbkdf2:') or pwd_db.startswith('scrypt:'):
                        es_valido = check_password_hash(pwd_db, password)
                    else:
                        # Si es una contraseña vieja en texto plano
                        es_valido = (pwd_db == password)

                    if es_valido:
                        session.clear()
                        session['usuario_id'] = usuario['id_usuario']
                        session['nombre'] = usuario['nombre']

                        # VINCULACIÓN DE COOKIE
                        visitante_cookie = request.cookies.get('visitante_id')
                        if visitante_cookie:
                            cursor.execute(
                                "UPDATE eventos SET usuario_id = %s WHERE visitante_id = %s AND usuario_id IS NULL",
                                (usuario['id_usuario'], visitante_cookie)
                            )
                            conn.commit()

                        conn.close()
                        return redirect(url_for('menu'))

                error = "Correo o contraseña incorrectos."
            conn.close()
        except Exception as e:
            error = f"Error en la base de datos: {e}"

    return render_template('login.html', error=error)
@app.route('/registro', methods=['GET', 'POST'])
def registro():
    error = None
    if request.method == 'POST':
        nombre = request.form.get('nombre', '').strip()
        email = request.form.get('correo', '').strip()
        telefono = request.form.get('telefono', '').strip()
        password = request.form.get('password', '')
        confirmar = request.form.get('confirmar', '')

        if not nombre or not email or not password:
            error = "Por favor, completa los campos obligatorios."
        elif password != confirmar:
            error = "Las contraseñas no coinciden."
        elif len(password) < 6:
            error = "La contraseña debe tener al menos 6 caracteres."
        else:
            try:
                hashed_password = generate_password_hash(password)
                conn = get_db_connection()
                with conn.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO usuarios (nombre, email, telefono, password, activo) VALUES (%s, %s, %s, %s, 1)",
                        (nombre, email, telefono, hashed_password)
                    )
                conn.commit()
                conn.close()
                return redirect(url_for('login', registrado=1))
            except Exception as e:
                error = "El correo ya está registrado o hubo un error al guardar."

    return render_template('registro.html', error=error)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ----------------------------------------------------
# API DE TRACKER DE COOKIES
# ----------------------------------------------------
@app.post('/api/tracker')
def api_tracker():
    datos = request.get_json(silent=True) or {}
    visitante_id = datos.get('visitante_id')
    tipo = datos.get('tipo', 'vista')
    pagina = datos.get('pagina', '')
    detalle = datos.get('detalle', '')
    usuario_id = session.get('usuario_id')

    if not visitante_id:
        return jsonify({'error': 'Falta cookie visitante_id'}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO eventos (visitante_id, usuario_id, tipo, pagina, detalle) VALUES (%s, %s, %s, %s, %s)",
                (visitante_id, usuario_id, tipo, pagina, detalle)
            )
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ----------------------------------------------------
# PANEL DE MÉTRICAS Y ACTIVIDAD RECIENTE
# ----------------------------------------------------
@app.route('/metrics')
def metrics():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Estadísticas
            cursor.execute("SELECT COUNT(DISTINCT visitante_id) AS visitantes FROM eventos")
            v_count = cursor.fetchone()['visitantes']

            cursor.execute("SELECT COUNT(DISTINCT visitante_id) AS sesiones FROM eventos WHERE usuario_id IS NOT NULL")
            s_count = cursor.fetchone()['sesiones']

            cursor.execute("SELECT COUNT(DISTINCT usuario_id) AS identificados FROM eventos WHERE usuario_id IS NOT NULL")
            u_count = cursor.fetchone()['identificados']

            cursor.execute("SELECT COUNT(*) AS vistas FROM eventos WHERE tipo = 'vista'")
            vistas_count = cursor.fetchone()['vistas']

            cursor.execute("SELECT COUNT(*) AS clics FROM eventos WHERE tipo = 'clic'")
            clics_count = cursor.fetchone()['clics']

            # Actividad reciente
            sql_eventos = """
                SELECT DATE_FORMAT(e.fecha, '%%H:%%i:%%s') AS hora,
                       COALESCE(u.nombre, 'Anónimo') AS quien,
                       e.tipo, e.pagina, e.detalle
                FROM eventos e
                LEFT JOIN usuarios u ON u.id_usuario = e.usuario_id
                ORDER BY e.id DESC LIMIT 25
            """
            cursor.execute(sql_eventos)
            lista_eventos = cursor.fetchall()

        conn.close()
        stats = {
            'visitantes': v_count,
            'sesiones': s_count,
            'identificados': u_count,
            'vistas': vistas_count,
            'clics': clics_count
        }
        return render_template('metrics.html', stats=stats, eventos=lista_eventos)
    except Exception as e:
        flash(f"Error al cargar métricas: {e}", "error")
        return redirect(url_for('menu'))

# ----------------------------------------------------
# MENÚ Y SECCIONES
# ----------------------------------------------------
@app.route('/menu')
def menu():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    
    nombre_usuario = session.get('nombre', '')
    if not nombre_usuario:
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT nombre FROM usuarios WHERE id_usuario = %s", (session['usuario_id'],))
                res = cursor.fetchone()
                if res:
                    nombre_usuario = res['nombre']
                    session['nombre'] = nombre_usuario
            conn.close()
        except:
            nombre_usuario = "Usuario"

    return render_template('menu.html', nombre=nombre_usuario)

@app.route('/mapas')
def mapas():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('pagina1.html')

@app.route('/presentacion')
def presentacion():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('pagina2.html')

@app.route('/youtube')
def youtube():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('youtube.html', video_id="vK9he9d-JN0")

# ----------------------------------------------------
# ENCUESTA UPVM
# ----------------------------------------------------
@app.route('/encuesta', methods=['GET', 'POST'])
def encuesta():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
        
    if request.method == 'POST':
        nombre = request.form.get('nombre', '').strip()
        p1 = request.form.get('pregunta1')
        p2 = request.form.get('pregunta2')
        p3 = request.form.get('pregunta3')
        p4 = request.form.get('pregunta4')
        p5 = request.form.get('pregunta5')

        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                sql = """INSERT INTO respuestas (nombre, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5) 
                         VALUES (%s, %s, %s, %s, %s, %s)"""
                cursor.execute(sql, (nombre, p1, p2, p3, p4, p5))
            conn.commit()
            conn.close()
            return redirect(url_for('regalo'))
        except Exception as e:
            flash(f'Error al guardar en la base de datos: {e}', 'error')

    return render_template('encuesta.html')

@app.route('/regalo')
def regalo():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('regalo.html')

# ----------------------------------------------------
# SERVICIO DE MENSAJERÍA
# ----------------------------------------------------
@app.route('/mensajes')
def mensajes():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('mensajes.html')

@app.get('/api/mensajes')
def listar_mensajes():
    desde = request.args.get("desde", default=0, type=int)
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, usuario, texto, DATE_FORMAT(fecha, '%%Y-%%m-%%dT%%H:%%i:%%sZ') as fecha FROM mensajes WHERE id > %s ORDER BY id ASC", (desde,))
            nuevos = cursor.fetchall()
        conn.close()
        return jsonify(nuevos), 200
    except Exception as e:
        return jsonify([]), 200

@app.post('/api/mensajes')
def crear_mensaje():
    datos = request.get_json(silent=True) or {}
    usuario = str(datos.get("usuario", "")).strip()
    texto = str(datos.get("texto", "")).strip()

    if not usuario or not texto:
        return jsonify({"error": "Campos obligatorios."}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO mensajes (usuario, texto) VALUES (%s, %s)", (usuario, texto))
            mensaje_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"id": mensaje_id, "usuario": usuario, "texto": texto}), 201
    except Exception as e:
        return jsonify({"error": "Error al guardar el mensaje."}), 500

# ----------------------------------------------------
# API REST PARA EL CRUD (USUARIOS, PRODUCTOS, VENTAS)
# ----------------------------------------------------
@app.route('/crud')
def crud():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('crud.html')

@app.route('/api.php', methods=['GET', 'POST'])
def api_crud():
    entity = request.args.get('entity', '')
    action = request.args.get('action', 'list')
    payload = request.get_json(silent=True) or {}

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            if entity == 'usuarios':
                if action == 'list':
                    cursor.execute('SELECT id_usuario, nombre, email, telefono, activo FROM usuarios ORDER BY id_usuario DESC')
                    res = cursor.fetchall()
                    conn.close()
                    return jsonify({'data': res})
                
                elif action == 'save':
                    id_u = payload.get('id_usuario')
                    nombre = payload.get('nombre')
                    email = payload.get('email')
                    telefono = payload.get('telefono')
                    activo = int(payload.get('activo', 1))

                    if id_u:
                        cursor.execute('UPDATE usuarios SET nombre=%s, email=%s, telefono=%s, activo=%s WHERE id_usuario=%s',
                                       (nombre, email, telefono, activo, id_u))
                    else:
                        default_pwd = generate_password_hash("123456")
                        cursor.execute('INSERT INTO usuarios (nombre, email, telefono, password, activo) VALUES (%s, %s, %s, %s, %s)',
                                       (nombre, email, telefono, default_pwd, activo))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Usuario guardado correctamente.'})

                elif action == 'delete':
                    id_u = payload.get('id_usuario')
                    cursor.execute('DELETE FROM usuarios WHERE id_usuario=%s', (id_u,))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Usuario eliminado correctamente.'})

            elif entity == 'productos':
                if action == 'list':
                    cursor.execute('SELECT id_producto, nombre, descripcion, precio, stock, imagen, activo FROM productos ORDER BY id_producto DESC')
                    res = cursor.fetchall()
                    conn.close()
                    return jsonify({'data': res})

                elif action == 'save':
                    id_p = payload.get('id_producto')
                    nombre = payload.get('nombre')
                    descripcion = payload.get('descripcion')
                    precio = float(payload.get('precio', 0))
                    stock = int(payload.get('stock', 0))
                    imagen = payload.get('imagen')
                    activo = int(payload.get('activo', 1))

                    if id_p:
                        cursor.execute('UPDATE productos SET nombre=%s, descripcion=%s, precio=%s, stock=%s, imagen=%s, activo=%s WHERE id_producto=%s',
                                       (nombre, descripcion, precio, stock, imagen, activo, id_p))
                    else:
                        cursor.execute('INSERT INTO productos (nombre, descripcion, precio, stock, imagen, activo) VALUES (%s, %s, %s, %s, %s, %s)',
                                       (nombre, descripcion, precio, stock, imagen, activo))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Producto guardado correctamente.'})

                elif action == 'delete':
                    id_p = payload.get('id_producto')
                    cursor.execute('DELETE FROM productos WHERE id_producto=%s', (id_p,))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Producto eliminado correctamente.'})

            elif entity == 'ventas':
                if action == 'list':
                    sql = """SELECT v.id_venta, v.id_usuario, v.id_producto, u.nombre AS usuario, p.nombre AS producto, 
                                    v.cantidad, v.precio_unit, v.total_bruto, v.tasa_impuesto, v.total_impuesto, v.total_final 
                             FROM ventas v 
                             INNER JOIN usuarios u ON u.id_usuario = v.id_usuario 
                             INNER JOIN productos p ON p.id_producto = v.id_producto 
                             ORDER BY v.id_venta DESC"""
                    cursor.execute(sql)
                    res = cursor.fetchall()
                    conn.close()
                    return jsonify({'data': res})

                elif action == 'save':
                    id_v = payload.get('id_venta')
                    id_u = payload.get('id_usuario')
                    id_p = payload.get('id_producto')
                    cantidad = int(payload.get('cantidad', 1))
                    tasa_impuesto = float(payload.get('tasa_impuesto', 16.0))

                    cursor.execute('SELECT precio FROM productos WHERE id_producto=%s', (id_p,))
                    prod = cursor.fetchone()
                    if not prod:
                        conn.close()
                        return jsonify({'error': 'Producto no encontrado.'}), 422
                    
                    precio_unit = float(prod['precio'])
                    total_bruto = cantidad * precio_unit
                    total_impuesto = total_bruto * (tasa_impuesto / 100.0)
                    total_final = total_bruto + total_impuesto

                    if id_v:
                        sql = """UPDATE ventas SET id_usuario=%s, id_producto=%s, cantidad=%s, precio_unit=%s, 
                                                   total_bruto=%s, tasa_impuesto=%s, total_impuesto=%s, total_final=%s 
                                 WHERE id_venta=%s"""
                        cursor.execute(sql, (id_u, id_p, cantidad, precio_unit, total_bruto, tasa_impuesto, total_impuesto, total_final, id_v))
                    else:
                        sql = """INSERT INTO ventas (id_usuario, id_producto, cantidad, precio_unit, total_bruto, tasa_impuesto, total_impuesto, total_final) 
                                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s)"""
                        cursor.execute(sql, (id_u, id_p, cantidad, precio_unit, total_bruto, tasa_impuesto, total_impuesto, total_final))
                    
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Venta guardada correctamente.'})

                elif action == 'delete':
                    id_v = payload.get('id_venta')
                    cursor.execute('DELETE FROM ventas WHERE id_venta=%s', (id_v,))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Venta eliminada correctamente.'})

        conn.close()
        return jsonify({'error': 'Operación no válida'}), 400
    except Exception as e:
        return jsonify({'error': f'Error en el servidor: {str(e)}'}), 500

if __name__ == '__main__':
    puerto = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=puerto, debug=True)
