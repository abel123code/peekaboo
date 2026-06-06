create table if not exists agent_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null default 'AEO Agent Chat',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_conversations_client_updated
  on agent_conversations(client_id, updated_at desc);

create index if not exists idx_agent_messages_conversation_created
  on agent_messages(conversation_id, created_at asc);

drop trigger if exists set_agent_conversations_updated_at on agent_conversations;
create trigger set_agent_conversations_updated_at
before update on agent_conversations
for each row execute function set_updated_at();

notify pgrst, 'reload schema';
