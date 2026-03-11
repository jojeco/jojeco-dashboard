# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by:

1. **DO NOT** open a public GitHub issue
2. Email the maintainer directly (if contact provided) or
3. Open a private security advisory on GitHub

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

## Security Best Practices

### Before Publishing to GitHub

✅ **Completed Steps:**
- `.env` file is gitignored
- `.env.example` template created with placeholder values
- No hardcoded secrets in source code
- Database files are gitignored
- Build artifacts are gitignored
- Sensitive logs are gitignored

⚠️ **CRITICAL - Before First Commit:**

1. **Verify .env is not committed:**
   ```bash
   git status
   # Make sure .env is NOT in the untracked files list
   ```

2. **Remove any existing .env from git if accidentally committed:**
   ```bash
   git rm --cached .env
   git commit -m "Remove .env from git"
   ```

3. **Rotate ALL secrets** if they were ever committed to git:
   - Generate a new `JWT_SECRET` (existing sessions will be invalidated)
   - Update all environment variables in your `.env` and deployment config

### Production Deployment Security

#### 1. Environment Variables
- **NEVER** use the default JWT_SECRET
- Generate cryptographically secure secrets:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Use Docker secrets or a secret management service
- Rotate secrets regularly (every 90 days minimum)

#### 2. Authentication Security
- JWT tokens are signed with `JWT_SECRET` and stored in `localStorage` (`auth_token` key)
- Passwords are hashed with bcrypt (10 rounds) — plaintext never stored or logged
- All protected API routes validate the JWT via `authMiddleware` before processing
- Netdata metrics are proxied through authenticated Express endpoints — port 19999 should never be publicly exposed
- Consider shortening the JWT expiry (currently 7 days) for higher-security deployments

#### 3. Network Security
- **Always use HTTPS** in production
- Deploy behind a reverse proxy (nginx, Cloudflare)
- Use firewall rules to restrict access:
  - Port 3001 (API): Internal only or firewall protected
  - Port 3005 (Dashboard): Behind reverse proxy with SSL
  - Port 19999 (Netdata): Internal only or VPN access
- Enable CORS only for your domain
- Use rate limiting on API endpoints

#### 4. Database Security
- Regular backups of SQLite database in `server/data/`
- Encrypt database at rest if storing sensitive data
- Implement database access logging
- Consider upgrading to PostgreSQL for production

#### 5. Docker Security
- Run containers as non-root user
- Use specific image versions (not `latest`)
- Scan images for vulnerabilities:
  ```bash
  docker scan jojeco-dashboard-jojeco-dashboard
  ```
- Limit container resources (CPU, memory)
- Enable Docker Content Trust

### Known Limitations

1. **SQLite in Production**: SQLite is suitable for small deployments, but consider PostgreSQL for:
   - Multiple concurrent users
   - High traffic
   - Need for advanced features

2. **No Rate Limiting**: Add rate limiting middleware for production:
   ```bash
   npm install express-rate-limit
   ```

3. **No HTTPS by Default**: Always deploy behind a reverse proxy with SSL

4. **CORS Wide Open**: Configure CORS to only allow your domain

### Recommended Security Headers

Add these headers to your nginx/reverse proxy configuration:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

### Security Checklist for Production

- [ ] All secrets in environment variables (not hardcoded)
- [ ] JWT_SECRET is a strong random string (32+ characters)
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Port 19999 (Netdata) blocked from public internet — access via API proxy only
- [ ] Firewall rules in place
- [ ] Regular backups configured
- [ ] Monitoring and logging enabled
- [ ] Rate limiting implemented
- [ ] CORS restricted to your domain
- [ ] Security headers configured
- [ ] Docker images scanned for vulnerabilities
- [ ] Strong password policy enforced
- [ ] Regular security updates applied

### Dependencies

Keep dependencies up to date to avoid known vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

### File Permissions

Ensure proper file permissions in production:

```bash
# Server files
chmod 600 .env
chmod 700 server/data/

# SSL certificates (if using)
chmod 600 /path/to/ssl/privkey.pem
```

## License

This security policy is part of the JojeCo Dashboard project and is subject to the same MIT license.
