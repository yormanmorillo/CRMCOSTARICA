import { Pool } from 'pg';

type Conn = {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<void>;
};

// Las fechas se guardan como texto AAAA-MM-DD para evitar problemas de zona horaria.
const SCHEMA = `
create table if not exists usuarios (
  id text primary key,
  email text unique not null,
  nombre text not null,
  rol text not null default 'vendedor',
  hash text not null,
  creado timestamptz not null default now()
);
create table if not exists leads (
  id text primary key,
  nombre text not null default '',
  tel text not null default '',
  email text not null default '',
  canal text not null default 'otro',
  tipo text not null default 'cr',
  cedula text not null default '',
  provincia text not null default '',
  pais text not null default '',
  pasaporte text not null default '',
  interes text not null default '',
  etapa text not null default 'nuevo',
  llegada text not null default '',
  aviso_dias int not null default 5,
  avisado boolean not null default false,
  creado text not null,
  auto boolean not null default false,
  cw_contact_id text,
  cw_conversation_id text,
  cw_inbox_id text,
  actualizado timestamptz not null default now()
);
create unique index if not exists leads_cw_contact_uidx on leads (cw_contact_id) where cw_contact_id is not null;
create table if not exists atenciones (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  fecha text not null,
  canal text not null default '',
  nota text not null default '',
  auto boolean not null default false,
  creado timestamptz not null default now()
);
create index if not exists atenciones_lead_idx on atenciones (lead_id);
create table if not exists tareas (
  id text primary key,
  lead_id text references leads(id) on delete cascade,
  titulo text not null,
  fecha text not null,
  hora text not null default '',
  hecha boolean not null default false,
  creado timestamptz not null default now()
);
create table if not exists archivos (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  nombre text not null,
  data text not null,
  creado timestamptz not null default now()
);
create index if not exists archivos_lead_idx on archivos (lead_id);
create table if not exists mensajes (
  id text primary key,
  n bigserial,
  lead_id text not null references leads(id) on delete cascade,
  cw_message_id text unique,
  cw_conversation_id text,
  direccion text not null,
  texto text not null default '',
  autor text not null default '',
  adjuntos jsonb not null default '[]'::jsonb,
  creado timestamptz not null default now()
);
create index if not exists mensajes_lead_idx on mensajes (lead_id, creado);
create table if not exists ajustes (
  clave text primary key,
  valor text not null
);
alter table leads add column if not exists chat_canal text;
alter table leads add column if not exists chat_id text;
create unique index if not exists leads_chat_uidx on leads (chat_canal, chat_id) where chat_id is not null;
alter table mensajes add column if not exists meta_id text;
alter table mensajes add column if not exists estado text not null default '';
alter table mensajes add column if not exists asunto text not null default '';
alter table mensajes add column if not exists canal text not null default '';
create unique index if not exists mensajes_meta_uidx on mensajes (meta_id) where meta_id is not null;
create table if not exists medios (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  mime text not null,
  nombre text not null default '',
  data text not null,
  creado timestamptz not null default now()
);
create index if not exists medios_lead_idx on medios (lead_id);
alter table leads add column if not exists etapa_en timestamptz not null default now();
alter table leads add column if not exists motivo_id text;
alter table leads add column if not exists motivo_nota text not null default '';
alter table leads add column if not exists perdido_en timestamptz;
alter table leads add column if not exists asignado text;
alter table leads add column if not exists etiquetas jsonb not null default '[]'::jsonb;
alter table leads add column if not exists destacado boolean not null default false;
alter table leads add column if not exists empresa text not null default '';
create table if not exists etapas (
  clave text primary key,
  nombre text not null,
  orden int not null default 0,
  color text not null default 'accent',
  tipo text not null default 'abierta'
);
insert into etapas(clave, nombre, orden, color, tipo)
  select * from (values
    ('nuevo', 'Nuevo', 1, 'accent', 'inicial'),
    ('contactado', 'Contactado', 2, 'fb', 'abierta'),
    ('cotizado', 'Cotización enviada', 3, 'warn', 'abierta'),
    ('negociacion', 'Negociación', 4, 'vio', 'abierta'),
    ('ganado', 'Ganado', 5, 'ok', 'ganada'),
    ('perdido', 'Perdido', 6, 'muted', 'perdida')
  ) v(clave, nombre, orden, color, tipo)
  where not exists (select 1 from etapas);
create table if not exists motivos_perdida (
  id text primary key,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true
);
insert into motivos_perdida(id, nombre, orden)
  select * from (values
    ('m-caro', 'Le pareció muy caro', 1),
    ('m-competencia', 'Se fue con la competencia', 2),
    ('m-sin-respuesta', 'Dejó de responder', 3),
    ('m-fechas', 'Cambió de fechas o de planes', 4),
    ('m-disponibilidad', 'No había disponibilidad', 5),
    ('m-info', 'Solo pedía información', 6),
    ('m-otro', 'Otro motivo', 7)
  ) v(id, nombre, orden)
  where not exists (select 1 from motivos_perdida);
create table if not exists productos (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  precio numeric(14,2) not null default 0,
  moneda text not null default 'CRC',
  activo boolean not null default true,
  creado timestamptz not null default now()
);
create table if not exists lead_productos (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  producto_id text,
  nombre text not null,
  cantidad numeric(12,2) not null default 1,
  precio numeric(14,2) not null default 0,
  moneda text not null default 'CRC',
  creado timestamptz not null default now()
);
create index if not exists lead_productos_lead_idx on lead_productos (lead_id);
create table if not exists notas (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  usuario text not null default '',
  usuario_id text,
  texto text not null,
  creado timestamptz not null default now()
);
create index if not exists notas_lead_idx on notas (lead_id);
create table if not exists actividad (
  n bigserial primary key,
  lead_id text not null references leads(id) on delete cascade,
  tipo text not null default '',
  texto text not null default '',
  usuario text not null default '',
  creado timestamptz not null default now()
);
create index if not exists actividad_lead_idx on actividad (lead_id, n);
create table if not exists lead_etapas (
  n bigserial primary key,
  lead_id text not null references leads(id) on delete cascade,
  etapa text not null,
  entrada timestamptz not null default now()
);
create index if not exists lead_etapas_lead_idx on lead_etapas (lead_id, n);
create or replace function lead_etapa_hist() returns trigger as $fn$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    insert into lead_etapas(lead_id, etapa) values (new.id, new.etapa);
  end if;
  return new;
end
$fn$ language plpgsql;
drop trigger if exists lead_etapa_trg on leads;
create trigger lead_etapa_trg after insert or update of etapa on leads for each row execute function lead_etapa_hist();
insert into lead_etapas(lead_id, etapa, entrada)
  select l.id, l.etapa, coalesce(l.etapa_en, now()) from leads l
  where not exists (select 1 from lead_etapas h where h.lead_id = l.id);
create table if not exists eventos_cw (
  id serial primary key,
  evento text,
  payload jsonb,
  resultado text,
  creado timestamptz not null default now()
);
`;

async function open(): Promise<Conn> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 3 });
    return {
      query: async (sql, params) => {
        const r = await pool.query(sql, params);
        return { rows: r.rows };
      },
      exec: async (sql) => {
        await pool.query(sql);
      },
    };
  }
  if (process.env.VERCEL) {
    throw new Error('Falta la variable DATABASE_URL. Conecta una base de datos Postgres al proyecto en Vercel.');
  }
  // Desarrollo local sin configurar nada: base de datos embebida en la carpeta .data
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync } = await import('node:fs');
  const dir = process.env.PGLITE_DIR || '.data/pglite';
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  return {
    query: async (sql, params) => {
      const r: any = await db.query(sql, params);
      return { rows: r.rows };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
  };
}

const G = globalThis as any;

function conn(): Promise<Conn> {
  if (!G.__pulsoDb) {
    const p = (async () => {
      const c = await open();
      await c.exec(SCHEMA);
      return c;
    })();
    p.catch(() => {
      G.__pulsoDb = null;
    });
    G.__pulsoDb = p;
  }
  return G.__pulsoDb;
}

export async function q(sql: string, params: any[] = []): Promise<any[]> {
  const c = await conn();
  const r = await c.query(sql, params);
  return r.rows;
}
