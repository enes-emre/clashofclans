-- ============================================================
-- ÜS ARŞİVİ — Supabase veritabanı şeması
-- Bunu Supabase Dashboard > SQL Editor içine yapıştırıp çalıştır.
-- ============================================================

-- ---------- profiles: her kullanıcı için ek bilgi ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now()
);

-- Yeni kullanıcı kayıt olduğunda otomatik profil satırı oluştur
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- bases: paylaşılan düzenler ----------
create table public.bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  image_url text not null,
  link text not null,
  created_at timestamptz default now()
);

-- ---------- ratings: 1-5 arası puanlar ----------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  base_id uuid references public.bases(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz default now(),
  unique (base_id, user_id) -- bir kullanıcı bir düzene sadece bir kez puan verir
);

-- ---------- Hesaplanan görünümler (view) ----------
create view public.base_ratings as
select base_id, avg(rating)::numeric(2,1) as avg_rating, count(*) as rating_count
from public.ratings
group by base_id;

create view public.profile_stats as
select p.id, p.username, count(b.id) as base_count
from public.profiles p
left join public.bases b on b.user_id = p.id
group by p.id, p.username;

-- ---------- Satır seviyesi güvenlik (RLS) ----------
alter table public.profiles enable row level security;
alter table public.bases enable row level security;
alter table public.ratings enable row level security;

create policy "Profiller herkese açık" on public.profiles
  for select using (true);

create policy "Düzenler herkese açık" on public.bases
  for select using (true);
create policy "Kullanıcı kendi düzenini ekler" on public.bases
  for insert with check (auth.uid() = user_id);
create policy "Kullanıcı kendi düzenini siler" on public.bases
  for delete using (auth.uid() = user_id);

create policy "Puanlar herkese açık" on public.ratings
  for select using (true);
create policy "Kullanıcı puan verir" on public.ratings
  for insert with check (auth.uid() = user_id);
create policy "Kullanıcı kendi puanını günceller" on public.ratings
  for update using (auth.uid() = user_id);

-- ---------- Fotoğraf deposu (storage bucket) ----------
insert into storage.buckets (id, name, public)
values ('base-images', 'base-images', true);

create policy "Herkes düzen fotoğraflarını görebilir" on storage.objects
  for select using (bucket_id = 'base-images');

create policy "Giriş yapan kullanıcı fotoğraf yükleyebilir" on storage.objects
  for insert with check (bucket_id = 'base-images' and auth.role() = 'authenticated');
