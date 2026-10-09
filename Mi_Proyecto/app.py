import os
import pymysql
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'clave_secreta_desarrollo')

# ----------------------------------------------------
# CONFIGURACIÓN DE BASE DE DATOS (RAILWAY)
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
                    pregunta1 VARCHAR(50),
                    pregunta2 VARCHAR(50),
                    pregunta3 VARCHAR(50),
                    pregunta4 VARCHAR(255),
                    pregunta5 VARCHAR(50),
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
            # 3. Tablas para el CRUD de Ventas
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    email VARCHAR(150) NOT NULL UNIQUE,
                    telefono VARCHAR(20),
                    activo TINYINT(1) NOT NULL DEFAULT 1,
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
        conn.commit()
        conn.close()
        print("Estructura de Base de Datos inicializada correctamente.")
    except Exception as e:
        print(f"Aviso de conexión DB: {e}")

init_db()

USUARIOS_DEMO = {
    "virginia": "12345"
}

# ----------------------------------------------------
# AUTENTICACIÓN
# ----------------------------------------------------
@app.route('/')
def index():
    if 'usuario' in session:
        return redirect(url_for('menu'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        usuario = request.form.get('username')
        password = request.form.get('password')

        if usuario in USUARIOS_DEMO and USUARIOS_DEMO[usuario] == password:
            session['usuario'] = usuario
            return redirect(url_for('menu'))
        else:
            flash('Usuario o contraseña incorrectos', 'error')

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('usuario', None)
    return redirect(url_for('login'))

# ----------------------------------------------------
# MENÚ Y SECCIONES
# ----------------------------------------------------
@app.route('/menu')
def menu():
    if 'usuario' not in session:
        return redirect(url_for('login'))
    return render_template('menu.html')

@app.route('/mapas')
def mapas():
    if 'usuario' not in session:
        return redirect(url_for('login'))
    return render_template('pagina1.html')

@app.route('/presentacion')
def presentacion():
    if 'usuario' not in session:
        return redirect(url_for('login'))
    return render_template('pagina2.html')

@app.route('/youtube')
def youtube():
    if 'usuario' not in session:
        return redirect(url_for('login'))
    return render_template('youtube.html', video_id="dQw4w9WgXcQ")

# ----------------------------------------------------
# ENCUESTA UPVM
# ----------------------------------------------------
@app.route('/encuesta', methods=['GET', 'POST'])
def encuesta():
    if 'usuario' not in session:
        return redirect(url_for('login'))
        
    if request.method == 'POST':
        p1 = request.form.get('pregunta1')
        p2 = request.form.get('pregunta2')
        p3 = request.form.get('pregunta3')
        p4 = request.form.get('pregunta4')
        p5 = request.form.get('pregunta5')

        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                sql = """INSERT INTO respuestas (pregunta1, pregunta2, pregunta3, pregunta4, pregunta5) 
                         VALUES (%s, %s, %s, %s, %s)"""
                cursor.execute(sql, (p1, p2, p3, p4, p5))
            conn.commit()
            conn.close()
            return redirect(url_for('regalo'))
        except Exception as e:
            flash(f'Error al guardar en la base de datos: {e}', 'error')

    return render_template('encuesta.html')

@app.route('/regalo')
def regalo():
    if 'usuario' not in session:
        return redirect(url_for('login'))
    return render_template('regalo.html')

# ----------------------------------------------------
# SERVICIO DE MENSAJERÍA
# ----------------------------------------------------
@app.route('/mensajes')
def mensajes_view():
    if 'usuario' not in session:
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
    if 'usuario' not in session:
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
            # ENTIDAD: USUARIOS
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
                        cursor.execute('INSERT INTO usuarios (nombre, email, telefono, activo) VALUES (%s, %s, %s, %s)',
                                       (nombre, email, telefono, activo))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Usuario guardado correctamente.'})

                elif action == 'delete':
                    id_u = payload.get('id_usuario')
                    cursor.execute('DELETE FROM usuarios WHERE id_usuario=%s', (id_u,))
                    conn.commit()
                    conn.close()
                    return jsonify({'message': 'Usuario eliminado correctamente.'})

            # ENTIDAD: PRODUCTOS
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

            # ENTIDAD: VENTAS
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

                    # Obtener precio unitario del producto
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