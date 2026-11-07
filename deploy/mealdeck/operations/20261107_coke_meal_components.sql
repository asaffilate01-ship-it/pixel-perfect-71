-- Add only the two reviewed Skorch Coke options to included meal summaries.
-- Apply after the frozen meal-components extension; preserve all historical rows,
-- receipt jobs, function permissions and the existing projection logic.
do $coke_meal_components$
declare
  helper_hash text; helper_acl aclitem[]; helper_owner oid;
  v_tenant uuid;
begin
  perform set_config('lock_timeout','5s',true);
  perform set_config('statement_timeout','15s',true);
  if to_regnamespace('dishbee_private') is not null then
    raise exception 'mealdeck_coke_components_wrong_database'; end if;
  select business_id into v_tenant from mealdeck_private.installation
    where singleton and profile='mealdeck-independent-v1';
  if not found or v_tenant is null then
    raise exception 'mealdeck_coke_components_independent_profile_required'; end if;
  if current_user in ('anon','authenticated','service_role') or not exists(
    select 1 from pg_class where oid='mealdeck_private.installation'::regclass
      and pg_has_role(current_user,relowner,'USAGE')
  ) then raise exception 'mealdeck_coke_components_database_owner_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'mealdeck-coke-meal-components-20261107:'||v_tenant::text,0));
  select md5(prosrc),proacl,proowner into helper_hash,helper_acl,helper_owner
    from pg_proc where oid=to_regprocedure('mealdeck_private.meal_components(uuid,jsonb)')
      and prosecdef and proconfig=array['search_path=""']
      and provolatile='i' and proparallel='u' and not proleakproof and not proisstrict
      and prorettype='jsonb'::regtype and not proretset;
  if helper_hash is null or helper_hash not in
    ('5f46ada643542e03e8b56fd8fe8d6205','0b7cb68775502267606c64ffaf064a83')
  then raise exception 'mealdeck_coke_components_reviewed_function_required'; end if;
  if helper_hash='0b7cb68775502267606c64ffaf064a83' then return; end if;

  execute $reviewed_components_definition$
CREATE OR REPLACE FUNCTION mealdeck_private.meal_components(p_tenant uuid, p_line jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare manifest constant jsonb:='{"version":1,"items":[{"sku":"tavo-chicken-burgers-cruncher","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-burgers-twin-crunch","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-burgers-flame","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-burgers-big-flame","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-fried-chicken-wings-fried-chicken-wings","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-fried-chicken-tenders-fried-chicken-tenders","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-grilled-chicken-wings-grilled-chicken-wings","kind":"adult","mealGroup":"tavo-chicken-make-it-a-meal","upgradeGroup":"tavo-chicken-meal-upgrades","drinkGroup":"tavo-chicken-included-meal-drink","sideGroup":null},{"sku":"tavo-chicken-kids-meals-little-jacks-nugget-meal","kind":"kids","mealGroup":null,"upgradeGroup":"tavo-chicken-kids-meal-upgrades","drinkGroup":"tavo-chicken-kids-included-drink","sideGroup":null},{"sku":"skorch-burgers-beef-smash-deck-the-ace","kind":"adult","mealGroup":"skorch-burgers-make-it-a-meal","upgradeGroup":"skorch-burgers-meal-upgrades","drinkGroup":"skorch-burgers-included-meal-drink","sideGroup":null},{"sku":"skorch-burgers-beef-smash-deck-double-deal","kind":"adult","mealGroup":"skorch-burgers-make-it-a-meal","upgradeGroup":"skorch-burgers-meal-upgrades","drinkGroup":"skorch-burgers-included-meal-drink","sideGroup":null},{"sku":"skorch-burgers-beef-smash-deck-triple-stack","kind":"adult","mealGroup":"skorch-burgers-make-it-a-meal","upgradeGroup":"skorch-burgers-meal-upgrades","drinkGroup":"skorch-burgers-included-meal-drink","sideGroup":null},{"sku":"skorch-burgers-beef-smash-deck-four-of-a-kind","kind":"adult","mealGroup":"skorch-burgers-make-it-a-meal","upgradeGroup":"skorch-burgers-meal-upgrades","drinkGroup":"skorch-burgers-included-meal-drink","sideGroup":null},{"sku":"skorch-burgers-kids-meal-little-jacks-nuggets-meal","kind":"kids","mealGroup":null,"upgradeGroup":"skorch-burgers-kids-meal-upgrades","drinkGroup":"skorch-burgers-kids-included-drink","sideGroup":null},{"sku":"souvano-stir-fry-donner-stir-fry-donner","kind":"side","sideGroup":"souvano-meal-side","mealGroup":null,"upgradeGroup":null,"drinkGroup":null},{"sku":"souvano-heatwave-heatwave","kind":"side","sideGroup":"souvano-heatwave-base","mealGroup":null,"upgradeGroup":null,"drinkGroup":null},{"sku":"souvano-lamb-chops-lamb-chops","kind":"side","sideGroup":"souvano-meal-side","mealGroup":null,"upgradeGroup":null,"drinkGroup":null}],"options":[{"group":"tavo-chicken-make-it-a-meal","option":"tavo-chicken-make-it-a-meal-make-it-a-meal","role":"meal","replacement":false,"kind":"source"},{"group":"tavo-chicken-meal-upgrades","option":"tavo-chicken-meal-upgrades-peri-salt","role":"peri","replacement":false,"kind":"source"},{"group":"tavo-chicken-meal-upgrades","option":"tavo-chicken-meal-upgrades-loaded-fries-upgrade","role":"side","replacement":true,"kind":"source"},{"group":"tavo-chicken-meal-upgrades","option":"tavo-chicken-meal-upgrades-loaded-mac-n-cheese-upgrade","role":"side","replacement":true,"kind":"source"},{"group":"tavo-chicken-meal-upgrades","option":"tavo-chicken-meal-upgrades-mocktail-upgrade","role":"drink","replacement":true,"kind":"source"},{"group":"tavo-chicken-meal-upgrades","option":"tavo-chicken-meal-upgrades-milkshake-upgrade","role":"drink","replacement":true,"kind":"source"},{"group":"tavo-chicken-kids-meal-upgrades","option":"tavo-chicken-kids-meal-upgrades-peri-salt","role":"peri","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-meal-upgrades","option":"tavo-chicken-kids-meal-upgrades-loaded-fries-upgrade","role":"side","replacement":true,"kind":"source"},{"group":"tavo-chicken-kids-meal-upgrades","option":"tavo-chicken-kids-meal-upgrades-loaded-mac-n-cheese-upgrade","role":"side","replacement":true,"kind":"source"},{"group":"tavo-chicken-kids-meal-upgrades","option":"tavo-chicken-kids-meal-upgrades-mocktail-upgrade","role":"drink","replacement":true,"kind":"source"},{"group":"tavo-chicken-kids-meal-upgrades","option":"tavo-chicken-kids-meal-upgrades-milkshake-upgrade","role":"drink","replacement":true,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-coke","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-pepsi-max","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-tango-apple","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-miranda-orange","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-miranda-strawberry","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-barr-limeade","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-included-meal-drink","option":"tavo-chicken-included-meal-drink-water-bottle","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-coke","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-pepsi-max","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-tango-apple","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-miranda-orange","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-miranda-strawberry","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-barr-limeade","role":"drink","replacement":false,"kind":"source"},{"group":"tavo-chicken-kids-included-drink","option":"tavo-chicken-kids-included-drink-water-bottle","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-make-it-a-meal","option":"skorch-burgers-make-it-a-meal-make-it-a-meal","role":"meal","replacement":false,"kind":"source"},{"group":"skorch-burgers-meal-upgrades","option":"skorch-burgers-meal-upgrades-peri-salt","role":"peri","replacement":false,"kind":"source"},{"group":"skorch-burgers-meal-upgrades","option":"skorch-burgers-meal-upgrades-loaded-fries","role":"side","replacement":true,"kind":"source"},{"group":"skorch-burgers-meal-upgrades","option":"skorch-burgers-meal-upgrades-loaded-mac-n-cheese","role":"side","replacement":true,"kind":"source"},{"group":"skorch-burgers-meal-upgrades","option":"skorch-burgers-meal-upgrades-mocktail","role":"drink","replacement":true,"kind":"source"},{"group":"skorch-burgers-meal-upgrades","option":"skorch-burgers-meal-upgrades-milkshake","role":"drink","replacement":true,"kind":"source"},{"group":"skorch-burgers-kids-meal-upgrades","option":"skorch-burgers-kids-meal-upgrades-peri-salt","role":"peri","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-meal-upgrades","option":"skorch-burgers-kids-meal-upgrades-loaded-fries","role":"side","replacement":true,"kind":"source"},{"group":"skorch-burgers-kids-meal-upgrades","option":"skorch-burgers-kids-meal-upgrades-loaded-mac-n-cheese","role":"side","replacement":true,"kind":"source"},{"group":"skorch-burgers-kids-meal-upgrades","option":"skorch-burgers-kids-meal-upgrades-mocktail","role":"drink","replacement":true,"kind":"source"},{"group":"skorch-burgers-kids-meal-upgrades","option":"skorch-burgers-kids-meal-upgrades-milkshake","role":"drink","replacement":true,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-coke","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-pepsi","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-pepsi-max","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-tango-orange","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-tango-apple","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-rubicon-mango","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-7up","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-included-meal-drink","option":"skorch-burgers-included-meal-drink-water-bottle","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-coke","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-pepsi","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-pepsi-max","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-tango-orange","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-tango-apple","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-rubicon-mango","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-7up","role":"drink","replacement":false,"kind":"source"},{"group":"skorch-burgers-kids-included-drink","option":"skorch-burgers-kids-included-drink-water-bottle","role":"drink","replacement":false,"kind":"source"},{"group":"souvano-meal-side","option":"souvano-meal-side-fries","role":"side","replacement":false,"kind":"source"},{"group":"souvano-meal-side","option":"souvano-meal-side-rice","role":"side","replacement":false,"kind":"source"},{"group":"souvano-meal-side","option":"souvano-meal-side-naan","role":"side","replacement":false,"kind":"source"},{"group":"souvano-heatwave-base","option":"souvano-heatwave-base-fries","role":"side","replacement":false,"kind":"source"},{"group":"souvano-heatwave-base","option":"souvano-heatwave-base-fragrant-spicy-rice","role":"side","replacement":false,"kind":"source"},{"group":"souvano-heatwave-base","option":"souvano-heatwave-base-naan","role":"side","replacement":false,"kind":"source"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-fries-king-of-hearts","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-fries-queen-of-hearts","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-fries-jack-of-diamonds","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-fries-king-of-spades","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-mac-cheese-ace-mac","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-mac-cheese-jacks-mac","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-mac-cheese-diamond-melt","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-mac-cheese-spade-stack","role":"side","replacement":true,"kind":"cross"},{"group":"cross-side-replacement","option":"cross-side-replacement-loadd-loaded-mac-cheese-kings-mac","role":"side","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-virgin-mojito","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-mango-mirage","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-lychee-breeze","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-apple-rush","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-blue-wave","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-strawberry-splash","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-passion-paradise","role":"drink","replacement":true,"kind":"cross"},{"group":"cross-drink-replacement","option":"cross-drink-replacement-moktl-mocktail-lounge-rush-hour","role":"drink","replacement":true,"kind":"cross"}]}'::jsonb;
  item jsonb;selection jsonb;matched jsonb:='[]';sides jsonb;drinks jsonb;components jsonb:='[]';
  name text;character integer;code integer;peri_count integer;meal_count integer;related_count integer;
begin
  if p_tenant is null or jsonb_typeof(p_line) is distinct from 'object'
    or p_line->>'parentLineId' is not null
    or jsonb_typeof(p_line->'modifiers') is distinct from 'array'
    or jsonb_array_length(p_line->'modifiers')>100 then return '[]'::jsonb; end if;
  select value into item from jsonb_array_elements(manifest->'items')
    where value->>'sku'=p_line->>'sku';
  if item is null then return '[]'::jsonb; end if;
  for selection in
    select m||jsonb_build_object('role',b->>'role','replacement',b->'replacement')
    from jsonb_array_elements(p_line->'modifiers') m
    join jsonb_array_elements(manifest->'options') b
      on m->>'id'=extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:option:'||(b->>'option'))::text
      and m->>'group_id'=extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(b->>'group'))::text
      and m->>'kind'=b->>'kind'
    where (b->>'kind'='source' and b->>'group' in (
      item->>'mealGroup',item->>'upgradeGroup',item->>'drinkGroup',item->>'sideGroup'))
      or (b->>'kind'='cross' and item->>'kind' in ('adult','kids'))
  loop
    -- These reviewed choices represent one component per parent. Unknown legacy
    -- quantities or unsafe labels are left in the original choices, not guessed.
    if selection->>'quantity_per_parent' is distinct from '1'
      or jsonb_typeof(selection->'name') is distinct from 'string' then return '[]'::jsonb; end if;
    name:=selection->>'name';
    if char_length(name) not between 1 and 1000 or name is distinct from btrim(name,
      U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') then
      return '[]'::jsonb; end if;
    for character in 1..char_length(name) loop
      code:=ascii(substr(name,character,1));
      if code between 0 and 31 or code between 127 and 159 or code between 55296 and 57343
        or code in (173,1564,1757,1807,2274,6158,65279,69821,69837,917505)
        or code between 1536 and 1541 or code between 2192 and 2193
        or code between 8203 and 8207 or code between 8234 and 8238
        or code between 8288 and 8292 or code between 8294 and 8303
        or code between 65529 and 65531 or code between 78896 and 78911
        or code between 113824 and 113827 or code between 119155 and 119162
        or code between 917536 and 917631 then return '[]'::jsonb; end if;
    end loop;
    matched:=matched||jsonb_build_array(selection);
  end loop;
  -- A newer or malformed replacement must not make the old default reappear.
  -- Unknown fulfilment choices keep their original ticket text without an
  -- inferred component summary until their stable identities are reviewed.
  select count(*) into related_count from jsonb_array_elements(p_line->'modifiers') m
    where m->>'kind'='cross' or m->>'group_id' in (
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'mealGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'upgradeGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'drinkGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:'||(item->>'sideGroup'))::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:cross-side-replacement')::text,
      extensions.uuid_generate_v5(p_tenant,'mealdeck-launch-v1:group:cross-drink-replacement')::text);
  if related_count<>jsonb_array_length(matched) then return '[]'::jsonb; end if;
  select count(*) into meal_count from jsonb_array_elements(matched) m where m->>'role'='meal';
  if item->>'kind'='adult' and meal_count<>1 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(m),'[]'::jsonb) into sides from jsonb_array_elements(matched) m where m->>'role'='side';
  select coalesce(jsonb_agg(m),'[]'::jsonb) into drinks from jsonb_array_elements(matched) m where m->>'role'='drink';
  select count(*) into peri_count from jsonb_array_elements(matched) m where m->>'role'='peri';
  if jsonb_array_length(sides)>1 or jsonb_array_length(drinks)>1 or peri_count>1
    or (peri_count=1 and jsonb_array_length(sides)>0) then return '[]'::jsonb; end if;
  if item->>'kind'='side' then
    if jsonb_array_length(sides)<>1 then return '[]'::jsonb; end if;
    return jsonb_build_array(jsonb_build_object('slot','side','name',sides->0->>'name',
      'quantityPerParent',1,'replacement',false));
  end if;
  if item->>'kind'='kids' then
    components:=jsonb_build_array(jsonb_build_object('slot','main','name','6 nuggets',
      'quantityPerParent',1,'replacement',false));
  end if;
  components:=components||jsonb_build_array(jsonb_build_object('slot','side',
    'name',case when jsonb_array_length(sides)=1 then sides->0->>'name'
      when peri_count=1 then 'Fries with peri salt' else 'Fries' end,
    'quantityPerParent',1,'replacement',jsonb_array_length(sides)=1));
  if jsonb_array_length(drinks)=1 then
    components:=components||jsonb_build_array(jsonb_build_object('slot','drink','name',drinks->0->>'name',
      'quantityPerParent',1,'replacement',drinks->0->'replacement'));
  end if;
  return components;
end $function$
$reviewed_components_definition$;
  if not exists(select 1 from pg_proc
    where oid=to_regprocedure('mealdeck_private.meal_components(uuid,jsonb)')
      and md5(prosrc)='0b7cb68775502267606c64ffaf064a83'
      and proacl is not distinct from helper_acl and proowner=helper_owner
      and prosecdef and proconfig=array['search_path=""']
      and provolatile='i' and proparallel='u' and not proleakproof and not proisstrict
      and prorettype='jsonb'::regtype and not proretset)
  then raise exception 'mealdeck_coke_components_verification_failed'; end if;

  insert into public.mealdeck_ops_audit_log(
    tenant_id,location_id,actor_id,action,entity_type,entity_id,previous_value,next_value
  ) values(
    v_tenant,null,null,'catalogue.coke_meal_components','catalogue',v_tenant,
    jsonb_build_object('mealComponentsBodyMd5',helper_hash),
    jsonb_build_object(
      'mealComponentsBodyMd5','0b7cb68775502267606c64ffaf064a83',
      'addedIncludedOptions',jsonb_build_array(
        'skorch-burgers-included-meal-drink-coke','skorch-burgers-kids-included-drink-coke'),
      'reason','Owner-confirmed Coke follows its reviewed stable meal and kids option identities. Existing summaries, purchased snapshots, receipt jobs and permissions preserved.')
  );
end $coke_meal_components$;
