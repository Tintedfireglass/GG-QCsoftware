# LaptopQC Admin Dashboard

Web-based admin dashboard for the LaptopQC application. Built with Next.js 14, TypeScript, and PostgreSQL.

## Setup

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (can use Vercel Postgres, Supabase, Railway, Neon, or local PostgreSQL)

### Installation

1. Install dependencies:
```bash
cd web
npm install
```

2. Configure environment variables:
   - Copy `.env.local` and update with your database connection string
   - Generate a secure JWT secret and API key

3. Initialize the database:
```bash
# Connect to your PostgreSQL database and run:
psql -h your-host -d your-database -U your-user -f lib/init-db.sql
```

Or manually copy and execute the SQL from `lib/init-db.sql`.

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Default Credentials

- **Username**: admin
- **Password**: admin123

⚠️ **IMPORTANT**: Change the default admin password after first login!

## API Endpoints

### Authentication (JWT)
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/register` - Create new user (admin only)

### QC Results
- `GET /api/qc-results` - List all QC results (with pagination and filters)
- `GET /api/qc-results/[id]` - Get specific QC result with test details
- `POST /api/qc-results` - Submit new QC result (requires API key)

### Machines
- `GET /api/machines` - List all registered machines
- `GET /api/machines/[id]` - Get machine details and test history

## API Authentication

### For Desktop Client (C#)
Use API key in header:
```
X-API-Key: your-api-key-from-env
```

### For Web Dashboard
Use JWT token in header:
```
Authorization: Bearer <jwt-token>
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub

2. Import project in Vercel dashboard

3. Add environment variables:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `API_KEY`
   - `NODE_ENV=production`

4. Deploy!

Vercel will automatically deploy on every push to main branch.

## Database Providers

This project works with any PostgreSQL database:

- **Vercel Postgres**: Integrated with Vercel deployment
- **Supabase**: Free tier available, includes auth
- **Railway**: Simple deployment, generous free tier
- **Neon**: Serverless postgres, auto-scaling
- **Local PostgreSQL**: For development

## Project Structure

```
web/
├── app/
│   ├── api/              # API routes (serverless functions)
│   │   ├── auth/        # Authentication endpoints
│   │   ├── qc-results/  # QC results endpoints
│   │   └── machines/    # Machine management endpoints
│   ├── dashboard/       # Dashboard pages (TODO)
│   └── layout.tsx       # Root layout
├── lib/
│   ├── db.ts           # Database connection
│   ├── auth.ts         # Authentication utilities
│   ├── types.ts        # TypeScript types
│   └── init-db.sql     # Database schema
└── components/         # React components (TODO)
```

## Next Steps

1. ✅ Backend API setup
2. ⏳ Build frontend dashboard UI
3. ⏳ Update C# desktop app to submit data
4. ⏳ Add analytics and reporting features
