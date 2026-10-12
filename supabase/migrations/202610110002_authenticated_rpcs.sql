begin;
-- Direct client table writes remain revoked. Only bounded atomic RPCs gain write access.
create unique index private_workspace_owner_unique on public.workspaces(owner_id) where not is_demo;
alter table public.import_batches add column rejected_rows jsonb not null default '[]';
alter table public.feedback add column contract_json jsonb;
alter table public.issues add column import_batch_id uuid;
alter table public.issues add column issue_key text;
alter table public.issues add column contract_json jsonb;
alter table public.issues add constraint issue_batch_scope foreign key (workspace_id, import_batch_id) references public.import_batches(workspace_id,id);
create unique index issue_batch_key_unique on public.issues(workspace_id,import_batch_id,issue_key);
alter table public.actions add column contract_json jsonb;

create function public.import_feedback_batch(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); scope uuid; batch uuid; prior public.import_batches;
  r jsonb; p jsonb; a jsonb; i jsonb; h text; source_type text; accepted integer; unique_count integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) <> 'object' or
    p_payload - array['batchId','records','patterns','issues','filename','source','contentHash','rejectedRows'] <> '{}'::jsonb or
    jsonb_typeof(p_payload->'records') <> 'array' or jsonb_typeof(p_payload->'patterns') <> 'array' or
    jsonb_typeof(p_payload->'issues') <> 'array' or jsonb_typeof(p_payload->'rejectedRows') <> 'array' then
    raise exception 'Invalid payload' using errcode='22023';
  end if;
  source_type := p_payload->>'source';
  accepted := jsonb_array_length(p_payload->'records');
  unique_count := jsonb_array_length(p_payload->'patterns');
  if source_type is null or source_type not in ('manual','upload') or accepted not between 1 and 50000 or
    unique_count not between 1 and accepted or octet_length(p_payload::text) > 100000000 then
    raise exception 'Invalid import bounds' using errcode='22023';
  end if;
  insert into public.workspaces(owner_id,is_demo) values(actor,false)
    on conflict (owner_id) where not is_demo do update set owner_id=excluded.owner_id returning id into scope;
  -- Serialize same-owner imports, including racing retries, inside this transaction.
  perform 1 from public.workspaces where id=scope for update;
  select * into prior from public.import_batches where workspace_id=scope and content_hash=p_payload->>'contentHash';
  if found then
    return jsonb_build_object('batchId',prior.id,'recordCount',prior.record_count,'uniqueTextCount',prior.unique_text_count,
      'repeatedRecordCount',prior.record_count-prior.unique_text_count,'rejectedCount',prior.rejected_count,
      'rejectedRows',prior.rejected_rows,'idempotentReplay',true);
  end if;
  batch := (p_payload->>'batchId')::uuid;
  insert into public.import_batches(id,workspace_id,owner_id,filename,source,content_hash,record_count,unique_text_count,rejected_count,rejected_rows,status)
    values(batch,scope,actor,p_payload->>'filename',source_type,p_payload->>'contentHash',accepted,unique_count,
      jsonb_array_length(p_payload->'rejectedRows'),p_payload->'rejectedRows','processing');
  for p in select value from jsonb_array_elements(p_payload->'patterns') loop
    if jsonb_typeof(p->'categoryCounts') is distinct from 'object' or
      (select count(*) from jsonb_object_keys(p->'categoryCounts')) <> 4 or
      exists(select 1 from jsonb_object_keys(p->'categoryCounts') key where key not in ('Product Feedback','Customer Service','Fraud and Scam','Operational Issues')) then
      raise exception 'Invalid category histogram' using errcode='22023';
    end if;
    insert into public.feedback_patterns(workspace_id,import_batch_id,normalized_hash,normalized_text,example_original_text,occurrence_count,category_counts)
      values(scope,batch,p->>'normalizedHash',p->>'normalizedText',p->>'exampleOriginalText',(p->>'occurrenceCount')::integer,p->'categoryCounts');
    a := p->'annotation';
    if a is not null and a <> 'null'::jsonb then
      if a->>'analyzedBy' is distinct from 'heuristic' or a->'confidence' is distinct from 'null'::jsonb or a->>'reviewStatus' is distinct from 'unreviewed' or
        (a->>'evidenceQuote' <> '' and strpos(p->>'exampleOriginalText',a->>'evidenceQuote')=0) or
        exists(select 1 from jsonb_array_elements(a->'aspects') aspect where strpos(p->>'exampleOriginalText',aspect->>'evidenceQuote')=0) then
        raise exception 'Unsupported annotation evidence' using errcode='22023';
      end if;
      insert into public.annotations(workspace_id,import_batch_id,normalized_hash,sentiment,severity,issue_types,aspects,explanation,evidence_quote,analyzed_by,pipeline_version,review_status,confidence)
        values(scope,batch,p->>'normalizedHash',a->>'sentiment',a->>'severity',array(select jsonb_array_elements_text(a->'issueTypes')),
          a->'aspects',a->>'explanation',a->>'evidenceQuote','heuristic',a->>'pipelineVersion','unreviewed',null);
    end if;
  end loop;
  for r in select value from jsonb_array_elements(p_payload->'records') loop
    if r->>'batchId' is distinct from batch::text or r->>'source' is distinct from source_type or (source_type='upload' and r->'observedAt'<>'null'::jsonb) then
      raise exception 'Invalid record provenance' using errcode='22023';
    end if;
    a := r->'annotation';
    if a is null or a='null'::jsonb or a->>'analyzedBy' is distinct from 'heuristic' or
      a->'confidence' is distinct from 'null'::jsonb or a->>'reviewStatus' is distinct from 'unreviewed' or
      (a->>'evidenceQuote' <> '' and strpos(r->>'rawText',a->>'evidenceQuote')=0) or
      exists(select 1 from jsonb_array_elements(a->'aspects') aspect where strpos(r->>'rawText',aspect->>'evidenceQuote')=0) then
      raise exception 'Invalid raw-record annotation provenance or evidence' using errcode='22023';
    end if;
    insert into public.feedback(id,workspace_id,import_batch_id,owner_id,row_number,raw_text,original_category,source,normalized_hash,imported_at,observed_at,contract_json)
      values((r->>'id')::uuid,scope,batch,actor,(r->>'rowNumber')::integer,r->>'rawText',r->>'category',source_type,
        r->>'normalizedHash',(r->>'importedAt')::timestamptz,(r->>'observedAt')::timestamptz,r);
  end loop;
  -- Refuse inconsistent pattern frequency/category histograms before committing any rows.
  if exists(select 1 from public.feedback_patterns fp where fp.import_batch_id=batch and (
    fp.occurrence_count <> (select count(*) from public.feedback f where f.import_batch_id=batch and f.normalized_hash=fp.normalized_hash) or
    exists(select 1 from jsonb_each_text(fp.category_counts) c where c.value::integer <>
      (select count(*) from public.feedback f where f.import_batch_id=batch and f.normalized_hash=fp.normalized_hash and f.original_category=c.key)))) then
    raise exception 'Pattern count mismatch' using errcode='22023';
  end if;
  for i in select value from jsonb_array_elements(p_payload->'issues') loop
    insert into public.issues(id,workspace_id,import_batch_id,issue_key,title,category,severity,summary,status,notes,contract_json)
      values((i->>'id')::uuid,scope,batch,i->>'key',i->>'title',i->>'category',i->>'severity',i->>'summary','open','',i - array['key','patterns']);
    for h in select jsonb_array_elements_text(i->'patterns') loop
      insert into public.issue_evidence(workspace_id,issue_id,import_batch_id,normalized_hash,role)
        values(scope,(i->>'id')::uuid,batch,h,'supporting');
    end loop;
  end loop;
  update public.import_batches set status='ready' where id=batch;
  return jsonb_build_object('batchId',batch,'recordCount',accepted,'uniqueTextCount',unique_count,'repeatedRecordCount',accepted-unique_count,
    'rejectedCount',jsonb_array_length(p_payload->'rejectedRows'),'rejectedRows',p_payload->'rejectedRows','idempotentReplay',false);
end $$;

create function public.read_feedback_batch(p_batch_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); b public.import_batches; result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select ib.* into b from public.import_batches ib join public.workspaces w on w.id=ib.workspace_id
    where w.owner_id=actor and not w.is_demo and ib.status='ready' and (p_batch_id is null or ib.id=p_batch_id)
    order by ib.created_at desc,ib.id limit 1;
  if not found then return null; end if;
  select jsonb_build_object('batchId',b.id,'source',b.source,
    'records',coalesce((select jsonb_agg(f.contract_json order by f.row_number) from public.feedback f where f.import_batch_id=b.id),'[]'::jsonb),
    'issues',coalesce((select jsonb_agg(i.contract_json || jsonb_build_object('status',i.status,'notes',i.notes,'createdAt',i.created_at,'updatedAt',i.updated_at)) from public.issues i where i.import_batch_id=b.id),'[]'::jsonb),
    'actions',coalesce((select jsonb_agg(a.contract_json || jsonb_build_object('status',a.status,'createdAt',a.created_at,'updatedAt',a.updated_at)) from public.actions a join public.issues i on i.id=a.issue_id where i.import_batch_id=b.id),'[]'::jsonb),
    'adaptionRuns',coalesce((select jsonb_agg(jsonb_build_object('id',ar.id,'datasetId',ar.dataset_id,'runId',ar.run_id,'status',ar.status,'sourceRows',ar.source_rows,'processedRows',ar.processed_rows,'estimatedCredits',ar.estimated_credits,'actualCredits',ar.actual_credits,'artifactPath',ar.artifact_path,'errorMessage',case when ar.error_message is null then null else 'Provider operation failed; inspect private operator logs' end) order by ar.created_at,ar.id) from public.adaption_runs ar where ar.import_batch_id=b.id and ar.workspace_id=b.workspace_id),'[]'::jsonb))
    into result;
  return result;
end $$;

create function public.update_feedback_issue(p_issue_id uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.issues; b public.import_batches;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or p_patch-array['status','notes']<>'{}'::jsonb then raise exception 'Invalid patch' using errcode='22023'; end if;
  select i.* into target from public.issues i join public.workspaces w on w.id=i.workspace_id
    where i.id=p_issue_id and w.owner_id=actor and not w.is_demo for update of i;
  if not found then raise exception 'Issue not found' using errcode='P0002'; end if;
  update public.issues set status=coalesce(p_patch->>'status',status),notes=coalesce(p_patch->>'notes',notes) where id=target.id returning * into target;
  select * into b from public.import_batches where id=target.import_batch_id;
  return jsonb_build_object('issue',target.contract_json || jsonb_build_object('status',target.status,'notes',target.notes,'createdAt',target.created_at,'updatedAt',target.updated_at),'batchId',b.id,'source',b.source);
end $$;

create function public.create_feedback_action(p_issue_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.issues; b public.import_batches; new_action public.actions;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_input)<>'object' or p_input-array['description','notes']<>'{}'::jsonb then raise exception 'Invalid action' using errcode='22023'; end if;
  select i.* into target from public.issues i join public.workspaces w on w.id=i.workspace_id where i.id=p_issue_id and w.owner_id=actor and not w.is_demo;
  if not found then raise exception 'Issue not found' using errcode='P0002'; end if;
  insert into public.actions(workspace_id,issue_id,owner_id,description,notes) values(target.workspace_id,target.id,actor,p_input->>'description',coalesce(p_input->>'notes','')) returning * into new_action;
  update public.actions set contract_json=jsonb_build_object('id',new_action.id,'issueId',target.id,'description',new_action.description,'status',new_action.status,'notes',new_action.notes,'createdAt',new_action.created_at,'updatedAt',new_action.updated_at) where id=new_action.id returning * into new_action;
  select * into b from public.import_batches where id=target.import_batch_id;
  return jsonb_build_object('action',new_action.contract_json,'batchId',b.id,'source',b.source);
end $$;

create function public.read_feedback_issue_batch(p_issue_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare batch uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select i.import_batch_id into batch from public.issues i join public.workspaces w on w.id=i.workspace_id
    where i.id=p_issue_id and w.owner_id=auth.uid() and not w.is_demo;
  if batch is null then return null; end if;
  return public.read_feedback_batch(batch);
end $$;
revoke all on function public.import_feedback_batch(jsonb),public.read_feedback_batch(uuid),public.read_feedback_issue_batch(uuid),public.update_feedback_issue(uuid,jsonb),public.create_feedback_action(uuid,jsonb) from public,anon;
grant execute on function public.import_feedback_batch(jsonb),public.read_feedback_batch(uuid),public.read_feedback_issue_batch(uuid),public.update_feedback_issue(uuid,jsonb),public.create_feedback_action(uuid,jsonb) to authenticated;
commit;
