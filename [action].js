const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { handleUpload } = require('@vercel/blob/client');
const { del } = require('@vercel/blob');

const ADMIN = 'tidharhaime142014@gmail.com';
const SECRET = process.env.JWT_SECRET;
const sql = neon(process.env.DATABASE_URL);

let ready;
const init = () => ready || (ready = (async () => {
  await sql`create table if not exists users(id serial primary key, email text unique not null, pw text not null, role text not null default 'user', blocked boolean not null default false)`;
  await sql`create table if not exists albums(id serial primary key, owner_id int references users(id) on delete cascade, title text, artist text, cover_url text default '', songs jsonb default '[]', shared_with text[] default '{}', created_at timestamptz default now())`;
})());

const pub = u => ({ id: String(u.id), email: u.email, role: u.role, blockedFromCreating: u.blocked });
const getUser = async req => {
  try {
    const t = ((req.headers.cookie || '').match(/(?:^|; )token=([^;]+)/) || [])[1];
    const { id } = jwt.verify(t, SECRET);
    return (await sql`select * from users where id=${id}`)[0] || null;
  } catch { return null; }
};
const okUrl = u => typeof u === 'string' && u.startsWith('https://') && u.includes('blob.vercel-storage.com');

module.exports = async (req, res) => {
  const send = (c, o) => res.status(c).json(o);
  try {
    if (!SECRET) return send(500, { error: 'חסר JWT_SECRET ב-Vercel' });
    await init();
    const a = req.query.action, b = req.body || {};

    if (a === 'upload') { // בדיקת הרשאה נעשית בתוך onBeforeGenerateToken
      const out = await handleUpload({
        body: b, request: req,
        onBeforeGenerateToken: async () => {
          const u = await getUser(req);
          if (!u || u.blocked) throw new Error('לא מורשה');
          return { allowedContentTypes: ['audio/*', 'image/*'], maximumSizeInBytes: 100 * 1024 * 1024, addRandomSuffix: true };
        },
        onUploadCompleted: async () => {}
      });
      return send(200, out);
    }

    if (a === 'register' || a === 'login') {
      const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 6) return send(400, { error: 'אימייל לא תקין או סיסמה קצרה מדי (לפחות 6 תווים)' });
      let u;
      if (a === 'register') {
        if ((await sql`select 1 from users where email=${email}`).length) return send(400, { error: 'האימייל כבר רשום, נסה להתחבר' });
        u = (await sql`insert into users(email,pw,role) values(${email},${await bcrypt.hash(pw, 10)},${email === ADMIN ? 'owner' : 'user'}) returning *`)[0];
      } else {
        u = (await sql`select * from users where email=${email}`)[0];
        if (!u || !(await bcrypt.compare(pw, u.pw))) return send(401, { error: 'אימייל או סיסמה שגויים' });
      }
      const token = jwt.sign({ id: u.id }, SECRET, { expiresIn: '30d' });
      res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/${b.remember ? '; Max-Age=2592000' : ''}`);
      return send(200, pub(u));
    }
    if (a === 'logout') {
      res.setHeader('Set-Cookie', 'token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
      return send(200, {});
    }

    const me = await getUser(req);
    if (!me) return send(401, { error: 'לא מחובר' });

    if (a === 'me') return send(200, pub(me));

    if (a === 'albums') {
      const rows = await sql`select a.*, u.email as owner_email from albums a join users u on u.id=a.owner_id where a.owner_id=${me.id} or ${me.email}::text = any(a.shared_with) order by a.created_at desc`;
      const m = r => ({ id: String(r.id), ownerUid: String(r.owner_id), ownerEmail: r.owner_email, title: r.title, artist: r.artist, coverUrl: r.cover_url, songs: r.songs, sharedWith: r.owner_id === me.id ? r.shared_with : [] });
      return send(200, { mine: rows.filter(r => r.owner_id === me.id).map(m), shared: rows.filter(r => r.owner_id !== me.id).map(m) });
    }

    if (a === 'createAlbum') {
      if (me.blocked) return send(403, { error: 'גישתך ליצירת אלבומים נחסמה' });
      const title = String(b.title || '').trim().slice(0, 200), artist = String(b.artist || '').trim().slice(0, 200);
      const songs = Array.isArray(b.songs) ? b.songs.slice(0, 200) : [];
      const cover = b.coverUrl || '';
      if (!title || !artist || !songs.length || (cover && !okUrl(cover)) || !songs.every(s => s && typeof s.name === 'string' && okUrl(s.url))) return send(400, { error: 'נתונים לא תקינים' });
      const clean = songs.map(s => ({ name: s.name.slice(0, 200), url: s.url }));
      await sql`insert into albums(owner_id,title,artist,cover_url,songs) values(${me.id},${title},${artist},${cover},${JSON.stringify(clean)}::jsonb)`;
      return send(200, {});
    }

    if (a === 'deleteAlbum') {
      const al = (await sql`select * from albums where id=${+b.id} and owner_id=${me.id}`)[0];
      if (!al) return send(404, { error: 'האלבום לא נמצא' });
      await del([...(al.songs || []).map(s => s.url), al.cover_url].filter(Boolean)).catch(() => {});
      await sql`delete from albums where id=${al.id}`;
      return send(200, {});
    }

    if (a === 'share') {
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email) || email === me.email) return send(400, { error: 'אימייל לא תקין' });
      await sql`update albums set shared_with = case when ${email}::text = any(shared_with) then shared_with else array_append(shared_with, ${email}::text) end where id=${+b.id} and owner_id=${me.id}`;
      return send(200, {});
    }

    if (a === 'users' || a === 'updateUser') {
      if (me.role !== 'owner') return send(403, { error: 'אין הרשאה' });
      if (a === 'users') return send(200, (await sql`select id,email,role,blocked from users order by id`).map(pub));
      const t = (await sql`select * from users where id=${+b.id}`)[0];
      if (!t || t.email === ADMIN || t.id === me.id) return send(400, { error: 'לא ניתן לשנות משתמש זה' });
      if (b.role === 'owner' || b.role === 'user') await sql`update users set role=${b.role} where id=${t.id}`;
      if (typeof b.blockedFromCreating === 'boolean') await sql`update users set blocked=${b.blockedFromCreating} where id=${t.id}`;
      return send(200, {});
    }

    return send(404, { error: 'לא נמצא' });
  } catch (err) {
    console.error(err);
    return send(400, { error: err.message || 'שגיאה' });
  }
};
