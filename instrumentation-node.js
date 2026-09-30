import { ensureSchema, query } from './lib/db.js';
import { scheduleLifeEngine } from './lib/life-scheduler.js';

export async function startLifeEngineLoop() {
  if (globalThis.__privateLifeBackgroundScheduler) return;
  globalThis.__privateLifeBackgroundScheduler = true;

  async function run() {
    try {
      await ensureSchema();
      const users = await query(`
        SELECT u.id, COALESCE(w.timezone,'UTC') AS timezone
        FROM private_life.users u
        LEFT JOIN private_life.world_clock w ON w.user_id=u.id
        ORDER BY u.id ASC
        LIMIT 500
      `);
      for (const user of users.rows) {
        try {
          await scheduleLifeEngine(user.id, user.timezone || 'UTC');
        } catch (error) {
          console.error('life_background_player_failed', user.id, String(error?.message || error).slice(0,200));
        }
      }
    } catch (error) {
      console.error('life_background_tick_failed', String(error?.message || error).slice(0,300));
    }
  }

  const initial = setTimeout(run, 12000);
  initial.unref?.();
  const timer = setInterval(run, 60000);
  timer.unref?.();
}
