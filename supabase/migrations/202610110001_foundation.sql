-- Supabase Postgres. Run as migration administrator. No seeds or secrets.
begin;
-- gen_random_uuid() is built into supported PostgreSQL versions; no extension required.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check ((is_demo and owner_id is null) or (not is_demo and owner_id is not null))
);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  filename text not null check (char_length(filename) between 1 and 255),
  source text not null check (source in ('official_csv','upload','manual','fixture')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  record_count integer not null default 0 check (record_count >= 0),
  unique_text_count integer not null default 0 check (unique_text_count between 0 and record_count),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  created_at timestamptz not null default now(),
  unique (workspace_id, content_hash),
  unique (workspace_id, id)
);
create table public.feedback_patterns (
  workspace_id uuid not null,
  import_batch_id uuid not null,
  normalized_hash text not null check (normalized_hash ~ '^[a-f0-9]{64}$'),
  normalized_text text not null check (char_length(normalized_text) between 1 and 10000),
  example_original_text text not null,
  occurrence_count integer not null check (occurrence_count > 0),
  -- Multiple source categories may share a text; do not choose an arbitrary category.
  category_counts jsonb not null check (jsonb_typeof(category_counts) = 'object'),
  primary key (workspace_id, import_batch_id, normalized_hash),
  foreign key (workspace_id, import_batch_id) references public.import_batches(workspace_id, id) on delete cascade
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  import_batch_id uuid not null,
  owner_id uuid references auth.users(id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  raw_text text not null check (char_length(btrim(raw_text)) between 1 and 10000),
  original_category text not null check (original_category in ('Product Feedback','Customer Service','Fraud and Scam','Operational Issues')),
  source text not null check (source in ('official_csv','upload','manual','fixture')),
  normalized_hash text not null,
  imported_at timestamptz not null default now(),
  observed_at timestamptz,
  unique (import_batch_id, row_number),
  foreign key (workspace_id, import_batch_id, normalized_hash) references public.feedback_patterns(workspace_id, import_batch_id, normalized_hash) on delete cascade
);
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  import_batch_id uuid not null,
  normalized_hash text not null,
  sentiment text not null check (sentiment in ('positive','negative','neutral','mixed','unknown')),
  severity text not null check (severity in ('low','medium','high','critical','unknown')),
  issue_types text[] not null default '{}',
  aspects jsonb not null default '[]' check (jsonb_typeof(aspects) = 'array'),
  explanation text not null,
  evidence_quote text not null,
  analyzed_by text not null check (analyzed_by in ('heuristic','manual','adaption','other')),
  pipeline_version text not null,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','verified','rejected')),
  confidence numeric check (confidence between 0 and 1),
  updated_at timestamptz not null default now(),
  unique (workspace_id, import_batch_id, normalized_hash),
  foreign key (workspace_id, import_batch_id, normalized_hash) references public.feedback_patterns(workspace_id, import_batch_id, normalized_hash) on delete cascade
);
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 250),
  category text not null check (category in ('Product Feedback','Customer Service','Fraud and Scam','Operational Issues')),
  severity text not null check (severity in ('low','medium','high','critical','unknown')),
  summary text not null,
  status text not null default 'open' check (status in ('open','investigating','planned','resolved')),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create table public.issue_evidence (
  workspace_id uuid not null,
  issue_id uuid not null,
  import_batch_id uuid not null,
  normalized_hash text not null,
  role text not null check (role in ('supporting','contradicting','context')),
  primary key (issue_id, import_batch_id, normalized_hash, role),
  foreign key (workspace_id, issue_id) references public.issues(workspace_id, id) on delete cascade,
  foreign key (workspace_id, import_batch_id, normalized_hash) references public.feedback_patterns(workspace_id, import_batch_id, normalized_hash) on delete cascade
);
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  issue_id uuid not null,
  owner_id uuid references auth.users(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, issue_id) references public.issues(workspace_id, id) on delete cascade
);
create table public.adaption_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  import_batch_id uuid not null,
  dataset_id text,
  run_id text,
  status text not null default 'pending' check (status in ('not_configured','pending','processing','partial','ready','failed')),
  source_rows integer not null check (source_rows >= 0),
  processed_rows integer check (processed_rows >= 0),
  estimated_credits numeric check (estimated_credits >= 0),
  actual_credits numeric check (actual_credits >= 0),
  config_json jsonb not null default '{}',
  artifact_path text,
  eval_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, import_batch_id) references public.import_batches(workspace_id, id) on delete cascade
);

create index feedback_batch_category_idx on public.feedback(import_batch_id, original_category);
create index feedback_hash_idx on public.feedback(workspace_id, normalized_hash);
create index feedback_date_idx on public.feedback(observed_at) where observed_at is not null;
create index issues_workspace_status_idx on public.issues(workspace_id, status);
create index issue_evidence_pattern_idx on public.issue_evidence(workspace_id, import_batch_id, normalized_hash);
create index actions_issue_idx on public.actions(workspace_id, issue_id);
create index adaption_batch_idx on public.adaption_runs(workspace_id, import_batch_id);
create index workspace_owner_idx on public.workspaces(owner_id);

-- Client roles may read curated demo data or their own workspace. No client write grants/policies.
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon, authenticated;
grant select on public.workspaces to anon, authenticated;
create policy workspace_read on public.workspaces for select to anon, authenticated
  using (is_demo or owner_id = (select auth.uid()));
do $$
declare table_name text;
begin
  foreach table_name in array array['import_batches','feedback_patterns','feedback','annotations','issues','issue_evidence','actions','adaption_runs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to anon, authenticated', table_name);
    execute format('create policy scoped_read on public.%I for select to anon, authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and (w.is_demo or w.owner_id = (select auth.uid()))))', table_name);
  end loop;
end $$;

-- Even privileged server writes must not attach an inconsistent owner to another workspace.
create function public.enforce_workspace_owner() returns trigger language plpgsql set search_path = '' as $$
declare expected_owner uuid;
begin
  select owner_id into expected_owner from public.workspaces where id = new.workspace_id;
  if not found or new.owner_id is distinct from expected_owner then
    raise exception 'Workspace owner mismatch';
  end if;
  return new;
end $$;
create trigger batch_owner before insert or update on public.import_batches for each row execute function public.enforce_workspace_owner();
create trigger feedback_owner before insert or update on public.feedback for each row execute function public.enforce_workspace_owner();
create trigger action_owner before insert or update on public.actions for each row execute function public.enforce_workspace_owner();
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger issues_touch before update on public.issues for each row execute function public.touch_updated_at();
create trigger actions_touch before update on public.actions for each row execute function public.touch_updated_at();
create trigger annotations_touch before update on public.annotations for each row execute function public.touch_updated_at();
comment on column public.feedback.observed_at is 'Customer event date only; official CSV has none. Never substitute imported_at.';
commit;
