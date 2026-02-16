# DockWatch

**Lightweight Docker Container & Image Monitor**

A modern web-based Docker monitoring tool built with Python Flask. Monitor your containers, images, system resources, and set up intelligent alerts.

## Features

- 📦 **Container Management**: View, start, stop, and monitor Docker containers in real-time
- 🖼️ **Image Management**: Browse Docker images, view details, and manage your image library
- 📊 **System Monitoring**: Track Docker system resources and statistics
- 🔔 **Smart Alerts**: Configure alerts for container status changes and resource thresholds
- 🔐 **Secure Authentication**: Login system with session management
- 🎨 **Modern UI**: Clean, responsive interface with dark mode support

## Prerequisites

- **Docker**: Installed and running on your system
- **Docker Compose**: For easy deployment (optional but recommended)
- **Python 3.8+**: If running without Docker

## Setup Instructions

### Option 1: Using Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd dockwatch
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set your preferences:
   ```env
   FLASK_SECRET_KEY=your-secret-key-here
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your-secure-password
   FLASK_PORT=5000
   ```

3. **Build and run**:
   ```bash
   docker compose up --build
   ```

4. **Access the application**:
   Open your browser and navigate to `http://localhost:5000`

5. **Login**:
   Use the credentials you set in the `.env` file

### Option 2: Pull from Docker Hub (Quick Start)

Run DockWatch directly from Docker Hub without cloning the repository:

#### **Basic Run (with default settings)**:
```bash
docker run -d \
  --name dockwatch \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  yourusername/dockwatch:latest
```

#### **Run with Environment Variables**:
```bash
docker run -d \
  --name dockwatch \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=YourSecurePassword12345678901234 \
  -e PORT=8080 \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url \
  -e SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your-webhook \
  -e TELEGRAM_BOT_TOKEN=your-bot-token \
  -e TELEGRAM_CHAT_ID=your-chat-id \
  yourusername/dockwatch:latest
```

#### **Run with .env file**:
```bash
# Create a .env file with your settings
docker run -d \
  --name dockwatch \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file .env \
  yourusername/dockwatch:latest
```

#### **Environment Variables Reference**:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_USERNAME` | No | `admin` | Admin login username |
| `ADMIN_PASSWORD` | **Yes** | - | Admin password (must be exactly 32 characters) |
| `PORT` | No | `8080` | Application port |
| `DISCORD_WEBHOOK_URL` | No | - | Discord webhook for notifications |
| `SLACK_WEBHOOK_URL` | No | - | Slack webhook for notifications |
| `TELEGRAM_BOT_TOKEN` | No | - | Telegram bot token |
| `TELEGRAM_CHAT_ID` | No | - | Telegram chat ID |
| `GENERIC_WEBHOOK_URL` | No | - | Generic webhook URL |

**Important Notes**:
- The `ADMIN_PASSWORD` **must be exactly 32 characters long**
- The Docker socket mount (`-v /var/run/docker.sock:/var/run/docker.sock`) is required for monitoring
- On Windows, use `//var/run/docker.sock:/var/run/docker.sock` for the socket path
- Webhook URLs configured in `.env` will be loaded automatically on first run

#### **Access the Application**:
- Open your browser to `http://localhost:8080`
- Login with your configured credentials
- Configure additional settings via the ⚙️ Settings button

### Option 3: Running Locally (Without Docker)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd dockwatch
   ```

2. **Create a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your settings (see Option 1 step 2)

5. **Run the application**:
   ```bash
   python app.py
   ```

6. **Access the application**:
   Open your browser and navigate to `http://localhost:5000`

## Configuration

The application uses environment variables for configuration. Key settings include:

- `FLASK_SECRET_KEY`: Secret key for session management (change this!)
- `ADMIN_USERNAME`: Admin login username
- `ADMIN_PASSWORD`: Admin login password
- `FLASK_PORT`: Port the application runs on (default: 5000)

## Usage

1. **Login**: Use your configured admin credentials
2. **Containers**: View all containers, see their status, and manage them
3. **Images**: Browse Docker images and their details
4. **System**: Monitor Docker system resources
5. **Alerts**: Configure and manage alerts for container events

## Technology Stack

- **Backend**: Python Flask
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Docker Integration**: Docker SDK for Python
- **Database**: SQLite (for alerts and configuration)
- **Deployment**: Docker & Docker Compose

## Project Structure

```
dockwatch/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── Dockerfile            # Docker image definition
├── docker-compose.yml    # Docker Compose configuration
├── .env.example          # Environment variables template
├── templates/            # HTML templates
│   ├── login.html
│   ├── base.html
│   ├── index.html
│   ├── images.html
│   ├── system.html
│   └── alerts.html
├── static/              # Static assets
│   ├── css/
│   └── js/
└── config/              # Configuration and database files
```


## License

See [LICENSE.md](LICENSE.md) for details.

## Author

**Ruturaj Sharbidre**

---

**Note**: Make sure Docker is running before starting the application. The app requires access to the Docker socket to monitor containers and images.