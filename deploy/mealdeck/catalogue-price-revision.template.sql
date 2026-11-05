-- Template only. Generated after the insert-only import in the same transaction.
-- The import has already checked owner identity, independent profile, tenant,
-- kitchen and the closed channel, and holds locks on the affected catalogue.
do __BLOCK_TAG__
declare
  v_tenant constant uuid := __TARGET_TENANT_UUID__::uuid;
  v_location constant uuid := __TARGET_KITCHEN_UUID__::uuid;
  v_source constant jsonb := __SOURCE_JSON_SQL_LITERAL__::jsonb;
  v_baseline constant jsonb := __BASELINE_JSON_SQL_LITERAL__::jsonb;
  v_source_hash constant text := __SOURCE_SHA256_SQL_LITERAL__;
  v_item jsonb; v_previous jsonb; v_group jsonb; v_option jsonb;
  v_row record; v_rule record;
  v_new_price integer; v_previous_price integer;
  v_all_skus text[]; v_current_skus text[];
  v_retired_skus text[] := '{}';
  v_changes jsonb := '[]'::jsonb;
  v_item_count integer := 0; v_option_count integer := 0;
  v_group_links_removed integer := 0; v_changed integer;
begin
  -- One reviewed revision, once. Administrator edits made after it survive
  -- every rerun; a mutable source file cannot overwrite a completed revision.
  if exists(select 1 from public.mealdeck_ops_audit_log a where a.tenant_id=v_tenant
      and a.action='catalogue.menu_revision'
      and a.next_value->>'priceRevision'=v_source->>'priceRevision') then
    raise notice 'MealDeck menu revision already applied; later administrator edits preserved.';
    return;
  end if;

  select array_agg(i.value->>'id') into v_current_skus
    from jsonb_array_elements(v_source->'brands') b
    cross join lateral jsonb_array_elements(b.value->'sections') s
    cross join lateral jsonb_array_elements(s.value->'items') i;
  select array_agg(i.value->>'id') into v_all_skus
    from jsonb_array_elements(v_baseline->'items') i;
  if exists(select sku from public.menu_items where tenant_id=v_tenant
      and sku=any(v_all_skus || v_current_skus) group by sku having count(*)>1) then
    raise exception 'mealdeck_menu_revision_duplicate_sku';
  end if;

  for v_item in select i.value from jsonb_array_elements(v_source->'brands') b
      cross join lateral jsonb_array_elements(b.value->'sections') s
      cross join lateral jsonb_array_elements(s.value->'items') i loop
    select i.value into v_previous from jsonb_array_elements(v_baseline->'items') i
      where i.value->>'id'=v_item->>'id';
    v_new_price:=(v_item->>'pricePence')::integer;
    v_previous_price:=coalesce((v_previous->>'pricePence')::integer,v_new_price);
    select * into strict v_row from public.menu_items
      where tenant_id=v_tenant and sku=v_item->>'id' for update;
    if v_row.price_pence not in (v_previous_price,v_new_price) then
      raise exception 'mealdeck_menu_revision_item_price_conflict: %',v_item->>'id';
    end if;

    -- A location override must not silently leave a £20 checkout price, nor
    -- overwrite an unrelated administrator override. Only expected old values
    -- are replaced; a different value aborts the complete transaction.
    for v_rule in select * from public.menu_item_channel_rules where tenant_id=v_tenant
        and location_id=v_location and channel_key='mealdeck' and menu_item_id=v_row.id for update loop
      if v_rule.price_override_pence is not null
          and v_rule.price_override_pence not in (v_previous_price,v_new_price) then
        raise exception 'mealdeck_menu_revision_override_conflict: %',v_item->>'id';
      end if;
      if v_rule.price_override_pence is not null and v_rule.price_override_pence<>v_new_price then
        update public.menu_item_channel_rules set price_override_pence=v_new_price
          where tenant_id=v_tenant and location_id=v_location and channel_key='mealdeck'
            and menu_item_id=v_row.id;
        v_changes:=v_changes || jsonb_build_array(jsonb_build_object('kind','channel-price',
          'sku',v_item->>'id','previousPence',v_rule.price_override_pence,'nextPence',v_new_price));
      end if;
    end loop;

    update public.menu_items set price_pence=v_new_price,
      name=case when name=v_previous->>'name' then v_item->>'name' else name end,
      description=case when v_previous is not null and description is not distinct from v_previous->>'description'
        then v_item->>'importDescription' else description end
      where id=v_row.id and (price_pence<>v_new_price
        or (name=v_previous->>'name' and name is distinct from v_item->>'name')
        or (v_previous is not null and description is not distinct from v_previous->>'description'
          and description is distinct from v_item->>'importDescription'));
    get diagnostics v_changed=row_count;
    if v_changed>0 then
      v_item_count:=v_item_count+1;
      v_changes:=v_changes || jsonb_build_array(jsonb_build_object('kind','item',
        'sku',v_item->>'id','previousPence',v_row.price_pence,'nextPence',v_new_price,
        'nameUpdated',v_row.name=v_previous->>'name',
        'descriptionUpdated',v_row.description is not distinct from v_previous->>'description'));
    end if;

    -- Remove only obsolete associations from the known previous source. Other
    -- administrator associations are retained. This replaces the grilled wing
    -- Korean BBQ selector with its approved Spicy Honey BBQ selector.
    delete from public.menu_item_modifier_groups l using jsonb_array_elements(v_baseline->'modifierGroups') g
      where l.tenant_id=v_tenant and l.item_id=v_row.id
        and l.group_id=(g.value->>'databaseId')::uuid
        and (v_previous->'optionGroupIds') ? (g.value->>'id')
        and not ((v_item->'canonicalOptionGroupIds') ? (g.value->>'id'));
    get diagnostics v_changed=row_count;
    v_group_links_removed:=v_group_links_removed+v_changed;
  end loop;

  for v_group in select value from jsonb_array_elements(v_source->'modifierGroups') loop
    select g.value into v_previous from jsonb_array_elements(v_baseline->'modifierGroups') g
      where g.value->>'id'=v_group->>'id';
    update public.modifier_groups set
      name=case when name=v_previous->>'name' then v_group->>'name' else name end,
      min_select=case when min_select=(v_previous->>'minSelect')::integer
        then (v_group->>'minSelect')::integer else min_select end,
      max_select=case when max_select=(v_previous->>'maxSelect')::integer
        then (v_group->>'maxSelect')::integer else max_select end
      where tenant_id=v_tenant and id=(v_group->>'databaseId')::uuid
        and ((name=v_previous->>'name' and name<>v_group->>'name')
          or (min_select=(v_previous->>'minSelect')::integer and min_select<>(v_group->>'minSelect')::integer)
          or (max_select=(v_previous->>'maxSelect')::integer and max_select<>(v_group->>'maxSelect')::integer));
    for v_option in select value from jsonb_array_elements(v_group->'options') loop
      select o.value into v_previous from jsonb_array_elements(v_baseline->'modifierGroups') g
        cross join lateral jsonb_array_elements(g.value->'options') o
        where o.value->>'id'=v_option->>'id';
      v_new_price:=(v_option->>'pricePence')::integer;
      v_previous_price:=coalesce((v_previous->>'pricePence')::integer,v_new_price);
      select * into strict v_row from public.modifier_options
        where tenant_id=v_tenant and id=(v_option->>'databaseId')::uuid for update;
      if v_row.price_delta_pence not in (v_previous_price,v_new_price) then
        raise exception 'mealdeck_menu_revision_option_price_conflict: %',v_option->>'id';
      end if;
      update public.modifier_options set price_delta_pence=v_new_price,
        active=case when v_option->>'available'='false' then false else active end,
        name=case when name=v_previous->>'label' then v_option->>'label' else name end
        where id=v_row.id and (price_delta_pence<>v_new_price
          or (name=v_previous->>'label' and name<>v_option->>'label')
          or (v_option->>'available'='false' and active));
      get diagnostics v_changed=row_count;
      if v_changed>0 then
        v_option_count:=v_option_count+1;
        v_changes:=v_changes || jsonb_build_array(jsonb_build_object('kind','option',
          'sourceId',v_option->>'id','previousPence',v_row.price_delta_pence,'nextPence',v_new_price,
          'previousActive',v_row.active,'nextActive',case when v_option->>'available'='false' then false else v_row.active end));
      end if;
    end loop;
  end loop;

  -- Historical orders retain their item IDs. Hide removed drinks and unpriced
  -- Souvano listings instead of deleting products or inventing replacement prices.
  for v_previous in select value from jsonb_array_elements(v_baseline->'items')
      where not (value->>'id'=any(v_current_skus)) loop
    select i.*,b.slug as brand_slug into v_row from public.menu_items i
      join public.tenant_brands b on b.id=i.brand_id and b.tenant_id=i.tenant_id
      where i.tenant_id=v_tenant and i.sku=v_previous->>'id' for update of i;
    if not found then continue; end if;
    if v_row.brand_slug<>v_previous->>'brandId' then
      raise exception 'mealdeck_menu_revision_retired_sku_scope_conflict';
    end if;
    update public.menu_items set active=false where id=v_row.id and active;
    update public.menu_item_channel_rules set visible=false
      where tenant_id=v_tenant and location_id=v_location and channel_key='mealdeck'
        and menu_item_id=v_row.id and visible;
    v_retired_skus:=array_append(v_retired_skus,v_previous->>'id');
  end loop;

  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,next_value
  ) values(v_tenant,v_location,null,'catalogue.menu_revision','catalogue',v_tenant,
    jsonb_build_object('operator','database_owner','priceRevision',v_source->>'priceRevision',
      'sourceSha256',v_source_hash,'approvedOn',v_source->>'approvedOn',
      'itemsUpdated',v_item_count,'optionsUpdated',v_option_count,
      'obsoleteSourceLinksRemoved',v_group_links_removed,'retiredSkus',to_jsonb(v_retired_skus),
      'changes',v_changes,'orderingEnabled',false,'administratorPriceConflicts','abort-transaction'));
  raise notice 'MealDeck reviewed menu revision applied: % items and % options updated; ordering remains closed.',
    v_item_count,v_option_count;
end __BLOCK_TAG__;
