import express from 'express';
import bodyParser from 'body-parser';
import { body, validationResult } from 'express-validator';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import { Strategy } from 'passport-local';
import passport from 'passport';
import bcrypt from 'bcrypt';

dotenv.config();

const nationalIdPattern = '^[0-9]{6}-?[0-9]{4}$';

const app = express();

app.locals.importantize = (str) => (`${str}!`);

const sessionSecret = 'leyndarmál';
app.use(express.urlencoded({ extended: true }));

app.set('views', path.join(path.dirname(''), '/views'));
app.set('view engine', 'ejs');

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  maxAge: 20 * 1000, // 20 sek
}));

async function strat(username, password, done) {
  try {
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const client = await laug.connect();
    const user = await (await client.query('SELECT users.id, users.username, users.password FROM users;')).rows[0];
    console.log(user);

    bcrypt.compare(password, user.password, (err, result) => {
      if (result) { return done(null, user); }
      return done(null, false);
    });
    // Verður annað hvort notanda hlutur ef lykilorð rétt, eða false
  } catch (err) {
    console.error(err);
    return done(err);
  }
}

passport.use(new Strategy(strat));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const client = await laug.connect();
    const user = await (await client.query('SELECT users.id, users.username, users.password FROM users WHERE users.id=$1;', [id])).rows;
    done(null, user);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  if (req.isAuthenticated()) {
    res.locals.user = req.user;
  }

  next();
});

const hostname = process.env.HOST;
const port = process.env.PORT;
const linkName = `${hostname}:${port}`;

app.locals.signature = [];

app.get('/login', (req, res) => {
  if (req.isAuthenticated())res.redirect('/');
  res.render('login');
});

app.post(
  '/login',

  // Þetta notar strat að ofan til að skrá notanda inn
  passport.authenticate('local', {
    failureMessage: 'Notandanafn eða lykilorð vitlaust.',
    failureRedirect: '/login',
  }),

  // Ef við komumst hingað var notandi skráður inn, senda á /admin
  (req, res) => res.redirect('/admin'),
);

app.get('/logout', (req, res) => {
  req.logout();
  app.locals.admin = false;
  return res.redirect('/');
});

app.get('/admin', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  app.locals.admin = true;
  return res.redirect('/');
});

app.post('/delete:id', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.redirect('/login');
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const id = Number.parseInt(req.params.id, 10);
    const client = await laug.connect();
    const result = await client.query('DELETE FROM signatures WHERE signatures.id=$1', [id]);
    console.log(result);
    client.release();
    await laug.end();
  } catch (e) {
    console.error(e);
  }

  return res.redirect('/');
});

app.get('/page:id', async (req, res) => {
  if (req.isAuthenticated()) app.locals.admin = true;
  else app.locals.admin = false;
  try {
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    let pageNr = 0;

    try {
      pageNr = Number.parseInt(req.params.id, 10);
    } catch (e) {
      app.locals.error = 'invalid pageNr';
      return res.render('index', {
        pageNr: 0,
      });
    }

    const page = [50 * (Math.floor(req.params.id) - 1)];
    if (page[0] < 0) page[0] = 0;

    const client = await laug.connect();
    const result = await client.query('SELECT signatures.date, signatures.ssn, signatures.name, signatures.comment, signatures.list, signatures.id FROM signatures ORDER BY id OFFSET $1 LIMIT 50;', page);
    client.release();
    await laug.end();
    app.locals.signature = result.rows;
    app.locals.error = '';
    return res.render('index', {
      pageNr,
    });
  } catch (e) {
    console.error(e);
    app.locals.error = 'parse error';
    return res.render('index', {
      pageNr: 0,
    });
  }
});

app.get('/', async (req, res) => {
  res.redirect('/page1');
});

app.post(
  '/submit-Signature',

  // Þetta er bara validation, ekki sanitization
  body('name')
    .isLength({ min: 1, max: 64 })
    .withMessage('Nafn má ekki vera tómt eða lengra en 64 stafir'),
  body('ssn')
    .isLength({ min: 1 })
    .withMessage('Kennitala má ekki vera tóm'),
  body('comment')
    .isLength({ min: 0, max: 1024 })
    .withMessage('Comment af langt max 1024 stafir'),
  body('ssn')
    .matches(new RegExp(nationalIdPattern))
    .withMessage('Kennitala verður að vera á formi 000000-0000 eða 0000000000'),
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((i) => i.msg);
      const [err] = errorMessages;
      app.locals.error = err;
      return res.render('index', { pageNr: 0 });
    }

    return next();
  },
  /* Nú sanitizeum við gögnin, þessar aðgerðir munu breyta gildum í body.req */
  // Fjarlægja whitespace frá byrjun og enda
  // „Escape“ á gögn, breytir stöfum sem hafa merkingu í t.d. HTML í entity
  // t.d. < í &lt;
  body('name').trim().escape(),
  body('comment').trim().escape(),
  body('list').trim().escape(),

  // Fjarlægjum - úr kennitölu, þó svo við leyfum í innslátt þá viljum við geyma
  // á normalizeruðu formi (þ.e.a.s. allar geymdar sem 10 tölustafir)
  // Hér gætum við viljað breyta kennitölu í heiltölu (int) en... það myndi
  // skemma gögnin okkar, því kennitölur geta byrjað á 0
  body('ssn').blacklist('-'),

  async (req, res) => {
    const {
      name = '',
      ssn = '',
      comment = '',
      list = false,
    } = req.body;

    try {
      const laug = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });

      const signature = [name, ssn, comment, list];
      const client = await laug.connect();
      const insertQuery = 'INSERT INTO signatures(name,ssn,comment,list) VALUES($1,$2,$3,$4) RETURNING *';
      const result = await client.query(insertQuery, signature);
      client.release();
      await laug.end();
      app.locals.signature = result.rows;
      res.redirect('/');
    } catch (e) {
      app.locals.error = 'kennitala í notkun';
      res.redirect('/');
    }
  },
);

app.listen(port, hostname, () => {
  app.locals.hostname = linkName;

  console.log(`Server running at http://${hostname}:${port}/`);
});
