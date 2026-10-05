# Deploying to a VPS

Every push to the main branch (`claude/optimize-all-platform-i3j5id`) goes live: the GitHub Actions workflow
`.github/workflows/deploy.yml` builds the API, migrator and web images from the commit, pushes them to GitHub's
container registry (`ghcr.io/<owner>/optimizeall-{api,migrator,web}:<commit sha>`), then makes **one** SSH request to
the server, `deploy <commit sha>`. The server pulls those images, applies migrations, starts the new version and waits
until `/health/ready` answers. Each run is a GitHub deployment to the environment **production** (repository page →
**Deployments**, with a link to the site); a failed build, migration or start fails the run.

The deploy key can do nothing else. On the server it is tied to a forced command
(`deploy/server/deploy-optimizeall`) that accepts only `deploy <40-hex sha>`, refuses and logs anything else, and
never takes files, settings or compose definitions from GitHub. A leaked key could at most switch the site to another
published version. The repository can be public: forks and other branches get no secrets.

On the server the stack is `deploy/docker-compose.production.example.yml` (read-only containers, secrets as files,
migrations as a one-shot job, no demo data, real SMTP email), `deploy/docker-compose.mysql.yml` (MySQL 8 as a
container) and, on a shared server, `deploy/docker-compose.isolated.yml`. `scripts/deploy-server.sh` runs it.

## Server setup (once, as root)

A VPS with Ubuntu 22.04 or 24.04 and Docker (`curl -fsSL https://get.docker.com | sh`), 2 CPUs and 4 GB RAM.

1. **The deploy directory**, owned by root and private, with the files from this repository:

   ```bash
   install -d -m 700 /opt/optimizeall
   cp deploy/docker-compose.production.example.yml /opt/optimizeall/docker-compose.production.yml
   cp deploy/docker-compose.mysql.yml deploy/docker-compose.isolated.yml deploy/.env.production.example /opt/optimizeall/
   install -m 700 scripts/deploy-server.sh /opt/optimizeall/
   /opt/optimizeall/deploy-server.sh init https://app.example.com admin@example.com
   ```

   `init` generates every secret into `secrets/` (JWT key, hash salt, postback secret, MySQL passwords and connection
   string, the first administrator's password) and writes `.env.production`; it never overwrites existing files and
   never prints a secret. On a server that runs other applications too, also follow [Shared server](#shared-server).
   Changes to the compose files in this repository reach the server only when an admin copies them again.
2. **The forced command and the deploy user:**

   ```bash
   install -m 755 deploy/server/deploy-optimizeall /usr/local/sbin/deploy-optimizeall
   adduser --system --group --home /var/lib/deploy-optimizeall --shell /bin/sh --disabled-password deploy-optimizeall
   ssh-keygen -t ed25519 -N "" -C github-actions-deploy-optimizeall -f /root/deploy-keys/optimizeall
   install -d -m 755 /var/lib/deploy-optimizeall/.ssh
   printf 'restrict,command="sudo -n /usr/local/sbin/deploy-optimizeall \\"$SSH_ORIGINAL_COMMAND\\"" %s\n' \
     "$(cat /root/deploy-keys/optimizeall.pub)" > /var/lib/deploy-optimizeall/.ssh/authorized_keys
   echo 'deploy-optimizeall ALL=(root) NOPASSWD: /usr/local/sbin/deploy-optimizeall *' > /etc/sudoers.d/deploy-optimizeall
   chmod 440 /etc/sudoers.d/deploy-optimizeall && visudo -c
   ```

   The user has no password, and `authorized_keys` belongs to root. `restrict` removes the shell, terminal,
   forwarding and file copy, and sudo allows only the wrapper, which validates the request.
   The registry path in the wrapper (`ghcr.io/haris-workshop`) must match the repository's owner.
   Check it: `ssh -i /root/deploy-keys/optimizeall deploy-optimizeall@<server> id` must answer `refused`.
3. **DNS:** an `A` record for the domain pointing at the server.
4. **HTTPS:** a reverse proxy on the server forwards the domain to the web container on `127.0.0.1:WEB_PORT` and
   terminates TLS (nginx + certbot, or Caddy). See [Shared server](#shared-server) for an nginx site.
5. **Firewall:** only SSH, HTTP and HTTPS open (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).

## GitHub settings

Repository **Settings → Environments → production** (create it):

* **Deployment branches and tags → Selected branches:** add `claude/optimize-all-platform-i3j5id`. Only that branch
  can use the environment's secrets; optional **Required reviewers** make every deploy wait for an approval.
* **Environment secrets:** `DEPLOY_SSH_KEY` (contents of `/root/deploy-keys/optimizeall`, then delete that file from
  the server), `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan -t ed25519 <server>`; compare its fingerprint with
  `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server) and `DEPLOY_HOST` (the server's address).
* **Variable** `PUBLIC_BASE_URL`: the site's address, e.g. `https://app.example.com` (no trailing slash).

## After the first deploy

1. Sign in as the administrator with the password from `/opt/optimizeall/secrets/bootstrap_admin_password` and change
   the password.
2. **Email:** in `/opt/optimizeall/.env.production` set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME` and
   `EMAIL_FROM_ADDRESS`; put the SMTP password into `secrets/smtp_password`; redeploy. Until then the deploy log warns
   that SMTP is not configured and no email is delivered.
3. WhatsApp is set in `.env.production` (`WHATSAPP_*`) and `secrets/whatsapp_access_token`. Features the compose
   file only lists as comments (YouTube upload, external image hosts, Google sign-in) need those lines enabled in the
   compose file, committed and copied to the server. See
   [DEPLOYMENT.md § 5.4](DEPLOYMENT.md#54-secrets-and-configuration).

To use a managed MySQL instead of the container: set `LOCAL_MYSQL=false` (not possible with `ISOLATED=true`) and write
the connection string to `secrets/db_connection_string` (format in `deploy/.env.production.example`).

## Shared server

On a server that also runs other applications, set `ISOLATED=true` (with `LOCAL_MYSQL=true`) in `.env.production`.
`deploy/docker-compose.isolated.yml` then puts the stack on its own networks with fixed ranges (`EDGE_SUBNET`
172.30.10.0/24 for web ↔ API, `DATA_SUBNET` 172.30.11.0/24 for API ↔ MySQL; pick free ranges if these are taken).
The data network is internal, so MySQL has no route to the internet or the host. Services the host runs on 127.0.0.1
are not reachable from the containers. Every container has memory, CPU and process limits. The stack's only port is
`127.0.0.1:WEB_PORT`; choose one that is free (`ss -ltn`). Set `TRUSTED_PROXY_NETWORK` and `REAL_IP_FROM` to
`EDGE_SUBNET`.

The host's existing web server keeps ports 80/443 and gets one extra site that matches only this domain, e.g. for
nginx `/etc/nginx/sites-available/optimizeall`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;
    client_max_body_size 60m;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    location / { proxy_pass http://127.0.0.1:8300; }
}
```

Enable it, then `nginx -t && systemctl reload nginx` (a reload keeps the other sites serving), and add HTTPS with
`certbot --nginx -d app.example.com` once DNS points at the server. Never mark it `default_server`.

Images can also be built on the server instead of pulled (`./deploy-server.sh deploy <tag> local` uses
`optimizeall-{api,migrator,web}:<tag>` already on the server). Build them in a builder with a memory cap so the build
cannot push the other applications out of memory:

```bash
docker buildx create --name optimizeall-builder --driver docker-container \
  --driver-opt memory=2560m,cpu-quota=200000,cpu-period=100000
TAG=$(git rev-parse HEAD)
docker buildx build --builder optimizeall-builder --load --target runtime  -t optimizeall-api:$TAG backend
docker buildx build --builder optimizeall-builder --load --target migrator -t optimizeall-migrator:$TAG backend
docker buildx build --builder optimizeall-builder --load -t optimizeall-web:$TAG frontend
docker buildx stop optimizeall-builder
```

## Day to day

* **Deploy:** push to the main branch. Pushes made by Claude deploy the same way. Deploys run one at a time.
* **Redeploy** the current version: **Actions → Deploy → Run workflow** (empty tag).
* **Roll back:** **Run workflow** with **tag** = the full commit sha of an earlier successful deploy (its run shows
  it; so does `/opt/optimizeall/release.previous.env`). Nothing is rebuilt. Migrations only go forward: rolling back
  across a schema change needs [DEPLOYMENT.md § 5.8](DEPLOYMENT.md#58-rollback).
* **Logs and status** (root, in `/opt/optimizeall`): `./deploy-server.sh compose ps`,
  `./deploy-server.sh compose logs -f api`; deploy requests: `journalctl -t deploy-optimizeall`.
* **Backups** (not automatic): the database and the uploads volume, e.g. a nightly root cron job:

  ```bash
  cd /opt/optimizeall && mkdir -p backups && ./deploy-server.sh compose exec -T mysql sh -c \
    'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysqldump -u root --single-transaction --routines optimizeall' \
    | gzip > "backups/optimizeall-$(date +%F).sql.gz"
  ```

  plus a copy of the `optimizeall_api-storage` volume and of `secrets/`, kept off the server. See
  [OPERATIONS.md](OPERATIONS.md).
