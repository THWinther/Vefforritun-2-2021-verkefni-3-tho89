import express from 'express';
import bodyParser from 'body-parser';
import { body, check, validationResult } from 'express-validator';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import sanitize from 'sanitize';

dotenv.config();

const nationalIdPattern = '^[0-9]{6}-?[0-9]{4}$';

const app = express();

app.locals.importantize = (str) => (`${str}!`);

app.set('views', path.join(path.dirname(''), '/views'));
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const hostname = process.env.HOST;
const port = process.env.PORT;
const linkName = `${hostname}:${port}`;

app.locals.signature = [];

app.get('/page:id', async (req, res) => {
  try {
    const laug = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      /* ssl: { rejectUnauthorized: false }, */
    });

    let pageNr = 0;

    try {
      pageNr = Number.parseInt(req.params.id);
    } catch (e) {
      app.locals.error = 'invalid pageNr';
      return res.render('index', {
        pageNr: 0,
      });
    }

    const page = [50 * (Math.floor(req.params.id) - 1)];
    if (page[0] < 0) page[0] = 0;

    const client = await laug.connect();
    const result = await client.query('SELECT signatures.date, signatures.ssn, signatures.name, signatures.comment, signatures.list FROM signatures ORDER BY id OFFSET $1 LIMIT 50;', page);
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
      pageNr,
    });
  }
});

app.get('/', (req, res) => res.redirect('/page1'));

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
    const {
      name = '',
      ssn = '',
      comment = '',
    } = req.body;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((i) => i.msg);
      console.log(errorMessages);
      app.locals.error = errorMessages[0];
      return res.render('index', { pageNr });
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
        /* ssl: { rejectUnauthorized: false }, */
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
