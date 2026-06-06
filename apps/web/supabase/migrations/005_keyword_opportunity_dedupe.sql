alter table keyword_opportunities
add column if not exists normalized_keyword text;

update keyword_opportunities
set normalized_keyword = regexp_replace(lower(btrim(keyword)), '\s+', ' ', 'g')
where normalized_keyword is null or normalized_keyword = '';

with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by client_id, normalized_keyword
      order by opportunity_score desc, created_at desc, id desc
    ) as row_number
  from keyword_opportunities
  where normalized_keyword is not null
)
delete from keyword_opportunities
using ranked_duplicates
where keyword_opportunities.id = ranked_duplicates.id
  and ranked_duplicates.row_number > 1;

alter table keyword_opportunities
alter column normalized_keyword set not null;

create unique index if not exists idx_keyword_opportunities_client_normalized_keyword
  on keyword_opportunities(client_id, normalized_keyword);

notify pgrst, 'reload schema';
