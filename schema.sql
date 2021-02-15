CREATE TABLE IF NOT EXISTS signatures(
  id serial primary key,
  name varchar(128) not null,
  ssn varchar(10) not null unique,
  comment varchar(1024) not null,
  list text not null,
  date timestamp with time zone not null default current_timestamp
);