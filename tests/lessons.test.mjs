import test from 'node:test';
import assert from 'node:assert/strict';
import { lessons,demonstration } from '../app/lib/lessons.ts';
test('each lesson has a valid understanding check and finite demo boundaries',()=>{for(const [id,lesson] of Object.entries(lessons)){assert.ok(lesson.correct>=0&&lesson.correct<lesson.options.length);for(const n of [0,50,100])assert.ok(Number.isFinite(demonstration(id,n).value));}});
test('mixture and leakage endpoints follow stated assumptions',()=>{assert.equal(demonstration('shift',0).value,95);assert.equal(demonstration('shift',100).value,55);assert.equal(demonstration('leakage',0).value,60);assert.equal(demonstration('leakage',100).value,100);});
test('independent missingness compounds across features',()=>{assert.equal(demonstration('missing',0).value,1000);assert.equal(demonstration('missing',100).value,0);assert.ok(Math.abs(demonstration('missing',20).value-327.68)<1e-8);});
test('overfitting toy has a validation optimum distinct from continued training',()=>{assert.ok(demonstration('possible-overfitting',35).value<demonstration('possible-overfitting',80).value);});
test('quadratic learning illustrates stalled and divergent updates',()=>{assert.equal(demonstration('possible-stalled-learning',0).value,.5);assert.ok(demonstration('possible-stalled-learning',10).value<.5);assert.ok(demonstration('possible-unstable-training',100).value>.5);});
