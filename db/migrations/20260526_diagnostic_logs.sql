create table if not exists diagnostic_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  correlation_id text not null,
  source        text not null,
  step          text not null,
  status        text not null,
  duration_ms   integer,
  employee_id   text,
  company_id    text,
  user_id       text,
  user_role     text,
  http_status   integer,
  error_code    text,
  detail        jsonb
);

create index on diagnostic_logs (correlation_id);
create index on diagnostic_logs (created_at desc);
