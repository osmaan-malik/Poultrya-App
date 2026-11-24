-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run
create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  opening numeric not null default 0,
  created_at timestamptz default now()
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  no text unique not null,
  date date not null,
  shop_id uuid not null references shops(id) on delete cascade,
  weight numeric not null default 0,
  rate numeric not null default 0,
  amount numeric not null default 0,
  prev numeric not null default 0,
  recv numeric not null default 0,
  balance numeric not null default 0,
  created_at timestamptz default now()
);
create index on bills(date);
create index on bills(shop_id);

-- Lock tables: only the server (service key) can read/write. No public policies.
alter table shops enable row level security;
alter table bills enable row level security;

create view shop_balances with (security_invoker = true) as
select s.*, s.opening + coalesce(sum(b.amount - b.recv), 0) as balance
from shops s left join bills b on b.shop_id = s.id
group by s.id;

-- Explicit privileges: only the server's service_role may touch these objects.
grant usage on schema public to service_role;
grant select, insert, update, delete on shops, bills to service_role;
grant select on shop_balances to service_role;
revoke all on shops, bills, shop_balances from anon, authenticated;
