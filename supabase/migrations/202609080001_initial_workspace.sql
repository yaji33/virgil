create table if not exists public.workspaces (
  id text primary key,
  account_id text not null,
  quote_asset text not null,
  balance text not null,
  example_hold text not null default '0',
  captured_at text not null default '1970-01-01T00:00:00.000Z'
);

create table if not exists public.memberships (
  user_id text not null,
  workspace_id text not null references public.workspaces(id),
  primary key (user_id, workspace_id)
);

create table if not exists public.sessions (
  id text primary key,
  token_hash text not null unique,
  user_id text not null,
  workspace_id text not null references public.workspaces(id),
  created_at text not null,
  expires_at text not null
);

create table if not exists public.plans (
  id text primary key,
  workspace_id text not null references public.workspaces(id),
  revision integer not null,
  body jsonb not null
);

create table if not exists public.orders (
  id text primary key,
  workspace_id text not null references public.workspaces(id),
  plan_id text not null,
  status text not null,
  body jsonb not null
);

create table if not exists public.activity (
  id text primary key,
  workspace_id text not null references public.workspaces(id),
  plan_id text not null,
  title text not null,
  revision integer not null,
  message text not null,
  time text not null
);

create table if not exists public.plan_history (
  id text primary key,
  workspace_id text not null references public.workspaces(id),
  plan_id text not null references public.plans(id),
  body jsonb not null
);

create table if not exists public.demo_orders (
  id text primary key,
  body jsonb not null
);

create or replace function public.reject_record_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Records are immutable';
end;
$$;

create or replace trigger immutable_plan_history
  before update or delete on public.plan_history
  for each row execute function public.reject_record_change();

create or replace trigger immutable_demo_orders
  before update or delete on public.demo_orders
  for each row execute function public.reject_record_change();

create or replace function public.is_workspace_member(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where memberships.workspace_id = target_workspace_id
      and memberships.user_id = auth.uid()::text
  );
$$;

revoke all on function public.is_workspace_member(text) from public;
grant execute on function public.is_workspace_member(text) to authenticated;

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.sessions enable row level security;
alter table public.plans enable row level security;
alter table public.orders enable row level security;
alter table public.activity enable row level security;
alter table public.plan_history enable row level security;
alter table public.demo_orders enable row level security;

create policy workspace_members_read on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

create policy own_memberships_read on public.memberships
  for select to authenticated
  using (user_id = auth.uid()::text);

create policy workspace_plans_read on public.plans
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workspace_orders_read on public.orders
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workspace_activity_read on public.activity
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workspace_plan_history_read on public.plan_history
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.sessions from anon, authenticated;
revoke all on public.demo_orders from anon, authenticated;
grant select on public.workspaces, public.memberships, public.plans,
  public.orders, public.activity, public.plan_history to authenticated;

