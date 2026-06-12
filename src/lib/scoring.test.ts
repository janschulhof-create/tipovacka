import { test } from 'node:test';
import assert from 'node:assert';
import { calculatePoints } from './scoring';

test('přesný výsledek = 10', () => assert.equal(calculatePoints(2, 1, 2, 1), 10));
test('jen vítěz (1:5 / tip 1:3) = 4', () => assert.equal(calculatePoints(1, 5, 1, 3), 4));
test('nepřesná remíza = 6', () => assert.equal(calculatePoints(1, 1, 2, 2), 6));
test('vítěz + správný rozdíl = 6', () => assert.equal(calculatePoints(2, 0, 5, 3), 6));
test('vítěz + správný celkový počet gólů = 6', () => assert.equal(calculatePoints(3, 1, 4, 0), 6));
test('jen vítěz = 4', () => assert.equal(calculatePoints(3, 1, 4, 1), 4));
test('špatný vítěz + správný celkový počet gólů = 2', () => assert.equal(calculatePoints(2, 1, 0, 3), 2));
test('špatný vítěz + špatný počet gólů = 0', () => assert.equal(calculatePoints(2, 1, 1, 1), 0));
test('góly jednoho týmu sedí, ale ne celkem, špatný vítěz = 0', () => assert.equal(calculatePoints(2, 1, 2, 2), 0));
