-- Run once in the Supabase SQL Editor for this app's project.
create table if not exists public.flashcard_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.flashcard_states enable row level security;
drop policy if exists "Own flashcard state" on public.flashcard_states;
create policy "Own flashcard state" on public.flashcard_states
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.flashcard_states from anon;
grant select, insert, update on public.flashcard_states to authenticated;

-- A concurrent device must refetch and merge rather than silently overwrite.
create or replace function public.save_flashcard_state(
  target_user_id uuid, expected_version bigint, next_state jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  next_version bigint;
begin
  if auth.uid() is null or auth.uid() <> target_user_id then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if jsonb_typeof(next_state->'sets') is distinct from 'array' then
    raise exception 'Invalid flashcard state' using errcode = '22023';
  end if;
  if expected_version = 0 then
    insert into public.flashcard_states(user_id, state)
      values(auth.uid(), next_state)
      on conflict (user_id) do nothing
      returning version into next_version;
  else
    update public.flashcard_states
      set state = next_state, version = version + 1, updated_at = now()
      where user_id = auth.uid() and version = expected_version
      returning version into next_version;
  end if;
  if next_version is null then
    raise exception 'sync_conflict' using errcode = '40001';
  end if;
  return jsonb_build_object('state', next_state, 'version', next_version);
end;
$$;
revoke all on function public.save_flashcard_state(uuid, bigint, jsonb) from public, anon;
grant execute on function public.save_flashcard_state(uuid, bigint, jsonb) to authenticated;
