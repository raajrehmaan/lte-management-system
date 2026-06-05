create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  auth_email text not null unique,
  role text not null check (role in ('admin', 'therapist', 'receptionist')) default 'therapist',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  treatment text not null,
  variant text not null default 'Standard',
  duration_minutes integer not null,
  default_price numeric(10,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  duration_minutes integer not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  treatment_id uuid references public.treatments(id) on delete set null,
  status text not null check (status in ('scheduled', 'completed', 'cancelled', 'no_show')) default 'scheduled',
  notes text,
  final_price numeric(10,2) not null default 0,
  paid_status text not null check (paid_status in ('unpaid', 'deposit_paid', 'paid', 'refunded')) default 'unpaid',
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'voucher')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.staff enable row level security;
alter table public.treatments enable row level security;
alter table public.appointments enable row level security;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.is_admin_or_reception()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'receptionist');
$$;

create policy "signed in users can read profiles" on public.profiles
for select using (auth.role() = 'authenticated');

create policy "admins can manage profiles" on public.profiles
for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create or replace function public.create_my_profile(p_username text, p_admin_creation_password text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  new_profile public.profiles;
  cleaned_username text;
  selected_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  cleaned_username := lower(regexp_replace(trim(p_username), '[^a-zA-Z0-9_-]', '', 'g'));

  if cleaned_username = '' then
    raise exception 'Username is required';
  end if;

  selected_role := case when p_admin_creation_password = '6871' then 'admin' else 'therapist' end;

  insert into public.profiles (id, username, auth_email, role)
  values (auth.uid(), cleaned_username, cleaned_username || '@users.lasertreat.local', selected_role)
  returning * into new_profile;

  return new_profile;
end;
$$;

create policy "signed in users can read clients" on public.clients
for select using (auth.role() = 'authenticated');

create policy "admin and reception can manage clients" on public.clients
for all using (public.is_admin_or_reception())
with check (public.is_admin_or_reception());

create policy "signed in users can read staff" on public.staff
for select using (auth.role() = 'authenticated');

create policy "admins can manage staff" on public.staff
for all using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy "signed in users can manage treatments" on public.treatments
for select using (auth.role() = 'authenticated');

create policy "admins can manage treatments" on public.treatments
for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "signed in users can read appointments" on public.appointments
for select using (auth.role() = 'authenticated');

create policy "admin and reception can create appointments" on public.appointments
for insert with check (public.is_admin_or_reception());

create policy "admin and reception can update appointments" on public.appointments
for update using (public.is_admin_or_reception())
with check (public.is_admin_or_reception());

create policy "therapists can update assigned appointments" on public.appointments
for update using (
  staff_id in (select id from public.staff where profile_id = auth.uid())
)
with check (
  staff_id in (select id from public.staff where profile_id = auth.uid())
);

create policy "admin and reception can delete appointments" on public.appointments
for delete using (public.is_admin_or_reception());

alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.staff;
alter publication supabase_realtime add table public.treatments;
alter publication supabase_realtime add table public.appointments;

insert into public.treatments (category, treatment, variant, duration_minutes, default_price) values
('FACIALS', 'HydraFacial', 'Bronze', 45, 80),
('FACIALS', 'HydraFacial', 'Silver', 45, 90),
('FACIALS', 'HydraFacial', 'Gold', 60, 150),
('FACIALS', 'HydraFacial', 'Platinum', 60, 220),
('FACIALS', 'Laser Carbon Peel', 'Face', 45, 220),
('FACIALS', 'Laser Carbon Peel', 'Back', 45, 220),
('FACIALS', 'Chemical Peel', 'Mild', 45, 75),
('FACIALS', 'Chemical Peel', 'Medium', 45, 100),
('FACIALS', 'Chemical Peel', 'Deep', 45, 140),
('FACIALS', 'Facial Treatments', 'Microdermabrasion', 45, 35),
('FACIALS', 'Facial Treatments', 'Radiofrequency Skin Tightening', 45, 30),
('FACIALS', 'Facial Treatments', 'Microneedling', 60, 150),
('LASER HAIR REMOVAL', 'Upper Lip', 'Standard', 30, 29),
('LASER HAIR REMOVAL', 'Chin', 'Standard', 30, 30),
('LASER HAIR REMOVAL', 'Chest', 'Standard', 30, 30),
('LASER HAIR REMOVAL', 'Stomach', 'Standard', 30, 35),
('LASER HAIR REMOVAL', 'Half Arm', 'Standard', 30, 75),
('LASER HAIR REMOVAL', 'Half Leg', 'Standard', 30, 80),
('LASER HAIR REMOVAL', 'Underarm', 'Standard', 30, 99),
('LASER HAIR REMOVAL', 'Bikini', 'Standard', 30, 120),
('LASER HAIR REMOVAL', 'Full Face', 'Standard', 60, 120),
('LASER HAIR REMOVAL', 'Full Arm', 'Standard', 60, 150),
('LASER HAIR REMOVAL', 'Full Leg', 'Standard', 60, 160),
('LASER HAIR REMOVAL', 'Full Body', 'Standard', 120, 299),
('ADVANCED AESTHETICS', 'Anti-Wrinkle Treatment', '3 Areas', 30, 260),
('ADVANCED AESTHETICS', 'Dermal Fillers', 'Lip Augmentation', 45, 190),
('ADVANCED AESTHETICS', 'Vitamin Injections', 'Vitamin B12', 30, 40),
('ADVANCED AESTHETICS', 'IV Drips', 'Detox', 60, 180),
('ADVANCED AESTHETICS', 'PRP / RPF / Exosomes', '1 Session', 60, 260),
('ADVANCED AESTHETICS', 'Skin Boosters', 'Profhilo', 30, 260),
('ADVANCED AESTHETICS', 'Biostimulators', 'Radiesse', 30, 400);
