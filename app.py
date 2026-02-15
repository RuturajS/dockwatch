[diff_block_start]
import datetime
# ...
[diff_block_end]
[diff_block_start]
        # Default: admin / admin (or from ENV)
        try:
            admin_user = os.environ.get('ADMIN_USERNAME', 'admin')
            admin_pass = os.environ.get('ADMIN_PASSWORD', 'admin')
            
            conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", 
                         (admin_user, generate_password_hash(admin_pass)))
            print(f"Initialized admin user: {admin_user}")
        except Exception as e:
            print(f"Error creating admin: {e}")
        
    conn.commit()
    conn.close()

# Initialize on startup
init_db()

# --- Auth Setup ---
login_manager = LoginManager()
login_manager.init_app(app)
[diff_block_end]
[diff_block_start]
def index():
    try:
        containers = client.containers.list(all=True)
        container_list = []
        for c in containers:
            name = c.name
            if name.startswith('/'):
                name = name[1:]
            
            image_tag = "unknown"
            if len(c.image.tags) > 0:
                image_tag = c.image.tags[0]
            
            # Calculate Uptime
            uptime_str = "Unknown"
            status_text = c.status
            
            if c.status == 'running':
                 started_at = c.attrs.get('State', {}).get('StartedAt')
                 # started_at format: 2023-10-27T10:00:00.000000000Z
                 if started_at:
                     try:
                         # Remove nanoseconds/timezone for simple parsing
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
                "StatusText": status_text
            })
        return render_template('index.html', containers=container_list)
    except Exception as e:
[diff_block_end]
[diff_block_start]
@app.route('/api/volumes')
@login_required
def get_volumes():
    target_container = request.args.get('container_id')
    
    try:
        # If filtering by container, get its mounts first
        allowed_volumes = None
        if target_container:
            try:
                c = client.containers.get(target_container)
                # Find volume names
                allowed_volumes = set()
                if 'Mounts' in c.attrs:
                    for m in c.attrs['Mounts']:
                        if m['Type'] == 'volume':
                            allowed_volumes.add(m['Name'])
            except: 
                return jsonify([]) # Container not found or error
        
        # Get all volumes
        volumes = client.volumes.list()
        
        # Get usage (expensive operation, maybe optimize later)
        usage = {}
        try:
             df = client.df()
             if 'Volumes' in df and df['Volumes']:
                 for v in df['Volumes']:
                     usage[v['Name']] = v.get('UsageData', {})
        except: pass

        final_list = []
        for v in volumes:
            # Filter logic: if allowed_volumes is set, skip if not in set
            if allowed_volumes is not None and v.name not in allowed_volumes:
                continue
                
            u = usage.get(v.name, {})
            # Safe parsing
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

if __name__ == '__main__':
[diff_block_end]
