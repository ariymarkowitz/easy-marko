import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { after, delay, scheduler } from './timers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('delay', () => {
  it('calls the function after the delay unless cancelled', () => {
    const fn = vi.fn();
    delay(fn, 100);
    const cancel = delay(fn, 100);
    cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('scheduler', () => {
  it('runs once for calls scheduled while one is waiting', () => {
    const fn = vi.fn();
    const scheduled = scheduler(fn, after(100));
    scheduled.schedule();
    vi.advanceTimersByTime(50);
    scheduled.schedule();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('schedules again after a run', () => {
    const fn = vi.fn();
    const scheduled = scheduler(fn, after(100));
    scheduled.schedule();
    vi.advanceTimersByTime(100);
    scheduled.schedule();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancels a waiting call, and schedules afresh after', () => {
    const fn = vi.fn();
    const scheduled = scheduler(fn, after(100));
    scheduled.schedule();
    scheduled.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    scheduled.schedule();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('lets the function schedule the next call', () => {
    let runs = 0;
    const loop = scheduler(() => {
      if (++runs < 3) loop.schedule();
    }, after(10));
    loop.schedule();
    vi.advanceTimersByTime(100);
    expect(runs).toBe(3);
  });
});
