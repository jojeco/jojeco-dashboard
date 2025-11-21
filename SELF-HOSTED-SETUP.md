# Self-Hosted JojeCo Dashboard

Your dashboard now runs completely on your own server with NO external dependencies!

## What Changed?

✅ **Replaced Firebase** with your own Node.js API server
✅ **SQLite Database** - All data stored locally
✅ **No External Services** - Everything runs on your infrastructure
✅ **Docker Ready** - Easy deployment with docker-compose

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Web Browser   │────▶│  Nginx (Port 80) │────▶│ React App   │
│  (Dashboard UI) │     │  Docker Container│     │  (Frontend) │
└─────────────────┘     └──────────────────┘     └─────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │  Node.js API     │
                        │  (Port 3001)     │
                        │  Docker Container│
                        └──────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │  SQLite Database │
                        │  (Local File)    │
                        └──────────────────┘
```

## Quick Start

### 1. Development Mode

```bash
# Terminal 1 - Start API Server
cd server
npm install
npm start

# Terminal 2 - Start Frontend
npm install
npm run dev
```

Access at: http://localhost:3005

### 2. Production Deploy (Docker)

```bash
# Build and deploy everything
deploy.bat

# Or manually:
docker-compose up -d
```

Access at: http://192.168.50.201:3005

## Features

### ✅ Service Management
- Add/Edit/Delete services through UI
- Custom icons and colors
- Tags and categories
- Pin important services

### ✅ Health Monitoring
- Real-time service status checks
- Configurable check intervals
- Response time tracking
- Health history

### ✅ Performance Metrics
- Response time graphs
- Uptime percentage
- Performance trends
- Historical data (1h, 6h, 24h, 7d)

### ✅ System Monitor
- CPU, Memory, Disk usage
- Network activity
- Real-time updates

### ✅ Import/Export
- Backup service configurations
- Restore from JSON
- Migrate between instances

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Services
- `GET /api/services` - List all services
- `POST /api/services` - Create service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service

### Metrics
- `POST /api/metrics` - Save metrics
- `GET /api/metrics/:serviceId` - Get metrics

### Health Checks
- `POST /api/health-checks` - Save health check
- `GET /api/health-checks/:serviceId` - Get history

### Import/Export
- `GET /api/services/export` - Export all services
- `POST /api/services/import` - Import services

## Configuration

### Environment Variables

Edit `.env`:

```env
# API Configuration
VITE_API_URL=http://192.168.50.201:3001/api
JWT_SECRET=your-secure-random-string-here

# Firebase (still used for authentication UI)
VITE_FIREBASE_API_KEY=your-key
VITE_FIREBASE_AUTH_DOMAIN=your-domain
# ... rest of Firebase config
```

### Security

**IMPORTANT**: Change these before deploying:

1. **JWT_SECRET**: Generate a secure random string
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Database Location**: Data stored in `server/data/dashboard.db`
   - Automatically backed up with your server
   - Consider regular backups of this file

## Database

### SQLite Database Schema

**Users Table**
- id, email, password_hash, display_name, timestamps

**Services Table**
- id, user_id, name, description, url, lan_url
- icon, color, tags, is_pinned
- health_check_url, health_check_interval
- timestamps

**Health Checks Table**
- service_id, status, response_time, status_code, timestamp, error

**Service Metrics Table**
- service_id, timestamp, response_time, status_code, is_online

### Manual Database Access

```bash
# Install SQLite CLI
npm install -g sql.js-cli

# Query database
sqlite3 server/data/dashboard.db "SELECT * FROM services;"
```

## Troubleshooting

### API Server Won't Start

```bash
cd server
npm install
npm start
```

Check logs for errors.

### Frontend Can't Connect to API

1. Check `VITE_API_URL` in `.env`
2. Ensure API server is running on port 3001
3. Check firewall rules

### Docker Issues

```bash
# Rebuild everything
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# View logs
docker-compose logs -f
```

### Database Issues

```bash
# Backup database
cp server/data/dashboard.db server/data/dashboard.db.backup

# Reset database (WARNING: deletes all data)
rm server/data/dashboard.db
# Restart server to create fresh database
```

## Backup & Restore

### Backup

```bash
# Method 1: Export from UI
# Click Download icon → Export Services → Save JSON

# Method 2: Copy database file
cp server/data/dashboard.db backup/dashboard-$(date +%Y%m%d).db
```

### Restore

```bash
# Method 1: Import to UI
# Click Download icon → Import Services → Upload JSON

# Method 2: Replace database file
cp backup/dashboard-20250110.db server/data/dashboard.db
docker-compose restart jojeco-dashboard-api
```

## Upgrading

```bash
git pull
npm install
cd server && npm install
docker-compose down
docker-compose up -d --build
```

## Performance Tips

1. **Database Optimization**: SQLite auto-saves every 5 seconds
2. **Health Checks**: Adjust intervals based on your needs
3. **Metrics Retention**: Old metrics are kept indefinitely (add cleanup if needed)

## Migration from Firebase

Your data is already migrated! The new system:
- ✅ Uses Firebase Auth (UI only)
- ✅ Stores services in your SQLite database
- ✅ All metrics saved locally
- ✅ No external API calls except authentication

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Verify `.env` configuration
3. Ensure ports 3001 and 3005 are available

## License

MIT
