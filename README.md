# JojeCo Dashboard

A production-ready, self-hosted services dashboard with authentication, health monitoring, and system metrics. Built with React, TypeScript, and Docker.

## Features

- **Authentication**: Firebase Authentication integration with JWT backend
- **Service Management**: Add, edit, and monitor your self-hosted services
- **Health Monitoring**: Real-time health checks for all services
- **System Metrics**: Live system monitoring via Netdata integration
- **Dark Mode**: Beautiful dark/light theme support
- **Docker Ready**: Fully containerized with docker-compose
- **Responsive**: Mobile-friendly interface

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- A Firebase project (for authentication)

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

   Edit `.env` and fill in your Firebase credentials and generate a secure JWT secret:
   ```bash
   # Generate a secure JWT secret (Linux/Mac)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Or on Windows PowerShell
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

## Configuration

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Email/Password authentication in the Authentication section
3. Copy your Firebase configuration from Project Settings
4. Update the `.env` file with your Firebase credentials

### Service URLs

Edit the `SERVICES` array in [src/Pages/Dashboard.tsx](src/Pages/Dashboard.tsx) to add your own services:

```typescript
const SERVICES: Service[] = [
  {
    name: "Your Service",
    icon: "Server",
    description: "Description of your service",
    publicUrl: "https://your-service.com",
    lanUrl: "http://192.168.1.100:8080",
    healthUrl: "https://your-service.com/health",
    tags: ["category"],
    pinned: true,
  },
  // Add more services...
];
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

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

- **NEVER commit `.env` files to Git** - They contain sensitive credentials
- Always use `.env.example` as a template
- Rotate your JWT secret regularly in production
- Use strong, randomly generated secrets (minimum 32 characters)

### Firebase Security

- Enable Firebase Security Rules for your Firestore database
- The Firebase API key in the frontend is safe to expose (it's not a secret)
- However, secure your Firebase project with proper authentication rules

### Production Deployment

1. **Use HTTPS**: Always deploy behind a reverse proxy with SSL (nginx, Cloudflare Tunnel, etc.)
2. **Environment Variables**: Use Docker secrets or a secure vault for production secrets
3. **Firewall**: Restrict access to ports 3001, 3005, and 19999 from public internet
4. **JWT Secret**: Generate a cryptographically secure random string for `JWT_SECRET`
5. **Database**: The SQLite database in `server/data/` is gitignored - back it up regularly

### Recommended Setup

```
Internet → Cloudflare Tunnel/nginx → Docker Container → Dashboard
                                   ↓
                                  SSL/TLS
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
│   ├── auth.js              # Authentication logic
│   ├── database.js          # SQLite database
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
- `GET /api/services/export` - Export services
- `POST /api/services/import` - Import services

### Monitoring
- `POST /api/metrics` - Save service metrics
- `GET /api/metrics/:serviceId` - Get service metrics
- `POST /api/health-checks` - Save health check
- `GET /api/health-checks/:serviceId` - Get health checks

## Troubleshooting

### Port Conflicts

If ports 3005, 3001, or 19999 are already in use, modify `docker-compose.yml`:

```yaml
ports:
  - "YOUR_PORT:80"  # Change YOUR_PORT to an available port
```

### Build Errors

If you encounter TypeScript errors during build:

```bash
# Clear node_modules and rebuild
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
docker-compose down
docker-compose up -d
```

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
- Authentication by [Firebase](https://firebase.google.com/)
