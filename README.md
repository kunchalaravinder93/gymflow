# GymFlow — Multi-Tenant SaaS Gym Management Platform

GymFlow is a full-stack SaaS application that lets gym owners manage their members, plans, subscriptions, check-ins, payments, staff, and notifications — all from a single dashboard. As the platform owner, you also get a private Owner Portal to track every registered gym, their member counts, and their subscription status with you.

---

## Table of Contents

1. [How GymFlow Works as a SaaS](#how-gymflow-works-as-a-saas)
2. [Multi-Tenancy: How Each Gym's Data is Separated](#multi-tenancy-how-each-gyms-data-is-separated)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Database Schema](#database-schema)
6. [Environment Variables](#environment-variables)
7. [Local Development Setup](#local-development-setup)
8. [All Commands Reference](#all-commands-reference)
9. [API Routes](#api-routes)
10. [SaaS Owner Portal](#saas-owner-portal)
11. [Deployment](#deployment)
12. [Demo Credentials](#demo-credentials)

---

## How GymFlow Works as a SaaS

GymFlow is sold as a **Software-as-a-Service** (SaaS) product. Here is the lifecycle from your perspective as the owner and from each gym owner's perspective:

### For You (Platform Owner)
1. You deploy one instance of GymFlow on a server/cloud.
2. Any gym in the world can visit your URL and click **"Register your gym"**.
3. Each gym gets their own isolated account — their data never mixes with other gyms.
4. You earn a recurring subscription fee from each gym (tracked in the Owner Portal).
5. You manage all gyms from `/superadmin` using your secret key — see member counts, subscription status, total revenue, and can disable non-paying gyms.

### For Each Gym Owner
1. A gym owner registers at `/register` — fills in their gym name, owner name, email, and password.
2. They are immediately logged in and see **their gym name** in the dashboard header and sidebar.
3. They manage their own members, plans, payments, check-ins, and staff — completely isolated from all other gyms.
4. Staff members they add only see data for that same gym.

### Subscription Flow (Platform-level)
- Every new gym starts on a **Trial** plan automatically.
- You log in to the Owner Portal (`/superadmin`) and update a gym to `Starter`, `Growth`, or `Pro` once they pay.
- You can record the amount they paid, the renewal date, and any notes.
- You can disable a gym that hasn't renewed (they will still exist in the DB but you can mark them inactive).

---

## Multi-Tenancy: How Each Gym's Data is Separated

GymFlow uses a **shared database, gym-scoped isolation** model. This is the most common and cost-effective approach for SaaS apps at this scale.

### The Key Mechanism

Every table that contains business data has a `gym_id` column that is a foreign key to the `gyms` table:

```
gyms
 └── users          (gym_id → gyms.id)
 └── members        (gym_id → gyms.id)
 └── membership_plans (gym_id → gyms.id)
 └── notifications  (gym_id → gyms.id)
```

### How Queries are Scoped

When a gym owner or staff member logs in, they receive a **JWT (JSON Web Token)** that encodes their `gymId`. Every authenticated API request:

1. The middleware (`requireAuth`) extracts the `gymId` from the JWT and attaches it to `req.user`.
2. Every database query filters by `WHERE gym_id = req.user.gymId`.

Example from the members endpoint:
```typescript
// Only returns members that belong to THIS gym
const members = await db
  .select()
  .from(membersTable)
  .where(eq(membersTable.gymId, req.user.gymId));
```

### Why Gyms Can Never See Each Other's Data

- **JWT is signed** — a gym cannot forge a token with a different `gymId`.
- **Every query is filtered** — even if someone obtained a valid token, they would only ever see rows matching their own `gymId`.
- **Foreign keys enforce integrity** — plans, payments, subscriptions, and notifications all trace back through `members.gym_id`, ensuring data consistency.
- **Staff are gym-scoped** — when you add a staff member, they are tied to your `gym_id` and can only see your gym's data.

### Concrete Example

| Gym | gym_id | Their members | Their plans | Their payments |
|-----|--------|---------------|-------------|----------------|
| PowerFit Gym | 1 | Rows where `gym_id = 1` | Plans where `gym_id = 1` | Via members where `gym_id = 1` |
| Iron House | 2 | Rows where `gym_id = 2` | Plans where `gym_id = 2` | Via members where `gym_id = 2` |

A user logged into gym 1 **cannot** access any row with `gym_id = 2`, even if they know the member's ID, because the API always appends `AND gym_id = <their_gym_id>` to every query.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite, TanStack React Query v5, Wouter (routing), Tailwind CSS v4, shadcn/ui (Radix UI) |
| **Backend** | Node.js, Express v5, TypeScript |
| **Database** | PostgreSQL (via Drizzle ORM) |
| **Auth** | JWT (jsonwebtoken), bcryptjs for password hashing |
| **Validation** | Zod (shared between frontend & backend) |
| **API Contract** | OpenAPI 3.0 spec → auto-generates React Query hooks + Zod schemas via Orval |
| **Logging** | Pino (structured JSON logging), pino-http |
| **Background Jobs** | node-cron (membership expiry alerts, auto-expired status updates) |
| **Package Manager** | pnpm workspaces (monorepo) |
| **Charting** | Recharts |
| **Icons** | Lucide React |

---

## Project Structure

```
gymflow/
├── artifacts/
│   ├── api-server/          # Express backend
│   │   └── src/
│   │       ├── app.ts           # Express app setup (CORS, body parser, routes)
│   │       ├── server.ts        # HTTP server entry point
│   │       ├── routes/          # All API route handlers
│   │       │   ├── auth.ts          # Register, login, /me
│   │       │   ├── members.ts       # Member CRUD + renew + check-in
│   │       │   ├── plans.ts         # Membership plan CRUD
│   │       │   ├── payments.ts      # Payment records
│   │       │   ├── subscriptions.ts # Subscription management
│   │       │   ├── checkins.ts      # Check-in terminal
│   │       │   ├── notifications.ts # Expiry notifications
│   │       │   ├── staff.ts         # Staff management
│   │       │   ├── dashboard.ts     # Stats, revenue, expiry widgets
│   │       │   └── superadmin.ts    # SaaS owner portal (secret-key protected)
│   │       ├── middlewares/
│   │       │   └── auth.ts          # JWT requireAuth, requireAdmin
│   │       └── lib/
│   │           └── logger.ts        # Pino logger singleton
│   │
│   └── gymflow/             # React + Vite frontend
│       └── src/
│           ├── pages/           # One file per page/route
│           ├── components/      # Reusable UI components
│           ├── hooks/           # use-auth, use-mobile, use-toast
│           └── App.tsx          # Router setup
│
├── lib/
│   ├── api-spec/            # OpenAPI YAML spec (source of truth)
│   ├── api-client-react/    # Auto-generated React Query hooks + fetch client
│   ├── api-zod/             # Auto-generated Zod validation schemas
│   └── db/                  # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── gyms.ts
│           ├── users.ts
│           ├── members.ts
│           ├── membership_plans.ts
│           ├── subscriptions.ts
│           ├── payments.ts
│           ├── checkins.ts
│           ├── notifications.ts
│           └── saas_subscriptions.ts  # Platform-level gym billing
│
└── scripts/                 # Utility scripts (seed data, migrations)
```

---

## Database Schema

### `gyms` — One row per registered gym (tenant)
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | Auto-increment gym ID |
| `name` | text NOT NULL | Gym business name |
| `email` | text | Owner email |
| `phone` | text | Contact phone |
| `address` | text | Physical address |
| `grace_period_days` | integer | Days after expiry before denying check-in |
| `is_active` | boolean | Whether the gym is enabled on the platform |
| `created_at` | timestamptz | Registration timestamp |

### `users` — Gym staff and admins
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `gym_id` | integer FK → gyms | Which gym this user belongs to |
| `name` | text | Full name |
| `email` | text UNIQUE | Login email |
| `password_hash` | text | bcrypt hash of password |
| `role` | enum(admin, staff) | Access level |
| `phone` | text | Optional |
| `is_active` | boolean | Whether account is enabled |

### `members` — Gym customers/members
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `gym_id` | integer FK → gyms | Tenant isolation column |
| `plan_id` | integer FK → membership_plans | Current plan |
| `name` | text | Member's name |
| `email` | text | Contact email |
| `phone` | text | Contact phone |
| `profile_photo` | text | Base64 encoded photo |
| `membership_status` | enum(active, expired, pending) | Current status |
| `start_date` | text | YYYY-MM-DD |
| `end_date` | text | YYYY-MM-DD — used for expiry checks |

### `membership_plans` — Plans each gym offers
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `gym_id` | integer FK → gyms | Tenant isolation column |
| `name` | text | e.g. "Monthly Basic", "Annual Pro" |
| `price` | numeric(10,2) | Price in local currency |
| `duration_days` | integer | How many days the plan is valid |
| `description` | text | Optional description |
| `benefits` | text | Optional benefit list |
| `is_active` | boolean | Whether the plan is selectable |

### `subscriptions` — Member plan enrollment history
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `member_id` | integer FK → members | |
| `plan_id` | integer FK → membership_plans | |
| `start_date` | text | YYYY-MM-DD |
| `end_date` | text | YYYY-MM-DD |
| `status` | enum(active, expired, pending) | |
| `grace_period_days` | integer | Extra days allowed after expiry |

### `payments` — Payment records for member subscriptions
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `member_id` | integer FK → members | |
| `subscription_id` | integer FK → subscriptions | Optional link |
| `amount` | numeric(10,2) | Amount paid |
| `method` | enum(cash, card, upi, bank_transfer, other) | How they paid |
| `paid_at` | text | YYYY-MM-DD |
| `notes` | text | Optional (e.g. "Renewal — Monthly Basic") |

### `checkins` — Member gym entry log
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `member_id` | integer FK → members | |
| `checked_in_at` | timestamptz | Exact time |
| `status` | enum(allowed, denied) | Was entry permitted |
| `denied_reason` | text | Why denied (e.g. "Membership expired") |

### `notifications` — System alerts per gym
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `gym_id` | integer FK → gyms | Tenant isolation column |
| `member_id` | integer FK → members | Optional — which member |
| `type` | enum | expiry_7days, expiry_3days, expired, payment_received, checkin, info |
| `title` | text | Short title |
| `message` | text | Full message |
| `is_read` | boolean | Read status |

### `saas_subscriptions` — Your billing record for each gym (platform level)
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial PK | |
| `gym_id` | integer FK → gyms | Which gym |
| `plan` | enum(trial, starter, growth, pro) | Your pricing tier |
| `status` | enum(active, expired, cancelled, trial) | Payment status |
| `amount` | numeric(10,2) | What they paid you |
| `start_date` | text | YYYY-MM-DD |
| `end_date` | text | Renewal/expiry date |
| `notes` | text | Any notes (payment method, contact, etc.) |

### Database Commands

```bash
# Connect to the database
psql "$DATABASE_URL"

# List all tables
\dt

# Check all registered gyms
SELECT id, name, email, is_active, created_at FROM gyms ORDER BY created_at DESC;

# Check all platform subscriptions (your billing records)
SELECT g.name, ss.plan, ss.status, ss.amount, ss.end_date
FROM saas_subscriptions ss
JOIN gyms g ON g.id = ss.gym_id
ORDER BY ss.created_at DESC;

# Count members per gym
SELECT g.name, COUNT(m.id) as total_members,
  SUM(CASE WHEN m.membership_status = 'active' THEN 1 ELSE 0 END) as active
FROM gyms g
LEFT JOIN members m ON m.gym_id = g.id
GROUP BY g.id, g.name;

# Count total platform revenue (what gyms paid YOU)
SELECT SUM(amount) as total_revenue FROM saas_subscriptions WHERE status = 'active';

# See revenue per gym (what gym members paid the GYM, not you)
SELECT g.name, SUM(p.amount) as gym_revenue
FROM payments p
JOIN members m ON m.id = p.member_id
JOIN gyms g ON g.id = m.gym_id
GROUP BY g.id, g.name;

# Manually create the saas_subscriptions table (if not exists)
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id SERIAL PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','growth','pro')),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active','expired','cancelled','trial')),
  amount NUMERIC(10,2),
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

# Seed trial subscriptions for all existing gyms
INSERT INTO saas_subscriptions (gym_id, plan, status, start_date, notes)
SELECT id, 'trial', 'trial', CURRENT_DATE::text, 'Auto-seeded'
FROM gyms
WHERE id NOT IN (SELECT gym_id FROM saas_subscriptions);
```

---

## Environment Variables

Create a `.env` file (or set these as secrets in your hosting environment):

```env
# REQUIRED — PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:5432/gymflow

# REQUIRED — Secret for signing JWT tokens (use a long random string)
SESSION_SECRET=your-super-secret-jwt-key-minimum-32-chars

# REQUIRED — Secret for the SaaS Owner Portal (/superadmin)
# Change this before deploying — anyone with this key has full platform access
SUPERADMIN_SECRET=your-owner-portal-secret-key

# OPTIONAL — Port for the API server (default: 5000)
PORT=5000

# OPTIONAL — Node environment
NODE_ENV=production

# OPTIONAL — Pino log level (trace/debug/info/warn/error)
LOG_LEVEL=info
```

> **Security note:** Never commit `.env` to version control. Use secrets management in production (AWS Secrets Manager, Replit Secrets, Railway Variables, etc.).

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- PostgreSQL 15+ (local or cloud)

### Step-by-step

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd gymflow

# 2. Install all dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, SESSION_SECRET, SUPERADMIN_SECRET

# 4. Create the database tables
# Run the SQL from the "Database Commands" section above, or use Drizzle push:
pnpm --filter @workspace/db run push

# 5. (Optional) Seed demo data
# The app registers gyms via /register — no separate seed script needed.

# 6. Start the API server
pnpm --filter @workspace/api-server run dev

# 7. Start the frontend (in a separate terminal)
pnpm --filter @workspace/gymflow run dev
```

The app will be available at `http://localhost:<PORT>`.

---

## All Commands Reference

### Development

```bash
# Install all workspace dependencies
pnpm install

# Start API server in watch mode (auto-restarts on changes)
pnpm --filter @workspace/api-server run dev

# Start frontend Vite dev server
pnpm --filter @workspace/gymflow run dev

# Run both simultaneously (if a root dev script is configured)
pnpm run dev
```

### Building for Production

```bash
# Build API server (TypeScript → JavaScript)
pnpm --filter @workspace/api-server run build

# Build frontend (Vite → static files in dist/)
pnpm --filter @workspace/gymflow run build

# Start API server in production mode (after build)
pnpm --filter @workspace/api-server run start
```

### Type Checking

```bash
# Type-check all packages
pnpm run typecheck

# Type-check only shared libraries
pnpm run typecheck:libs

# Type-check a specific package
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/gymflow run typecheck
```

### API Code Generation

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the single source of truth. After modifying it, regenerate hooks and schemas:

```bash
# Regenerate React Query hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

This generates:
- `lib/api-client-react/src/generated/api.ts` — React Query hooks
- `lib/api-client-react/src/generated/api.schemas.ts` — TypeScript types
- `lib/api-zod/src/generated/api.ts` — Zod validators

### Database

```bash
# Push Drizzle schema to DB (development only — no migration files)
pnpm --filter @workspace/db run push

# Generate migration SQL files
pnpm --filter @workspace/db run generate

# Apply pending migrations
pnpm --filter @workspace/db run migrate

# Open Drizzle Studio (visual DB browser)
pnpm --filter @workspace/db run studio
```

---

## API Routes

All routes are prefixed with `/api`.

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register a new gym + admin user |
| POST | `/auth/login` | — | Log in, receive JWT |
| GET | `/auth/me` | JWT | Get current user + gym info |

### Dashboard (per-gym)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard/stats` | JWT | Total/active/expired members, revenue, check-ins |
| GET | `/dashboard/upcoming-expiries` | JWT | Members expiring in next 7 days |
| GET | `/dashboard/recent-checkins` | JWT | Last 20 check-ins |
| GET | `/dashboard/revenue` | JWT | Last 6 months revenue chart data |

### Members
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/members` | JWT | List all members (with plan name) |
| POST | `/members` | JWT | Add a new member |
| GET | `/members/export` | JWT | Export members as CSV |
| GET | `/members/:id` | JWT | Get single member |
| PATCH | `/members/:id` | JWT | Update member details |
| DELETE | `/members/:id` | JWT | Delete member |
| POST | `/members/:id/renew` | JWT | Renew membership (creates subscription + payment) |
| POST | `/members/:id/checkin` | JWT | Record a check-in for member |

### Plans
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/plans` | JWT | List active plans |
| POST | `/plans` | JWT (admin) | Create a plan |
| GET | `/plans/:id` | JWT | Get plan details |
| PATCH | `/plans/:id` | JWT (admin) | Update plan |
| DELETE | `/plans/:id` | JWT (admin) | Delete plan |

### Payments
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/payments` | JWT | List all payments with member names |
| POST | `/payments` | JWT | Record a payment |
| GET | `/payments/:id` | JWT | Get single payment |

### Subscriptions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/subscriptions` | JWT | List all subscriptions |
| POST | `/subscriptions` | JWT | Create subscription |
| GET | `/subscriptions/:id` | JWT | Get single subscription |
| PATCH | `/subscriptions/:id` | JWT | Update subscription |

### Check-ins
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/checkins` | JWT | List check-in history |
| POST | `/checkins/lookup` | JWT | Check-in terminal: lookup member by ID/phone, record entry |

### Notifications
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | JWT | List all notifications |
| GET | `/notifications/unread-count` | JWT | Count of unread notifications |
| POST | `/notifications/mark-all-read` | JWT | Mark all as read |
| PATCH | `/notifications/:id/read` | JWT | Mark one notification read |

### Staff
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/staff` | JWT | List all staff for this gym |
| POST | `/staff` | JWT (admin) | Add staff member |
| PATCH | `/staff/:id` | JWT (admin) | Update staff member |
| DELETE | `/staff/:id` | JWT (admin) | Remove staff member |

### Superadmin (Platform Owner Only)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/superadmin/stats` | Secret | Platform-wide stats |
| GET | `/superadmin/gyms` | Secret | All gyms with member counts and subscription |
| GET | `/superadmin/gyms/:id` | Secret | Single gym full details |
| PATCH | `/superadmin/gyms/:id/subscription` | Secret | Update gym's SaaS subscription |
| PATCH | `/superadmin/gyms/:id/toggle-active` | Secret | Enable/disable a gym |

---

## SaaS Owner Portal

As the platform owner, you have a private portal at:

```
https://your-domain.com/superadmin
```

### What You Can See
- **Total gyms** registered (active vs. all)
- **Total members** across all gyms
- **Platform revenue** (what gyms paid you, not what gym members paid their gym)
- **Active vs. trial subscriptions**
- Per-gym table showing: member count, active members, SaaS plan, subscription status, total paid, renewal date

### What You Can Do
- **Edit any gym's subscription** — change plan (trial/starter/growth/pro), status (active/expired/cancelled), record payment amount and renewal date
- **Enable or disable a gym** — stops their access to the platform
- **View full gym details** including staff list and subscription history

### Authentication
The Owner Portal uses a **separate secret key** (not your gym login). Set `SUPERADMIN_SECRET` in your environment variables. This key is entered once in the browser and stored in `localStorage`.

**Default value (change before deploying):** `gymflow-superadmin-secret`

---

## Deployment

GymFlow has two parts that need to be deployed together:
- **Backend (API Server)** — Express + Node.js, needs a persistent server with PostgreSQL
- **Frontend (React SPA)** — Static files, can be hosted on any CDN/static host

> **Database note:** The API server requires a PostgreSQL database. See the [Database Hosting Options](#database-hosting-options) section to choose where to host your DB before deploying.

---

### Deploy on Replit (Recommended — zero config)

Click the **Publish** button in the Replit workspace. Replit handles everything automatically:
- Builds the app
- Hosts on `https://your-app.replit.app`
- TLS/HTTPS
- Health checks
- `DATABASE_URL` and `SESSION_SECRET` are already configured as Replit secrets

**Before publishing, add this secret in Replit Secrets tab:**
```
SUPERADMIN_SECRET = your-private-owner-key
```

---

### Deploy on AWS EC2 (Full control — recommended for production)

EC2 runs both the API server and serves the frontend via Nginx on a single virtual machine.

#### Step 1 — Launch an EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Choose **Ubuntu 24.04 LTS** (free tier: t2.micro, production: t3.small or higher)
3. Open these ports in Security Group:
   - Port **22** (SSH)
   - Port **80** (HTTP)
   - Port **443** (HTTPS)
4. Create or select a key pair — download the `.pem` file
5. Launch the instance and note the **Public IP**

#### Step 2 — Connect and Install Dependencies

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2 (process manager — keeps app running after SSH disconnect)
npm install -g pm2

# Install Nginx (web server)
sudo apt install -y nginx

# Install Git
sudo apt install -y git
```

#### Step 3 — Clone and Build the App

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/gymflow.git /var/www/gymflow
cd /var/www/gymflow

# Install all dependencies
pnpm install

# Build API server
pnpm --filter @workspace/api-server run build

# Build frontend (creates static files in artifacts/gymflow/dist/)
pnpm --filter @workspace/gymflow run build
```

#### Step 4 — Set Environment Variables

```bash
# Create environment file
sudo nano /etc/environment

# Add these lines (replace values with your actual secrets):
DATABASE_URL="postgresql://user:password@your-db-host:5432/gymflow"
SESSION_SECRET="your-super-long-random-secret-key-minimum-32-chars"
SUPERADMIN_SECRET="your-private-owner-portal-key"
NODE_ENV="production"
PORT="5000"
LOG_LEVEL="info"

# Save and reload environment
source /etc/environment
```

#### Step 5 — Start API Server with PM2

```bash
cd /var/www/gymflow

# Start the API server
pm2 start "pnpm --filter @workspace/api-server run start" --name "gymflow-api"

# Save PM2 process list (survives reboots)
pm2 save

# Configure PM2 to start on system boot
pm2 startup
# Copy and run the command it outputs

# Verify it's running
pm2 status
pm2 logs gymflow-api
```

#### Step 6 — Configure Nginx

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/gymflow
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_EC2_IP;

    # Serve React frontend
    root /var/www/gymflow/artifacts/gymflow/dist;
    index index.html;

    # Proxy all /api requests to the Express backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10m;
    }

    # SPA fallback — React Router handles all other routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/gymflow /etc/nginx/sites-enabled/

# Remove default Nginx site
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
```

#### Step 7 — Add HTTPS with Let's Encrypt (free SSL)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your actual domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically — verify with:
sudo certbot renew --dry-run
```

#### Step 8 — Update Deployments

```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
cd /var/www/gymflow

# Pull latest code
git pull origin main

# Reinstall dependencies (if package.json changed)
pnpm install

# Rebuild
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/gymflow run build

# Restart API server
pm2 restart gymflow-api

# Nginx picks up frontend changes automatically (static files)
```

---

### Deploy on any VPS / Ubuntu Server (Quick setup)

Use this if you already have any Ubuntu/Debian VPS (DigitalOcean Droplet, Linode, Hetzner, etc.) and want a fast setup without the detailed EC2 walkthrough.

```bash
# 1. Install Node.js and pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm

# 2. Clone and install
git clone https://github.com/YOUR_USERNAME/gymflow.git /var/www/gymflow
cd /var/www/gymflow
pnpm install

# 3. Set environment variables
sudo nano /etc/environment
# Add the following lines:
# DATABASE_URL="postgresql://user:password@host:5432/gymflow"
# SESSION_SECRET="your-long-random-secret-key"
# SUPERADMIN_SECRET="your-owner-portal-key"
# NODE_ENV="production"
# PORT="5000"
source /etc/environment

# 4. Build both packages
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/gymflow run build

# 5. Run API server with PM2
npm install -g pm2
pm2 start "pnpm --filter @workspace/api-server run start" --name "gymflow-api"
pm2 save
pm2 startup
# Run the command that pm2 startup prints

# 6. Install and configure Nginx
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/gymflow
# Paste the Nginx config below, then:
sudo ln -s /etc/nginx/sites-available/gymflow /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

**Nginx Configuration (paste into `/etc/nginx/sites-available/gymflow`):**

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_SERVER_IP;

    # Serve React frontend static files
    root /var/www/gymflow/artifacts/gymflow/dist;
    index index.html;

    # Proxy all /api requests to the Express backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 10m;
    }

    # SPA fallback — all unknown routes serve index.html (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**To update after code changes:**
```bash
cd /var/www/gymflow
git pull origin main
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/gymflow run build
pm2 restart gymflow-api
```

---

### Deploy on Railway (Easiest cloud deploy — 5 minutes)

Railway automatically detects and deploys Node.js apps with zero config.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Go to your project folder
cd /path/to/gymflow

# 4. Initialize Railway project
railway init

# 5. Provision a PostgreSQL database
railway add --plugin postgresql
# Railway will auto-set DATABASE_URL

# 6. Set remaining environment variables
railway variables set SESSION_SECRET="your-super-long-secret-key"
railway variables set SUPERADMIN_SECRET="your-owner-portal-key"
railway variables set NODE_ENV="production"

# 7. Deploy
railway up

# 8. Get your live URL
railway open
```

---

### Deploy Frontend on Vercel + Backend on Railway

Vercel is ideal for hosting the React frontend (free tier). Pair it with Railway for the backend.

#### Backend on Railway (same as above)

After deploying on Railway, note your backend URL (e.g. `https://gymflow-api.up.railway.app`).

#### Frontend on Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Build the frontend
cd /path/to/gymflow
pnpm --filter @workspace/gymflow run build

# 3. Deploy the dist folder to Vercel
cd artifacts/gymflow

# 4. Login and deploy
vercel login
vercel --prod
```

**Or use Vercel Git integration (recommended):**
1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
3. Set these build settings in the Vercel dashboard:
   - **Root Directory:** `artifacts/gymflow`
   - **Build Command:** `cd ../.. && pnpm install && pnpm --filter @workspace/gymflow run build`
   - **Output Directory:** `dist`
4. Add this Environment Variable in Vercel dashboard:
   ```
   VITE_API_BASE_URL = https://your-railway-backend.up.railway.app
   ```
5. Click **Deploy**

**Vercel `vercel.json` for SPA routing** (create at `artifacts/gymflow/vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

### Database Hosting Options

The API server needs a PostgreSQL database. Choose one of these:

#### Option A — Supabase (Free tier, 500MB)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a region close to your server
3. Set a strong database password
4. Go to **Settings → Database** → copy the **Connection String (URI)**
5. Use it as your `DATABASE_URL`:
   ```
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Run the table creation SQL from the [Database Commands](#database-commands) section in Supabase's **SQL Editor**

#### Option B — Firebase (Firestore is NoSQL — not compatible)

> **Important:** Firebase's primary database (Firestore) is a NoSQL document database and is **not compatible** with GymFlow, which requires PostgreSQL. However, you can use **Firebase Hosting** for the frontend and host the backend + database elsewhere (Railway, EC2, Supabase).

**Deploy frontend to Firebase Hosting:**

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Build the frontend
cd /path/to/gymflow
pnpm --filter @workspace/gymflow run build

# 4. Go to the frontend folder
cd artifacts/gymflow

# 5. Initialize Firebase Hosting
firebase init hosting
# When prompted:
#   - Public directory: dist
#   - Single-page app: YES (important for React Router)
#   - Overwrite index.html: NO

# 6. Deploy
firebase deploy --only hosting
```

Your frontend will be at `https://your-project.web.app`.

**Note:** You still need a separate backend server (Railway, EC2, or Render) for the API since Firebase cannot run Express/Node.js servers.

#### Option C — Netlify (Frontend only — same limitation as Firebase)

> Like Firebase, Netlify hosts static files only. Use it for the frontend; host the backend on Railway or EC2.

**Deploy frontend to Netlify:**

```bash
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Build the frontend
cd /path/to/gymflow
pnpm --filter @workspace/gymflow run build

# 3. Login
netlify login

# 4. Deploy from the dist folder
cd artifacts/gymflow
netlify deploy --dir=dist --prod
```

**Or use Netlify Git integration (recommended):**
1. Push your repo to GitHub
2. Go to [netlify.com](https://netlify.com) → New Site from Git
3. Set build settings:
   - **Base directory:** `artifacts/gymflow`
   - **Build command:** `cd ../.. && pnpm install && pnpm --filter @workspace/gymflow run build`
   - **Publish directory:** `artifacts/gymflow/dist`
4. Click **Deploy**

**Create `artifacts/gymflow/public/_redirects`** for SPA routing:
```
/*    /index.html   200
```

**Set environment variable in Netlify dashboard:**
```
VITE_API_BASE_URL = https://your-railway-or-ec2-backend.com
```

---

### Recommended Deployment Combinations

| Use Case | Frontend | Backend + DB | Cost |
|----------|----------|--------------|------|
| **Quick demo / testing** | Replit | Replit built-in DB | Free |
| **Production — simplest** | Railway | Railway + Railway PostgreSQL | ~$5/mo |
| **Production — scalable** | Vercel | Railway or EC2 + Supabase | ~$0–20/mo |
| **Full control** | EC2 Nginx | EC2 + RDS PostgreSQL | ~$15–30/mo |
| **Frontend only** | Netlify / Firebase | Railway / EC2 / Render | Free frontend |

---

### Environment Variables Quick Reference

Set these on every deployment platform:

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SESSION_SECRET=minimum-32-character-random-string
SUPERADMIN_SECRET=your-owner-portal-secret-key

# Optional
PORT=5000
NODE_ENV=production
LOG_LEVEL=info
```

---

## Demo Credentials

### Gym 1 — PowerFit Gym

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | admin@powerfit.com | gymflow123 | Full access — members, plans, payments, staff, settings |
| **Staff** | staff@powerfit.com | gymflow123 | Limited access — check-ins, members (read), notifications |

### Gym 2 — Gladiator

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | test@gmail.com | gymflow123 | Full access to Gladiator gym only |

> Each gym's admin can only see their own gym's data. Logging in as PowerFit admin will never show Gladiator's members or payments, and vice versa.

### SaaS Owner Portal (Platform Superadmin)

| Field | Value |
|-------|-------|
| **URL** | `/superadmin` |
| **Secret Key** | `gymflow-superadmin-secret` |
| **Access** | Full platform view — all gyms, member counts, subscription management |

> Change `SUPERADMIN_SECRET` in your environment variables before going to production. Anyone with this key has full platform control.

---

## Feature Summary

| Feature | Status |
|---------|--------|
| Multi-tenant gym registration | ✅ |
| JWT authentication | ✅ |
| Member management (CRUD + photo) | ✅ |
| Membership plans | ✅ |
| Subscription tracking | ✅ |
| Payment recording | ✅ |
| Member renewal with auto-payment | ✅ |
| Check-in terminal | ✅ |
| Expiry notifications (automated) | ✅ |
| Staff management (RBAC) | ✅ |
| Dashboard with revenue charts | ✅ |
| Export members to CSV | ✅ |
| Gym name in dashboard hero | ✅ |
| SaaS Owner Portal | ✅ |
| Platform-level subscription tracking | ✅ |
