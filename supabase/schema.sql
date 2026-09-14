-- قلاع المملكة — مخطط Supabase المقترح (غير مفعّل في v1)
-- التفاصيل خطوة بخطوة في SUPABASE_SETUP.md
-- نفّذ هذا الملف في SQL Editor داخل مشروع Supabase عند تفعيل المزامنة.

-- ── لقطة حالة اللعبة (صف واحد JSONB لكل موسم/جهاز) ──────────────
create table if not exists public.game_states (
  id text primary key default 'season',
  state jsonb not null,
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);

-- ── مجلد الأحداث (append-only) ──────────────────────────────────
create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  at timestamptz not null default now()
);
create index if not exists game_events_at_idx on public.game_events (at);

-- ── بنك الأسئلة ─────────────────────────────────────────────────
create table if not exists public.question_banks (
  id text primary key default 'bank',
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── ميتاداتا المجسمات المرفوعة (البلوبات في bucket game-models) ──
create table if not exists public.model_assets (
  id text primary key,
  element_key text not null,      -- castle-base / floor-empty / soldier-novice-walk …
  filename text not null,
  storage_path text not null,     -- المسار داخل bucket game-models
  size_bytes int not null,
  scale double precision not null default 1,
  pivot jsonb not null default '{"x":0,"y":0,"z":0}'::jsonb,
  uploaded_at timestamptz not null default now()
);

-- ── سياسات RLS المقترحة (لعبة صفّية واحدة: وصول كامل بمفتاح anon) ─
alter table public.game_states enable row level security;
alter table public.game_events enable row level security;
alter table public.question_banks enable row level security;
alter table public.model_assets enable row level security;

create policy "anon full access game_states" on public.game_states
  for all using (true) with check (true);
create policy "anon full access game_events" on public.game_events
  for all using (true) with check (true);
create policy "anon full access question_banks" on public.question_banks
  for all using (true) with check (true);
create policy "anon full access model_assets" on public.model_assets
  for all using (true) with check (true);

-- ── Bucket المجسمات: قراءة عامة + رفع بمفتاح anon (§15 تبويب 3) ──
insert into storage.buckets (id, name, public)
values ('game-models', 'game-models', true)
on conflict (id) do nothing;

create policy "public read game-models" on storage.objects
  for select using (bucket_id = 'game-models');
create policy "anon upload game-models" on storage.objects
  for insert with check (bucket_id = 'game-models');
create policy "anon delete game-models" on storage.objects
  for delete using (bucket_id = 'game-models');

-- ── قناة Realtime الاختيارية (مزامنة متعددة الأجهزة مستقبلًا) ────
-- alter publication supabase_realtime add table public.game_states;
