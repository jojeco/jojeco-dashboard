# JojeCo Dashboard

A production-ready, self-hosted services dashboard with authentication, health monitoring, and system metrics. Built with React, TypeScript, and Docker. No external cloud dependencies.

## Features

- **Authentication**: JWT-based auth via self-hosted Express API (register/login)
- **Service Management**: Add, edit, and monitor your self-hosted services
- **Health Monitoring**: Real-time health checks for all services
- **System Metrics**: Live CPU, memory, disk, and network stats via Netdata
- **Dark Mode**: Beautiful dark/light theme support
- **Docker Ready**: Fully containerized with docker-compose
- **Responsive**: Mobile-friendly interface

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/jojeco-dashboard.git
   cd jojeco-dashboard
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set a secure `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Build and start the containers**
   ```bash
   docker-compose up -d --build
   ```

4. **Access the dashboard**
   - Local: http://localhost:3005
   - LAN: http://YOUR-SERVER-IP:3005
   - Netdata: http://localhost:19999

   Register your first account at the login page — the first user created becomes the admin.

## Configuration

### Environment Variables

| Variable | Where used | Description |
|----------|-----------|-------------|
| `VITE_API_URL` | Frontend build | URL the browser uses to reach the API |
| `JWT_SECRET` | API runtime | Secret for signing JWT tokens — keep this private |
| `NETDATA_URL` | API runtime | Internal URL to reach Netdata (default: `http://netdata:19999`) |

### Service URLs

Services are managed through the dashboard UI. Each service has:
- **Public URL** — accessible from the internet
- **LAN URL** — local network access
- **Health URL** — endpoint polled for up/down status

## Development

### Local Development

Run the API and frontend in separate terminals:

```bash
# Terminal 1 — API server
cd server
npm install
JWT_SECRET=dev-secret node --watch server.js

# Terminal 2 — Vite dev server
npm install
npm run dev
```

The frontend defaults to `http://localhost:3001/api` — set `VITE_API_URL` in `.env` to override.

> **Note:** System metrics require Netdata running at `NETDATA_URL`. Without it, the System Monitor shows a "Netdata unavailable" error — everything else works normally.

### Docker Commands

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop containers
docker-compose down

# Restart a specific service
docker-compose restart jojeco-dashboard
```

## Security Best Practices

### Environment Variables

- **NEVER commit `.env` to Git** — it contains your JWT secret
- Use `.env.example` as a template
- Rotate `JWT_SECRET` regularly in production
- Use a randomly generated string of at least 32 characters

### Production Deployment

1. **Use HTTPS**: Deploy behind a reverse proxy with SSL (nginx, Cloudflare Tunnel, etc.)
2. **Firewall**: Restrict ports 3001, 3005, and 19999 from the public internet
3. **JWT Secret**: Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. **Database backup**: SQLite lives at `server/data/dashboard.db` — back it up regularly

### Recommended Setup

```
Internet → Cloudflare Tunnel → nginx → Docker (port 3005)
                                          ├── jojeco-dashboard (nginx)
                                          ├── jojeco-dashboard-api (express)
                                          └── netdata
```

## Project Structure

```
jojeco-dashboard/
├── src/                      # Frontend React application
│   ├── Pages/               # Page components
│   ├── components/          # Reusable components
│   ├── contexts/            # React contexts (Auth)
│   ├── config/              # Configuration files
│   └── services/            # API services
├── server/                   # Backend API
│   ├── server.js            # Express server
│   ├── auth.js              # JWT + bcrypt auth helpers
│   ├── database.js          # sql.js SQLite wrapper
│   └── data/                # SQLite database files (gitignored)
├── docker-compose.yml       # Docker composition
├── Dockerfile               # Frontend Dockerfile
├── .env.example             # Environment template
└── .gitignore               # Git ignore rules
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Services
- `GET /api/services` - List all services
- `POST /api/services` - Create service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service
- `GET /api/services/export` - Export services as JSON
- `POST /api/services/import` - Import services from JSON

### System Monitoring
- `GET /api/system/metrics` - Live CPU, memory, disk, network (proxied from Netdata)
- `GET /api/system/history` - CPU history for sparkline graph

### Service Metrics
- `POST /api/metrics` - Save service response time
- `GET /api/metrics/:serviceId` - Get service metrics
- `POST /api/health-checks` - Save health check result
- `GET /api/health-checks/:serviceId` - Get health check history

## Troubleshooting

### Port Conflicts

If ports 3005, 3001, or 19999 are already in use, edit `docker-compose.yml`:

```yaml
ports:
  - "YOUR_PORT:80"  # Change YOUR_PORT to an available port
```

### Build Errors

If you encounter TypeScript errors during build:

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Database Issues

If the database gets corrupted:

```bash
# Remove the database (you'll lose data!)
rm -rf server/data/*.db

# Restart containers to recreate
docker-compose down && docker-compose up -d
```

### System Monitor Shows "Unavailable"

Netdata isn't reachable from the API container. Check:
- Netdata container is running: `docker-compose ps`
- All containers are on the same network: `docker network inspect jojeco-network`
- `NETDATA_URL` in the API's environment matches the Netdata container name

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Support

For issues and questions, please open an issue on GitHub.

## Acknowledgments

- Built with [React](https://react.dev/)
- Icons by [Lucide](https://lucide.dev/)
- System monitoring by [Netdata](https://www.netdata.cloud/)
- Storage by [sql.js](https://sql.js.org/) (SQLite in Node.js)
