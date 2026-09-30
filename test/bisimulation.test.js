'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { audit, weakTargets, normalize, TAU } = require('../src/bisimulation');
const { samples } = require('../src/samples');

test('仅以 tau 环重命名而等价：关系包含两个初始状态对', () => {
  const r = audit(samples.equivalent.procA, samples.equivalent.procB);
  assert.equal(r.ok, true);
  assert.equal(r.equivalent, true);
  assert.deepEqual(r.initialPairs, [['S0', 'P0'], ['P0', 'S0']]);
  assert.ok(r.initialAlive.every(Boolean));
  assert.ok(r.finalRelation.some((p) => p[0] === 'S0' && p[1] === 'P0'));
  assert.ok(r.finalRelation.some((p) => p[0] === 'P0' && p[1] === 'S0'));
  // 行为不同的配对（如 S0 与终态 P1）被淘汰属正常；初始对存活即等价
  assert.ok(!r.eliminatedPairs.some((p) => p.pair[0] === 'S0' && p.pair[1] === 'P0'));
});

test('缺失匹配动作：不等价，首个失败义务是缺失侧无法承接的动作', () => {
  const r = audit(samples.missing.procA, samples.missing.procB);
  assert.equal(r.equivalent, false);
  const f = r.firstEliminated;
  assert.equal(f.action, 'x'); // 有 x 的 A 方挑战，B 方无法承接
  assert.equal(f.challenger, 'A');
  assert.ok(f.transitions.some((t) => t.reason === 'NO_MATCHING_ACTION'));
  // 四个跨侧对中三个无法匹配（死态对 (a1,b1) 存活）
  assert.equal(r.rounds[0].eliminated.length, 3);
  const initPair = r.eliminatedPairs.find((p) => p.pair[0] === 'a0' && p.pair[1] === 'b0');
  assert.equal(initPair.round, 1);
});

test('多轮级联：初始对第 2 轮淘汰，失败义务只引用第 1 轮淘汰对', () => {
  const r = audit(samples.cascade.procA, samples.cascade.procB);
  assert.equal(r.equivalent, false);

  const p11 = r.eliminatedPairs.find((p) => p.pair[0] === 'a1' && p.pair[1] === 'b1');
  assert.equal(p11.round, 1);
  assert.equal(p11.action, 'y');

  const p00 = r.eliminatedPairs.find((p) => p.pair[0] === 'a0' && p.pair[1] === 'b0');
  assert.equal(p00.round, 2);
  assert.equal(p00.action, 'x');
  assert.equal(p00.challenger, 'A');

  const fail = p00.transitions.find((t) => t.source === 'a1');
  assert.equal(fail.reason, 'ALL_RESPONSES_ELIMINATED');
  assert.equal(fail.responses.length, 1);
  assert.deepEqual(fail.responses[0].pair, ['a1', 'b1']);
  assert.equal(fail.responses[0].eliminatedRound, 1);

  // 每条失败义务的依据都来自严格更早的轮次（自底向上可复算）
  for (const ep of r.eliminatedPairs) {
    for (const t of ep.transitions) {
      if (t.reason === 'ALL_RESPONSES_ELIMINATED') {
        for (const w of t.responses) {
          assert.ok(typeof w.eliminatedRound === 'number');
          assert.ok(w.eliminatedRound < ep.round, `依据轮次应更早: ${JSON.stringify(w)} in round ${ep.round}`);
        }
        // 依据按轮次递减排序
        const rounds = t.responses.map((w) => w.eliminatedRound);
        assert.deepEqual(rounds, [...rounds].sort((x, y) => y - x));
      }
    }
  }
});

test('tau 链上的弱转移：静默前缀后承接动作', () => {
  const proc = normalize({
    states: [{ name: 's' }, { name: 'u' }, { name: 'p' }, { name: 'v' }],
    initial: 's',
    transitions: [
      { id: '1', from: 's', action: 'tau', to: 'u' },
      { id: '2', from: 'u', action: 'tau', to: 'p' },
      { id: '3', from: 'p', action: 'a', to: 'v' },
    ],
  });
  assert.deepEqual([...weakTargets(proc, 's', 'a')], ['v']);
  assert.deepEqual([...weakTargets(proc, 's', TAU)].sort(), ['p', 's', 'u']);
});

test('静默前缀 + 可观察承接的典型等价：tau 前缀进程与直接动作进程', () => {
  const A = {
    states: [{ name: 's' }, { name: 'u' }, { name: 'p' }],
    initial: 's',
    transitions: [
      { id: '1', from: 's', action: 'tau', to: 'u' },
      { id: '2', from: 'u', action: 'tau', to: 'u' }, // tau 自环
      { id: '3', from: 'u', action: 'a', to: 'p' },
    ],
  };
  const B = {
    states: [{ name: 'q' }, { name: 'r' }],
    initial: 'q',
    transitions: [{ id: '1', from: 'q', action: 'a', to: 'r' }],
  };
  const r = audit(A, B);
  assert.equal(r.equivalent, true);
});

test('环内单点可观察动作：初态与两个中继形成单向 tau 环，应等价且两个初始对均存活', () => {
  const r = audit(samples.ring.procA, samples.ring.procB);
  assert.equal(r.ok, true);
  assert.equal(r.equivalent, true, JSON.stringify(r.eliminatedPairs));
  assert.deepEqual(r.initialPairs, [['s0', 't0'], ['t0', 's0']]);
  assert.deepEqual(r.initialAlive, [true, true]);
  assert.ok(r.finalRelation.some((p) => p[0] === 's0' && p[1] === 't0'));
  assert.ok(r.finalRelation.some((p) => p[0] === 't0' && p[1] === 's0'));
  // 两个方向的初始状态对均未被淘汰（无初始对淘汰）
  assert.ok(!r.eliminatedPairs.some((p) => p.pair[0] === 's0' && p.pair[1] === 't0'));
  assert.ok(!r.eliminatedPairs.some((p) => p.pair[0] === 't0' && p.pair[1] === 's0'));
});

test('环内每个状态沿内部环继续跳转后都能承接 x（静默环可达完整且确定）', () => {
  const proc = normalize(samples.ring.procA);
  for (const s of ['s0', 's1', 's2']) {
    assert.deepEqual([...weakTargets(proc, s, 'x')], ['s3'], `状态 ${s} 应经静默环到达 s1 后承接 x`);
  }
  // 终态无后续迁移
  assert.deepEqual([...weakTargets(proc, 's3', 'x')], []);
  assert.deepEqual([...weakTargets(proc, 's3', TAU)], ['s3']);
});

test('环场景输入重排：调换状态或迁移录入顺序不改变裁决、首个淘汰对与候选响应', () => {
  const { procA, procB } = samples.ring;
  const reorder = (spec, revStates, revTrans) => ({
    ...spec,
    states: revStates ? [...spec.states].reverse() : spec.states,
    transitions: revTrans ? [...spec.transitions].reverse() : spec.transitions,
  });
  const signature = (r) => JSON.stringify({
    equivalent: r.equivalent,
    initialAlive: r.initialAlive,
    rounds: r.rounds.map((rd) => rd.eliminated.map((e) => [e.pair, e.action, e.challenger])),
    firstEliminated: r.firstEliminated && [
      r.firstEliminated.pair,
      r.firstEliminated.action,
      r.firstEliminated.challenger,
      r.firstEliminated.transitions.map((t) => [
        t.source,
        t.reason,
        (t.responses || []).map((w) => [w.target, w.pair, w.eliminatedRound]),
      ]),
    ],
  });
  const results = [];
  for (const revStates of [false, true]) {
    for (const revTrans of [false, true]) {
      const r = audit(reorder(procA, revStates, revTrans), reorder(procB, revStates, revTrans));
      assert.equal(r.equivalent, true);
      results.push(signature(r));
    }
  }
  assert.equal(new Set(results).size, 1, '四种录入排列的裁决与淘汰/候选响应细节应完全一致');
});

test('任意长度静默环、环内汇合与分叉、环内不同位置发动作：可达完整且与直接动作进程等价', () => {
  // r0→r1→r2→r4→r3→r5→r0（6 状态环），且 r1→r3 为环内分叉后汇合；
  // x/y/z 分别从 r5/r2/r4 发出到终态。
  const ring = {
    states: ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'd0', 'd1', 'd2'].map((name) => ({ name })),
    initial: 'r0',
    transitions: [
      { id: 'c1', from: 'r0', action: 'tau', to: 'r1' },
      { id: 'c2', from: 'r1', action: 'tau', to: 'r2' },
      { id: 'c3', from: 'r1', action: 'tau', to: 'r3' },
      { id: 'c4', from: 'r2', action: 'tau', to: 'r4' },
      { id: 'c5', from: 'r4', action: 'tau', to: 'r3' },
      { id: 'c6', from: 'r3', action: 'tau', to: 'r5' },
      { id: 'c7', from: 'r5', action: 'tau', to: 'r0' },
      { id: 'cx', from: 'r5', action: 'x', to: 'd0' },
      { id: 'cy', from: 'r2', action: 'y', to: 'd1' },
      { id: 'cz', from: 'r4', action: 'z', to: 'd2' },
    ],
  };
  const proc = normalize(ring);
  for (const s of ['r0', 'r1', 'r2', 'r3', 'r4', 'r5']) {
    assert.equal(proc.tauClosures.get(s).size, 6, `${s} 的静默闭包应覆盖环上全部 6 个状态`);
    assert.deepEqual([...weakTargets(proc, s, 'x')].sort(), ['d0']);
    assert.deepEqual([...weakTargets(proc, s, 'y')].sort(), ['d1']);
    assert.deepEqual([...weakTargets(proc, s, 'z')].sort(), ['d2']);
  }
  const direct = {
    states: [{ name: 'q' }, { name: 'e0' }, { name: 'e1' }, { name: 'e2' }],
    initial: 'q',
    transitions: [
      { id: 'dx', from: 'q', action: 'x', to: 'e0' },
      { id: 'dy', from: 'q', action: 'y', to: 'e1' },
      { id: 'dz', from: 'q', action: 'z', to: 'e2' },
    ],
  };
  assert.equal(audit(ring, direct).equivalent, true);
  // 反向录入（状态与迁移均倒序）裁决一致
  assert.equal(
    audit(
      { ...ring, states: [...ring.states].reverse(), transitions: [...ring.transitions].reverse() },
      { ...direct, states: [...direct.states].reverse(), transitions: [...direct.transitions].reverse() },
    ).equivalent,
    true,
  );
});

test('输入无效：一次显示所有问题并清除旧结论', () => {
  const bad = {
    states: [{ name: 'x' }, { name: 'x' }, {}, { name: 'bad name' }],
    initial: 'ghost',
    transitions: [
      { id: 't', from: 'x', action: '', to: 'nope' },
      { id: 't', from: 'x', action: 'foo', to: 'x' },
      { id: 'a1', from: 'x', action: 'a', to: 'x' },
      { id: 'a2', from: 'x', action: 'b', to: 'x' },
      { id: 'a3', from: 'x', action: 'c', to: 'x' },
      { id: 'a4', from: 'x', action: 'd', to: 'x' },
      { id: 'a5', from: 'x', action: 'e', to: 'x' },
    ],
  };
  const r = audit(bad, { states: [], initial: '', transitions: [] });
  assert.equal(r.ok, false);
  assert.equal(r.equivalent, null);
  const codes = r.errors.map((e) => e.code);
  for (const code of [
    'STATE_DUPLICATE',
    'STATE_NAME_INVALID',
    'STATE_NAME_MISSING',
    'INITIAL_UNKNOWN',
    'ENDPOINT_UNKNOWN',
    'ACTION_MISSING',
    'TID_DUPLICATE',
    'INITIAL_MISSING',
    'ACTION_LIMIT',
  ]) {
    assert.ok(codes.includes(code), `应报告 ${code}；实际 ${JSON.stringify(codes)}`);
  }
  // 两侧问题都要收集
  assert.ok(r.errors.some((e) => e.side === 'A'));
  assert.ok(r.errors.some((e) => e.side === 'B'));
  // 清除旧结论：无轮次、无淘汰对、无初始对
  assert.equal(r.rounds.length, 0);
  assert.equal(r.eliminatedPairs.length, 0);
  assert.equal(r.firstEliminated, null);
  assert.equal(r.initialPairs.length, 0);
});

test('稳定排序：首个失败动作按动作字典序（tau 最后），轮次内状态对稳定排序', () => {
  const A = {
    states: [{ name: 's' }, { name: 'p' }],
    initial: 's',
    transitions: [
      { id: 'z', from: 's', action: 'z', to: 'p' },
      { id: 'b', from: 's', action: 'b', to: 'p' },
    ],
  };
  const B = {
    states: [{ name: 'q' }, { name: 'r' }],
    initial: 'q',
    transitions: [{ id: 'c', from: 'q', action: 'c', to: 'r' }],
  };
  const r = audit(A, B);
  // 首个淘汰对按状态对字典序为 (p,q)：p 为死态，q 可做 c，首个失败动作为 c（B 挑战）
  assert.deepEqual(r.firstEliminated.pair, ['p', 'q']);
  assert.equal(r.firstEliminated.action, 'c');
  assert.equal(r.firstEliminated.challenger, 'B');
  // (s,q) 的首个失败义务才是动作 b（A 挑战，字典序早于 z）
  const sq = r.eliminatedPairs.find((p) => p.pair[0] === 's' && p.pair[1] === 'q');
  assert.equal(sq.action, 'b');
  assert.equal(sq.challenger, 'A');
  for (const rd of r.rounds) {
    const pairs = rd.eliminated.map((e) => e.pair.join(','));
    assert.deepEqual(pairs, [...pairs].sort());
  }
});

test('同构进程（仅状态重命名）等价', () => {
  const mk = (prefix) => ({
    states: [{ name: `${prefix}0` }, { name: `${prefix}1` }, { name: `${prefix}2` }],
    initial: `${prefix}0`,
    transitions: [
      { id: `${prefix}a`, from: `${prefix}0`, action: 'a', to: `${prefix}1` },
      { id: `${prefix}b`, from: `${prefix}1`, action: 'b', to: `${prefix}2` },
      { id: `${prefix}t`, from: `${prefix}2`, action: 'tau', to: `${prefix}0` },
    ],
  });
  const r = audit(mk('s'), mk('q'));
  assert.equal(r.equivalent, true);
  // 静默环使各状态经 tau 弱可达彼此：行为相同的非初始配对也可在关系中，
  // 关键是两个初始状态对均存活、初始对未被淘汰
  assert.ok(!r.eliminatedPairs.some((p) => p.pair[0] === 's0' && p.pair[1] === 'q0'));
});

test('状态数与可观察动作种类上限', () => {
  const tooMany = {
    states: Array.from({ length: 19 }, (_, i) => ({ name: `s${i}` })),
    initial: 's0',
    transitions: [],
  };
  const r1 = audit(tooMany, { states: [{ name: 'q' }], initial: 'q', transitions: [] });
  assert.ok(r1.errors.some((e) => e.code === 'STATE_LIMIT'));

  const fiveActions = {
    states: [{ name: 's' }],
    initial: 's',
    transitions: ['a', 'b', 'c', 'd', 'e'].map((a) => ({ id: a, from: 's', action: a, to: 's' })),
  };
  const r2 = audit(fiveActions, { states: [{ name: 'q' }], initial: 'q', transitions: [] });
  assert.ok(r2.errors.some((e) => e.code === 'ACTION_LIMIT'));
});

test('18 状态 4 动作的上限边界可正常计算', () => {
  const mk = (prefix) => ({
    states: Array.from({ length: 18 }, (_, i) => ({ name: `${prefix}${i}` })),
    initial: `${prefix}0`,
    transitions: [
      ...['a', 'b', 'c', 'd'].map((act, i) => ({ id: `${prefix}${act}`, from: `${prefix}0`, action: act, to: `${prefix}${i + 1}` })),
      { id: `${prefix}tau`, from: `${prefix}0`, action: 'tau', to: `${prefix}0` },
    ],
  });
  const r = audit(mk('s'), mk('q'));
  assert.equal(r.ok, true);
  assert.equal(r.equivalent, true);
});
