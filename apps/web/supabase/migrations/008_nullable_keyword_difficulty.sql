alter table keyword_opportunities
  alter column keyword_difficulty drop default,
  alter column keyword_difficulty drop not null;

alter table competitor_recommendations
  alter column keyword_difficulty drop default,
  alter column keyword_difficulty drop not null;

notify pgrst, 'reload schema';
