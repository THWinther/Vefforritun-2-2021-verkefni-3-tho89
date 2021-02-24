DROP TABLE IF EXISTS signatures;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users(
  id serial primary key,
  username varchar(128),
  password varchar(128),
  admin int default 0
);

CREATE TABLE IF NOT EXISTS signatures(
  id serial primary key,
  name varchar(128) not null,
  ssn varchar(10) not null unique,
  comment varchar(1024) not null,
  list text not null,
  date timestamp with time zone not null default current_timestamp
);

INSERT INTO users(username,password,admin)  VALUES ('Admin','Admin',1);