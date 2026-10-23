-- The Travel Log — run in Supabase Dashboard > SQL Editor
create extension if not exists pgcrypto;
do $$ begin create type booking_status as enum ('not_booked','partially_booked','booked'); exception when duplicate_object then null; end $$;
do $$ begin create type item_type as enum ('transit','hotel','activity'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null, email text not null, avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'New Trip', place text not null default '',
  place_lat double precision, place_lng double precision,
  start_date date, end_date date, major_stops jsonb not null default '[]'::jsonb,
  booking_status booking_status not null default 'not_booked',
  image_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- For existing projects: destination photo on trips
alter table public.trips add column if not exists image_url text;

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type item_type not null, group_id uuid, subtype text,
  title text not null default '', place_name text not null default '',
  lat double precision, lng double precision,
  from_name text not null default '', from_lat double precision, from_lng double precision,
  to_name text not null default '', to_lat double precision, to_lng double precision,
  start_at timestamptz, end_at timestamptz, duration_minutes int,
  mode_of_transport text not null default '', booking_status booking_status not null default 'not_booked',
  booking_open_date date, book_by_date date,
  image_url text not null default '', sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- For existing projects: add the booking-window columns if they are not there yet
alter table public.itinerary_items add column if not exists booking_open_date date;
alter table public.itinerary_items add column if not exists book_by_date date;
-- For existing projects: allow 'restaurant' as an itinerary item type
alter type item_type add value if not exists 'restaurant';
create index if not exists idx_trips_user on public.trips(user_id);
create index if not exists idx_items_trip on public.itinerary_items(trip_id, sort_order);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.itinerary_items enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
-- Allow username->email lookup for login (only email column is used by app)
drop policy if exists "profiles lookup" on public.profiles;
create policy "profiles lookup" on public.profiles for select using (true);
drop policy if exists "own trips" on public.trips;
create policy "own trips" on public.trips for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own items" on public.itinerary_items;
create policy "own items" on public.itinerary_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into public.profiles (id, email, username) values (new.id, new.email, split_part(new.email,'@',1)) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict (id) do nothing;
drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects for select using (bucket_id='avatars');
drop policy if exists "avatar write own" on storage.objects;
create policy "avatar write own" on storage.objects for all using (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
