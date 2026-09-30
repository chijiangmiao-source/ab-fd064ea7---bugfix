'use strict';

// 页面内置示例：
//  1. equivalent —— 仅差一个可观察上不可见的 tau 自环（状态重命名），应判定等价
//  2. ring       —— 初态与两个中继形成单向 tau 环，环内仅一个中继可执行 x，应判定等价
//  3. missing    —— 一侧可观察动作另一侧无法承接，应判定不等价
//  4. cascade    —— 多轮淘汰：初始对在第 2 轮因引用第 1 轮淘汰结果而失败

const samples = {
  equivalent: {
    label: 'tau 自环 + 重命名（应等价）',
    procA: {
      states: [{ name: 'S0' }, { name: 'S1' }],
      initial: 'S0',
      transitions: [
        { id: 'a-tau-loop', from: 'S0', action: 'tau', to: 'S0' },
        { id: 'a-x', from: 'S0', action: 'x', to: 'S1' },
      ],
    },
    procB: {
      states: [{ name: 'P0' }, { name: 'P1' }],
      initial: 'P0',
      transitions: [{ id: 'b-x', from: 'P0', action: 'x', to: 'P1' }],
    },
  },
  ring: {
    label: '环内单点可观察动作 + 静默环（应等价）',
    procA: {
      states: [{ name: 's0' }, { name: 's1' }, { name: 's2' }, { name: 's3' }],
      initial: 's0',
      transitions: [
        { id: 'r-a1', from: 's0', action: 'tau', to: 's1' },
        { id: 'r-a2', from: 's1', action: 'tau', to: 's2' },
        { id: 'r-a3', from: 's2', action: 'tau', to: 's0' },
        { id: 'r-ax', from: 's1', action: 'x', to: 's3' },
      ],
    },
    procB: {
      states: [{ name: 't0' }, { name: 't1' }],
      initial: 't0',
      transitions: [{ id: 'r-bx', from: 't0', action: 'x', to: 't1' }],
    },
  },
  missing: {
    label: '缺失匹配动作（应不等价）',
    procA: {
      states: [{ name: 'a0' }, { name: 'a1' }],
      initial: 'a0',
      transitions: [{ id: 'ax', from: 'a0', action: 'x', to: 'a1' }],
    },
    procB: {
      states: [{ name: 'b0' }, { name: 'b1' }],
      initial: 'b0',
      transitions: [{ id: 'by', from: 'b0', action: 'y', to: 'b1' }],
    },
  },
  cascade: {
    label: '多轮级联淘汰（初始对第 2 轮失败）',
    procA: {
      states: [{ name: 'a0' }, { name: 'a1' }, { name: 'a2' }],
      initial: 'a0',
      transitions: [
        { id: 'ax', from: 'a0', action: 'x', to: 'a1' },
        { id: 'ay', from: 'a1', action: 'y', to: 'a2' },
      ],
    },
    procB: {
      states: [{ name: 'b0' }, { name: 'b1' }],
      initial: 'b0',
      transitions: [{ id: 'bx', from: 'b0', action: 'x', to: 'b1' }],
    },
  },
};

module.exports = { samples };
