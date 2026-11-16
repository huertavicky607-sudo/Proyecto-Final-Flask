import os
import pymysql
import pymysql.cursors
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

# ----------------------------------------------------
# CLOUDINARY (fotos permanentes). Se activa solo si existe
# la variable de entorno CLOUDINARY_URL; si no, guarda en static/uploads.
# ----------------------------------------------------
# Si al pegarla en Render se incluyó "CLOUDINARY_URL=" o comillas, se limpian aquí
_cld = os.getenv('CLOUDINARY_URL', '').strip().strip('"\'')
if _cld.startswith('CLOUDINARY_URL='):
    _cld = _cld[len('CLOUDINARY_URL='):]
if _cld:
    os.environ['CLOUDINARY_URL'] = _cld
try:
    import cloudinary
    import cloudinary.uploader
    USA_CLOUDINARY = _cld.startswith('cloudinary://')
except ImportError:
    USA_CLOUDINARY = False
print('Fotos de clientes guardadas en:', 'Cloudinary' if USA_CLOUDINARY else 'static/uploads (se borran en Render)')

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'clave_secreta_desarrollo')
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024   # límite de subida (fotos)

# ----------------------------------------------------
# CONFIGURACIÓN DE BASE DE DATOS (AIVEN)
# ----------------------------------------------------
DB_HOST = os.getenv('DB_HOST', 'mysql-3e9d9e2a-zunigavirginiayadira-4b8a.g.aivencloud.com')
DB_PORT = int(os.getenv('DB_PORT', 23189))
DB_USER = os.getenv('DB_USER', 'avnadmin')
DB_PASS = os.getenv('DB_PASS', 'AVNS_kej1VzzpPgz38UW9hBe')
DB_NAME = os.getenv('DB_NAME', 'defaultdb')

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
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    email VARCHAR(150) NOT NULL UNIQUE,
                    telefono VARCHAR(20),
                    activo TINYINT(1) NOT NULL DEFAULT 1,
                    password VARCHAR(255) NOT NULL,
                    rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            try:
                cursor.execute("ALTER TABLE usuarios ADD COLUMN rol VARCHAR(20) DEFAULT 'cliente'")
            except:
                pass

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
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mensajes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    usuario VARCHAR(50) NOT NULL,
                    texto TEXT NOT NULL,
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                    colores VARCHAR(255) DEFAULT 'negro,blanco,naranja,celeste,marron',
                    tallas VARCHAR(255) DEFAULT 'XS,S,M,L,XL,2XL,3XL',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            try:
                cursor.execute("ALTER TABLE productos ADD COLUMN colores VARCHAR(255) DEFAULT 'negro,blanco,naranja,celeste,marron'")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE productos ADD COLUMN tallas VARCHAR(255) DEFAULT 'XS,S,M,L,XL,2XL,3XL'")
            except:
                pass

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
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS eventos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    visitante_id VARCHAR(100),
                    usuario_id INT,
                    tipo VARCHAR(50),
                    pagina VARCHAR(255),
                    elemento VARCHAR(100) DEFAULT NULL,
                    segundos INT DEFAULT 0,
                    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ubicaciones (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    usuario_id INT NULL,
                    nombre VARCHAR(100) NOT NULL,
                    latitud DECIMAL(9, 6) NOT NULL,
                    longitud DECIMAL(9, 6) NOT NULL,
                    precision_m INT UNSIGNED NOT NULL,
                    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS fotos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    usuario_id INT NULL,
                    nombre VARCHAR(100),
                    archivo VARCHAR(255),
                    tipo VARCHAR(50),
                    bytes INT,
                    creado_en DATETIME,
                    id_producto INT NULL,
                    talla VARCHAR(20) NULL,
                    ajuste VARCHAR(20) NULL,
                    comentario VARCHAR(500) NULL
                )
            """)
            # Columnas nuevas para las fotos de clientes (si la tabla ya existía)
            for columna in ("id_producto INT NULL", "talla VARCHAR(20) NULL",
                            "ajuste VARCHAR(20) NULL", "comentario VARCHAR(500) NULL",
                            "public_id VARCHAR(255) NULL"):
                try:
                    cursor.execute(f"ALTER TABLE fotos ADD COLUMN {columna}")
                except:
                    pass
            # Atención al cliente: cada mensaje es una consulta que la tienda responde
            for columna in ("id_usuario INT NULL", "respuesta TEXT NULL", "respondido_en DATETIME NULL"):
                try:
                    cursor.execute(f"ALTER TABLE mensajes ADD COLUMN {columna}")
                except:
                    pass
            # Dirección de entrega de cada venta
            for columna in ("direccion_envio VARCHAR(255) NULL", "latitud DECIMAL(9, 6) NULL",
                            "longitud DECIMAL(9, 6) NULL"):
                try:
                    cursor.execute(f"ALTER TABLE ventas ADD COLUMN {columna}")
                except:
                    pass
        conn.commit()
        conn.close()
        print("Base de datos inicializada correctamente.")
    except Exception as e:
        print(f"Aviso de conexión DB: {e}")

init_db()

# Nombre y rol disponibles en TODAS las plantillas (encabezado de base.html)
@app.context_processor
def inyectar_usuario():
    return {'nombre': session.get('nombre'), 'rol': session.get('rol', 'invitado')}

# Foto guardada en Cloudinary (URL completa) o en static/uploads (solo nombre)
@app.template_filter('foto_src')
def foto_src(archivo):
    if archivo and archivo.startswith('http'):
        return archivo
    return url_for('static', filename='uploads/' + (archivo or ''))

# Color de respaldo para el fondo de la portada (si no se puede leer la imagen)
COLOR_HEX = {
    'negro': '#1f2937', 'blanco': '#cbd5e1', 'naranja': '#f97316', 'celeste': '#449dd1',
    'marron': '#826251', 'marrón': '#826251', 'rojo': '#dc2626', 'vino': '#7f1d1d',
    'azul': '#2563eb', 'verde': '#16a34a', 'gris': '#9ca3af', 'rosa': '#f472b6',
    'amarillo': '#facc15', 'morado': '#7c3aed', 'beige': '#d6c3a5'
}

@app.route('/')
@app.route('/menu')
def menu():
    nombre_usuario = session.get('nombre', 'Visitante')
    rol_usuario = session.get('rol', 'invitado')
    productos = []
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM productos WHERE activo = 1 ORDER BY id_producto DESC")
            productos = cursor.fetchall()
        conn.close()
    except Exception as e:
        print(f"Error al cargar catálogo: {e}")

    # Datos para el carrusel de la portada
    hero = []
    for p in productos[:8]:
        primer_color = ((p.get('colores') or '').split(',')[0]).strip().lower()
        hero.append({
            'nombre': p['nombre'],
            'descripcion': p.get('descripcion') or '',
            'precio': float(p['precio']),
            'imagen': p.get('imagen') or '',
            'tallas': [t.strip() for t in (p.get('tallas') or '').split(',') if t.strip()][:5],
            'color': COLOR_HEX.get(primer_color, '#64748b'),
            'url': url_for('detalle_producto', id_producto=p['id_producto'])
        })

    return render_template('menu.html', nombre=nombre_usuario, rol=rol_usuario,
                           productos=productos, hero=hero)

@app.route('/producto/<int:id_producto>')
def detalle_producto(id_producto):
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
        
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM productos WHERE id_producto = %s AND activo = 1", (id_producto,))
            producto = cursor.fetchone()
            
            if not producto:
                conn.close()
                flash('El producto no está disponible.', 'error')
                return redirect(url_for('menu'))
                
            cursor.execute("SELECT * FROM productos WHERE id_producto != %s AND activo = 1 LIMIT 4", (id_producto,))
            relacionados = cursor.fetchall()

            cursor.execute("""SELECT id, nombre, archivo, talla, ajuste, comentario, creado_en
                              FROM fotos WHERE id_producto = %s ORDER BY id DESC LIMIT 12""", (id_producto,))
            fotos_clientes = cursor.fetchall()

        conn.close()

        lista_colores = [c.strip() for c in (producto.get('colores') or 'negro,blanco').split(',')]
        lista_tallas = [t.strip() for t in (producto.get('tallas') or 'S,M,L').split(',')]

        return render_template('detalle_producto.html',
                               producto=producto,
                               colores=lista_colores,
                               tallas=lista_tallas,
                               relacionados=relacionados,
                               fotos_clientes=fotos_clientes,
                               nombre=session.get('nombre'),
                               rol=session.get('rol'))
    except Exception as e:
        flash(f'Error al cargar el producto: {e}', 'error')
        return redirect(url_for('menu'))

@app.route('/carrito')
def carrito():
    return render_template('carrito.html')

@app.post('/api/checkout')
def api_checkout():
    """Registra la compra: una venta por artículo y descuenta el stock."""
    if 'usuario_id' not in session:
        return jsonify({'error': 'Inicia sesión para comprar.'}), 401

    datos = request.get_json(silent=True) or {}
    items = datos.get('items') or []
    if not isinstance(items, list) or not items:
        return jsonify({'error': 'Tu carrito está vacío.'}), 400

    # Dirección de entrega (elegida en el mapa de la ventana de pago)
    envio = datos.get('envio') or {}
    direccion = str(envio.get('direccion', '')).strip()[:255]
    try:
        lat = float(envio.get('lat'))
        lng = float(envio.get('lng'))
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'error': 'Marca tu dirección de entrega en el mapa.'}), 400
    if len(direccion) < 8:
        return jsonify({'error': 'Escribe tu dirección de entrega.'}), 400

    TASA = 16.0
    conn = None
    try:
        conn = get_db_connection()
        conn.begin()
        total_final = 0.0
        unidades = 0
        primer_id = None
        with conn.cursor() as cursor:
            for item in items:
                try:
                    id_p = int(item.get('id_producto'))
                    cantidad = int(item.get('cantidad', 1))
                except (TypeError, ValueError):
                    raise ValueError('Artículo inválido en el carrito.')
                if cantidad < 1:
                    raise ValueError('Cantidad inválida.')

                cursor.execute("SELECT nombre, precio, stock FROM productos WHERE id_producto = %s AND activo = 1 FOR UPDATE", (id_p,))
                prod = cursor.fetchone()
                if not prod:
                    raise ValueError('Uno de los productos ya no está disponible.')
                if prod['stock'] < cantidad:
                    raise ValueError(f"Solo quedan {prod['stock']} piezas de {prod['nombre']}.")

                precio_unit = float(prod['precio'])
                bruto = precio_unit * cantidad
                impuesto = bruto * TASA / 100
                final = bruto + impuesto

                cursor.execute("""INSERT INTO ventas (id_usuario, id_producto, cantidad, precio_unit, total_bruto,
                                                      tasa_impuesto, total_impuesto, total_final,
                                                      direccion_envio, latitud, longitud)
                                  VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                               (session['usuario_id'], id_p, cantidad, precio_unit, bruto, TASA, impuesto, final,
                                direccion, lat, lng))
                if primer_id is None:
                    primer_id = cursor.lastrowid
                cursor.execute("UPDATE productos SET stock = stock - %s WHERE id_producto = %s", (cantidad, id_p))
                total_final += final
                unidades += cantidad

            # También queda en el historial de ubicaciones
            cursor.execute("""INSERT INTO ubicaciones (usuario_id, nombre, latitud, longitud, precision_m)
                              VALUES (%s, %s, %s, %s, 0)""",
                           (session['usuario_id'], session.get('nombre', 'cliente'), lat, lng))
        conn.commit()
        return jsonify({'total_final': round(total_final, 2), 'unidades': unidades,
                        'folio': folio_de(primer_id)}), 201
    except ValueError as e:
        if conn: conn.rollback()
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({'error': f'Error al procesar la compra: {e}'}), 500
    finally:
        if conn: conn.close()

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        email = request.form.get('correo', '').strip()
        password = request.form.get('password', '')

        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT id_usuario, nombre, password, rol FROM usuarios WHERE email = %s", (email,))
                usuario = cursor.fetchone()

                if usuario:
                    pwd_db = usuario['password']
                    es_valido = False

                    if pwd_db.startswith('pbkdf2:') or pwd_db.startswith('scrypt:'):
                        es_valido = check_password_hash(pwd_db, password)
                    else:
                        es_valido = (pwd_db == password)

                    if es_valido:
                        session.clear()
                        session['usuario_id'] = usuario['id_usuario']
                        session['nombre'] = usuario['nombre']
                        session['rol'] = usuario['rol'] or 'cliente'

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
                        "INSERT INTO usuarios (nombre, email, telefono, password, rol, activo) VALUES (%s, %s, %s, %s, 'cliente', 1)",
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
    return redirect(url_for('menu'))

@app.post('/api/tracker')
def api_tracker():
    datos = request.get_json(silent=True) or {}
    visitante_id = datos.get('visitante_id')
    tipo = datos.get('tipo', 'vista')
    pagina = datos.get('pagina', '')
    detalle = datos.get('detalle', '')
    segundos = int(datos.get('segundos', 0))
    usuario_id = session.get('usuario_id')

    if not visitante_id:
        return jsonify({'error': 'Falta cookie visitante_id'}), 400

    elemento = detalle if tipo == 'clic' else None
    segundos_val = segundos if tipo == 'tiempo' else 0

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO eventos (visitante_id, usuario_id, tipo, pagina, elemento, segundos) VALUES (%s, %s, %s, %s, %s, %s)",
                (visitante_id, usuario_id, tipo, pagina, elemento, segundos_val)
            )
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/metrics')
def metrics():
    if 'usuario_id' not in session or session.get('rol') != 'admin':
        flash('Acceso restringido. Solo los administradores pueden ver las métricas.', 'error')
        return redirect(url_for('menu'))
    return render_template('metrics.html')

@app.route('/api/metricas')
def api_metricas():
    if 'usuario_id' not in session or session.get('rol') != 'admin':
        return jsonify({'error': 'No autorizado'}), 401

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(DISTINCT visitante_id) AS visitantes,
                       COUNT(DISTINCT visitante_id) AS sesiones,
                       COUNT(DISTINCT usuario_id)   AS usuarios,
                       COALESCE(SUM(CASE WHEN tipo = 'vista' THEN 1 ELSE 0 END), 0) AS vistas,
                       COALESCE(SUM(CASE WHEN tipo = 'clic' THEN 1 ELSE 0 END), 0)  AS clics
                FROM eventos
            """)
            resumen = cursor.fetchone()
            if not resumen:
                resumen = {'visitantes': 0, 'sesiones': 0, 'usuarios': 0, 'vistas': 0, 'clics': 0}

            try:
                cursor.execute("""
                    SELECT COALESCE(ROUND(AVG(total)), 0) AS promedio
                    FROM (SELECT SUM(segundos) AS total FROM eventos
                          WHERE tipo = 'tiempo' GROUP BY visitante_id) AS t
                """)
                prom_res = cursor.fetchone()
                resumen['tiempo_promedio'] = prom_res['promedio'] if prom_res and prom_res.get('promedio') else 0
            except:
                resumen['tiempo_promedio'] = 0

            cursor.execute("""
                SELECT pagina,
                       SUM(CASE WHEN tipo = 'vista' THEN 1 ELSE 0 END) AS vistas,
                       SUM(CASE WHEN tipo = 'clic' THEN 1 ELSE 0 END)  AS clics,
                       COALESCE(SUM(segundos), 0) AS segundos
                FROM eventos
                GROUP BY pagina
                ORDER BY vistas DESC
                LIMIT 10
            """)
            paginas = cursor.fetchall() or []

            cursor.execute("""
                SELECT elemento, pagina, COUNT(*) AS total
                FROM eventos
                WHERE tipo = 'clic' AND elemento IS NOT NULL AND elemento != ''
                GROUP BY elemento, pagina
                ORDER BY total DESC
                LIMIT 10
            """)
            clics = cursor.fetchall() or []

            cursor.execute("""
                SELECT COALESCE(u.nombre, '(anónimos)') AS nombre,
                       COUNT(DISTINCT e.visitante_id) AS sesiones,
                       SUM(CASE WHEN e.tipo = 'vista' THEN 1 ELSE 0 END) AS vistas,
                       SUM(CASE WHEN e.tipo = 'clic' THEN 1 ELSE 0 END)  AS clics,
                       COALESCE(SUM(e.segundos), 0) AS segundos,
                       DATE_FORMAT(MAX(e.fecha), '%d/%m/%Y %H:%i') AS ultima
                FROM eventos e
                LEFT JOIN usuarios u ON u.id_usuario = e.usuario_id
                GROUP BY e.usuario_id, u.nombre
                ORDER BY MAX(e.fecha) DESC
            """)
            usuarios = cursor.fetchall() or []

            # ----- Ventas -----
            cursor.execute("""
                SELECT COUNT(*) AS pedidos,
                       COALESCE(SUM(cantidad), 0) AS piezas,
                       COALESCE(SUM(total_final), 0) AS ingresos
                FROM ventas
            """)
            ventas = cursor.fetchone() or {'pedidos': 0, 'piezas': 0, 'ingresos': 0}

            cursor.execute("""
                SELECT p.nombre, SUM(v.cantidad) AS piezas, SUM(v.total_final) AS ingresos
                FROM ventas v INNER JOIN productos p ON p.id_producto = v.id_producto
                GROUP BY p.id_producto, p.nombre
                ORDER BY piezas DESC
                LIMIT 6
            """)
            top_productos = cursor.fetchall() or []

            # ----- Satisfacción (pregunta 1 de la encuesta) -----
            cursor.execute("""
                SELECT pregunta1 AS respuesta, COUNT(*) AS total
                FROM respuestas
                WHERE pregunta1 IS NOT NULL AND pregunta1 != ''
                GROUP BY pregunta1
                ORDER BY total DESC
            """)
            satisfaccion = cursor.fetchall() or []

            cursor.execute("""
                SELECT DATE_FORMAT(e.fecha, '%H:%i:%s') AS hora,
                       COALESCE(u.nombre, 'Anónimo') AS nombre,
                       e.tipo, e.pagina, e.elemento, e.segundos
                FROM eventos e
                LEFT JOIN usuarios u ON u.id_usuario = e.usuario_id
                ORDER BY e.id DESC
                LIMIT 15
            """)
            recientes = cursor.fetchall() or []

        conn.close()
        return jsonify({
            'resumen': resumen,
            'paginas': paginas,
            'clics': clics,
            'usuarios': usuarios,
            'ventas': ventas,
            'top_productos': top_productos,
            'satisfaccion': satisfaccion,
            'recientes': recientes
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/mapas')
def mapas():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('pagina1.html')

@app.route('/youtube')
def youtube():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('youtube.html', video_id="vK9he9d-JN0")

@app.route('/ubicacion')
def vista_ubicacion():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('ubicacion.html')

@app.route('/api/guardar', methods=['POST'])
def guardar_ubicacion():
    datos = request.get_json(silent=True) or {}
    lat = datos.get('latitud')
    lng = datos.get('longitud')
    
    if lat is None or lng is None or not (-90 <= float(lat) <= 90) or not (-180 <= float(lng) <= 180):
        return jsonify({'error': 'Coordenadas inválidas.'}), 400

    precision = round(float(datos.get('precision', 0)))
    usuario_id = session.get('usuario_id')
    nombre = session.get('nombre', 'invitado')

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            sql = "INSERT INTO ubicaciones (usuario_id, nombre, latitud, longitud, precision_m) VALUES (%s, %s, %s, %s, %s)"
            cursor.execute(sql, (usuario_id, nombre, lat, lng, precision))
            conn.commit()
            nuevo_id = cursor.lastrowid
        conn.close()
        return jsonify({'id': nuevo_id}), 201
    except Exception as e:
        return jsonify({'error': f'Error al guardar: {str(e)}'}), 500

@app.route('/api/ubicaciones', methods=['GET'])
def obtener_ubicaciones():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT nombre, latitud, longitud, precision_m, creado_en FROM ubicaciones ORDER BY id DESC LIMIT 50")
            filas = cursor.fetchall()
        conn.close()
        ubicaciones = [{
            'nombre': f['nombre'],
            'latitud': float(f['latitud']),
            'longitud': float(f['longitud']),
            'precision_m': int(f['precision_m']),
            'creado_en': str(f['creado_en'])
        } for f in filas]
        return jsonify(ubicaciones), 200
    except Exception as e:
        return jsonify({'error': f'Error al obtener: {str(e)}'}), 500

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
                sql = "INSERT INTO respuestas (nombre, pregunta1, pregunta2, pregunta3, pregunta4, pregunta5) VALUES (%s, %s, %s, %s, %s, %s)"
                cursor.execute(sql, (nombre, p1, p2, p3, p4, p5))
            conn.commit()
            conn.close()
            return redirect(url_for('regalo'))
        except Exception as e:
            flash(f'Error al guardar: {e}', 'error')

    return render_template('encuesta.html')

@app.route('/regalo')
def regalo():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('regalo.html')

# ----------------------------------------------------
# ATENCIÓN AL CLIENTE: chatbot + consultas que responde la tienda
# ----------------------------------------------------
def folio_de(id_venta):
    return f"SW-{int(id_venta):05d}" if id_venta else None

# Respuestas del asistente. Cambia los textos por las políticas reales de tu tienda.
BOT = {
    'saludo': "¡Hola{nombre}! Soy Estrella, la asistente de Starwish. ¿En qué te ayudo?",
    'envio': "Enviamos a todo México. La entrega tarda de 3 a 5 días hábiles después de tu compra. "
             "Tu dirección de entrega la eliges en el mapa al momento de pagar.",
    'tallas': "Cada prenda muestra sus tallas disponibles. Si dudas entre dos, te recomendamos la más grande. "
              "En la sección Comunidad puedes ver fotos de clientes y cómo les quedó su talla.",
    'devolucion': "Tienes 15 días después de recibir tu pedido para pedir un cambio de talla o una devolución. "
                  "La prenda debe estar sin usar y con etiquetas. Pide tu cambio aquí con una asesora.",
    'pago': "Aceptamos tarjetas Visa, Mastercard y American Express. "
            "El cobro se confirma al instante y recibes tu folio en pantalla.",
    'tienda': "Nuestra tienda está en Coacalco, Estado de México. Abrimos de lunes a sábado de 10:00 a 20:00.",
    'cupon': "Contesta nuestra encuesta de servicio y te regalamos el cupón STARWISH10 con 10% de descuento en tienda.",
    'gracias': "¡Con gusto! Si necesitas algo más, aquí estoy.",
    'asesora': "Claro. Escribe tu duda con todos los detalles (por ejemplo, tu folio) y una asesora te responderá aquí mismo.",
    'nada': "Mmm, no estoy segura de haber entendido. Elige una opción de abajo o deja tu mensaje a una asesora.",
}
OPCIONES = ['Mis pedidos', 'Envíos', 'Tallas', 'Cambios y devoluciones', 'Formas de pago', 'Hablar con una asesora']

# Palabras clave de cada tema (sin acentos y en minúsculas)
INTENCIONES = [
    ('asesora', ('asesor', 'humano', 'persona', 'agente', 'hablar con', 'queja', 'reclamo')),
    ('pedido', ('pedido', 'mi compra', 'mis compras', 'orden', 'folio', 'rastre', 'donde esta mi', 'ya llego', 'cuando llega', 'estado')),
    ('devolucion', ('devol', 'cambio', 'cambiar', 'reembolso', 'regresar')),
    ('envio', ('envio', 'enviar', 'entrega', 'paqueteria', 'cuanto tarda', 'domicilio')),
    ('tallas', ('talla', 'medida', 'me queda', 'tamano', 'chica', 'grande')),
    ('pago', ('pago', 'pagar', 'tarjeta', 'efectivo', 'oxxo', 'transferencia', 'meses')),
    ('tienda', ('tienda', 'ubica', 'direccion', 'horario', 'abren', 'cierran', 'sucursal', 'donde estan')),
    ('cupon', ('cupon', 'descuento', 'promo', 'oferta', 'codigo')),
    ('gracias', ('gracias', 'thank', 'excelente', 'genial')),
    ('saludo', ('hola', 'buenas', 'buenos dias', 'buen dia', 'hey', 'que tal')),
]
ENLACES = {
    'tallas': {'texto': 'Ver fotos de clientes', 'url': '/fotos'},
    'tienda': {'texto': 'Ver mapa y cómo llegar', 'url': '/mapas'},
    'cupon': {'texto': 'Contestar encuesta', 'url': '/encuesta'},
    'pedido': {'texto': 'Ir al catálogo', 'url': '/menu'},
}

def _normalizar(texto):
    import unicodedata
    texto = unicodedata.normalize('NFD', texto.lower())
    return ''.join(c for c in texto if unicodedata.category(c) != 'Mn')

def _pedidos_de(cursor, id_usuario):
    """Últimos pedidos del cliente (una compra = artículos registrados en el mismo momento)."""
    cursor.execute("""
        SELECT MIN(v.id_venta) AS id, v.created_at AS fecha, SUM(v.cantidad) AS piezas,
               SUM(v.total_final) AS total, MAX(v.direccion_envio) AS direccion,
               GROUP_CONCAT(p.nombre ORDER BY v.id_venta SEPARATOR ', ') AS productos
        FROM ventas v JOIN productos p ON p.id_producto = v.id_producto
        WHERE v.id_usuario = %s
        GROUP BY v.created_at
        ORDER BY v.created_at DESC
        LIMIT 3
    """, (id_usuario,))
    from datetime import datetime
    pedidos = []
    for r in cursor.fetchall():
        dias = (datetime.now() - r['fecha']).days if r['fecha'] else 0
        estado = 'Preparando tu pedido' if dias < 1 else 'En camino' if dias < 5 else 'Entregado'
        pedidos.append({
            'folio': folio_de(r['id']),
            'fecha': r['fecha'].strftime('%d/%m/%Y') if r['fecha'] else '',
            'productos': r['productos'],
            'piezas': int(r['piezas'] or 0),
            'total': float(r['total'] or 0),
            'estado': estado,
            'direccion': r['direccion'] or '',
        })
    return pedidos

@app.route('/mensajes')
def mensajes():
    if 'usuario_id' not in session:
        flash('Inicia sesión para hablar con atención al cliente.', 'error')
        return redirect(url_for('login'))
    return render_template('mensajes.html', opciones=OPCIONES)

@app.post('/api/soporte/bot')
def soporte_bot():
    """Chatbot por palabras clave. No usa servicios externos."""
    if 'usuario_id' not in session:
        return jsonify({'error': 'Inicia sesión.'}), 401
    texto = str((request.get_json(silent=True) or {}).get('texto', '')).strip()[:300]
    limpio = _normalizar(texto)

    intencion = 'nada'
    for clave, palabras in INTENCIONES:
        if any(p in limpio for p in palabras):
            intencion = clave
            break

    respuesta = {'intencion': intencion, 'opciones': OPCIONES, 'enlace': ENLACES.get(intencion)}
    if intencion == 'pedido':
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                pedidos = _pedidos_de(cursor, session['usuario_id'])
            conn.close()
        except Exception:
            return jsonify({**respuesta, 'texto': 'No pude consultar tus pedidos en este momento. Intenta de nuevo en un rato.'})
        respuesta['pedidos'] = pedidos
        respuesta['texto'] = (f"Encontré tus últimos {len(pedidos)} pedidos:" if len(pedidos) > 1
                              else "Este es tu pedido más reciente:" if pedidos
                              else "Aún no tienes pedidos. Cuando compres, aquí verás su estado.")
    else:
        partes = (session.get('nombre') or '').split()
        respuesta['texto'] = BOT[intencion].format(nombre=f", {partes[0]}" if partes else '')
    if intencion == 'asesora':
        respuesta['accion'] = 'ticket'
    return jsonify(respuesta)

@app.get('/api/soporte/tickets')
def listar_tickets():
    """El cliente ve sus consultas; la administradora ve todas."""
    if 'usuario_id' not in session:
        return jsonify({'error': 'Inicia sesión.'}), 401
    es_admin = session.get('rol') == 'admin'
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            sql = """SELECT id, usuario, texto, respuesta,
                            DATE_FORMAT(fecha, '%%d/%%m/%%Y %%H:%%i') AS fecha,
                            DATE_FORMAT(respondido_en, '%%d/%%m/%%Y %%H:%%i') AS respondido_en
                     FROM mensajes {} ORDER BY (respuesta IS NULL) DESC, id DESC LIMIT 100"""
            if es_admin:
                cursor.execute(sql.format('WHERE id_usuario IS NOT NULL'), ())
            else:
                cursor.execute(sql.format('WHERE id_usuario = %s'), (session['usuario_id'],))
            tickets = cursor.fetchall()
        conn.close()
        return jsonify(tickets)
    except Exception:
        return jsonify([])

@app.post('/api/soporte/tickets')
def crear_ticket():
    if 'usuario_id' not in session:
        return jsonify({'error': 'Inicia sesión.'}), 401
    texto = str((request.get_json(silent=True) or {}).get('texto', '')).strip()
    if len(texto) < 5:
        return jsonify({'error': 'Describe tu duda con un poco más de detalle.'}), 400
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("INSERT INTO mensajes (usuario, texto, id_usuario) VALUES (%s, %s, %s)",
                           (session.get('nombre', 'Cliente')[:50], texto[:1000], session['usuario_id']))
            nuevo = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'id': nuevo}), 201
    except Exception:
        return jsonify({'error': 'No se pudo enviar tu mensaje.'}), 500

@app.post('/api/soporte/tickets/<int:id_ticket>/responder')
def responder_ticket(id_ticket):
    if session.get('rol') != 'admin':
        return jsonify({'error': 'No autorizado'}), 403
    respuesta = str((request.get_json(silent=True) or {}).get('respuesta', '')).strip()
    if not respuesta:
        return jsonify({'error': 'Escribe una respuesta.'}), 400
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("UPDATE mensajes SET respuesta = %s, respondido_en = NOW() WHERE id = %s",
                           (respuesta[:2000], id_ticket))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception:
        return jsonify({'error': 'No se pudo guardar la respuesta.'}), 500

@app.route('/crud')
def crud():
    if 'usuario_id' not in session or session.get('rol') != 'admin':
        flash('Acceso restringido al panel de administración.', 'error')
        return redirect(url_for('menu'))
    return render_template('crud.html')

EXT_PERMITIDAS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
MAX_FOTO_BYTES = 5 * 1024 * 1024   # 5 MB
AJUSTES = ('Pequeña', 'Perfecta', 'Grande')

@app.route('/fotos', methods=['GET', 'POST'])
def vista_fotos():
    """Fotos de clientes (estilo Shein): cada cliente sube la foto de su prenda."""
    if 'usuario_id' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        archivo = request.files.get('foto')
        id_producto = request.form.get('id_producto', type=int)
        talla = request.form.get('talla', '').strip()[:20] or None
        ajuste = request.form.get('ajuste', '').strip()
        ajuste = ajuste if ajuste in AJUSTES else None
        comentario = request.form.get('comentario', '').strip()[:500] or None
        destino = url_for('vista_fotos', producto=id_producto) if id_producto else url_for('vista_fotos')

        if not archivo or archivo.filename == '':
            flash('Selecciona o toma una foto de tu prenda.', 'error')
            return redirect(destino)

        _, ext = os.path.splitext(secure_filename(archivo.filename).lower())
        if ext not in EXT_PERMITIDAS or not (archivo.mimetype or '').startswith('image/'):
            flash('Solo se permiten imágenes JPG, PNG, WEBP o GIF.', 'error')
            return redirect(destino)

        archivo.seek(0, os.SEEK_END)
        tamano_bytes = archivo.tell()
        archivo.seek(0)
        if tamano_bytes > MAX_FOTO_BYTES:
            flash('La imagen pesa más de 5 MB.', 'error')
            return redirect(destino)

        import time
        public_id = None
        try:
            if USA_CLOUDINARY:
                # Se guarda en la nube: no se pierde cuando Render reinicia
                res = cloudinary.uploader.upload(
                    archivo, folder='starwish/clientes', resource_type='image',
                    transformation=[{'width': 1200, 'crop': 'limit', 'quality': 'auto', 'fetch_format': 'auto'}])
                nombre_final = res['secure_url']
                public_id = res['public_id']
            else:
                nombre_final = f"cliente{session['usuario_id']}_{int(time.time() * 1000)}{ext}"
                carpeta_uploads = os.path.join(app.root_path, 'static', 'uploads')
                os.makedirs(carpeta_uploads, exist_ok=True)
                archivo.save(os.path.join(carpeta_uploads, nombre_final))
        except Exception as e:
            flash(f'No se pudo subir la imagen: {e}', 'error')
            return redirect(destino)

        try:
            conexion = get_db_connection()
            with conexion.cursor() as cursor:
                cursor.execute("""INSERT INTO fotos (usuario_id, nombre, archivo, tipo, bytes, creado_en,
                                                     id_producto, talla, ajuste, comentario, public_id)
                                  VALUES (%s, %s, %s, %s, %s, NOW(), %s, %s, %s, %s, %s)""",
                               (session['usuario_id'], session.get('nombre', 'Cliente'), nombre_final,
                                archivo.mimetype, tamano_bytes, id_producto, talla, ajuste, comentario, public_id))
            conexion.commit()
            conexion.close()
            flash('¡Gracias! Tu foto ya aparece en la galería de clientes.', 'success')
        except Exception as e:
            flash(f'No se pudo guardar la foto: {e}', 'error')
        return redirect(destino)

    filtro = request.args.get('producto', type=int)
    lista_fotos, productos = [], []
    try:
        conexion = get_db_connection()
        with conexion.cursor() as cursor:
            cursor.execute("SELECT id_producto, nombre, tallas FROM productos WHERE activo = 1 ORDER BY nombre")
            productos = cursor.fetchall()
            sql = """SELECT f.*, p.nombre AS producto, p.imagen AS producto_imagen
                     FROM fotos f LEFT JOIN productos p ON p.id_producto = f.id_producto"""
            if filtro:
                cursor.execute(sql + " WHERE f.id_producto = %s ORDER BY f.id DESC", (filtro,))
            else:
                cursor.execute(sql + " ORDER BY f.id DESC")
            lista_fotos = cursor.fetchall()
        conexion.close()
    except Exception as e:
        flash(f'Error al cargar la galería: {e}', 'error')

    return render_template('fotos.html', fotos=lista_fotos, productos=productos,
                           filtro=filtro, ajustes=AJUSTES, usa_cloudinary=USA_CLOUDINARY)

@app.post('/fotos/<int:id_foto>/eliminar')
def eliminar_foto(id_foto):
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    try:
        conexion = get_db_connection()
        with conexion.cursor() as cursor:
            cursor.execute("SELECT usuario_id, archivo, public_id FROM fotos WHERE id = %s", (id_foto,))
            foto = cursor.fetchone()
            if foto and (foto['usuario_id'] == session['usuario_id'] or session.get('rol') == 'admin'):
                cursor.execute("DELETE FROM fotos WHERE id = %s", (id_foto,))
                conexion.commit()
                if foto.get('public_id') and USA_CLOUDINARY:
                    try:
                        cloudinary.uploader.destroy(foto['public_id'])
                    except Exception:
                        pass
                elif foto['archivo'] and not foto['archivo'].startswith('http'):
                    ruta = os.path.join(app.root_path, 'static', 'uploads', foto['archivo'])
                    if os.path.isfile(ruta):
                        os.remove(ruta)
                flash('Foto eliminada.', 'success')
            else:
                flash('No puedes eliminar esta foto.', 'error')
        conexion.close()
    except Exception as e:
        flash(f'Error al eliminar: {e}', 'error')
    return redirect(request.referrer or url_for('vista_fotos'))

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
                    cursor.execute('SELECT id_usuario, nombre, email, telefono, activo, rol FROM usuarios ORDER BY id_usuario DESC')
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
                    cursor.execute('SELECT id_producto, nombre, descripcion, precio, stock, imagen, activo, colores, tallas FROM productos ORDER BY id_producto DESC')
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
                    colores = payload.get('colores', 'negro,blanco,naranja,celeste,marron')
                    tallas = payload.get('tallas', 'XS,S,M,L,XL,2XL,3XL')

                    if id_p:
                        cursor.execute('UPDATE productos SET nombre=%s, descripcion=%s, precio=%s, stock=%s, imagen=%s, activo=%s, colores=%s, tallas=%s WHERE id_producto=%s',
                                       (nombre, descripcion, precio, stock, imagen, activo, colores, tallas, id_p))
                    else:
                        cursor.execute('INSERT INTO productos (nombre, descripcion, precio, stock, imagen, activo, colores, tallas) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)',
                                       (nombre, descripcion, precio, stock, imagen, activo, colores, tallas))
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
