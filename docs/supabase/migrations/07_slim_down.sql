-- Removes what the product no longer has: landing-page leads, subscriptions, payments,
-- plans, the grace period, the organization's legal name and БИН. Contact person
-- fields become optional.

-- Tables (policies, indexes and triggers go with them).
drop table public.leads;
drop table public.payments;
drop table public.subscriptions;

drop type public.lead_status;
drop type public.payment_method;
drop type public.subscription_status;
drop type public.plan;

-- Staff notes belong to tickets only now.
delete from public.internal_comments where subject_type = 'LEAD';
alter type public.comment_subject rename to comment_subject_old;
create type public.comment_subject as enum ('TICKET');
alter table public.internal_comments
  alter column subject_type type public.comment_subject using subject_type::text::public.comment_subject;
drop type public.comment_subject_old;

-- Platform settings keep only the redirect allowlist.
alter table public.platform_settings drop column grace_days, drop column plans;

-- Organizations: title only; the contact person is optional.
alter table public.organizations drop column legal_name, drop column bin;
alter table public.organizations
  alter column contact_name drop not null,
  alter column contact_phone drop not null,
  alter column contact_email drop not null;

-- Functions that mentioned subscriptions or payments.
drop function public.payments_sum(timestamptz, timestamptz);
drop function public.assign_cards(uuid[], uuid, uuid, uuid, timestamptz, integer);
drop function public.create_client(jsonb, jsonb, jsonb);

create function public.assign_cards(
  p_card_ids uuid[],
  p_organization_id uuid,
  p_location_id uuid,
  p_target_id uuid,
  p_activated_at timestamptz
)
returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_wanted integer := (select count(distinct id) from unnest(p_card_ids) as id);
  v_found integer;
  v_free integer;
begin
  perform 1 from public.cards where id = any (p_card_ids) order by id for update;

  select count(*), count(*) filter (where status = 'UNASSIGNED')
    into v_found, v_free
    from public.cards where id = any (p_card_ids);
  if v_found <> v_wanted then return 'NOT_FOUND'; end if;
  if v_free <> v_found then return 'NOT_UNASSIGNED'; end if;

  update public.cards
     set organization_id = p_organization_id,
         location_id = p_location_id,
         employee_id = null,
         target_id = p_target_id,
         status = 'ACTIVE',
         activated_at = p_activated_at
   where id = any (p_card_ids);
  return 'OK';
end;
$$;

create function public.create_client(
  p_organization jsonb,
  p_locations jsonb
)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_org_id uuid;
  v_location_id uuid;
  v_location jsonb;
begin
  insert into public.organizations (name, contact_name, contact_phone, contact_email, timezone)
    values (
      p_organization ->> 'name',
      p_organization ->> 'contactName',
      p_organization ->> 'contactPhone',
      p_organization ->> 'contactEmail',
      coalesce(p_organization ->> 'timezone', 'Asia/Almaty')
    )
    returning id into v_org_id;

  for v_location in select * from jsonb_array_elements(p_locations) loop
    insert into public.locations (organization_id, name, address, twogis_firm_id, twogis_profile_url)
      values (
        v_org_id,
        v_location ->> 'name',
        v_location ->> 'address',
        v_location ->> 'twogisFirmId',
        v_location ->> 'twogisProfileUrl'
      )
      returning id into v_location_id;
    if v_location ->> 'reviewsTargetUrl' is not null then
      insert into public.redirect_targets (organization_id, location_id, type, url, is_verified)
        values (v_org_id, v_location_id, 'TWOGIS_REVIEW', v_location ->> 'reviewsTargetUrl', true);
    end if;
  end loop;
  return v_org_id;
end;
$$;

create function public.delete_batch(p_batch_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_platform_admin() then
    raise exception 'delete_batch: only administrators' using errcode = '42501';
  end if;

  perform 1 from public.card_batches where id = p_batch_id for update;
  if not found then return 'NOT_FOUND'; end if;

  if exists (
    select 1 from public.cards c
    where c.batch_id = p_batch_id
      and (c.status <> 'UNASSIGNED'
           or exists (select 1 from public.tap_events e where e.card_id = c.id)
           or exists (select 1 from public.daily_card_stats s where s.card_id = c.id))
  ) then
    return 'IN_USE';
  end if;

  delete from public.cards where batch_id = p_batch_id;
  delete from public.card_batches where id = p_batch_id;
  return 'OK';
end;
$$;

revoke execute on function public.assign_cards, public.delete_batch, public.create_client from public, anon;
grant execute on function public.assign_cards, public.delete_batch, public.create_client to authenticated, service_role;
