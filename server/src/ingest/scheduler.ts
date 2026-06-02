/* ===========================================================
   server 内置定时同步 · 赛事期间持续拉实时数据
   由 SYNC_ENABLED 开启, 需 API_FOOTBALL_KEY 才会真正运行。
   防重叠: 上一轮未结束时跳过本轮。
   =========================================================== */
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { runSync } from './sync.js';

export function startScheduler(log: FastifyBaseLogger): NodeJS.Timeout | null {
  if (!config.sync.enabled) {
    log.info('⏸ 定时同步未开启 (SYNC_ENABLED=false)。');
    return null;
  }
  if (!config.apiFootball.key) {
    log.warn('⏸ SYNC_ENABLED=true 但未配置 API_FOOTBALL_KEY,定时同步不会运行。');
    return null;
  }

  const everyMs = Math.max(1, config.sync.intervalMin) * 60_000;
  let running = false;

  const tick = async () => {
    if (running) {
      log.warn('⏭ 上一轮同步未结束,跳过本轮。');
      return;
    }
    running = true;
    try {
      const r = await runSync({ mode: config.sync.mode, stats: config.sync.stats, odds: config.sync.odds, quiet: true });
      log.info({ sync: r }, '🔄 定时同步完成');
    } catch (err) {
      log.error({ err }, '定时同步失败');
    } finally {
      running = false;
    }
  };

  log.info(`⏱ 定时同步已启动: 每 ${config.sync.intervalMin} 分钟 (mode=${config.sync.mode}, stats=${config.sync.stats}, odds=${config.sync.odds})。`);
  void tick(); // 启动即跑一次
  return setInterval(() => void tick(), everyMs);
}
