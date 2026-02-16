import os
import datetime
import secrets
import string
import io
import random
import time
import json
from fpdf import FPDF
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session, Response, stream_with_context
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import docker
import subprocess
import threading
import requests

app = Flask(__name__)
# Config
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-this')
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(hours=12)
# Ensure config directory exists
CONFIG_DIR = os.path.join(os.path.dirname(__file__), 'config')
os.makedirs(CONFIG_DIR, exist_ok=True)
DB_PATH = os.path.join(CONFIG_DIR, 'dockwatch.db')

# Docker Client
try:
    client = docker.from_env()
except:
    client = None
    print("Warning: Docker client not initialized.")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)''')

    # Alerts Config - Create if not exists
    c.execute('''CREATE TABLE IF NOT EXISTS alerts_config
                 (id INTEGER PRIMARY KEY CHECK (id = 1), 
                  cpu_limit INTEGER DEFAULT 80, 
                  mem_limit INTEGER DEFAULT 90,
                  slack_webhook TEXT,
                  slack_enabled INTEGER DEFAULT 0,
                  discord_webhook TEXT,
                  discord_enabled INTEGER DEFAULT 0,
                  telegram_bot_token TEXT,
                  telegram_chat_id TEXT,
                  telegram_enabled INTEGER DEFAULT 0,
                  generic_webhook TEXT,
                  generic_enabled INTEGER DEFAULT 0,
                  email_recipient TEXT,
                  email_enabled INTEGER DEFAULT 0)''')
    c.execute("INSERT OR IGNORE INTO alerts_config (id, cpu_limit, mem_limit) VALUES (1, 80, 90)")
    
    # Migration: Add new columns if they don't exist
    c.execute("PRAGMA table_info(alerts_config)")
    existing_columns = [row[1] for row in c.fetchall()]
    
    migrations = [
        ('slack_enabled', 'INTEGER DEFAULT 0'),
        ('discord_webhook', 'TEXT'),
        ('discord_enabled', 'INTEGER DEFAULT 0'),
        ('telegram_bot_token', 'TEXT'),
        ('telegram_chat_id', 'TEXT'),
        ('telegram_enabled', 'INTEGER DEFAULT 0'),
        ('generic_enabled', 'INTEGER DEFAULT 0'),
        ('email_enabled', 'INTEGER DEFAULT 0')
    ]
    
    for col_name, col_type in migrations:
        if col_name not in existing_columns:
            try:
                c.execute(f"ALTER TABLE alerts_config ADD COLUMN {col_name} {col_type}")
                print(f"Added column: {col_name}")
            except sqlite3.OperationalError as e:
                print(f"Column {col_name} migration error: {e}")

    # Alert History
    c.execute('''CREATE TABLE IF NOT EXISTS alert_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                  level TEXT,
                  message TEXT,
                  container TEXT)''')
    
    # Check if admin exists
    admin_user = os.environ.get('ADMIN_USERNAME', 'admin')
    admin_pass = os.environ.get('ADMIN_PASSWORD', 'secretpassword')
    
    
    # We allow the ENV password to be anything, but the login form enforces 32 chars. 
    # This implies the user SHOULD set a 32 char password in ENV.
    
    c.execute("SELECT * FROM users WHERE username=?", (admin_user,))
    row = c.fetchone()
    
    hashed = generate_password_hash(admin_pass)
    if row:
        # Update existing admin password to match ENV (crucial for new length policy)
        c.execute("UPDATE users SET password=? WHERE username=?", (hashed, admin_user))
        print(f"Updated admin user: {admin_user}")
    else:
        try:
            c.execute("INSERT INTO users (username, password) VALUES (?, ?)", (admin_user, hashed))
            print(f"Initialized admin user: {admin_user}")
        except sqlite3.IntegrityError:
            pass
            
    conn.commit()
    conn.close()

# Initialize API and DB
init_db()

# Login Manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin):
    def __init__(self, id, username):
        self.id = id
        self.username = username

@login_manager.user_loader
def load_user(user_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id=?", (user_id,))
    user = c.fetchone()
    conn.close()
    if user:
        return User(id=user[0], username=user[1])
    return None

# --- Routes ---

@app.route('/captcha')
def captcha():
    # Simple SVG Captcha to avoid external deps
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    session['captcha_answer'] = code
    
    # Randomize visual elements
    colors = ['#333', '#555', '#000']
    lines = []
    for _ in range(5):
        x1 = random.randint(0, 150)
        y1 = random.randint(0, 50)
        x2 = random.randint(0, 150)
        y2 = random.randint(0, 50)
        lines.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#ccc" stroke-width="1"/>')
    
    svg_content = f'''<svg width="150" height="50" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f0f0f0"/>
      {''.join(lines)}
      <text x="50%" y="50%" font-family="monospace" font-size="28" font-weight="bold"
            fill="{random.choice(colors)}" text-anchor="middle" dominant-baseline="middle"
            transform="rotate({random.randint(-5, 5)}, 75, 25)">
        {code}
      </text>
    </svg>'''
    return Response(svg_content, mimetype='image/svg+xml')

@app.route('/api/check_user', methods=['POST'])
def check_user():
    data = request.json
    if not data:
        return jsonify({'exists': False})
    username = data.get('username')
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT 1 FROM users WHERE username=?", (username,))
    exists = c.fetchone() is not None
    conn.close()
    return jsonify({'exists': exists})

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        captcha_input = request.form.get('captcha')
        
        # Verify Captcha
        stored_captcha = session.get('captcha_answer')
        if not stored_captcha or stored_captcha != captcha_input.strip().upper():
            flash("Invalid Captcha")
            return redirect(url_for('login'))
            
        # Strict 32 char password check
        if len(password) != 32:
             flash("Password must be strictly 32 characters long.")
             return redirect(url_for('login'))

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username=?", (username,))
        user_row = c.fetchone()
        conn.close()
        
        if user_row and check_password_hash(user_row[2], password):
            user = User(id=user_row[0], username=user_row[1])
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash("Invalid credentials")
            return redirect(url_for('login'))
            
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    try:
        if not client:
             return render_template('index.html', containers=[])
             
        containers = client.containers.list(all=True)
        container_list = []
        for c in containers:
            name = c.name
            if name.startswith('/'):
                name = name[1:]
            
            image_tag = "unknown"
            if hasattr(c, 'image') and hasattr(c.image, 'tags') and len(c.image.tags) > 0:
                image_tag = c.image.tags[0]
            
            # Ports
            ports_list = []
            ports_data = c.attrs.get('NetworkSettings', {}).get('Ports', {})
            if ports_data:
                for int_port, bindings in ports_data.items():
                    if bindings:
                        for b in bindings:
                            host_port = b.get('HostPort', '')
                            ports_list.append(f"{host_port}:{int_port}")
                    else:
                        ports_list.append(f"{int_port}")
            ports_str = ", ".join(ports_list)

            # Calculate Uptime
            uptime_str = "Unknown"
            status_text = c.status
            
            if c.status == 'running':
                 started_at = c.attrs.get('State', {}).get('StartedAt')
                 if started_at:
                     try:
                         dt_str = started_at.split('.')[0] 
                         start_dt = datetime.datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%S")
                         now_dt = datetime.datetime.utcnow()
                         diff = now_dt - start_dt
                         days = diff.days
                         hours = diff.seconds // 3600
                         minutes = (diff.seconds % 3600) // 60
                         if days > 0: uptime_str = f"{days}d {hours}h"
                         elif hours > 0: uptime_str = f"{hours}h {minutes}m"
                         else: uptime_str = f"{minutes}m"
                         status_text = f"Up {uptime_str}"
                     except: pass
            else:
                 status_text = c.status.capitalize()

            container_list.append({
                "ID": c.id[:12],
                "Names": name, 
                "Image": image_tag,
                "State": c.status,
                "StatusText": status_text,
                "Ports": ports_str,
                "Uptime": uptime_str
            })
        return render_template('index.html', containers=container_list)
    except Exception as e:
        print(f"Error fetching containers: {e}")
        return render_template('index.html', containers=[])

@app.route('/images_view')
@login_required
def images_view_page():
    return render_template('images.html')

@app.route('/system_view')
@login_required
def system_view_page():
    return render_template('system.html')

@app.route('/alerts_view')
@login_required
def alerts_view_page():
    return render_template('alerts.html')

@app.route('/api/export/<container_id>')
@login_required
def export_logs(container_id):
    try:
        format_type = request.args.get('format', 'txt')
        container = client.containers.get(container_id)
        logs = container.logs().decode('utf-8', errors='replace')
        name = container.name.replace('/', '')

        if format_type == 'json':
            return jsonify({"container": name, "logs": logs.split('\n')})
            
        elif format_type == 'pdf':
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Arial", size=10)
            
            # Simple header
            pdf.cell(200, 10, txt=f"Logs for container: {name}", ln=1, align='C')
            pdf.ln(10)
            
            # Add logs line by line
            # FPDF unicode support is limited in standard font, strip non-latin1 for simplicity
            for line in logs.split('\n'):
                # clean line
                clean_line = line.encode('latin-1', 'replace').decode('latin-1')
                pdf.multi_cell(0, 5, txt=clean_line)
                
            response = Response(pdf.output(dest='S').encode('latin-1'), mimetype='application/pdf')
            response.headers['Content-Disposition'] = f'attachment; filename={name}.pdf'
            return response
            
        else: # txt default
            return Response(logs, mimetype='text/plain', 
                           headers={"Content-Disposition": f"attachment;filename={name}.txt"})
                           
    except Exception as e:
        return f"Error exporting logs: {str(e)}", 500

@app.route('/api/volume/<container_id>')
@login_required
def volume_usage(container_id):
    try:
        container = client.containers.get(container_id)
        if container.status != 'running':
            return jsonify({'status': 'stopped', 'total_mb': 0, 'mounts': []})

        mounts = container.attrs.get('Mounts', [])
        usage_data = []
        total_kb = 0
        
        for mount in mounts:
            dest = mount['Destination']
            # Try du -sk (kilobytes) which is widely supported
            try:
                # exec_run returns (exit_code, output)
                # We use simple string splitting
                cmd = f"du -sk {dest}"
                exit_code, output = container.exec_run(cmd)
                if exit_code == 0:
                    # Output example: b'10500\t/var/lib/mysql\n'
                    out_str = output.decode('utf-8').strip()
                    if out_str:
                        size_kb = int(out_str.split()[0])
                        total_kb += size_kb
                        usage_data.append({'path': dest, 'size_mb': round(size_kb/1024, 2)})
            except Exception as e:
                # Sometimes exec fails or permission denied
                usage_data.append({'path': dest, 'error': str(e)})
        
        return jsonify({
            'status': 'success',
            'total_mb': round(total_kb / 1024, 2),
            'mounts': usage_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats/<container_id>')
@login_required
def stream_stats(container_id):
    if not client:
        return "Docker client not initialized", 500

    def generate():
        try:
            container = client.containers.get(container_id)
            if container.status != 'running':
                 yield f"data: {json.dumps({'error': 'Container excluded'})}\n\n"
                 return

            # Keep track of previous network/disk values to calculate rate/speed if needed
            # For now, we stream raw cumulative values or calculated usage
            for stat in container.stats(stream=True, decode=True):
                # Calculations
                cpu_delta = stat.get('cpu_stats', {}).get('cpu_usage', {}).get('total_usage', 0) - \
                            stat.get('precpu_stats', {}).get('cpu_usage', {}).get('total_usage', 0)
                system_delta = stat.get('cpu_stats', {}).get('system_cpu_usage', 0) - \
                               stat.get('precpu_stats', {}).get('system_cpu_usage', 0)
                
                online_cpus = stat.get('cpu_stats', {}).get('online_cpus', 1)
                if online_cpus is None: online_cpus = 1
                
                cpu_percent = 0.0
                if system_delta > 0 and cpu_delta > 0:
                    cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0

                # Memory
                mem_usage = stat.get('memory_stats', {}).get('usage', 0)
                mem_limit = stat.get('memory_stats', {}).get('limit', 0)
                mem_percent = 0.0
                if mem_limit > 0:
                    mem_percent = (mem_usage / mem_limit) * 100.0
                
                # Network (Sum all interfaces)
                networks = stat.get('networks', {})
                rx_bytes = 0
                tx_bytes = 0
                if networks:
                    for iface in networks.values():
                        rx_bytes += iface.get('rx_bytes', 0)
                        tx_bytes += iface.get('tx_bytes', 0)
                
                # Disk IO
                # blkio_stats -> io_service_bytes_recursive
                blkio = stat.get('blkio_stats', {}).get('io_service_bytes_recursive', [])
                disk_read = 0
                disk_write = 0
                if blkio:
                    for entry in blkio:
                        op = entry.get('op', '').lower()
                        if 'read' in op:
                            disk_read += entry.get('value', 0)
                        elif 'write' in op:
                            disk_write += entry.get('value', 0)

                data = {
                    "cpu": round(cpu_percent, 2),
                    "memory": round(mem_usage / 1024 / 1024, 2), # MB
                    "memory_limit": round(mem_limit / 1024 / 1024, 2), # MB
                    "net_rx": round(rx_bytes / 1024 / 1024, 2), # MB
                    "net_tx": round(tx_bytes / 1024 / 1024, 2), # MB
                    "disk_read": round(disk_read / 1024 / 1024, 2), # MB
                    "disk_write": round(disk_write / 1024 / 1024, 2), # MB
                    "timestamp": datetime.datetime.now().strftime('%H:%M:%S')
                }
                yield f"data: {json.dumps(data)}\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/volumes')
@login_required
def get_volumes():
    target_container = request.args.get('container_id')
    if not client: return jsonify([])
    
    try:
        allowed_volumes = None
        if target_container:
            try:
                c = client.containers.get(target_container)
                allowed_volumes = set()
                if 'Mounts' in c.attrs:
                    for m in c.attrs['Mounts']:
                        if m['Type'] == 'volume':
                            allowed_volumes.add(m['Name'])
            except: 
                return jsonify([])
        
        volumes = client.volumes.list()
        usage = {}
        try:
             df = client.df()
             if 'Volumes' in df and df['Volumes']:
                 for v in df['Volumes']:
                     usage[v['Name']] = v.get('UsageData', {})
        except: pass

        final_list = []
        for v in volumes:
            if allowed_volumes is not None and v.name not in allowed_volumes:
                continue
            u = usage.get(v.name, {})
            size = u.get('Size', 0)
            if size == -1: size = 0 
            
            final_list.append({
                "Name": v.name,
                "Driver": v.attrs.get('Driver', 'local'),
                "Size": size, 
                "RefCount": u.get('RefCount', 0)
            })
            
        return jsonify(final_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/logs/<container_id>')
@login_required
def stream_logs(container_id):
    if not client:
        return "Docker client not initialized", 500

    def generate():
        last_id = request.headers.get('Last-Event-ID')
        try:
            container = client.containers.get(container_id)
            kwargs = {'stream': True, 'follow': True}
            
            # If client suggests a last ID (timestamp), we fetch logs since then
            if last_id:
                try:
                    # docker accepts integer timestamp usually
                    kwargs['since'] = int(float(last_id))
                except:
                    kwargs['tail'] = 100
            else:
                kwargs['tail'] = 100
                
            for line in container.logs(**kwargs):
                # We emit the current server time as the ID for the next reconnect point
                # This ensures that if the client reconnects, it asks for logs starting 'now'
                # avoiding the re-fetching of the tail history.
                yield f"id: {time.time()}\ndata: {line.decode('utf-8')}\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# --- Image Management Routes ---
@app.route('/api/images')
@login_required
def list_images():
    try:
        images = client.images.list()
        img_list = []
        for img in images:
            # parsing size, tags, created
            tags = img.tags if img.tags else ['<none>:<none>']
            size_mb = round(img.attrs.get('Size', 0) / (1024*1024), 2)
            created = img.attrs.get('Created', '').split('.')[0]
            img_list.append({
                'id': img.short_id,
                'long_id': img.id,
                'tags': tags,
                'size_mb': size_mb,
                'created': created,
                'labels': img.labels
            })
        return jsonify(img_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images/history/<path:image_id>')
@login_required
def image_history(image_id):
    try:
        # allow image_id to be ID or tag
        image = client.images.get(image_id)
        history = image.history()
        return jsonify(history)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images/scan/<path:image_id>')
@login_required
def scan_image(image_id):
    try:
        image = client.images.get(image_id)
        # Use repo tag if available, else ID
        target = image.tags[0] if image.tags else image.id
        
        # Trivy command
        cmd = ["trivy", "image", "--format", "json", "--scanners", "vuln", target]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
             # Trivy might fail if DB not found or other issues
             # We try to return stderr
             err = result.stderr or "Unknown error"
             return jsonify({'error': err, 'stdout': result.stdout})
             
        # Return raw JSON from trivy
        return Response(result.stdout, mimetype='application/json')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images/pull', methods=['POST'])
@login_required
def pull_image():
    data = request.json
    image_name = data.get('image')
    if not image_name: return "No image provided", 400
    
    def generate():
        try:
            # stream=True returns a generator showing progress
            for line in client.api.pull(image_name, stream=True, decode=True):
                yield f"data: {json.dumps(line)}\n\n"
            yield f"data: {json.dumps({'status': 'Done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/images/<path:image_id>', methods=['DELETE'])
@login_required
def delete_image(image_id):
    try:
        force = request.args.get('force', 'false') == 'true'
        client.images.remove(image_id, force=force)
        return jsonify({'status': 'deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images/prune', methods=['POST'])
@login_required
def prune_images():
    try:
        pruned = client.images.prune()
        return jsonify(pruned)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images/build', methods=['POST'])
@login_required
def build_image():
    # Expects 'dockerfile' content and 'tag'
    data = request.json
    dockerfile_content = data.get('dockerfile')
    tag = data.get('tag')
    
    if not dockerfile_content:
        return jsonify({'error': 'No dockerfile content'}), 400
        
    def generate():
        try:
            # We create a file-like object for the build context
            f = io.BytesIO(dockerfile_content.encode('utf-8'))
            # client.images.build expects fileobj or path. 
            # If fileobj, it's treated as a tarball context or Dockerfile if using basic params.
            # Using fileobj directly as Dockerfile is tricky. 
            # We should probably use `client.api.build(..., fileobj=f)` which allows simple Dockerfile stream
            yield f"data: {json.dumps({'status': 'Starting build...'})}\n\n"
            
            for line in client.api.build(fileobj=f, tag=tag, rm=True, decode=True):
                if 'stream' in line:
                    yield f"data: {json.dumps({'stream': line['stream']})}\n\n"
                elif 'error' in line:
                     yield f"data: {json.dumps({'error': line['error']})}\n\n"
                     
            yield f"data: {json.dumps({'status': 'Done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

# --- System Routes ---
@app.route('/api/system/info')
@login_required
def system_info():
    try:
        info = client.info()
        version = client.version()
        df = client.df()
        return jsonify({
            'info': info,
            'version': version,
            'df': df
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/prune', methods=['POST'])
@login_required
def system_prune():
    try:
        # Prune everything
        c_prune = client.containers.prune()
        i_prune = client.images.prune()
        v_prune = client.volumes.prune()
        n_prune = client.networks.prune()
        return jsonify({
            'containers': c_prune,
            'images': i_prune,
            'volumes': v_prune,
            'networks': n_prune
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Container Deep Dive ---
@app.route('/api/containers/<container_id>/inspect')
@login_required
def inspect_container(container_id):
    try:
        c = client.containers.get(container_id)
        return jsonify(c.attrs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/containers/<container_id>/top')
@login_required
def container_top(container_id):
    try:
        c = client.containers.get(container_id)
        if c.status != 'running':
            return jsonify({'error': 'Container excluded'})
        return jsonify(c.top())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Alerts API ---
@app.route('/api/alerts/config', methods=['GET', 'POST'])
@login_required
def alerts_config_api():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    if request.method == 'POST':
        data = request.json
        c.execute("""UPDATE alerts_config SET cpu_limit=?, mem_limit=?, 
                     slack_webhook=?, slack_enabled=?, discord_webhook=?, discord_enabled=?,
                     telegram_bot_token=?, telegram_chat_id=?, telegram_enabled=?,
                     generic_webhook=?, generic_enabled=?, email_recipient=?, email_enabled=? WHERE id=1""",
                  (data.get('cpu_limit'), data.get('mem_limit'), 
                   data.get('slack_webhook'), data.get('slack_enabled', 0),
                   data.get('discord_webhook'), data.get('discord_enabled', 0),
                   data.get('telegram_bot_token'), data.get('telegram_chat_id'), data.get('telegram_enabled', 0),
                   data.get('generic_webhook'), data.get('generic_enabled', 0),
                   data.get('email_recipient'), data.get('email_enabled', 0)))
        conn.commit()
        conn.close()
        return jsonify({'status': 'updated'})
    else:
        c.execute("SELECT * FROM alerts_config WHERE id=1")
        row = c.fetchone()
        conn.close()
        if not row:
            return jsonify({})
        return jsonify({
            'cpu_limit': row[1], 'mem_limit': row[2], 
            'slack_webhook': row[3] or '', 'slack_enabled': row[4] or 0,
            'discord_webhook': row[5] or '', 'discord_enabled': row[6] or 0,
            'telegram_bot_token': row[7] or '', 'telegram_chat_id': row[8] or '', 'telegram_enabled': row[9] or 0,
            'generic_webhook': row[10] or '', 'generic_enabled': row[11] or 0,
            'email_recipient': row[12] or '', 'email_enabled': row[13] or 0
        })

@app.route('/api/alerts/history')
@login_required
def alerts_history_api():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT * FROM alert_history ORDER BY timestamp DESC LIMIT 100")
    rows = c.fetchall()
    conn.close()
    history = []
    for r in rows:
        history.append({'id': r[0], 'timestamp': r[1], 'level': r[2], 'message': r[3], 'container': r[4]})
    return jsonify(history)

# --- Monitoring Logic ---
last_alert_cooldown = {}

def send_notification(title, message):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""SELECT slack_webhook, slack_enabled, discord_webhook, discord_enabled, 
                     telegram_bot_token, telegram_chat_id, telegram_enabled, 
                     generic_webhook, generic_enabled FROM alerts_config WHERE id=1""")
        row = c.fetchone()
        conn.close()
        
        if not row: 
            return
        
        slack_url, slack_on, discord_url, discord_on, tg_token, tg_chat, tg_on, webhook_url, webhook_on = row
        
        # Prioritize environment variables over database values for security
        slack_url = os.environ.get('SLACK_WEBHOOK_URL', slack_url)
        discord_url = os.environ.get('DISCORD_WEBHOOK_URL', discord_url)
        tg_token = os.environ.get('TELEGRAM_BOT_TOKEN', tg_token)
        tg_chat = os.environ.get('TELEGRAM_CHAT_ID', tg_chat)
        webhook_url = os.environ.get('GENERIC_WEBHOOK_URL', webhook_url)
        
        # Slack
        if slack_on and slack_url:
            try: 
                requests.post(slack_url, json={"text": f"*{title}*\n{message}"}, timeout=3)
            except Exception as e: 
                print(f"Slack error: {e}")
        
        # Discord
        if discord_on and discord_url:
            try:
                requests.post(discord_url, json={"content": f"**{title}**\n{message}"}, timeout=3)
            except Exception as e:
                print(f"Discord error: {e}")
        
        # Telegram
        if tg_on and tg_token and tg_chat:
            try:
                tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
                requests.post(tg_url, json={"chat_id": tg_chat, "text": f"*{title}*\n{message}", "parse_mode": "Markdown"}, timeout=3)
            except Exception as e:
                print(f"Telegram error: {e}")
        
        # Generic Webhook
        if webhook_on and webhook_url:
            try: 
                requests.post(webhook_url, json={"title": title, "message": message, "timestamp": time.time()}, timeout=3)
            except Exception as e:
                print(f"Webhook error: {e}")
                
    except Exception as e:
        print(f"Notification error: {e}")

def log_alert(level, message, container_name="System"):
    try:
        # DB Log
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("INSERT INTO alert_history (level, message, container) VALUES (?, ?, ?)", 
                  (level, message, container_name))
        conn.commit()
        conn.close()
        # Notify
        send_notification(f"[{level}] {container_name}", message)
    except: pass

def monitor_loop():
    while True:
        try:
            if not client: 
                time.sleep(10)
                continue
                
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("SELECT cpu_limit, mem_limit FROM alerts_config WHERE id=1")
            row = c.fetchone()
            conn.close()
            
            if not row:
                time.sleep(30)
                continue
            
            cpu_thresh, mem_thresh = row
            
            containers = client.containers.list()
            for c in containers:
                try:
                    stats = c.stats(stream=False)
                    # CPU
                    cpu_stats = stats['cpu_stats']
                    precpu_stats = stats['precpu_stats']
                    cpu_percent = 0.0
                    
                    cpu_usage = cpu_stats['cpu_usage']['total_usage']
                    precpu_usage = precpu_stats['cpu_usage']['total_usage']
                    system_usage = cpu_stats.get('system_cpu_usage', 0)
                    presystem_usage = precpu_stats.get('system_cpu_usage', 0)
                    
                    if system_usage > 0 and presystem_usage > 0:
                        cpu_delta = cpu_usage - precpu_usage
                        system_delta = system_usage - presystem_usage
                        if system_delta > 0 and cpu_delta > 0:
                            online_cpus = cpu_stats.get('online_cpus', 1) or 1
                            cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0
                            
                    # Mem
                    mem_usage = stats['memory_stats'].get('usage', 0)
                    mem_limit = stats['memory_stats'].get('limit', 0)
                    mem_percent = 0.0
                    if mem_limit > 0: mem_percent = (mem_usage / mem_limit) * 100.0
                    
                    # Alerts
                    uid = c.id
                    now = time.time()
                    
                    if cpu_percent > cpu_thresh:
                        key = f"{uid}_cpu"
                        if now - last_alert_cooldown.get(key, 0) > 300: # 5 min cooldown
                            log_alert("High CPU", f"CPU: {round(cpu_percent,1)}% > {cpu_thresh}%", c.name)
                            last_alert_cooldown[key] = now
                            
                    if mem_percent > mem_thresh:
                        key = f"{uid}_mem"
                        if now - last_alert_cooldown.get(key, 0) > 300:
                            log_alert("High Memory", f"Mem: {round(mem_percent,1)}% > {mem_thresh}%", c.name)
                            last_alert_cooldown[key] = now
                            
                except: pass
            
        except Exception as e:
            print(f"Monitor error: {e}")
            
        time.sleep(30) # Check every 30s

def event_listener_loop():
    while True:
        try:
            if not client:
               time.sleep(10)
               continue
            
            # This blocks
            for event in client.events(decode=True):
                if event.get('Type') == 'container':
                    status = event.get('status')
                    if status in ['die', 'kill', 'stop', 'start']:
                        name = event.get('Actor', {}).get('Attributes', {}).get('name', 'Unknown')
                        log_alert("State Change", f"Container {status}", name)
        except:
             time.sleep(5)

# Start Threads
# Start monitoring threads (avoid duplicate in Flask reloader)
if not os.environ.get("WERKZEUG_RUN_MAIN") or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    t1 = threading.Thread(target=monitor_loop, daemon=True)
    t1.start()
    t2 = threading.Thread(target=event_listener_loop, daemon=True)
    t2.start()


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
