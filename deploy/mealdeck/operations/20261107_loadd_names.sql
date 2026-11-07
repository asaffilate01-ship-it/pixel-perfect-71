-- Owner instruction, 7 November 2026: rename only these Load'd dishes.
-- Preserve stable product/modifier IDs, prices, descriptions and historical orders.
do $loadd_name_update$
declare
  item_row record;
  option_row record;
  updated_items integer := 0;
  updated_options integer := 0;
  scope_tenant constant uuid := '94f97f02-70ec-445a-87a4-b51c0956d193';
  scope_brand constant uuid := 'aa39b159-7e65-49b4-9cc0-2d73b9cf964f';
  scope_location constant uuid := 'a0ba64ac-e268-44d3-8345-fce8d24999b6';
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','15s',true);
  if to_regnamespace('dishbee_private') is not null or not exists(
    select 1 from mealdeck_private.installation
      where singleton and profile='mealdeck-independent-v1' and business_id=scope_tenant
  ) then raise exception 'mealdeck_loadd_wrong_database'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')
  ) then raise exception 'mealdeck_loadd_database_owner_required'; end if;

  for item_row in
    select i.*, requested.old_name, requested.new_name
    from public.menu_items i
    join (values
      ('loadd-loaded-fries-king-of-hearts','King of Hearts','Royal Flush'),
      ('loadd-loaded-fries-queen-of-hearts','Queen of Hearts','Double Deck'),
      ('loadd-loaded-fries-jack-of-diamonds','Jack of Diamonds','All In'),
      ('loadd-loaded-fries-king-of-spades','King of Spades','The Jackpot'),
      ('loadd-full-house-king-of-hearts','King of Hearts','Royal Flush'),
      ('loadd-full-house-queen-of-hearts','Queen of Hearts','Double Deck'),
      ('loadd-full-house-jack-of-diamonds','Jack of Diamonds','All In'),
      ('loadd-full-house-king-of-spades','King of Spades','The Jackpot')
    ) requested(sku,old_name,new_name) on requested.sku=i.sku
    where i.tenant_id=scope_tenant and i.brand_id=scope_brand
    order by i.id for update of i
  loop
    if item_row.name not in (item_row.old_name,item_row.new_name) then
      raise exception 'mealdeck_loadd_name_changed_review_required: %',item_row.sku;
    end if;
    if item_row.name<>item_row.new_name then
      update public.menu_items set name=item_row.new_name
        where id=item_row.id and tenant_id=scope_tenant and brand_id=scope_brand;
      insert into public.mealdeck_ops_audit_log(
        tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
      ) values(
        scope_tenant,scope_location,null,'menu.owner_name_revision','menu_item',item_row.id,
        jsonb_build_object('name',item_row.name,'sku',item_row.sku),
        jsonb_build_object('name',item_row.new_name,'sku',item_row.sku,
          'reason','Owner requested four Load’d dish renames on 7 November 2026; all other product fields preserved.')
      );
    end if;
    updated_items:=updated_items+1;
  end loop;
  if updated_items<>8 then raise exception 'mealdeck_loadd_expected_eight_items'; end if;

  for option_row in
    select o.*, requested.old_name, requested.new_name
    from public.modifier_options o
    join (values
      ('81930bed-9cd7-5712-b8b1-2b4eb12b6eb6','King of Hearts · Loaded Fries','Royal Flush · Loaded Fries'),
      ('808ed3cd-27c7-501b-839e-9d373d5414da','Queen of Hearts · Loaded Fries','Double Deck · Loaded Fries'),
      ('28b9b002-4d30-5616-9693-81c093962acf','Jack of Diamonds · Loaded Fries','All In · Loaded Fries'),
      ('392534b4-aef3-5655-b0d8-13cea3d1c4f5','King of Spades · Loaded Fries','The Jackpot · Loaded Fries')
    ) requested(id,old_name,new_name) on requested.id::uuid=o.id
    where o.tenant_id=scope_tenant and o.group_id='1edd44f3-f0dd-5cec-80ad-cf3f488a350d'
    order by o.id for update of o
  loop
    if option_row.name not in (option_row.old_name,option_row.new_name) then
      raise exception 'mealdeck_loadd_replacement_name_changed_review_required';
    end if;
    if option_row.name<>option_row.new_name then
      update public.modifier_options set name=option_row.new_name
        where id=option_row.id and tenant_id=scope_tenant;
      insert into public.mealdeck_ops_audit_log(
        tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
      ) values(
        scope_tenant,scope_location,null,'menu.owner_name_revision','modifier_option',option_row.id,
        jsonb_build_object('name',option_row.name),
        jsonb_build_object('name',option_row.new_name,
          'reason','Keep the same Load’d product names in named meal replacements; all prices and IDs preserved.')
      );
    end if;
    updated_options:=updated_options+1;
  end loop;
  if updated_options<>4 then raise exception 'mealdeck_loadd_expected_four_replacements'; end if;
end $loadd_name_update$;

