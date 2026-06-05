# Simple Shared Clinic App Setup

This is the lightweight version: Next.js + Supabase only.

## What It Does

- Username/password login
- Shared live appointments
- Shared clients
- Shared staff
- Shared treatments
- Notes, payment status, appointment status
- Realtime updates across phones/desktops

## 1. Create Supabase Project

1. Go to Supabase.
2. Create a new project.
3. Open SQL Editor.
4. Run `supabase/schema.sql`.
5. Go to Authentication -> Providers and enable Email.
6. Turn OFF email confirmations. This keeps login simple: no OTP, no magic link, no verification email.
7. Deploy/run the app and create the first Admin from the app:

```text
Username: admin
Password: LTEadmin123
Admin creation password: 6871
```

The app internally maps usernames to Supabase Auth emails like:

```text
admin@users.lasertreat.local
```

Staff can create normal accounts without the admin creation password. They will become Therapist accounts by default.

After users are created, Admin can add Staff records and link each staff member to their login profile. This is what lets therapists edit only their own assigned appointments.

The admin creation password is enforced by the Supabase function `create_my_profile`, not only by the UI.

If you prefer to create users manually in Supabase, create the Auth user with the generated internal email, then either call the function while authenticated as that user or insert the profile as a service/admin operation:

```sql
insert into public.profiles (id, username, auth_email, role)
values ('AUTH_USER_ID', 'staffusername', 'staffusername@users.lasertreat.local', 'therapist');
```

Roles:

- `admin`
- `therapist`
- `receptionist`

## 2. Add Environment Variables

Copy `.env.example` to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 3. Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. One-Click Hosting

Simplest hosting:

1. Put this folder in GitHub.
2. Import into Vercel.
3. Add the two Supabase environment variables.
4. Deploy.

You will get a live link like:

```text
https://your-project.vercel.app
```

Send that link to staff. They log in with their username/password.

## Keep It Simple

This intentionally avoids:

- custom domains
- CI/CD complexity
- enterprise infrastructure
- advanced admin systems

It is a shared clinic database with a clean interface.
